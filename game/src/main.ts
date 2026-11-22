import { GESTURE_REACTIONS } from "./core/gestureWatch";
import { gameTitle } from "./core/title";
import { watchCamera } from "./render/camera";
import { drawPond } from "./render/pond";
import { playDemo } from "./render/play";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body).then((app) => {
  const puddles = playDemo(app, drawPond(app));
  watchCamera((gesture) => {
    puddles.react(GESTURE_REACTIONS[gesture]);
  }).catch((error: unknown) => {
    // Without a camera Puddles still plays the demo and idles; there is no on-screen message yet.
    console.warn("Camera unavailable:", error);
  });
});
