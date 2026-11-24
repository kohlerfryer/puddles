// Generated from shared/contracts.schema.json by pnpm gen:types. Do not edit.

/**
 * A namespace and a name, e.g. observation.smile or outcome.done.
 */
export type EventType = string;
export type Mood = "happy" | "curious" | "scared" | "silly" | "proud" | "grossed_out";
export type IntentKind = "routine" | "behavior" | "goal";
/**
 * A plugin's manifest.json: the common fields plus the fields of its kind.
 */
export type Manifest = {
  id: string;
  /**
   * Major version of these contracts the plugin was written against.
   */
  contract: string;
  name: string;
  /**
   * @minItems 1
   */
  authors: [string, ...string[]];
  /**
   * An SPDX license id.
   */
  license: string;
  tags?: string[];
} & (SenseManifest | BrainManifest | SkillManifest | ContentManifest);
/**
 * When the brain decides: every tick, on an event, or every few seconds.
 */
export type Cadence = "tick" | OnEvent | EverySeconds;

/**
 * One of each kernel contract: the root for type generators and a table of test examples.
 */
export interface Contracts {
  event: KernelEvent;
  observation: Observation;
  intent: Intent;
  step: Step;
  outcome: Outcome;
  reward: Reward;
  manifest: Manifest;
}
/**
 * One entry in the kernel's append-only event log. Plugins talk only through events.
 */
export interface KernelEvent {
  /**
   * Kernel clock time in ms.
   */
  t: number;
  type: EventType;
  /**
   * Id of the plugin or kernel part that emitted it.
   */
  source: string;
  /**
   * The payload; its shape depends on the type.
   */
  data: Record<string, unknown>;
}
/**
 * The snapshot brains read: what Puddles senses this tick. Summaries only, never raw media.
 */
export interface Observation {
  kid: Kid;
  held_object?: HeldObject;
  smile: Smile;
  laugh?: boolean;
  speech?: Speech;
  world: WorldView;
  self: SelfState;
}
export interface Kid {
  present: boolean;
  pose?: Pose;
  gesture?: string;
  attention: number;
  /**
   * Metres from the camera.
   */
  distance: number;
}
/**
 * Where the kid is in the window, 0 to 1 from the left and the top.
 */
export interface Pose {
  x: number;
  y: number;
}
export interface HeldObject {
  /**
   * A prop id, or other.
   */
  id: string;
  confidence: number;
}
export interface Smile {
  level: number;
  delta: number;
}
export interface Speech {
  active: boolean;
  command?: string;
}
export interface WorldView {
  near: Entity[];
}
/**
 * Something in the world near Puddles, and what he can do with it.
 */
export interface Entity {
  id: string;
  affords: string[];
}
export interface SelfState {
  mood: Mood;
  /**
   * Each need from 0 (met) to 1 (urgent).
   */
  needs: Record<string, number>;
  /**
   * The skill or behavior running, or idle.
   */
  doing: string;
}
/**
 * What a brain wants Puddles to do. The guardian checks it before the executor plays it.
 */
export interface Intent {
  /**
   * Id of the brain that decided.
   */
  brain: string;
  /**
   * A higher priority preempts.
   */
  priority: number;
  kind: IntentKind;
  /**
   * A routine's steps.
   *
   * @minItems 1
   * @maxItems 8
   */
  steps?: [Step, ...Step[]];
  behavior?: BehaviorCall;
  /**
   * Shown in the replay viewer.
   */
  why: string;
  /**
   * Comedy features the bandit learns from.
   */
  features?: string[];
}
/**
 * One skill call. A reaction step maps onto it: do is the skill, target is args.target.
 */
export interface Step {
  /**
   * Skill id.
   */
  skill: string;
  /**
   * Arguments, named as in the skill's manifest params.
   */
  args: Record<string, string | number | boolean>;
  /**
   * What Puddles says. The guardian caps it at 12 words.
   */
  say?: string;
  mood?: Mood;
  /**
   * Thought bubble icon id.
   */
  think?: string;
}
export interface BehaviorCall {
  id: string;
  params: Record<string, string | number | boolean>;
}
/**
 * How a step or behavior ended. Skills emit it in outcome.* events.
 */
export interface Outcome {
  /**
   * Index of the step in the running intent; 0 for a behavior.
   */
  step: number;
  status: "done" | "failed" | "interrupted";
  /**
   * Why it failed or stopped, or the skill's own outcome name, e.g. dropped.
   */
  reason?: string;
  /**
   * Changes to the world state.
   */
  effects?: Record<string, unknown>;
}
/**
 * How the kid took a bit, attributed to the bit that caused it.
 */
export interface Reward {
  bit_id: string;
  /**
   * Smile after the punchline minus the smile before the bit.
   */
  smile_delta: number;
  laugh: boolean;
  talk: boolean;
  attention: number;
  /**
   * Length of the attribution window.
   */
  window_ms: number;
}
export interface SenseManifest {
  kind: "sense";
  /**
   * Raw inputs it reads, e.g. camera, microphone, hand landmarks.
   *
   * @minItems 1
   */
  inputs: [string, ...string[]];
  /**
   * @minItems 1
   */
  emits: [EventType, ...EventType[]];
  /**
   * Per tick.
   */
  budget_ms: number;
}
export interface BrainManifest {
  kind: "brain";
  cadence: Cadence;
  autonomy: number;
  latency_budget_ms: number;
  /**
   * @minItems 1
   */
  intents: [IntentKind, ...IntentKind[]];
}
export interface OnEvent {
  on: EventType;
}
export interface EverySeconds {
  every_s: number;
}
export interface SkillManifest {
  kind: "skill";
  /**
   * Each param's type, e.g. target: prop.
   */
  params: Record<string, string>;
  /**
   * Affordances or conditions, e.g. target.affords:wear.
   */
  needs: string[];
  duration_s: number;
  energy: number;
  /**
   * @minItems 1
   */
  outcomes: [string, ...string[]];
}
export interface ContentManifest {
  kind: "content";
  type:
    | "prop"
    | "place"
    | "scene"
    | "character"
    | "personality"
    | "bit_pack"
    | "art_pack"
    | "sound_pack";
}
