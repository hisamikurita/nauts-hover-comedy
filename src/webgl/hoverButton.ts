import * as CANNON from "cannon-es";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { FontLoader, type Font } from "three/addons/loaders/FontLoader.js";
import { FLOOR_Y } from "./constants";
import { camera, scene } from "./core";
import { hands } from "./handView";
import { addMeshOutline, toonGradientMap } from "./material";
import { GROUP_STATIC, GROUP_TOY, physicsWorld } from "./physics";
import { addExistingToy } from "./toys";

const BUTTON_POS = { x: 0, z: 0 };
// 横長のピル形状ボタン。真上視点で「ここを撫でて」と示唆する幅広の形にする
const BUTTON_WIDTH = 8.0;
const BUTTON_DEPTH = 2.5;
// 丸み半径は min(高さ, 奥行き)/2 で決まるので、ジオメトリは高さ=奥行きの
// フルカプセルで作り、Y方向に潰して低くする。床に沈めるとシルエットの
// 最太部(赤道)が床下に隠れてアウトラインが消えるため、潰す方式にしている
const BUTTON_GEO_HEIGHT = BUTTON_DEPTH;
const BUTTON_SQUASH = 0.45;
const BUTTON_HEIGHT = BUTTON_GEO_HEIGHT * BUTTON_SQUASH;
const BUTTON_Y = FLOOR_Y + BUTTON_HEIGHT / 2;
// 手のランドマークがボタン矩形の中(padding 分外側含む)に入ればホバー扱い
const HOVER_PAD = 0.6;
const HOVER_HALF_X = BUTTON_WIDTH / 2 + HOVER_PAD;
const HOVER_HALF_Z = BUTTON_DEPTH / 2 + HOVER_PAD;

const BUTTON_COLOR_IDLE = new THREE.Color("#ff5252");
const BUTTON_COLOR_HOVER = new THREE.Color("#ffd740");

// ボタンはライティング非適用のベタ塗り: トゥーン陰影の段差を出さずUIらしく見せる
const buttonMaterial = new THREE.MeshBasicMaterial({
	color: BUTTON_COLOR_IDLE.clone(),
});
const buttonMesh = new THREE.Mesh(
	new RoundedBoxGeometry(
		BUTTON_WIDTH,
		BUTTON_GEO_HEIGHT,
		BUTTON_DEPTH,
		8,
		Math.min(BUTTON_GEO_HEIGHT, BUTTON_DEPTH) / 2,
	),
	buttonMaterial,
);
buttonMesh.scale.y = BUTTON_SQUASH;
buttonMesh.position.set(BUTTON_POS.x, BUTTON_Y, BUTTON_POS.z);
// 中央ボタンは影を落とさない(接地感を軽くしてUIっぽく見せる)
buttonMesh.castShadow = false;
buttonMesh.receiveShadow = false;
addMeshOutline(buttonMesh, 0.03);
scene.add(buttonMesh);

// 落ちてきた文字トイがボタン天面で受け止められるように、静的コライダーを重ねる
const buttonBody = new CANNON.Body({
	type: CANNON.Body.STATIC,
	collisionFilterGroup: GROUP_STATIC,
	shape: new CANNON.Box(
		new CANNON.Vec3(BUTTON_WIDTH / 2, BUTTON_HEIGHT / 2, BUTTON_DEPTH / 2),
	),
});
buttonBody.position.set(BUTTON_POS.x, BUTTON_Y, BUTTON_POS.z);
physicsWorld.addBody(buttonBody);

// 液体フィルインジケーター: ボタン自体がゲージになる。熱量ぶんだけ
// ホバー色がカプセルの左から満ちていく(クリッピングプレーンで切る)
const fillClipPlane = new THREE.Plane(
	new THREE.Vector3(-1, 0, 0),
	-BUTTON_WIDTH, // 初期状態は全クリップ(何も見えない)
);
const fillMaterial = new THREE.MeshBasicMaterial({
	color: BUTTON_COLOR_HOVER.clone(),
	clippingPlanes: [fillClipPlane],
	// 同一ジオメトリの重ね描きなので手前に引き寄せて z-fight を防ぐ
	polygonOffset: true,
	polygonOffsetFactor: -1,
	polygonOffsetUnits: -1,
});
const fillMesh = new THREE.Mesh(buttonMesh.geometry, fillMaterial);
buttonMesh.add(fillMesh);

const updateIndicator = (heat: number) => {
	// クリップ境界(ワールドX): 左端から熱量ぶん右へ。押し込みスケールにも追従
	const halfW = (BUTTON_WIDTH / 2) * buttonMesh.scale.x;
	fillClipPlane.constant = BUTTON_POS.x - halfW + halfW * 2 * heat;
};

