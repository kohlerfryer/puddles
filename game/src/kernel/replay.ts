import type { KernelEvent } from "../core/contracts";
import { contractValidators } from "../core/contractsSchema";
import { type Kernel, type KernelOptions, createKernel } from "./kernel";
import type { PluginFolder } from "./plugins";

export interface ReplayOptions {
  /** The brain, skill and content versions to re-run; sense plugins are replaced by the recording. */
  readonly plugins: readonly PluginFolder[];
  /** The seed the session was recorded with, so random choices match; the log doesn't store it. */
  readonly seed: number;
  /** The behaviors the brains' behavior intents may name, by id. */
  readonly behaviors?: KernelOptions["behaviors"];
}

/** A tick where a brain decided differently, or only on one side; null means it didn't decide. */
export interface DecisionDiff {
  readonly t: number;
  readonly brain: string;
  readonly recorded: KernelEvent["data"] | null;
  readonly replayed: KernelEvent["data"] | null;
}

export interface Replay {
  /** Every event the replayed session logged. */
  readonly events: KernelEvent[];
  readonly diffs: DecisionDiff[];
}

function parseLine(line: string, index: number): KernelEvent[] {
  if (!line.trim()) return [];
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    throw new Error(`line ${String(index + 1)} is not JSON`);
  }
  if (!contractValidators.event(event)) {
    const errors = JSON.stringify(contractValidators.event.errors);
    throw new Error(`line ${String(index + 1)} is not an event: ${errors}`);
  }
  return [event];
}

/** Reads a recorded event log: the JSON lines the kernel's `sink` wrote to the save. */
export function parseLog(text: string): KernelEvent[] {
  return text.split("\n").flatMap(parseLine);
}

const isSense = ({ manifest }: PluginFolder) =>
  typeof manifest === "object" && manifest !== null && Reflect.get(manifest, "kind") === "sense";

/** A sense that appends the recorded observations at their tick, keeping their source and order. */
function playback(observations: readonly KernelEvent[], kernel: () => Kernel): PluginFolder[] {
  if (!observations.length) return [];
  let next = 0;
  const sense: PluginFolder = {
    manifest: {
      kind: "sense",
      id: "replay",
      contract: "1",
      name: "Replay",
      authors: ["Puddles"],
      license: "MIT",
      inputs: ["recording"],
      emits: [...new Set(observations.map((event) => event.type))],
      budget_ms: 1000,
    },
    code: {
      sense: ({ t }) => {
        for (let event = observations[next]; event && event.t <= t; event = observations[++next]) {
          kernel().log.append({ ...event, t });
        }
        return [];
      },
    },
  };
  return [sense];
}

/** JSON with object keys sorted, so two intents compare by content, not key order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );

const proposals = (events: readonly KernelEvent[]) =>
  events.filter((event) => event.type === "intent.proposed");

const keyOf = ({ t, source }: KernelEvent) => `${String(t)} ${source}`;

function diffDecisions(
  recorded: readonly KernelEvent[],
  replayed: readonly KernelEvent[],
): DecisionDiff[] {
  const before = new Map(proposals(recorded).map((event) => [keyOf(event), event.data]));
  const after = new Map(proposals(replayed).map((event) => [keyOf(event), event.data]));
  const all = [...proposals(recorded), ...proposals(replayed)].sort((a, b) => a.t - b.t);
  const diffs: DecisionDiff[] = [];
  const seen = new Set<string>();
  for (const event of all) {
    const key = keyOf(event);
    if (seen.has(key)) continue;
    seen.add(key);
    const was = before.get(key) ?? null;
    const now = after.get(key) ?? null;
    if (canonical(was) !== canonical(now)) {
      diffs.push({ t: event.t, brain: event.source, recorded: was, replayed: now });
    }
  }
  return diffs;
}

/**
 * Re-runs a recorded session in the headless kernel against other plugin versions: the recorded
 * `observation.*` events are played back at their ticks, and brain decisions are diffed. The
 * replay stops at the last recorded event, so decisions a new brain would make later don't show.
 */
export function replay(
  recorded: readonly KernelEvent[],
  { plugins, seed, behaviors }: ReplayOptions,
): Replay {
  const lines: string[] = [];
  const observations = recorded.filter((event) => event.type.startsWith("observation."));
  const kernel: Kernel = createKernel({
    plugins: [...playback(observations, () => kernel), ...plugins.filter((p) => !isSense(p))],
    seed,
    ...(behaviors && { behaviors }),
    now: () => 0,
    sink: (line) => lines.push(line),
  });
  const end = recorded.at(-1)?.t ?? 0;
  while (kernel.clock.t < end) kernel.tick();
  const events = lines.map((line) => JSON.parse(line) as KernelEvent);
  return { events, diffs: diffDecisions(recorded, events) };
}
