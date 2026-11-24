import { ask, type Post, reactUrl, scriptMs, toBase64 } from "./core/ask";
import { gameTitle } from "./core/title";
import { loadSave, type SaveServer, saveUrl } from "./kernel/saves";
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
  load: async (): Promise<unknown> => (await fetch(SAVE_URL)).json() as Promise<unknown>,
  store: async (save) => {
    const reply = await fetch(SAVE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(save),
    });
    if (!reply.ok) throw new Error(`save failed: ${String(reply.status)}`);
  },
};

/** Sends `photo` to the server while Puddles senses it, then plays his reaction; resolves once it ends. */
async function reactTo(photo: Blob, puddles: Actor, hud: Hud): Promise<void> {
  puddles.sense(true);
  hud.server("asking...");
  const image = toBase64(new Uint8Array(await photo.arrayBuffer()));
  const { reaction, readout } = await ask(image, post, REACT_URL, () => performance.now());
  puddles.sense(false);
  hud.server(readout);
  puddles.spawn(reaction.traits, await createImageBitmap(photo));
  puddles.play(reaction.script);
  await new Promise((done) => setTimeout(done, scriptMs(reaction.script)));
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
  if (!save.settings.camera) {
    hud.status("camera off (grown-ups panel)");
    return;
  }
  watchCamera(
    (gesture) => {
      hud.gesture(gesture, puddles.see(gesture).step.say);
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
