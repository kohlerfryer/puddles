/**
 * Showcase scenarios (spec §16) as end-to-end tests: a scripted recording plays through the game's
 * real senses, brains, guardian and skills on the headless kernel, as `pnpm dev --input` would play
 * it in the browser, and each test checks what Puddles did.
 */

import { scriptMs } from "../core/ask";
import type { KernelEvent } from "../core/contracts";
import { isPoseFixture, type PoseFrame } from "../core/poseFixture";
import type { SafeReaction } from "../core/validator";
import { createKernel } from "../kernel/kernel";
import { gameOptions } from "../plugins/game";
import { heldHand } from "../plugins/sense/held_object";
import { recordedSenses } from "../plugins/sense/recorded";
import { type Recording, recordingEnd } from "../plugins/sense/recorded/recording";

/** Long enough that the guardian never suggests a break mid-scenario. */
const SESSION_LIMIT_MIN = 20;
/** The gap between one clip's last frame and the next one's first: one camera sample. */
const SAMPLE_MS = 66;

export interface Scenario {
  readonly recording: Recording;
  /** The kernel's seed, which settles whatever the brains choose at random. */
  readonly seed: number;
  /** The server's reply to each photo of a held-up object; without one the sense re-arms at once. */
  readonly reply?: SafeReaction;
}

/** Every event the game logs playing `scenario`, from kernel time 0 to the recording's end. */
export function play({ recording, seed, reply }: Scenario): KernelEvent[] {
  const { folders, held } = recordedSenses(recording);
  const kernel = createKernel({ ...gameOptions(folders, SESSION_LIMIT_MIN, seed), now: () => 0 });
  const end = recordingEnd(recording);
  while (kernel.clock.t <= end) {
    const seen = kernel.log.count;
    kernel.tick();
    for (const event of kernel.log.since(seen).filter((e) => heldHand(e) !== undefined)) {
      if (reply) held.reacted(reply);
      held.finished(event.t + (reply ? scriptMs(reply.script) : 0));
    }
  }
  return kernel.log.events();
}

/** A gesture fixture's pose frames; throws for anything else. */
export function clip(fixture: unknown): PoseFrame[] {
  if (!isPoseFixture(fixture)) throw new Error("scenario: not a gesture fixture");
  return fixture.frames;
}

/** The clips' frames back to back from time 0, each clip starting a sample after the last ends. */
export function backToBack(...clips: readonly (readonly PoseFrame[])[]): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (const next of clips) {
    const start = (frames.at(-1)?.t ?? -SAMPLE_MS) + SAMPLE_MS;
    const first = next[0]?.t ?? 0;
    frames.push(...next.map((frame) => ({ ...frame, t: frame.t - first + start })));
  }
  return frames;
}

/** What Puddles said, as `brain: line`, in order. */
export function said(events: readonly KernelEvent[]): string[] {
  return events
    .filter((e) => e.type === "action.started" && typeof e.data.say === "string")
    .map((e) => `${String(e.data.brain)}: ${String(e.data.say)}`);
}
