import { describe, expect, it } from "vitest";

import { createRegistry } from "./registry";
import { fakeBrain, fakeSense, fakeSkill } from "./testing";

const pond = {
  manifest: {
    kind: "content",
    type: "scene",
    id: "pond",
    contract: "1",
    name: "Pond",
    authors: ["P"],
    license: "MIT",
  },
};

describe("createRegistry", () => {
  it("sorts valid plugins by kind", () => {
    const registry = createRegistry([
      fakeSense("pose", () => []),
      fakeBrain("reflexes", "tick", () => null),
      fakeSkill("peck", 1),
      pond,
    ]);
    expect(registry.senses.map((p) => p.manifest.id)).toEqual(["pose"]);
    expect(registry.brains.map((p) => p.manifest.id)).toEqual(["reflexes"]);
    expect([...registry.skills.keys()]).toEqual(["peck"]);
    expect(registry.content.map((m) => m.id)).toEqual(["pond"]);
    expect(registry.rejected).toEqual([]);
  });

  it("rejects manifests that break the manifest contract", () => {
    const registry = createRegistry([
      { manifest: { id: "broken", kind: "skill" } },
      { manifest: 7 },
    ]);
    expect(registry.rejected.map((r) => r.id)).toEqual(["broken", "?"]);
    expect(registry.rejected[0]?.reason).toMatch(/manifest/);
  });

  it("rejects plugins written against another contract version", () => {
    const peck = fakeSkill("peck", 1);
    const registry = createRegistry([
      { ...peck, manifest: { ...(peck.manifest as object), contract: "2" } },
    ]);
    expect(registry.skills.size).toBe(0);
    expect(registry.rejected).toEqual([
      { id: "peck", reason: "contract 2, but the kernel speaks 1" },
    ]);
  });

  it("rejects a second plugin with the same id", () => {
    const registry = createRegistry([fakeSkill("peck", 1), fakeSkill("peck", 2)]);
    expect(registry.skills.size).toBe(1);
    expect(registry.rejected).toEqual([{ id: "peck", reason: "id already registered" }]);
  });

  it("rejects code plugins without the function their kind needs", () => {
    const registry = createRegistry([
      { manifest: fakeSense("pose", () => []).manifest },
      { manifest: fakeBrain("reflexes", "tick", () => null).manifest },
      { manifest: fakeSkill("peck", 1).manifest },
    ]);
    expect(registry.rejected.map((r) => r.reason)).toEqual([
      "sense plugin has no sense()",
      "brain plugin has no decide()",
      "skill plugin has no start()",
    ]);
  });
});

describe("registry.due", () => {
  const event = (type: string) => ({ t: 0, type, source: "test", data: {} });

  it("runs tick brains every tick", () => {
    const registry = createRegistry([fakeBrain("reflexes", "tick", () => null)]);
    expect(registry.due(33, [])).toHaveLength(1);
    expect(registry.due(67, [])).toHaveLength(1);
  });

  it("runs event brains when their event or a more specific one arrives", () => {
    const registry = createRegistry([fakeBrain("matcher", { on: "observation.held" }, () => null)]);
    expect(registry.due(33, [event("observation.smile")])).toHaveLength(0);
    expect(registry.due(67, [event("observation.held")])).toHaveLength(1);
    expect(registry.due(100, [event("observation.held.lost")])).toHaveLength(1);
    expect(registry.due(133, [event("observation.heldout")])).toHaveLength(0);
  });

  it("runs timed brains at once and then every few seconds", () => {
    const registry = createRegistry([fakeBrain("bandit", { every_s: 1 }, () => null)]);
    expect(registry.due(33, [])).toHaveLength(1);
    expect(registry.due(1000, [])).toHaveLength(0);
    expect(registry.due(1033, [])).toHaveLength(1);
  });
});
