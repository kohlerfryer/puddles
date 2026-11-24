/** The guardian's content rules: pure checks on one intent, with no state or clock. */

import blocklist from "../../../../shared/blocklist.json";
import requests from "../../../../shared/requests.json";
import type { Intent, Step } from "../../core/contracts";

/** Longest line Puddles may say, in words. */
const MAX_LINE_WORDS = 12;
/** Longest a routine may last, in seconds. */
const MAX_ROUTINE_SECONDS = 20;

/** What the guardian checks; a broken rule names the rule and says why. */
export type Rule =
  | "schema"
  | "rate"
  | "line_length"
  | "blocklist"
  | "request"
  | "scary"
  | "unknown_skill"
  | "routine_duration";

export interface Violation {
  readonly rule: Rule;
  readonly reason: string;
}

/** What the content rules depend on: installed skills and the scary cap for this setting. */
export interface Limits {
  /** Each installed skill's duration in seconds, from its manifest. */
  readonly skillSeconds: ReadonlyMap<string, number>;
  /** Most steps with a scared mood one intent may have. */
  readonly maxScaredSteps: number;
}

const lists = (data: Record<string, string | string[]>): string[] =>
  Object.values(data)
    .filter((value): value is string[] => Array.isArray(value))
    .flat();

const VETTED_REQUESTS = new Set(lists(requests));
const BLOCKED = lists(blocklist);

/** Lowercase words separated by single spaces, padded so phrases match whole words only. */
const normalize = (text: string): string =>
  ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const stepTexts = (step: Step): string[] => [
  ...(step.say === undefined ? [] : [step.say]),
  ...(step.think === undefined ? [] : [step.think]),
  ...Object.values(step.args).filter((value) => typeof value === "string"),
];

/** Every piece of text in the intent that could reach the kid. */
const texts = (intent: Intent): string[] => [
  ...(intent.steps ?? []).flatMap(stepTexts),
  ...Object.values(intent.behavior?.params ?? {}).filter((value) => typeof value === "string"),
];

type Check = (intent: Intent, limits: Limits) => Violation | null;

const lineLength: Check = (intent) => {
  const line = intent.steps?.find((step) => wordCount(step.say ?? "") > MAX_LINE_WORDS)?.say;
  return line === undefined
    ? null
    : { rule: "line_length", reason: `line over ${String(MAX_LINE_WORDS)} words: "${line}"` };
};

const blocked: Check = (intent) => {
  for (const text of texts(intent)) {
    const phrase = BLOCKED.find((entry) => normalize(text).includes(` ${entry} `));
    if (phrase !== undefined) return { rule: "blocklist", reason: `blocked "${phrase}"` };
  }
  return null;
};

const request: Check = (intent) => {
  const asks = (intent.steps ?? []).filter((step) => step.skill === "ask_for");
  const bad = asks.find(
    ({ args }) => typeof args.request !== "string" || !VETTED_REQUESTS.has(args.request),
  );
  return bad === undefined
    ? null
    : { rule: "request", reason: `request not vetted: ${String(bad.args.request)}` };
};

const scary: Check = (intent, limits) => {
  const count = (intent.steps ?? []).filter((step) => step.mood === "scared").length;
  return count > limits.maxScaredSteps
    ? {
        rule: "scary",
        reason: `${String(count)} scared steps, cap ${String(limits.maxScaredSteps)}`,
      }
    : null;
};

const duration: Check = (intent, limits) => {
  let seconds = 0;
  for (const step of intent.steps ?? []) {
    const skill = limits.skillSeconds.get(step.skill);
    if (skill === undefined) return { rule: "unknown_skill", reason: `no skill ${step.skill}` };
    seconds += skill;
  }
  return seconds > MAX_ROUTINE_SECONDS
    ? { rule: "routine_duration", reason: `routine lasts ${String(seconds)} s` }
    : null;
};

const CHECKS: readonly Check[] = [lineLength, blocked, request, scary, duration];

/** The first content rule a schema-valid intent breaks, or null when it is safe to play. */
export function violation(intent: Intent, limits: Limits): Violation | null {
  for (const check of CHECKS) {
    const broken = check(intent, limits);
    if (broken !== null) return broken;
  }
  return null;
}
