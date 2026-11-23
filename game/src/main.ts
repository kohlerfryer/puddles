import { GESTURE_REACTIONS } from "./core/gestureWatch";
import { gameTitle } from "./core/title";
import { watchCamera } from "./render/camera";
import { createDevPanel } from "./render/devPanel";
import { createHud } from "./render/hud";
import { drawPond } from "./render/pond";
import { playDemo } from "./render/play";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body).then((app) => {
  const puddles = playDemo(app, drawPond(app));
  const hud = createHud(document.body);
  createDevPanel(document.body, puddles);
  watchCamera(
    (gesture) => {
      const reaction = GESTURE_REACTIONS[gesture];
      hud.gesture(gesture, reaction.say);
      puddles.think(gesture);
      puddles.react(reaction);
    },
    (frame) => {
      hud.status("watching");
      hud.frame(frame);
      puddles.see(frame);
    },
  ).catch((error: unknown) => {
    hud.status(`unavailable (${String(error)})`);
  });
});
