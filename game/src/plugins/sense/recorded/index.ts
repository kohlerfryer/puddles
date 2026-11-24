import { replayCamera } from "../../../core/cameraSample";
import type { KernelEvent } from "../../../core/contracts";
import type { Emitted, PluginFolder } from "../../../kernel/plugins";
import { gestureOf, gesturesSense } from "../gestures";
import { type HeldObjectSense, heldHand, heldObjectSense } from "../held_object";
import { poseSense } from "../pose";
import manifest from "./manifest.json";
import { cameraSamples, type Recording } from "./recording";

/** A smile at least this much above the kid's calm level is worth a screenshot. */
const BIG_SMILE = 0.3;

/** Hands out each sample once, as soon as kernel time reaches it; `samples` are in time order. */
function due<T extends { t: number }>(samples: readonly T[]): (t: number) => T[] {
  let next = 0;
  return (t) => {
    const start = next;
    while (next < samples.length && (samples[next]?.t ?? Infinity) <= t) next += 1;
    return samples.slice(start, next);
  };
}

/**
 * Emits `observation.smile` and `observation.speech` from a recording at the times they were
 * recorded, standing in for the smile and voice senses, which have no live versions yet.
 */
export function recordedSense(recording: Recording): PluginFolder {
  const smiles = due(recording.smile);
  const voices = due(recording.voice);
  return {
    manifest,
    code: {
      sense: ({ t }): Emitted[] => [
        ...smiles(t).map(({ level, delta }) => ({
          type: "observation.smile",
          data: { level, delta },
        })),
        ...voices(t).map(({ active, command }) => ({
          type: "observation.speech",
          data: command === undefined ? { active } : { active, command },
        })),
      ],
    },
  };
}

/** Every sense reading `recording`: the camera senses on its landmarks, and its smiles and voice. */
export function recordedSenses(recording: Recording): {
  folders: PluginFolder[];
  held: HeldObjectSense;
} {
  const read = replayCamera(cameraSamples(recording));
  const held = heldObjectSense(read);
  return {
    folders: [poseSense(read), gesturesSense(read), held.folder, recordedSense(recording)],
    held,
  };
}

function speechMoment({ type, data }: KernelEvent): string | undefined {
  if (type !== "observation.speech" || typeof data.command !== "string") return undefined;
  return `heard "${data.command}"`;
}

function smileMoment({ type, data }: KernelEvent): string | undefined {
  if (type !== "observation.smile" || typeof data.delta !== "number") return undefined;
  return data.delta >= BIG_SMILE ? "big smile" : undefined;
}

/** A short name for an event worth a screenshot (gestures, holds, commands, big smiles), or nothing. */
export function momentOf(event: KernelEvent): string | undefined {
  if (heldHand(event)) return "held something up";
  return gestureOf(event) ?? speechMoment(event) ?? smileMoment(event);
}
