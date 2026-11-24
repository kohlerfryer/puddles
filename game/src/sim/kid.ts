import type { Event } from "../core/contracts";
import type { Random } from "../core/random";
import type { EventLog } from "../kernel/eventLog";
import type { Emitted, PluginFolder } from "../kernel/plugins";
import { fakeSense } from "../kernel/testing";
import { bits } from "./policies";
import { type KidProfile, type Seen, appeal, watched, worth } from "./profiles";

/** How a kid took one bit, with what an oracle knows: the bit's worth and the best one's. */
export interface Punchline {
  readonly t: number;
  readonly features: readonly string[];
  readonly worth: number;
  readonly best: number;
  readonly smiled: boolean;
  readonly walkedAway: boolean;
}

/** A simulated kid: a sense plugin, plus the oracle's record the brains never see. */
export interface SimulatedKid {
  readonly plugin: PluginFolder;
  readonly punchlines: readonly Punchline[];
  readonly present: boolean;
}

/** Smile level while not smiling; a smile's delta is measured from it. */
const CALM = 0.1;
const SMILE = 0.6;
/** A smile this big comes with a clap. */
const CLAP = 0.9;
const EMITS = ["observation.smile", "observation.gesture", "observation.walk_away"];

function smileAt(smiled: boolean, random: Random): Emitted[] {
  const level = smiled ? SMILE + (1 - SMILE) * random() : CALM * random();
  const smile = { type: "observation.smile", data: { level, delta: level - CALM } };
  return level > CLAP
    ? [smile, { type: "observation.gesture", data: { gesture: "clap" } }]
    : [smile];
}

/**
 * A kid with `profile` watching Puddles through the kernel's log: after each bit it smiles (or
 * not), claps when delighted, and may walk away from a bit it fears, after which it is gone.
 */
export function simulatedKid(profile: KidProfile, log: () => EventLog): SimulatedKid {
  const punchlines: Punchline[] = [];
  const proposed = new Map<string, readonly string[]>();
  let playing: readonly string[] = [];
  let seen: Seen = new Map();
  let read = 0;
  let present = true;

  const react = (t: number, random: Random): Emitted[] => {
    const now = appeal(profile, playing, seen);
    const best = Math.max(...bits.map((bit) => worth(appeal(profile, bit.features, seen))));
    seen = watched(seen, playing);
    const walkedAway = random() < now.walkAway;
    const smiled = !walkedAway && random() < now.smile;
    punchlines.push({ t, features: playing, worth: worth(now), best, smiled, walkedAway });
    if (!walkedAway) return smileAt(smiled, random);
    present = false;
    return [{ type: "observation.walk_away", data: { reason: "scared" } }];
  };

  const follow = ({ type, data }: Event, t: number, random: Random): Emitted[] => {
    const brain = String(data.brain);
    if (type === "intent.proposed")
      proposed.set(brain, (data.features as string[] | undefined) ?? []);
    if (type === "intent.started") playing = proposed.get(brain) ?? [];
    return type === "intent.done" && present ? react(t, random) : [];
  };

  const sense = fakeSense("kid", ({ t, random }) => {
    const events = log().since(read);
    read = log().count;
    return events.flatMap((event) => follow(event, t, random));
  });
  return {
    plugin: { ...sense, manifest: { ...(sense.manifest as object), emits: EMITS } },
    punchlines,
    get present() {
      return present;
    },
  };
}
