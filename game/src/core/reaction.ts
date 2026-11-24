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
 * The object matcher's library answer: an installed prop's id, or other with an archetype and the crop's dominant colour.
 */
export type PropAnswer = LibraryProp | OtherProp;
export type Archetype = "ball" | "box" | "plush_animal" | "stick" | "fruit" | "cup" | "flat_thing";

/**
 * What Puddles does about a held-up object. Produced by the VLM, checked by the game's validator.
 */
export interface Reaction {
  /**
   * Whether the hand is holding anything.
   */
  holding: boolean;
  /**
   * Short name of the object. The game trims long names.
   */
  object: string;
  traits: Traits;
  /**
   * @minItems 2
   * @maxItems 5
   */
  script: [Step, Step, ...Step[]];
  prop?: PropAnswer;
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
  /**
   * What Puddles says. The game cuts it to 12 words.
   */
  say?: string;
}
export interface LibraryProp {
  /**
   * An installed prop's id.
   */
  id: string;
}
export interface OtherProp {
  id: "other";
  archetype: Archetype;
  /**
   * The crop's dominant colour.
   */
  color: string;
}
