// Scene: おもちゃの撮影スタジオ風 (パステル単色 + 円形床)
export const BACKGROUND_COLOR = "#f2efe9";

export const FOG = {
	NEAR: 20,
	FAR: 55,
} as const;

// Camera: 真上から床を見下ろす俯瞰視点
export const CAMERA = {
	FOV: 35,
	NEAR: 0.1,
	FAR: 100,
	INITIAL_Y: 22,
	// モバイルはカメラを引いてシーン全体を小さく収める
	MOBILE_Y: 32,
} as const;

// モバイルではトイのサイズ自体も縮めて、狭いビューポートで見せる
export const MOBILE_TOY_SCALE = 0.6;

// 陰影
export const SHADING_PARAMS = {
	gradientShadow: 142,
	gradientMid: 176,
	gradientHighlight: 255,
	keyLight: 4,
	rimLight: 1.2,
	ambient: 0.35,
	shadowOpacity: 0.12,
};

// Background
export const FLOOR_COLOR = "#e5ded2";

// Physics
export const FLOOR_Y = -4;

// 手首→中指付け根の目標ワールド距離。handTracking のランドマーク正規化と
// interactions の当たり判定サイズの両方に使うので共有定数として置く
export const TARGET_HAND_SPAN = 2.8;

// MediaPipe hand landmarks
export const FINGER_CHAINS: number[][] = [
	[0, 1, 2, 3, 4],
	[0, 5, 6, 7, 8],
	[0, 9, 10, 11, 12],
	[0, 13, 14, 15, 16],
	[0, 17, 18, 19, 20],
];
export const FINGER_TIPS = [4, 8, 12, 16, 20];

// トイハンド (プリミティブ表示) の寸法
export const FINGER_RADIUS = 0.21;
export const TIP_RADIUS = 0.26;
export const PALM_THICKNESS = 0.38;

// Rig model
export const MODEL_URL = `${import.meta.env.BASE_URL}cartoon_hand.glb`;
