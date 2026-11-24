/**
 * The kernel's guardian: every intent passes it before the executor plays anything. Unsafe
 * intents are replaced by a safe fallback, intents over a brain's budget are dropped, and
 * past the session soft limit Puddles yawns and suggests a break. Each verdict is an event.
 */

import type { Event, Intent } from "../../core/contracts";
import { contractValidators } from "../../core/contractsSchema";
import { type Limits, type Violation, violation } from "./rules";

/** How long after a suggested break Puddles suggests another, in ms. */
export const BREAK_REPEAT_MS = 5 * 60_000;
const SECOND_MS = 1000;
const MINUTE_MS = 60_000;
const SOURCE = "guardian";

export interface GuardianSettings extends Limits {
  readonly intentsPerSecond: number;
  readonly modelCallsPerMinute: number;
  /** Session time, in ms, after which Puddles suggests a break. */
  readonly sessionSoftLimitMs: number;
}

/** What plays instead of the intent (null when it is dropped), and the event to log. */
export interface Verdict {
  readonly intent: Intent | null;
  readonly event: Event;
}

export interface ModelCallVerdict {
  readonly allowed: boolean;
  readonly event: Event;
}

export interface Guardian {
  /** Checks a brain's output at kernel time `t` in ms. */
  check(intent: unknown, t: number): Verdict;
  /** Whether `brain` may call its model at kernel time `t` in ms. */
  modelCall(brain: string, t: number): ModelCallVerdict;
}

const event = (t: number, type: string, data: Record<string, unknown>): Event => ({
  t,
  type: `guardian.${type}`,
  source: SOURCE,
  data,
});

const rejected = (t: number, brain: string, broken: Violation): Event =>
  event(t, "rejected", { brain, rule: broken.rule, reason: broken.reason });

const fallback = (priority: number, reason: string): Intent => ({
  brain: SOURCE,
  priority,
  kind: "routine",
  steps: [{ skill: "look_at", args: { target: "camera" }, mood: "curious", say: "Hmm..." }],
  why: `fallback: ${reason}`,
});

const rest = (priority: number): Intent => ({
  brain: SOURCE,
  priority,
  kind: "routine",
  steps: [
    {
      skill: "look_at",
      args: { target: "camera" },
      mood: "happy",
      say: "Yawn... time for a break?",
    },
    { skill: "nap", args: {} },
  ],
  why: "session soft limit: suggest a break",
});

/** The brain an output claims to come from, even when the output is malformed. */
function brainOf(output: unknown): string {
  const brain = (output as { brain?: unknown } | null)?.brain;
  return typeof brain === "string" && brain !== "" ? brain : "unknown";
}

/** Allows at most `limit` events per key in any `spanMs` window. */
function budget(limit: number, spanMs: number): (key: string, t: number) => boolean {
  const times = new Map<string, number[]>();
  return (key, t) => {
    const recent = (times.get(key) ?? []).filter((time) => time > t - spanMs);
    const allowed = recent.length < limit;
    times.set(key, allowed ? [...recent, t] : recent);
    return allowed;
  };
}

/** Checks a schema-valid intent against the content rules. */
function judge(intent: Intent, t: number, limits: Limits): Verdict {
  const broken = violation(intent, limits);
  if (broken === null) return { intent, event: event(t, "passed", { brain: intent.brain }) };
  return {
    intent: fallback(intent.priority, broken.reason),
    event: rejected(t, intent.brain, broken),
  };
}

export function createGuardian(settings: GuardianSettings): Guardian {
  const intentBudget = budget(settings.intentsPerSecond, SECOND_MS);
  const modelBudget = budget(settings.modelCallsPerMinute, MINUTE_MS);
  let nextBreakAt = settings.sessionSoftLimitMs;

  return {
    check(output, t) {
      const brain = brainOf(output);
      if (!intentBudget(brain, t)) {
        const reason = `over ${String(settings.intentsPerSecond)} intents per second`;
        return { intent: null, event: rejected(t, brain, { rule: "rate", reason }) };
      }
      const valid = contractValidators.intent(output);
      const priority = valid ? output.priority : 0;
      if (t >= nextBreakAt) {
        nextBreakAt = t + BREAK_REPEAT_MS;
        return { intent: rest(priority), event: event(t, "break", { brain }) };
      }
      if (valid) return judge(output, t, settings);
      const broken: Violation = { rule: "schema", reason: "not a valid intent" };
      return { intent: fallback(0, broken.reason), event: rejected(t, brain, broken) };
    },
    modelCall(brain, t) {
      if (modelBudget(brain, t)) {
        return { allowed: true, event: event(t, "passed", { brain, model_call: true }) };
      }
      const reason = `over ${String(settings.modelCallsPerMinute)} model calls per minute`;
      return { allowed: false, event: rejected(t, brain, { rule: "rate", reason }) };
    },
  };
}
