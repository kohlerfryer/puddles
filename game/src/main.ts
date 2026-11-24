import { ask, type Post, reactUrl, toBase64 } from "./core/ask";
import { gameTitle } from "./core/title";
import type { SafeReaction } from "./core/validator";
import { loadSave, type SaveServer, saveUrl } from "./kernel/saves";
import { gestureOf } from "./plugins/sense/gestures";
import { watchCamera } from "./render/camera";
import { createDevPanel } from "./render/devPanel";
import { createHud, type Hud } from "./render/hud";
import { createParentPanel } from "./render/parentPanel";
import { drawPond } from "./render/pond";
import { type Actor, playDemo } from "./render/play";
import { createVoice } from "./render/sound";
import { createStage } from "./render/stage";

const REACT_URL = reactUrl(import.meta.env.VITE_PUDDLES_SERVER);
const SAVE_URL = saveUrl(import.meta.env.VITE_PUDDLES_SERVER);

const post: Post = (url, body, signal) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });

const saves: SaveServer = {
  load: async (): Promise<unknown> => {
    const reply = await fetch(SAVE_URL);
    if (!reply.ok) throw new Error(`load failed: ${String(reply.status)}`);
    return reply.json() as Promise<unknown>;
  },
  store: async (save) => {
    const reply = await fetch(SAVE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(save),
    });
    if (!reply.ok) throw new Error(`save failed: ${String(reply.status)}`);
  },
};

/**
 * Sends `photo` to the server while Puddles senses it and drops it in as a sticker; resolves with
 * the reaction, which the object matcher brain plays.
 */
async function reactTo(photo: Blob, puddles: Actor, hud: Hud): Promise<SafeReaction> {
  puddles.sense(true);
  hud.server("asking...");
  const image = toBase64(new Uint8Array(await photo.arrayBuffer()));
  const { reaction, readout } = await ask(image, post, REACT_URL, () => performance.now());
  puddles.sense(false);
  hud.server(readout);
  puddles.spawn(reaction.traits, await createImageBitmap(photo));
  return reaction;
}

document.title = gameTitle();
void Promise.all([createStage(document.body), loadSave(saves)]).then(([app, save]) => {
  const hud = createHud(document.body);
  const puddles = playDemo(
    app,
    drawPond(app),
    createVoice((text) => {
      hud.sound(text);
    }),
  );
  createDevPanel(document.body, puddles);
  createParentPanel(document.body, saves, save);
  if (!save) {
    hud.status("camera off until the save loads (reload once the server is up)");
    return;
  }
  if (!save.settings.camera) {
    hud.status("camera off (grown-ups panel)");
    return;
  }
  watchCamera(
    save.settings.session_limit_min,
    (event) => {
      const gesture = gestureOf(event);
      if (gesture) hud.gesture(gesture);
      puddles.follow(event);
    },
    (frame) => {
      hud.status("watching");
      hud.frame(frame);
      puddles.watching(frame);
    },
    (photo) => reactTo(photo, puddles, hud),
  ).catch((error: unknown) => {
    hud.status(`unavailable (${String(error)})`);
  });
});
