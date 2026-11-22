// Generated from shared/reaction.schema.json by pnpm gen:types. Do not edit.

export type Size = "tiny" | "small" | "medium" | "big";
export type Weight = "light" | "medium" | "heavy";
export type Shape = "round" | "flat" | "long" | "other";
export type Verb =
  | "walk_to"
  | "run_to"
  | "run_away"
  | "hide_behind"
  | "look_at"
  | "sniff"
  | "peck"
  | "eat"
  | "push"
  | "jump"
  | "jump_over"
  | "sit_on"
  | "wear"
  | "circle"
  | "dance"
  | "flap"
  | "freeze"
  | "fall_over";
export type Target = "object" | "camera" | "reeds" | "none";
export type Mood = "happy" | "curious" | "scared" | "silly" | "proud" | "grossed_out";

/**
 * What Puddles does about a held-up object. Produced by the VLM, checked by the game's validator.
 */
export interface Reaction {
  /**
   * Whether the hand is holding anything.
   */
  holding: boolean;
  /**
   * Short name of the object.
   */
  object: string;
  traits: Traits;
  /**
   * @minItems 2
   * @maxItems 5
   */
  script: [Step, Step, ...Step[]];
}
export interface Traits {
  size: Size;
  weight: Weight;
  shape: Shape;
  edible: boolean;
}
export interface Step {
  do: Verb;
  target?: Target;
  mood: Mood;
  say?: string;
}
