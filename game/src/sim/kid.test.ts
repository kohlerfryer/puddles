import { describe, expect, it } from "vitest";

import type { Event } from "../core/contracts";
import { type Kernel, createKernel } from "../kernel/kernel";
import { type SimulatedKid, simulatedKid } from "./kid";
import { type Bit, bitSkills, bits, fixedPolicy } from "./policies";
import { type KidProfile, profiles } from "./profiles";

const [slapstickFan, scaredOfLoud] = profiles as [KidProfile, KidProfile];

function bit(id: string): Bit {
  const found = bits.find((b) => b.id === id);
  if (!found) throw new Error(`no bit ${id}`);
  return found;
}

/** Runs `seconds` of a session where Puddles always plays `played`. */
function play(profile: KidProfile, played: Bit, seconds: number, seed = 3) {
  const kid: SimulatedKid = simulatedKid(profile, () => kernel.log);
  const kernel: Kernel = createKernel({
    plugins: [kid.plugin, fixedPolicy(played), ...bitSkills()],
    seed,
    now: () => 0,
  });
  for (let i = 0; i < seconds * 30; i++) kernel.tick();
  return { kid, events: kernel.log.events() };
}

const ofType = (events: Event[], type: string) => events.filter((e) => e.type === type);

describe("simulatedKid", () => {
  it("reacts to each finished bit with a smile from the kid", () => {
    const { kid, events } = play(slapstickFan, bit("pratfall"), 10);
    const smiles = ofType(events, "observation.smile");
    expect(smiles.length).toBe(kid.punchlines.length);
    expect(smiles.length).toBeGreaterThan(2);
    expect(smiles.every((e) => e.source === "kid")).toBe(true);
    for (const { data } of smiles) {
      const { level, delta } = data as { level: number; delta: number };
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
      expect(delta).toBeGreaterThanOrEqual(-1);
      expect(delta).toBeLessThanOrEqual(1);
    }
  });

  it("declares every event type it emits in its manifest", () => {
    const { kid, events } = play(scaredOfLoud, bit("spooky"), 60);
    const { emits } = kid.plugin.manifest as { emits: string[] };
    const delighted = play({ ...slapstickFan, baseline: 1 }, bit("pratfall"), 30).events;
    const emitted = [...events, ...delighted].filter((e) => e.source === "kid");
    expect(new Set(emitted.map((e) => e.type))).toEqual(new Set(emits));
  });

  it("smiles right after the bit is done", () => {
    const { events } = play(slapstickFan, bit("pratfall"), 4);
    const done = ofType(events, "intent.done")[0];
    const smile = ofType(events, "observation.smile")[0];
    expect(done && smile && smile.t - done.t).toBe(33);
  });

  it("records what each bit was worth and what the best bit would have been", () => {
    const { kid } = play(slapstickFan, bit("pratfall"), 16);
    const [first, , , fourth] = kid.punchlines;
    expect(first?.features).toEqual(["slapstick"]);
    expect(first?.worth).toBeCloseTo(0.8);
    expect(first?.best).toBeCloseTo(0.8);
    expect(fourth).toMatchObject({ features: ["slapstick"], worth: 0.1 });
    expect(fourth?.best).toBeGreaterThan(0.1);
  });

  it("smiles more at a bit it loves than one it doesn't", () => {
    const loved = ofType(play(slapstickFan, bit("pratfall"), 9).events, "observation.smile");
    const meh = ofType(play(slapstickFan, bit("nap"), 9).events, "observation.smile");
    const mean = (events: Event[]) =>
      events.reduce((sum, e) => sum + (e.data as { level: number }).level, 0) / events.length;
    expect(mean(loved)).toBeGreaterThan(mean(meh));
  });

  it("records whether the kid smiled at each bit", () => {
    const { kid, events } = play(slapstickFan, bit("pratfall"), 16);
    const levels = ofType(events, "observation.smile").map((e) => e.data.level as number);
    expect(kid.punchlines.map((p) => p.smiled)).toEqual(levels.map((level) => level >= 0.6));
    expect(kid.punchlines.some((p) => p.smiled)).toBe(true);
  });

  it("claps now and then when delighted", () => {
    const delighted = { ...slapstickFan, baseline: 1 };
    const { events } = play(delighted, bit("pratfall"), 30);
    const claps = ofType(events, "observation.gesture");
    expect(claps.length).toBeGreaterThan(0);
    expect(claps[0]?.data).toEqual({ gesture: "clap" });
  });

  it("walks away from a scary bit and then stops reacting", () => {
    const { kid, events } = play(scaredOfLoud, bit("spooky"), 60);
    const away = ofType(events, "observation.walk_away");
    expect(away).toHaveLength(1);
    expect(away[0]?.data).toEqual({ reason: "scared" });
    expect(kid.present).toBe(false);
    expect(kid.punchlines.at(-1)?.walkedAway).toBe(true);
    const after = events.filter((e) => e.source === "kid" && e.t > (away[0]?.t ?? 0));
    expect(after).toEqual([]);
  });
});