const CHARS = ["N", "a", "u", "t", "s", "ホ", "バ", "ー", "大", "喜", "利"];
const CHAR_COLORS = [
	"#ff5252",
	"#40c4ff",
	"#ffd740",
	"#69f0ae",
	"#ff80ab",
	"#ba68c8",
	"#ffab40",
];

// 「Nauts ホバー大喜利」の11文字だけをサブセット化した丸ゴシックフォント
// (scripts/generateCharFont.mjs で生成)
let charFont: Font | null = null;
new FontLoader().load(
	`${import.meta.env.BASE_URL}fonts/toy_chars.typeface.json`,
	(font) => {
		charFont = font;
		placeInitialToys(font);
	},
);

const CHAR_SIZE = 1.7;

interface CharGeometry {
	geometry: TextGeometry;
	halfExtents: CANNON.Vec3;
	radius: number;
}
const geometryCache = new Map<string, CharGeometry>();

const createCharGeometry = (font: Font, ch: string): CharGeometry => {
	const cached = geometryCache.get(ch);
	if (cached) return cached;
	const geometry = new TextGeometry(ch, {
		font,
		size: CHAR_SIZE,
		depth: CHAR_SIZE * 0.4,
		curveSegments: 6,
		bevelEnabled: true,
		bevelThickness: CHAR_SIZE * 0.06,
		bevelSize: CHAR_SIZE * 0.04,
		bevelSegments: 2,
	});
	geometry.computeBoundingBox();
	const bb = geometry.boundingBox;
	if (!bb) throw new Error("bounding box unavailable");
	// 原点が左下手前なので中心に寄せてから当たり判定の箱を合わせる
	geometry.translate(
		-(bb.min.x + bb.max.x) / 2,
		-(bb.min.y + bb.max.y) / 2,
		-(bb.min.z + bb.max.z) / 2,
	);
	geometry.computeBoundingSphere();
	const entry: CharGeometry = {
		geometry,
		halfExtents: new CANNON.Vec3(
			(bb.max.x - bb.min.x) / 2,
			(bb.max.y - bb.min.y) / 2,
			(bb.max.z - bb.min.z) / 2,
		),
		radius: geometry.boundingSphere?.radius ?? CHAR_SIZE * 0.7,
	};
	geometryCache.set(ch, entry);
	return entry;
};

// 起動時に「Nauts ホバー大喜利」の3D文字を1文字ずつと、サイコロ数個を床に散らしておく
const INITIAL_DICE_COUNT = 17;
const layFlat = new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0);
const yawAxis = new CANNON.Vec3(0, 1, 0);

