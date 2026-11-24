/**
 * The prop library (spec §7.1): props a held-up object can come through the window as. The server's
 * object matcher answers with one of these ids, or `other` with an archetype and the crop's
 * dominant colour; both halves read `library.json`, so a new prop needs no code.
 */

import type { Archetype, PropAnswer, Size, Traits } from "../../../core/reaction";
import library from "./library.json";

/** A prop spawned for a held-up object: its physics traits, affordances and the colour it's drawn in. */
export interface Prop {
  /** The installed prop's id, or `other` for a generic prop of its archetype. */
  readonly id: string;
  readonly archetype: Archetype;
  readonly color: string;
  readonly traits: Traits;
  /** The skills Puddles can do with it. */
  readonly affords: readonly string[];
}

interface Kind {
  readonly traits: Traits;
  readonly affords: readonly string[];
}

/** A library prop: its archetype, colour, the traits where it differs from its archetype, and
 * the words besides its id that name it. */
interface Entry extends Partial<Pick<Traits, "size" | "shape">> {
  readonly archetype: Archetype;
  readonly color: string;
  readonly names?: readonly string[];
}

/** The JSON's strings typed as the schema's enums; the plugin's tests check them against it. */
const ARCHETYPES = library.archetypes as Readonly<Record<Archetype, Kind>>;
const PROPS = new Map(Object.entries(library.props as Readonly<Record<string, Entry>>));

/**
 * The prop to spawn for the matcher's `answer` about an object of `size`: the installed prop it
 * names, or a generic prop of the archetype in the crop's colour. Nothing for an id that isn't
 * installed, so the game keeps the photo sticker.
 */
export function propFor(answer: PropAnswer, size: Size): Prop | undefined {
  if ("archetype" in answer) {
    const { traits, affords } = ARCHETYPES[answer.archetype];
    return { ...answer, traits: { ...traits, size }, affords };
  }
  const entry = PROPS.get(answer.id);
  if (!entry) return undefined;
  const { traits, affords } = ARCHETYPES[entry.archetype];
  const { archetype, color, size: own = traits.size, shape = traits.shape } = entry;
  return { id: answer.id, archetype, color, traits: { ...traits, size: own, shape }, affords };
}
