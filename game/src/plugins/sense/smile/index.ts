/**
 * The smile sense (spec §13): the best smile level among the faces in view, held for half a
 * second so a smile still forming or a flicker doesn't count (spike #122), and its delta above the
 * kid's calm level. No face, no data.
 */

import { newSamples, type ReadCamera } from "../../../core/cameraSample";
import type { PluginFolder } from "../../../kernel/plugins";
import manifest from "./manifest.json";

/** How long a level must hold before it counts. */
export const SUSTAIN_MS = 500;
/** How far back the calm level reaches: the lowest held level in this time. */
const CALM_MS = 10_000;

interface Level {
  readonly t: number;
  readonly level: number;
}

const lowest = (levels: readonly Level[]) => Math.min(...levels.map((l) => l.level));

/** Emits `observation.smile` with the held level and delta on each camera sample with a face. */
export function smileSense(read: ReadCamera): PluginFolder {
  const fresh = newSamples(read);
  let raw: Level[] = [];
  let held: Level[] = [];
  let faceSince = Infinity;
  return {
    manifest,
    code: {
      sense: ({ t }) => {
        const sample = fresh(t);
        if (!sample) return [];
        if (sample.smile === undefined) {
          raw = [];
          held = [];
          faceSince = Infinity;
          return [];
        }
        faceSince = Math.min(faceSince, sample.t);
        raw = [
          ...raw.filter((l) => l.t > sample.t - SUSTAIN_MS),
          { t: sample.t, level: sample.smile },
        ];
        if (sample.t - faceSince < SUSTAIN_MS) return [];
        const level = lowest(raw);
        held = [...held.filter((l) => l.t > sample.t - CALM_MS), { t: sample.t, level }];
        return [{ type: "observation.smile", data: { level, delta: level - lowest(held) } }];
      },
    },
  };
}
