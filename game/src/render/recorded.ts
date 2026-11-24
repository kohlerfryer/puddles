import { replayCamera } from "../core/cameraSample";
import type { KernelEvent } from "../core/contracts";
import type { PoseFrame } from "../core/poseFixture";
import { heldHand } from "../plugins/sense/held_object";
import { recordedSenses } from "../plugins/sense/recorded";
import { cameraSamples, type Recording, recordingEnd } from "../plugins/sense/recorded/recording";
import { driveKernel, liveKernel } from "./camera";

/** What a replay tells the game as it plays. */
export interface ReplayHandlers {
  /** Each event the kernel logs. */
  readonly onEvent: (event: KernelEvent) => void;
  /** The recorded pose at each tick. */
  readonly onFrame: (frame: PoseFrame | undefined) => void;
  /** The recording has played to its last sample. */
  readonly onEnd: () => void;
}

/**
 * Plays `recording` through the real senses, brains and skills in place of the camera, from kernel
 * time 0 until its last sample. A held-up hand takes no photo, since a recording has no image; the
 * sense re-arms straight away instead.
 */
export function replayRecording(
  recording: Recording,
  sessionLimitMin: number,
  { onEvent, onFrame, onEnd }: ReplayHandlers,
): void {
  const camera = replayCamera(cameraSamples(recording));
  const { folders, held } = recordedSenses(recording);
  const kernel = liveKernel(folders, sessionLimitMin);
  const end = recordingEnd(recording);
  const stop = driveKernel(kernel, (events) => {
    onFrame(camera(kernel.clock.t)?.pose);
    for (const event of events) {
      onEvent(event);
      if (heldHand(event)) held.finished(event.t);
    }
    if (kernel.clock.t <= end) return;
    stop();
    onEnd();
  });
}
