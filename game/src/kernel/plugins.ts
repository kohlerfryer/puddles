import type {
  BehaviorCall,
  BrainManifest,
  ContentManifest,
  KernelEvent,
  Intent,
  Manifest,
  SenseManifest,
  SkillManifest,
  Step,
} from "../core/contracts";
import type { Random } from "../core/random";

/** What the kernel hands a plugin each time it runs it. */
export interface PluginContext {
  /** Kernel clock time in ms. */
  readonly t: number;
  /** Events appended since the brains last ran. */
  readonly events: readonly KernelEvent[];
  /** The kernel's seeded random source: the only randomness plugins may use. */
  readonly random: Random;
}

/** An event before the kernel stamps it with the time and its source. */
export interface Emitted {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

/** How a running skill ended. */
export interface Finished {
  readonly status: "done" | "failed";
  readonly reason?: string;
  readonly effects?: Record<string, unknown>;
}

/** One running skill call; the executor ticks it with the tick's new events until it finishes. */
export interface Activity {
  tick(t: number, events: readonly KernelEvent[]): "running" | Finished;
}

/**
 * One run of a behavior: a state machine over skills. Given how its last step ended (null at the
 * start), it returns the next step to play, or how the whole behavior ended.
 */
export type BehaviorRun = (last: Finished | null) => Step | Finished;

/** A behavior: tested code the executor plays as one choice, ending with a single outcome. */
export type Behavior = (params: BehaviorCall["params"], ctx: PluginContext) => BehaviorRun;

/** The code half of a plugin folder (its index.ts); which function it needs depends on its kind. */
export interface PluginCode {
  readonly sense?: (ctx: PluginContext) => readonly Emitted[];
  readonly decide?: (ctx: PluginContext) => Intent | null;
  readonly start?: (args: Step["args"], ctx: PluginContext) => Activity;
}

/** A discovered plugin folder: its manifest.json, not yet checked, and its code if it has any. */
export interface PluginFolder {
  readonly manifest: unknown;
  readonly code?: PluginCode;
}

export interface SensePlugin {
  readonly manifest: Manifest & SenseManifest;
  readonly sense: NonNullable<PluginCode["sense"]>;
}

export interface BrainPlugin {
  readonly manifest: Manifest & BrainManifest;
  readonly decide: NonNullable<PluginCode["decide"]>;
}

export interface SkillPlugin {
  readonly manifest: Manifest & SkillManifest;
  readonly start: NonNullable<PluginCode["start"]>;
}

export type ContentPlugin = Manifest & ContentManifest;
