/**
 * "Copy me!": after a while idling with the kid in view, the copy-me brain starts the copy-me
 * behavior, in which Puddles does a gesture himself and waits for the kid to copy it. It runs above
 * the reflexes, so while it waits the kid's gestures are answers, not something to mirror.
 */

import type { KernelEvent, Intent, Mood, Step } from "../../../core/contracts";
import type { Random } from "../../../core/random";
import type { Behavior, Finished, PluginFolder } from "../../../kernel/plugins";
import { BODY_GESTURES, type BodyGesture } from "../../sense/gestures/gestures";
import manifest from "./manifest.json";

/** How long Puddles idles with a body in view before asking. */
export const IDLE_BEFORE_ASK_MS = 15_000;
/** How long Puddles waits for the kid to copy him, from when he asks. */
export const ASK_MS = 8000;
/** Above the reflexes, so the kid's gestures go to copy-me while it runs. */
const PRIORITY = 2;

const ask = (skill: string, gesture: BodyGesture, mood: Mood): Step => ({
  skill,
  args: { target: "camera" },
  mood,
  say: `Can you ${gesture}?`,
  think: gesture,
});

/** What Puddles does at each turn of a request; lines ending in "?" quack as asking. */
export const COPY_STEPS = {
  ask: {
    jump: ask("jump", "jump", "silly"),
    wave: ask("look_at", "wave", "happy"),
    flap: ask("flap", "flap", "silly"),
    crouch: ask("freeze", "crouch", "curious"),
  },
  yes: { skill: "dance", args: { target: "camera" }, mood: "happy", say: "You did it!" },
  no: { skill: "freeze", args: { target: "camera" }, mood: "grossed_out", say: "Not that one!" },
  timeout: {
    skill: "look_at",
    args: { target: "reeds" },
    mood: "curious",
    say: "Maybe next time.",
  },
} as const satisfies { ask: Record<BodyGesture, Step>; yes: Step; no: Step; timeout: Step };

type Answer = "yes" | "timeout";

/**
 * Asks for `params.gesture` and waits for the kid in `copy_gesture` until `ASK_MS` after asking:
 * a dance for the right gesture, a no and more waiting for a wrong one, a sigh once time is up.
 * Ends with one outcome saying how it went.
 */
export const copyMe: Behavior = (params, { t }) => {
  const asked = BODY_GESTURES.find((gesture) => gesture === params.gesture) ?? "jump";
  const wait: Step = { skill: "copy_gesture", args: { gesture: asked, until: t + ASK_MS } };
  let waiting = false;
  let answer: Answer | undefined;
  const heard = (last: Finished): Step => {
    waiting = false;
    const seen = last.effects?.gesture;
    if (seen === undefined) answer = "timeout";
    else if (seen === asked) answer = "yes";
    return answer ? COPY_STEPS[answer] : { ...COPY_STEPS.no, think: asked };
  };
  return (last) => {
    if (!last) return COPY_STEPS.ask[asked];
    if (last.status === "failed") return last;
    if (answer) return { status: "done", effects: { answer } };
    if (waiting) return heard(last);
    waiting = true;
    return wait;
  };
};

/** Any gesture but `last`, chosen by one roll. */
function pick(random: Random, last: BodyGesture | undefined): BodyGesture {
  const choices = BODY_GESTURES.filter((g) => g !== last);
  return choices[Math.floor(random() * choices.length)] ?? "jump";
}

/** What the brain knows from the log: whether the kid is in view and whether Puddles is busy. */
interface Watch {
  inView: boolean;
  busy: boolean;
  idleSince: number | undefined;
}

const ENDED = new Set(["intent.done", "intent.failed"]);

function follow(watch: Watch, events: readonly KernelEvent[], t: number): void {
  for (const { type, data } of events) {
    if (type === "observation.kid") watch.inView = data.present === true;
    else if (type === "intent.started") watch.busy = true;
    else if (ENDED.has(type)) {
      watch.busy = false;
      watch.idleSince = t;
    }
  }
}

/** The copy-me brain: starts the copy-me behavior once Puddles has idled long enough. */
export function copyMeBrain(): PluginFolder {
  const watch: Watch = { inView: false, busy: false, idleSince: undefined };
  let last: BodyGesture | undefined;
  return {
    manifest,
    code: {
      decide: ({ t, events, random }): Intent | null => {
        follow(watch, events, t);
        const { inView, busy, idleSince } = watch;
        if (!inView || busy || idleSince === undefined) {
          watch.idleSince = t;
          return null;
        }
        if (t - idleSince < IDLE_BEFORE_ASK_MS) return null;
        watch.idleSince = t;
        last = pick(random, last);
        return {
          brain: manifest.id,
          priority: PRIORITY,
          kind: "behavior",
          behavior: { id: manifest.id, params: { gesture: last } },
          why: "idled with the kid in view",
          features: ["copies_kid"],
        };
      },
    },
  };
}
