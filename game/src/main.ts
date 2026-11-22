import { GESTURE_REACTIONS } from "./core/gestureWatch";
import { createRunner } from "./core/runner";
import { gameTitle } from "./core/title";
import { watchCamera } from "./render/camera";
import { drawPond } from "./render/pond";
import { drawPuddles } from "./render/puddles";
import { createStage } from "./render/stage";

document.title = gameTitle();
const runner = createRunner();
void createStage(document.body).then((app) => drawPuddles(app, drawPond(app), runner));
watchCamera((gesture, now) => {
  runner.react(GESTURE_REACTIONS[gesture], now);
}).catch((error: unknown) => {
  // Without a camera Puddles still idles; there is no on-screen message yet.
  console.warn("Camera unavailable:", error);
});
