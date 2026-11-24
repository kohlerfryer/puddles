/** "Copy me!": after a while idling, Puddles does a gesture himself and waits for the kid to copy it. */

import { BODY_GESTURES, type BodyGesture } from "../plugins/sense/gestures/gestures";
import type { Random } from "./random";
import type { Step } from "./reaction";

/** What Puddles does when the player makes each gesture. */
export const GESTURE_REACTIONS: Record<BodyGesture, Step> = {
  jump: { do: "jump", mood: "happy", say: "Boing!" },
  wave: { do: "look_at", target: "camera", mood: "happy", say: "Hi friend!" },
  flap: { do: "flap", mood: "silly", say: "Flap flap flap!" },
  crouch: { do: "freeze", mood: "curious", say: "Where did you go?" },
};

/** How long Puddles idles with a body in view before asking. */
export const IDLE_BEFORE_ASK_MS = 15_000;
/** How long Puddles waits for the kid to copy him. */
export const ASK_MS = 8000;

/** What Puddles does at each turn of a request; lines ending in "?" quack as asking. */
export const COPY_STEPS = {
  ask: {
    jump: { do: "jump", target: "camera", mood: "silly", say: "Can you jump?" },
    wave: { do: "look_at", target: "camera", mood: "happy", say: "Can you wave?" },
    flap: { do: "flap", target: "camera", mood: "silly", say: "Can you flap?" },
    crouch: { do: "freeze", target: "camera", mood: "curious", say: "Can you crouch?" },
  },
  yes: { do: "dance", target: "camera", mood: "happy", say: "You did it!" },
  no: { do: "freeze", target: "camera", mood: "grossed_out", say: "Not that one!" },
  timeout: { do: "look_at", target: "reeds", mood: "curious", say: "Maybe next time." },
} as const satisfies {
  ask: Record<BodyGesture, Step>;
  yes: Step;
  no: Step;
  timeout: Step;
};

/** What Puddles does next: ask, answer the kid, give up, or mirror a gesture one to one. */
export type CopyCue =
  | { readonly kind: "ask" | "mirror"; readonly gesture: BodyGesture; readonly step: Step }
  | { readonly kind: "yes" | "no" | "timeout"; readonly step: Step };

/** Whether a body is in front of the camera and whether Puddles is in the middle of acting. */
interface Watching {
  readonly inView: boolean;
  readonly busy: boolean;
}

/** Any gesture but `last`, chosen by one roll. */
function pick(random: Random, last: BodyGesture | undefined): BodyGesture {
  const choices = BODY_GESTURES.filter((g) => g !== last);
  return choices[Math.floor(random() * choices.length)] ?? "jump";
}

/**
 * The request loop, idle → asking → yes or no → idle, driven by `tick` on a steady clock in
 * milliseconds and `see` for each gesture the player makes.
 */
export function createCopyMe(random: Random) {
  let asking: { readonly gesture: BodyGesture; readonly since: number } | undefined;
  let last: BodyGesture | undefined;
  let idleSince: number | undefined;

  const idleFrom = (now: number): void => {
    asking = undefined;
    idleSince = now;
  };

  return {
    phase: (): "idle" | "asking" => (asking ? "asking" : "idle"),
    /** Moves time on to `now`, asking once Puddles has idled long enough and giving up once the wait is over. */
    tick(now: number, { inView, busy }: Watching): CopyCue | undefined {
      if (asking) {
        if (now - asking.since < ASK_MS) return undefined;
        idleFrom(now);
        return { kind: "timeout", step: COPY_STEPS.timeout };
      }
      if (!inView || busy || idleSince === undefined) {
        idleSince = now;
        return undefined;
      }
      if (now - idleSince < IDLE_BEFORE_ASK_MS) return undefined;
      const gesture = pick(random, last);
      last = gesture;
      asking = { gesture, since: now };
      return { kind: "ask", gesture, step: COPY_STEPS.ask[gesture] };
    },
    /** Answers `gesture` seen at `now`: yes or no while asking, its one-to-one reaction otherwise. */
    see(gesture: BodyGesture, now: number): CopyCue {
      if (!asking) return { kind: "mirror", gesture, step: GESTURE_REACTIONS[gesture] };
      if (gesture !== asking.gesture) return { kind: "no", step: COPY_STEPS.no };
      idleFrom(now);
      return { kind: "yes", step: COPY_STEPS.yes };
    },
  };
}
