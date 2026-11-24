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
  /**
   * Checks the output `brain` sent at kernel time `t` in ms. A due break replaces the output
   * whatever it was; its event carries the rule the output broke, if any.
   */
  check(brain: string, output: unknown, t: number): Verdict;
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

/** Skills the guardian's own fallback and break intents use. */
const OWN_SKILLS = ["look_at", "nap"];

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

/** Checks a schema-valid intent from `brain` against its claimed brain and the content rules. */
function judge(brain: string, intent: Intent, t: number, limits: Limits): Verdict {
  const broken: Violation | null =
    intent.brain === brain
      ? violation(intent, limits)
      : { rule: "brain", reason: `${brain} claims to be ${intent.brain}` };
  if (broken === null) return { intent, event: event(t, "passed", { brain }) };
  return { intent: fallback(intent.priority, broken.reason), event: rejected(t, brain, broken) };
}

/** Checks any output from `brain`: schema first, then `judge`. */
function review(brain: string, output: unknown, t: number, limits: Limits): Verdict {
  if (contractValidators.intent(output)) return judge(brain, output, t, limits);
  const broken: Violation = { rule: "schema", reason: "not a valid intent" };
  return { intent: fallback(0, broken.reason), event: rejected(t, brain, broken) };
}

/** Throws unless `settings` install the skills the guardian's own intents need. */
export function createGuardian(settings: GuardianSettings): Guardian {
  const missing = OWN_SKILLS.filter((skill) => !settings.skillSeconds.has(skill));
  if (missing.length > 0) throw new Error(`guardian needs skills: ${missing.join(", ")}`);
  const intentBudget = budget(settings.intentsPerSecond, SECOND_MS);
  const modelBudget = budget(settings.modelCallsPerMinute, MINUTE_MS);
  let nextBreakAt = settings.sessionSoftLimitMs;

  return {
    check(brain, output, t) {
      if (!intentBudget(brain, t)) {
        const reason = `over ${String(settings.intentsPerSecond)} intents per second`;
        return { intent: null, event: rejected(t, brain, { rule: "rate", reason }) };
      }
      const verdict = review(brain, output, t, settings);
      if (t < nextBreakAt) return verdict;
      nextBreakAt = t + BREAK_REPEAT_MS;
      const priority = verdict.intent?.priority ?? 0;
      return { intent: rest(priority), event: event(t, "break", verdict.event.data) };
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
