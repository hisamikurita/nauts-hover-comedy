import * as THREE from "three";
import { BACKGROUND_COLOR, CAMERA, FOG } from "./constants";

export const canvas = document.getElementById("stage") as HTMLCanvasElement;

export const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// hoverButton の液体フィル表現でマテリアル単位のクリッピングを使う
renderer.localClippingEnabled = true;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);
scene.fog = new THREE.Fog(BACKGROUND_COLOR, FOG.NEAR, FOG.FAR);

const isMobile = document.documentElement.dataset.mobile === "true";

export const camera = new THREE.PerspectiveCamera(
	CAMERA.FOV,
	window.innerWidth / window.innerHeight,
	CAMERA.NEAR,
	CAMERA.FAR,
);
// 真上から床(y=FLOOR_Y)を見下ろす。z=0.001 の微小オフセットで up ベクトル反転を防ぐ
camera.position.set(0, isMobile ? CAMERA.MOBILE_Y : CAMERA.INITIAL_Y, 0.001);
camera.lookAt(0, 0, 0);

export const handleResize = (): void => {
	window.addEventListener("resize", () => {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	});
};

export const startAnimationLoop = (update: () => void): void => {
	const tick = () => {
		update();
		renderer.render(scene, camera);
		requestAnimationFrame(tick);
	};
	tick();
};
