import type { Cadence, KernelEvent, Manifest } from "../core/contracts";
import { contractValidators } from "../core/contractsSchema";
import type {
  BrainPlugin,
  ContentPlugin,
  PluginCode,
  PluginFolder,
  SensePlugin,
  SkillPlugin,
} from "./plugins";

/** The contract major version this kernel speaks; plugins must declare the same. */
const KERNEL_CONTRACT = "1";

export interface Rejected {
  readonly id: string;
  readonly reason: string;
}

/** The checked plugins, sorted by kind, and the ones refused with a reason. */
export interface Registry {
  readonly senses: readonly SensePlugin[];
  readonly brains: readonly BrainPlugin[];
  readonly skills: ReadonlyMap<string, SkillPlugin>;
  readonly content: readonly ContentPlugin[];
  readonly rejected: readonly Rejected[];
  /** The brains whose cadence says they decide now, given the events since they last could. */
  due(t: number, events: readonly KernelEvent[]): BrainPlugin[];
}

interface Sorted {
  senses: SensePlugin[];
  brains: BrainPlugin[];
  skills: Map<string, SkillPlugin>;
  content: ContentPlugin[];
}

/** Puts a valid manifest and its code in its kind's list, or says what's missing. */
function place(manifest: Manifest, code: PluginCode, sorted: Sorted): string | null {
  switch (manifest.kind) {
    case "sense":
      if (!code.sense) return "sense plugin has no sense()";
      sorted.senses.push({ manifest, sense: code.sense });
      return null;
    case "brain":
      if (!code.decide) return "brain plugin has no decide()";
      sorted.brains.push({ manifest, decide: code.decide });
      return null;
    case "skill":
      if (!code.start) return "skill plugin has no start()";
      sorted.skills.set(manifest.id, { manifest, start: code.start });
      return null;
    case "content":
      sorted.content.push(manifest);
      return null;
  }
}

function idOf(manifest: unknown): string {
  const id: unknown =
    typeof manifest === "object" && manifest !== null ? Reflect.get(manifest, "id") : null;
  return typeof id === "string" ? id : "?";
}

function check(folder: PluginFolder, sorted: Sorted, seen: Set<string>): string | null {
  const { manifest } = folder;
  if (!contractValidators.manifest(manifest)) {
    return `invalid manifest: ${JSON.stringify(contractValidators.manifest.errors)}`;
  }
  if (manifest.contract !== KERNEL_CONTRACT) {
    return `contract ${manifest.contract}, but the kernel speaks ${KERNEL_CONTRACT}`;
  }
  if (seen.has(manifest.id)) return "id already registered";
  seen.add(manifest.id);
  return place(manifest, folder.code ?? {}, sorted);
}

const matches = (type: string, on: string) => type === on || type.startsWith(`${on}.`);

function isDue(
  cadence: Cadence,
  last: number | undefined,
  t: number,
  events: readonly KernelEvent[],
): boolean {
  if (cadence === "tick") return true;
  if ("on" in cadence) return events.some((event) => matches(event.type, cadence.on));
  return last === undefined || t - last >= cadence.every_s * 1000;
}

/** Checks each discovered plugin folder against the contracts and wires the valid ones. */
export function createRegistry(folders: readonly PluginFolder[]): Registry {
  const sorted: Sorted = { senses: [], brains: [], skills: new Map(), content: [] };
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    const reason = check(folder, sorted, seen);
    if (reason) rejected.push({ id: idOf(folder.manifest), reason });
  }
  const lastDecided = new Map<string, number>();
  return {
    ...sorted,
    rejected,
    due(t, events) {
      const due = sorted.brains.filter((brain) =>
        isDue(brain.manifest.cadence, lastDecided.get(brain.manifest.id), t, events),
      );
      for (const brain of due) lastDecided.set(brain.manifest.id, t);
      return due;
    },
  };
}
