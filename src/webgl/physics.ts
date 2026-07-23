import * as CANNON from "cannon-es";
import { FLOOR_Y } from "./constants";

export const physicsWorld = new CANNON.World({
	gravity: new CANNON.Vec3(0, -18, 0),
});
physicsWorld.allowSleep = true;
physicsWorld.defaultContactMaterial.friction = 0.35;
physicsWorld.defaultContactMaterial.restitution = 0.45;

// 衝突グループ: 手コライダーはおもちゃとだけ衝突させる
export const GROUP_TOY = 1;
export const GROUP_HAND = 2;
export const GROUP_STATIC = 4;

// 床だけを設置。壁と天井はなくして、はじかれた toys は自由に画面外へ飛べる
const floorBody = new CANNON.Body({
	type: CANNON.Body.STATIC,
	shape: new CANNON.Plane(),
	collisionFilterGroup: GROUP_STATIC,
});
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
floorBody.position.set(0, FLOOR_Y, 0);
physicsWorld.addBody(floorBody);

// 壁が動く仕組みは廃止したので常に false を返す(interactions 側の wakeAllToys は不要)
export const updatePlayBounds = (): boolean => false;
