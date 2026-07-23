import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import * as THREE from "three";
import { camera, FLOOR_Y, hands, TARGET_HAND_SPAN } from "../webgl";
import { setStatus } from "./status";

// 手の平面: 床のすぐ上に置いて toys(半径〜0.5–1.2)を確実に弾けるレンジに固定
const HAND_Y_BASE = FLOOR_Y + 1.2;
// lm.z(手首基準の深度)の残し量。0 で全ランドマークを同一 XZ 平面に置き、
// パーム法線が常に純粋な Y 軸方向になるので rig の指の曲げが安定する
const HEIGHT_SCALE = 0;

let handLandmarker: HandLandmarker | null = null;
let video: HTMLVideoElement | null = null;

export const initHandTracking = async () => {
	setStatus("Loading model…");
	const vision = await FilesetResolver.forVisionTasks(
		"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
	);
	handLandmarker = await HandLandmarker.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath:
				"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
			delegate: "GPU",
		},
		runningMode: "VIDEO",
		numHands: 2,
	});

	setStatus("Please allow camera access");
	const stream = await navigator.mediaDevices.getUserMedia({
		video: { width: 640, height: 480, facingMode: "user" },
	});
	const v = document.createElement("video");
	v.autoplay = true;
	v.playsInline = true;
	v.muted = true;
	v.style.display = "none";
	document.body.appendChild(v);
	v.srcObject = stream;
	await v.play();
	video = v;

	setStatus("Show your hand to the camera", false);
};

const rawTargets: THREE.Vector3[] = Array.from(
	{ length: 21 },
	() => new THREE.Vector3(),
);
const wristOffset = new THREE.Vector3();

export const updateHand = () => {
	if (!handLandmarker || !video || video.readyState < 2) return;

	const now = performance.now();
	const result = handLandmarker.detectForVideo(video, now);

	const detected = result.landmarks.length;
	if (detected === 0) {
		for (const h of hands) {
			h.detected = false;
			h.smoothingInitialized = false;
		}
		return;
	}

	// 真上視点: 手の平面(y=HAND_Y_BASE)での見える範囲に合わせて XZ を投影する
	const handPlaneDistance = camera.position.y - HAND_Y_BASE;
	const visibleDepth =
		2 * handPlaneDistance * Math.tan((camera.fov * Math.PI) / 360);
	const visibleWidth = visibleDepth * camera.aspect;

	let anyDetectedBefore = false;
	for (const h of hands) if (h.detected) anyDetectedBefore = true;

	for (let hIdx = 0; hIdx < hands.length; hIdx++) {
		const h = hands[hIdx];
		if (hIdx >= detected) {
			h.detected = false;
			h.smoothingInitialized = false;
			continue;
		}
		h.detected = true;
		h.label = result.handedness[hIdx]?.[0]?.categoryName ?? "";
		const landmarks = result.landmarks[hIdx];
		// 1) 生ワールド座標を全ランドマーク分先に求める
		// 画面X→ワールドX、画面Y→ワールドZ(手前=+Z)、深度→ワールドY(HAND_Y_BASE付近)。
		// lm.z を負反転しないことで rigBX × rigBY が右手系のまま保たれ、
		// 指の曲げ方向が反転しない
		for (let i = 0; i < 21; i++) {
			const lm = landmarks[i];
			rawTargets[i].set(
				(0.5 - lm.x) * visibleWidth,
				HAND_Y_BASE + lm.z * HEIGHT_SCALE,
				(lm.y - 0.5) * visibleDepth,
			);
		}
		// 2) 手首→中指付け根の距離が TARGET_HAND_SPAN になるよう手首基準で一律スケール
		// これで手を近づけても遠ざけても、rig の見た目もコライダーの広がりも一定になる
		const wrist = rawTargets[0];
		const rawSpan = wrist.distanceTo(rawTargets[9]);
		if (rawSpan > 0.001) {
			const spanScale = TARGET_HAND_SPAN / rawSpan;
			for (let i = 1; i < 21; i++) {
				wristOffset.subVectors(rawTargets[i], wrist).multiplyScalar(spanScale);
				rawTargets[i].copy(wrist).add(wristOffset);
			}
		}
		// 3) スムージングを適用
		for (let i = 0; i < 21; i++) {
			if (!h.smoothingInitialized) h.smoothed[i].copy(rawTargets[i]);
			else h.smoothed[i].lerp(rawTargets[i], 0.45);
		}
		h.smoothingInitialized = true;
	}

	if (!anyDetectedBefore) setStatus("", true);
};
