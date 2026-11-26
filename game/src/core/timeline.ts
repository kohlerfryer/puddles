/**
 * The replay viewer's timeline (spec §14): each intent a brain proposed, from the observation
 * before it, through its `why`, the guardian's verdict and how it ended, to the reward the bandit
 * attributes to it. Built from the event log alone, so a replayed session shows the same rows.
 */

import { type Attributed, WINDOW_MS, attribute } from "../plugins/brains/bandit/attribution";
import bandit from "../plugins/brains/bandit/manifest.json";
import type { KernelEvent } from "./contracts";

export interface Row {
  readonly t: number;
  readonly brain: string;
  /** The last observation before the intent, or "–" when there was none. */
  readonly observation: string;
  readonly why: string;
  /** The guardian's verdict and reason, or "unchecked" without a guardian. */
  readonly verdict: string;
  /** How the intent ended: done, failed, dropped, preempted, or still playing. */
  readonly outcome: string;
  /** How the kid took a bandit bit that played through, once its window has closed. */
  readonly reward: Attributed | null;
  /** Why a bandit bit that played through has no reward: its window is open, or no face was seen. */
  readonly note: "waiting" | "no face" | null;
}

const ENDINGS = ["intent.done", "intent.failed", "intent.dropped", "intent.preempted"];
const OBSERVATION = "observation.";

const rest = (type: string) => type.slice(type.indexOf(".") + 1);

const shown = (value: unknown) =>
  typeof value === "number"
    ? [Number(value.toFixed(2)).toString()]
    : typeof value === "string"
      ? [value]
      : [];

function observed({ type, data }: KernelEvent): string {
  return [rest(type), ...Object.values(data).flatMap(shown)].join(" ");
}

function verdictOf(event: KernelEvent | undefined): string {
  if (!event) return "unchecked";
  const { reason } = event.data;
  return typeof reason === "string" ? `${rest(event.type)}: ${reason}` : rest(event.type);
}

/** The events about one proposal: up to the brain's next proposal. */
function ownEvents(events: readonly KernelEvent[], at: number, brain: string): KernelEvent[] {
  const after = events.slice(at + 1);
  const next = after.findIndex((e) => e.type === "intent.proposed" && e.source === brain);
  return (next < 0 ? after : after.slice(0, next)).filter((e) => e.data.brain === brain);
}

function rewardOf(
  own: readonly KernelEvent[],
  events: readonly KernelEvent[],
  brain: string,
): Pick<Row, "reward" | "note"> {
  const started = own.find((e) => e.type === "intent.started");
  const done = own.find((e) => e.type === "intent.done");
  if (brain !== bandit.id || !started || !done) return { reward: null, note: null };
  if ((events.at(-1)?.t ?? 0) < done.t + WINDOW_MS) return { reward: null, note: "waiting" };
  const reward = attribute({ id: brain, startedAt: started.t, doneAt: done.t }, events);
  return { reward, note: reward ? null : "no face" };
}

function rowAt(events: readonly KernelEvent[], at: number, proposal: KernelEvent): Row {
  const brain = proposal.source;
  const own = ownEvents(events, at, brain);
  const seen = events
    .slice(0, at)
    .filter((e) => e.type.startsWith(OBSERVATION))
    .at(-1);
  const ending = own.find((e) => ENDINGS.includes(e.type));
  return {
    t: proposal.t,
    brain,
    observation: seen ? observed(seen) : "–",
    why: String(proposal.data.why),
    verdict: verdictOf(own.find((e) => e.type.startsWith("guardian.") && e.t === proposal.t)),
    outcome: ending ? rest(ending.type) : "playing",
    ...rewardOf(own, events, brain),
  };
}

/** One row per proposed intent, oldest first. */
export function timeline(events: readonly KernelEvent[]): Row[] {
  return events.flatMap((event, at) =>
    event.type === "intent.proposed" ? [rowAt(events, at, event)] : [],
  );
}

function rewardText({ reward, note }: Row): string[] {
  if (!reward) return note ? [note] : [];
  const sign = reward.smileDelta >= 0 ? "+" : "";
  const smile = `smile ${sign}${reward.smileDelta.toFixed(2)}`;
  return [
    [smile, ...(reward.laugh ? ["laugh"] : []), ...(reward.walkedAway ? ["walked away"] : [])].join(
      ", ",
    ),
  ];
}

/** One line for the overlay: time, brain, then observation → why → verdict → outcome → reward. */
export function rowText(row: Row): string {
  const steps = [row.observation, row.why, row.verdict, row.outcome, ...rewardText(row)];
  return `${(row.t / 1000).toFixed(1)}s ${row.brain} · ${steps.join(" → ")}`;
}
