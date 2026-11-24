import { describe, expect, it } from "vitest";

import schema from "../../../../../shared/reaction.schema.json";
import type { Traits } from "../../../core/reaction";
import { checkPlugin } from "../../../kernel/harness";
import { SKILLS } from "../../skill";
import { propFor } from "./index";
import library from "./library.json";
import manifest from "./manifest.json";

const SKILL_IDS = new Set(SKILLS.map((skill) => skill.manifest.id));
const NEEDS = new Map(SKILLS.map(({ manifest: m }) => [m.id, m.needs]));
const IDS = Object.keys(library.props);
const ALL = IDS.map((id) => ({ id, prop: propFor({ id }, "medium") }));

/** Whether `traits` meet a skill need such as `target.size:tiny|small`. */
function meets(need: string, traits: Traits): boolean {
  const [trait = "", values = ""] = need.replace(/^target\./, "").split(":");
  return values.split("|").includes(String(Reflect.get(traits, trait)));
}

describe("the prop library content plugin", () => {
  it("passes the plugin harness", () => {
    expect(checkPlugin(() => ({ manifest }))).toEqual([]);
  });

  it("holds about thirty props, none of them other", () => {
    expect(IDS.length).toBeGreaterThanOrEqual(30);
    expect(IDS).not.toContain("other");
    const pattern = new RegExp(schema.$defs.LibraryProp.properties.id.pattern);
    for (const id of IDS) expect(id).toMatch(pattern);
  });

  it("gives each archetype in the reaction schema its words, traits and affordances", () => {
    expect(Object.keys(library.archetypes).sort()).toEqual([...schema.$defs.Archetype.enum].sort());
  });

  it("names each word once, so the matcher can't pick between two props", () => {
    const words = [
      ...IDS,
      ...Object.values(library.props).flatMap((prop) => ("names" in prop ? prop.names : [])),
      ...Object.values(library.archetypes).flatMap((archetype) => archetype.words),
    ];
    expect(new Set(words).size).toBe(words.length);
  });

  it.each(ALL)("spawns $id in a colour, with affordances its traits allow", ({ prop }) => {
    expect(prop?.color).toMatch(/^#[0-9a-f]{6}$/);
    for (const skill of prop?.affords ?? []) {
      expect(SKILL_IDS).toContain(skill);
      const traits = prop?.traits ?? ({} as Traits);
      expect((NEEDS.get(skill) ?? []).filter((need) => !meets(need, traits))).toEqual([]);
    }
  });
});

describe("propFor", () => {
  it("spawns the installed prop the matcher named, with its own traits and colour", () => {
    expect(propFor({ id: "banana" }, "big")).toEqual({
      id: "banana",
      archetype: "fruit",
      color: "#ffd84d",
      traits: { size: "small", weight: "light", shape: "long", edible: true },
      affords: ["peck", "eat"],
    });
  });

  it("spawns a generic prop of the archetype in the crop's colour, sized like the object", () => {
    const answer = { id: "other", archetype: "stick", color: "#123abc" } as const;
    expect(propFor(answer, "big")).toEqual({
      id: "other",
      archetype: "stick",
      color: "#123abc",
      traits: { size: "big", weight: "light", shape: "long", edible: false },
      affords: ["push", "jump_over"],
    });
  });

  it("spawns nothing for an id that isn't installed, so the photo sticker stays", () => {
    expect(propFor({ id: "spaceship" }, "small")).toBeUndefined();
  });
});
