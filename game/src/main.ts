import { gameTitle } from "./core/title";
import { watchCamera } from "./render/camera";
import { createDevPanel } from "./render/devPanel";
import { createHud } from "./render/hud";
import { drawPond } from "./render/pond";
import { playDemo } from "./render/play";
import { createVoice } from "./render/sound";
import { createStage } from "./render/stage";

document.title = gameTitle();
void createStage(document.body).then((app) => {
  const hud = createHud(document.body);
  const puddles = playDemo(
    app,
    drawPond(app),
    createVoice((text) => {
      hud.sound(text);
    }),
  );
  createDevPanel(document.body, puddles);
  watchCamera(
    (gesture) => {
      hud.gesture(gesture, puddles.see(gesture).step.say);
    },
    (frame) => {
      hud.status("watching");
      puddles.watching(frame !== undefined);
      hud.frame(frame);
    },
  ).catch((error: unknown) => {
    hud.status(`unavailable (${String(error)})`);
  });
});