const placeInitialToys = (font: Font) => {
	const floorDistance = camera.position.y - FLOOR_Y;
	const visibleDepth =
		2 * floorDistance * Math.tan((camera.fov * Math.PI) / 360);
	const visibleWidth = visibleDepth * camera.aspect;
	// 偏りを避けるため画面をマスに分け、シャッフルして1マスに1個ずつ置く
	// (ジッター付きグリッド)。マス内でランダムに揺らして機械的な等間隔感を消す
	const COLS = 6;
	const ROWS = 5;
	const spanX = visibleWidth * 0.88;
	const spanZ = visibleDepth * 0.88;
	const cellW = spanX / COLS;
	const cellD = spanZ / ROWS;
	const cells = Array.from({ length: COLS * ROWS }, (_, k) => k);
	for (let k = cells.length - 1; k > 0; k--) {
		const j = Math.floor(Math.random() * (k + 1));
		[cells[k], cells[j]] = [cells[j], cells[k]];
	}
	const total = CHARS.length + INITIAL_DICE_COUNT;
	for (let i = 0; i < total; i++) {
		const isChar = i < CHARS.length;
		let mesh: THREE.Mesh;
		let shape: CANNON.Box;
		let radius: number;
		let restY: number;
		if (isChar) {
			const cg = createCharGeometry(font, CHARS[i]);
			mesh = new THREE.Mesh(
				cg.geometry,
				new THREE.MeshToonMaterial({
					color: CHAR_COLORS[i % CHAR_COLORS.length],
					gradientMap: toonGradientMap,
				}),
			);
			shape = new CANNON.Box(cg.halfExtents);
			radius = cg.radius;
			restY = FLOOR_Y + cg.halfExtents.z + 0.02;
		} else {
			const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
			const color = CHAR_COLORS[Math.floor(Math.random() * CHAR_COLORS.length)];
			mesh = new THREE.Mesh(
				diceGeometry,
				new THREE.MeshToonMaterial({
					map: createCharTexture(ch, color),
					gradientMap: toonGradientMap,
				}),
			);
			shape = new CANNON.Box(
				new CANNON.Vec3(DICE_SIZE / 2, DICE_SIZE / 2, DICE_SIZE / 2),
			);
			radius = diceRadius;
			restY = FLOOR_Y + DICE_SIZE / 2 + 0.02;
		}
		mesh.castShadow = true;
		addMeshOutline(mesh, 0.02);
		const body = new CANNON.Body({
			mass: 0.6,
			collisionFilterGroup: GROUP_TOY,
			shape,
		});
		body.angularDamping = 0.35;
		body.linearDamping = 0.1;
		// 割り当てマスの中心 ± マス内ジッター。ボタンの近く(マージン込み)は引き直す
		const keepoutX = BUTTON_WIDTH / 2 + 2.0;
		const keepoutZ = BUTTON_DEPTH / 2 + 2.0;
		const cell = cells[i];
		const cx = -spanX / 2 + ((cell % COLS) + 0.5) * cellW;
		const cz = -spanZ / 2 + (Math.floor(cell / COLS) + 0.5) * cellD;
		let x = cx;
		let z = cz;
		for (let attempt = 0; attempt < 20; attempt++) {
			x = cx + (Math.random() - 0.5) * cellW * 0.7;
			z = cz + (Math.random() - 0.5) * cellD * 0.7;
			if (Math.abs(x) > keepoutX || Math.abs(z) > keepoutZ) break;
		}
		// マスがまるごと除外圏内で引き直しきれなかったら奥/手前側へ押し出す
		if (Math.abs(x) <= keepoutX && Math.abs(z) <= keepoutZ) {
			z = Math.sign(z || 1) * (keepoutZ + 0.5 + Math.random());
		}
		// 3D文字は文字面を真上に向けて寝かせる。どちらも向きは軽くランダムに振る
		const yaw = new CANNON.Quaternion().setFromAxisAngle(
			yawAxis,
			(Math.random() - 0.5) * 1.2,
		);
		if (isChar) yaw.mult(layFlat, body.quaternion);
		else body.quaternion.copy(yaw);
		body.position.set(x, restY, z);
		addExistingToy(mesh, body, radius);
	}
};

// サイコロ(全6面に文字が乗る立方体): どの向きで転がっても文字が見える
const DICE_SIZE = 1.1;
const diceGeometry = new RoundedBoxGeometry(
	DICE_SIZE,
	DICE_SIZE,
	DICE_SIZE,
	3,
	DICE_SIZE * 0.15,
);
diceGeometry.computeBoundingSphere();
const diceRadius = diceGeometry.boundingSphere?.radius ?? DICE_SIZE * 0.75;

const textureCache = new Map<string, THREE.CanvasTexture>();

const createCharTexture = (ch: string, bg: string): THREE.CanvasTexture => {
	const key = `${ch}|${bg}`;
	const cached = textureCache.get(key);
	if (cached) return cached;
	const size = 256;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2D context unavailable");
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, size, size);
	ctx.fillStyle = "#ffffff";
	ctx.font =
		"bold 180px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(ch, size / 2, size / 2 + 8);
	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 4;
	textureCache.set(key, tex);
	return tex;
};

// サイコロ8 : 押し出し3D文字1 の割合で降らせる(レインボーモード中は半々)
const TEXT_CHAR_RATIO = 1 / 9;
const TEXT_CHAR_RATIO_RAINBOW = 0.5;

// ホバーし続けるほど 0→1 に上がる熱量。降る間隔・落下速度・サイズを激しくする
const HEAT_RISE_SECONDS = 5;
const HEAT_FALL_SECONDS = 1.5;
let hoverHeat = 0;

