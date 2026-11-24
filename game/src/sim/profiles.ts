/**
 * Simulated kids' preference profiles (spec §14): what makes each one smile, how fast a joke
 * goes stale, and what scares them away. Features are the bandit's comedy features (§12).
 */
export interface KidProfile {
  readonly id: string;
  /** Chance of a smile at any bit. */
  readonly baseline: number;
  /** Extra smile chance per loved feature, until the kid has seen it `boredAfter` times. */
  readonly loves: Readonly<Record<string, number>>;
  readonly boredAfter: number;
  /** A bit with any of these features makes the kid walk away with chance `scare`. */
  readonly fears: readonly string[];
  readonly scare: number;
}

export const profiles: readonly KidProfile[] = [
  {
    id: "loves-slapstick",
    baseline: 0.1,
    loves: { slapstick: 0.7, surprise: 0.3 },
    boredAfter: 3,
    fears: [],
    scare: 0,
  },
  {
    id: "scared-of-loud",
    baseline: 0.1,
    loves: { musical: 0.4, sleepy: 0.5 },
    boredAfter: 5,
    fears: ["surprise", "scary_light"],
    scare: 0.5,
  },
  {
    id: "copycat",
    baseline: 0.2,
    loves: { copies_kid: 0.6, musical: 0.2 },
    boredAfter: 4,
    fears: [],
    scare: 0,
  },
];

/** How many times the kid has seen each feature this session. */
export type Seen = ReadonlyMap<string, number>;

/** How a bit lands: the chance of a smile, and of walking away instead. */
export interface Appeal {
  readonly smile: number;
  readonly walkAway: number;
}

export function appeal(profile: KidProfile, features: readonly string[], seen: Seen): Appeal {
  const loved = features
    .filter((feature) => (seen.get(feature) ?? 0) < profile.boredAfter)
    .reduce((sum, feature) => sum + (profile.loves[feature] ?? 0), 0);
  const scared = features.some((feature) => profile.fears.includes(feature));
  return { smile: Math.min(1, profile.baseline + loved), walkAway: scared ? profile.scare : 0 };
}

/** What a bit is expected to earn: a smile, if the kid stays to see it. */
export const worth = ({ smile, walkAway }: Appeal): number => smile * (1 - walkAway);

/** The counts after the kid sees a bit with `features`. */
export function watched(seen: Seen, features: readonly string[]): Seen {
  const next = new Map(seen);
  for (const feature of features) next.set(feature, (next.get(feature) ?? 0) + 1);
  return next;
}
