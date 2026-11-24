import { newSamples, type Point, type ReadCamera } from "../../../core/cameraSample";
import type { KernelEvent } from "../../../core/contracts";
import type { SafeReaction } from "../../../core/validator";
import type { Emitted, PluginFolder } from "../../../kernel/plugins";
import { armRaised, createHoldWatch, highestHand } from "./hold";
import manifest from "./manifest.json";

const HELD = "observation.held";
const OBJECT = "observation.object";

/** The sense, and how the game tells it what the server made of the photo and when that ended. */
export interface HeldObjectSense {
  readonly folder: PluginFolder;
  /** The server's reply about the photo; logged on the next tick, without the photo. */
  reacted(reaction: SafeReaction): void;
  /** The reaction finished at `t`, on the camera samples' clock; the sense re-arms after a cooldown. */
  finished(t: number): void;
}

/** The hand's corners, which frame the photo just as the whole hand would. */
function corners(hand: readonly Point[]): Point[] {
  const xs = hand.map((p) => p.x);
  const ys = hand.map((p) => p.y);
  return [
    { x: Math.min(...xs), y: Math.min(...ys) },
    { x: Math.max(...xs), y: Math.max(...ys) },
  ];
}

/**
 * Emits `observation.held` when the kid holds a raised hand still, with only the hand's corners,
 * so the game knows where to take the photo, and `observation.object` with the server's reaction
 * to it; the landmarks and the image stay out of the log.
 */
export function heldObjectSense(read: ReadCamera): HeldObjectSense {
  const fresh = newSamples(read);
  const watch = createHoldWatch();
  const replies: Emitted[] = [];
  const hold = (t: number): Emitted[] => {
    const sample = fresh(t);
    if (!sample) return [];
    const hand = highestHand(sample.hands);
    const raised = sample.pose !== undefined && armRaised(sample.pose);
    if (!watch.push({ t: sample.t, raised, hand }) || !hand) return [];
    return [{ type: HELD, data: { hand: corners(hand) } }];
  };
  return {
    folder: { manifest, code: { sense: ({ t }) => [...replies.splice(0), ...hold(t)] } },
    reacted: (reaction) => {
      replies.push({ type: OBJECT, data: { reaction } });
    },
    finished: (t) => {
      watch.finished(t);
    },
  };
}

const isPoint = (value: unknown): value is Point =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "x") === "number" &&
  typeof Reflect.get(value, "y") === "number";

/** The hand's corners from an `observation.held` event, or nothing for any other event. */
export function heldHand({ type, data }: KernelEvent): Point[] | undefined {
  const { hand } = data;
  if (type !== HELD || !Array.isArray(hand) || !hand.every(isPoint)) return undefined;
  return hand;
}
