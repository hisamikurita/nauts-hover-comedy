import type * as CANNON from "cannon-es";
import type * as THREE from "three";
import { scene } from "./core";
import { physicsWorld } from "./physics";

export interface Toy {
	mesh: THREE.Mesh;
	body: CANNON.Body;
	// 掴み判定用のおおまかな半径(バウンディングスフィア)
	radius: number;
}
export const toys: Toy[] = [];

// 外部モジュール(hoverButton)から動的にトイを追加するための入口
export const addExistingToy = (
	mesh: THREE.Mesh,
	body: CANNON.Body,
	radius: number,
) => {
	scene.add(mesh);
	physicsWorld.addBody(body);
	toys.push({ mesh, body, radius });
};

export const wakeAllToys = () => {
	for (const t of toys) t.body.wakeUp();
};

export const syncToys = (_dt: number) => {
	for (const t of toys) {
		t.mesh.position.set(
			t.body.position.x,
			t.body.position.y,
			t.body.position.z,
		);
		t.mesh.quaternion.set(
			t.body.quaternion.x,
			t.body.quaternion.y,
			t.body.quaternion.z,
			t.body.quaternion.w,
		);
	}
};
