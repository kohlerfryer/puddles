import { ask, type Post, reactUrl, toBase64 } from "./core/ask";
import { gameTitle } from "./core/title";
import type { SafeReaction } from "./core/validator";
import type { KernelEvent } from "./core/contracts";
import { loadSave, SESSION_LIMIT_MIN, type SaveServer, saveUrl } from "./kernel/saves";
import { gestureOf } from "./plugins/sense/gestures";
import { momentOf } from "./plugins/sense/recorded";
import { parseRecording, type Recording } from "./plugins/sense/recorded/recording";
import { watchCamera } from "./render/camera";
import { createDevOverlay } from "./render/devOverlay";
import { createDevPanel } from "./render/devPanel";
import { createHud, type Hud } from "./render/hud";
import { createParentPanel } from "./render/parentPanel";
import { drawPond } from "./render/pond";
import { type Actor, playDemo } from "./render/play";
import { replayRecording } from "./render/recorded";
import { createVoice } from "./render/sound";
import { createStage } from "./render/stage";

const REACT_URL = reactUrl(import.meta.env.VITE_PUDDLES_SERVER);
const SAVE_URL = saveUrl(import.meta.env.VITE_PUDDLES_SERVER);
const INPUT = import.meta.env.VITE_PUDDLES_INPUT;

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
 * Sends `photo` to the server while Puddles senses it and drops it in as the prop the matcher
 * named, or as a photo sticker when it named none; resolves with the reaction, which the object
 * matcher brain plays.
 */
async function reactTo(photo: Blob, puddles: Actor, hud: Hud): Promise<SafeReaction> {
  puddles.sense(true);
  hud.server("asking...");
  const image = toBase64(new Uint8Array(await photo.arrayBuffer()));
  const { reaction, readout } = await ask(image, post, REACT_URL, () => performance.now());
  puddles.sense(false);
  hud.server(readout);
  puddles.spawn(reaction.traits, reaction.prop?.color ?? (await createImageBitmap(photo)));
  return reaction;
}

/** What the game shows: Puddles, the HUD, and where each kernel event goes. */
interface Screen {
  readonly puddles: Actor;
  readonly hud: Hud;
  readonly see: (event: KernelEvent) => void;
}

/** Shows each gesture on the HUD, hands every event to Puddles and logs it on the dev overlay. */
function follower(puddles: Actor, hud: Hud, overlay: (event: KernelEvent) => void) {
  return (event: KernelEvent): void => {
    const gesture = gestureOf(event);
    if (gesture) hud.gesture(gesture);
    puddles.follow(event);
    overlay(event);
  };
}

/**
 * Plays the recording in `input` in place of the camera, naming its key moments on the HUD, or
 * says on the HUD why it can't.
 */
function replay(input: string, sessionLimitMin: number, { puddles, hud, see }: Screen): void {
  let recording: Recording;
  try {
    recording = parseRecording(input);
  } catch (error) {
    hud.status(`replay failed (${String(error)})`);
    return;
  }
  hud.status("replaying a recording");
  replayRecording(recording, sessionLimitMin, {
    onEvent: (event) => {
      see(event);
      const moment = momentOf(event);
      if (moment) hud.moment(moment);
    },
    onFrame: (frame) => {
      hud.frame(frame);
      puddles.watching(frame);
    },
    onEnd: () => {
      hud.status("replay finished");
    },
  });
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
  const see = follower(puddles, hud, createDevOverlay(document.body));
  if (INPUT !== undefined) {
    const limit = save?.settings.session_limit_min ?? SESSION_LIMIT_MIN.default;
    replay(INPUT, limit, { puddles, hud, see });
    return;
  }
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
    see,
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