const spawnChar = () => {
	const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
	const color = CHAR_COLORS[Math.floor(Math.random() * CHAR_COLORS.length)];
	let mesh: THREE.Mesh;
	let shape: CANNON.Box;
	let radius: number;
	// 熱量に応じて少しずつ大きくなる(最大 +35%)
	const sizeScale = 1 + hoverHeat * 0.35;
	const textRatio =
		hoverHeat >= 1 ? TEXT_CHAR_RATIO_RAINBOW : TEXT_CHAR_RATIO;
	if (charFont && Math.random() < textRatio) {
		const cg = createCharGeometry(charFont, ch);
		mesh = new THREE.Mesh(
			cg.geometry,
			new THREE.MeshToonMaterial({ color, gradientMap: toonGradientMap }),
		);
		shape = new CANNON.Box(cg.halfExtents.scale(sizeScale));
		radius = cg.radius * sizeScale;
	} else {
		mesh = new THREE.Mesh(
			diceGeometry,
			new THREE.MeshToonMaterial({
				map: createCharTexture(ch, color),
				gradientMap: toonGradientMap,
			}),
		);
		shape = new CANNON.Box(
			new CANNON.Vec3(DICE_SIZE / 2, DICE_SIZE / 2, DICE_SIZE / 2).scale(
				sizeScale,
			),
		);
		radius = diceRadius * sizeScale;
	}
	mesh.scale.setScalar(sizeScale);
	mesh.castShadow = true;
	addMeshOutline(mesh, 0.02);

	const body = new CANNON.Body({
		mass: 0.6,
		collisionFilterGroup: GROUP_TOY,
		shape,
	});
	body.angularDamping = 0.35;
	// 弱めの空気抵抗: 落下時にはふわっと下る程度、着地後は風圧で素直に流れる
	body.linearDamping = 0.1;
	// 床面での可視範囲を計算して、画面全体のランダムな位置に降らせる
	// (0.8 倍で端ギリギリを避ける)
	const floorDistance = camera.position.y - FLOOR_Y;
	const visibleDepth = 2 * floorDistance * Math.tan((camera.fov * Math.PI) / 360);
	const visibleWidth = visibleDepth * camera.aspect;
	const spawnX = (Math.random() - 0.5) * visibleWidth * 0.8;
	const spawnZ = (Math.random() - 0.5) * visibleDepth * 0.8;
	body.position.set(spawnX, 3.5, spawnZ);
	body.velocity.set(
		(Math.random() - 0.5) * 1.2,
		-15 - hoverHeat * 30,
		(Math.random() - 0.5) * 1.2,
	);
	body.angularVelocity.set(
		(Math.random() - 0.5) * 3,
		(Math.random() - 0.5) * 3,
		(Math.random() - 0.5) * 3,
	);

	addExistingToy(mesh, body, radius);
};

let lastSpawnTime = 0;
// 降る間隔: 熱量 0 で 220ms、最大で 70ms、レインボーモード中はさらに詰める
const SPAWN_INTERVAL_MAX_MS = 220;
const SPAWN_INTERVAL_MIN_MS = 70;
const SPAWN_INTERVAL_RAINBOW_MS = 30;

const isHandOverButton = (): boolean => {
	for (const h of hands) {
		if (!h.detected) continue;
		for (const p of h.smoothed) {
			const dx = p.x - BUTTON_POS.x;
			const dz = p.z - BUTTON_POS.z;
			if (Math.abs(dx) < HOVER_HALF_X && Math.abs(dz) < HOVER_HALF_Z) {
				return true;
			}
		}
	}
	return false;
};

// ホバー中は押し込まれたように少し縮む
const BUTTON_PRESS_SCALE = 0.88;
let buttonScale = 1;

let lastUpdateTime = performance.now();

export const updateHoverButton = () => {
	const now = performance.now();
	const dt = Math.min((now - lastUpdateTime) / 1000, 0.05);
	lastUpdateTime = now;
	const hovering = isHandOverButton();
	buttonScale += ((hovering ? BUTTON_PRESS_SCALE : 1) - buttonScale) * 0.2;
	if (hovering) {
		hoverHeat = Math.min(1, hoverHeat + dt / HEAT_RISE_SECONDS);
	} else {
		hoverHeat = Math.max(0, hoverHeat - dt / HEAT_FALL_SECONDS);
	}
	// レインボーモード: MAX中はフィルが虹色にサイクルし、ボタンが軽く脈打つ
	const isMax = hoverHeat >= 1;
	if (isMax) {
		fillMaterial.color.setHSL((now * 0.0004) % 1, 0.9, 0.62);
	} else {
		fillMaterial.color.copy(BUTTON_COLOR_HOVER);
	}
	const pulse = isMax ? 1 + Math.sin(now * 0.012) * 0.04 : 1;
	const s = buttonScale * pulse;
	buttonMesh.scale.set(s, BUTTON_SQUASH * s, s);
	updateIndicator(hoverHeat);
	if (!hovering) return;
	const interval = isMax
		? SPAWN_INTERVAL_RAINBOW_MS
		: SPAWN_INTERVAL_MAX_MS -
			(SPAWN_INTERVAL_MAX_MS - SPAWN_INTERVAL_MIN_MS) * hoverHeat;
	if (now - lastSpawnTime < interval) return;
	lastSpawnTime = now;
	spawnChar();
};
