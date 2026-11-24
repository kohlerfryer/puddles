import { replayCamera } from "../core/cameraSample";
import type { KernelEvent } from "../core/contracts";
import { createKernel } from "../kernel/kernel";
import { gestureOf } from "../plugins/sense/gestures";
import { heldHand } from "../plugins/sense/held_object";
import { momentOf, recordedSenses } from "../plugins/sense/recorded";
import { cameraSamples, parseRecording, recordingEnd } from "../plugins/sense/recorded/recording";
import { driveKernel } from "./camera";
import type { Hud } from "./hud";
import type { Actor } from "./play";

/** Reads the recording, or says on the HUD why it can't. */
function read(input: string, hud: Hud) {
  try {
    return parseRecording(input);
  } catch (error) {
    hud.status(`replay failed (${String(error)})`);
    return undefined;
  }
}

/**
 * Plays a recording through the real senses in a kernel, in place of the camera, from kernel time
 * 0 until its last sample. A held-up hand takes no photo, since a recording has no image; the sense
 * re-arms straight away instead.
 */
export function replayRecording(input: string, puddles: Actor, hud: Hud): void {
  const recording = read(input, hud);
  if (!recording) return;
  hud.status("replaying a recording");
  const camera = replayCamera(cameraSamples(recording));
  const { folders, held } = recordedSenses(recording);
  const kernel = createKernel({ plugins: folders });
  const end = recordingEnd(recording);
  const see = (event: KernelEvent): void => {
    if (event.type === "observation.kid") {
      const frame = camera(event.t)?.pose;
      hud.frame(frame);
      puddles.watching(frame);
    }
    const gesture = gestureOf(event);
    if (gesture) hud.gesture(gesture, puddles.see(gesture).step.say);
    const moment = momentOf(event);
    if (moment) hud.moment(moment);
    if (heldHand(event)) held.finished(event.t);
  };
  const stop = driveKernel(kernel, (events) => {
    events.forEach(see);
    if (kernel.clock.t <= end) return;
    stop();
    hud.status("replay finished");
  });
}
