import type { Intent } from "../core/contracts";
import type { Random } from "../core/random";
import type { PluginFolder } from "../kernel/plugins";
import { fakeBrain, fakeSkill, routine } from "../kernel/testing";

/** A comedy bit Puddles can play: the skills it runs and its comedy features. */
export interface Bit {
  readonly id: string;
  readonly features: readonly string[];
  readonly skills: readonly string[];
}

/** The fixed policy's bit. */
export const pratfall: Bit = {
  id: "pratfall",
  features: ["slapstick"],
  skills: ["walk_to", "fall_over"],
};

/** The arms the simulated policies choose from. */
export const bits: readonly Bit[] = [
  pratfall,
  { id: "peekaboo", features: ["surprise"], skills: ["hide_behind", "jump"] },
  { id: "quack_song", features: ["musical"], skills: ["dance", "quack"] },
  { id: "copy_wave", features: ["copies_kid"], skills: ["copy_gesture"] },
  { id: "nap", features: ["sleepy"], skills: ["nap"] },
  { id: "spooky", features: ["scary_light", "surprise"], skills: ["hide_behind", "flap"] },
];

/** How often a policy picks a bit; every bit finishes well within it. */
const BIT_EVERY_S = 3;
const SKILL_TICKS = 15;

/** Headless stand-ins for the skills the bits use. */
export function bitSkills(): PluginFolder[] {
  const ids = new Set(bits.flatMap((bit) => bit.skills));
  return [...ids].map((id) => fakeSkill(id, SKILL_TICKS));
}

const play = (brain: string, bit: Bit): Intent => ({
  ...routine(brain, 1, ...bit.skills),
  why: `bit ${bit.id}`,
  features: [...bit.features],
});

function pick(random: Random): Bit {
  const bit = bits[Math.floor(random() * bits.length)];
  if (!bit) throw new Error("no bits to pick from");
  return bit;
}

/** Plays a bit chosen uniformly at random. */
export function randomPolicy(): PluginFolder {
  return fakeBrain("random", { every_s: BIT_EVERY_S }, ({ random }) =>
    play("random", pick(random)),
  );
}

/** Always plays the same bit. */
export function fixedPolicy(bit: Bit): PluginFolder {
  return fakeBrain("fixed", { every_s: BIT_EVERY_S }, () => play("fixed", bit));
}
