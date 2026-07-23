import { initHandTracking, updateHand } from "./app/handTracking";
import { setStatus } from "./app/status";
import {
	handleResize,
	loadRigModel,
	startAnimationLoop,
	updateHandDisplay,
	updateHoverButton,
	updatePhysics,
} from "./webgl";

handleResize();

if (document.documentElement.dataset.mobile === "true") {
	// モバイルではハンドトラッキングを起動せず、物理演算だけ動かしてシーンを見せる
	setStatus("Please access from a desktop browser.");
	startAnimationLoop(() => {
		updatePhysics();
	});
} else {
	loadRigModel();

	initHandTracking().catch((err) => {
		console.error(err);
		setStatus("Failed to start the camera");
	});

	startAnimationLoop(() => {
		updateHand();
		updateHandDisplay();
		updateHoverButton();
		updatePhysics();
	});
}
