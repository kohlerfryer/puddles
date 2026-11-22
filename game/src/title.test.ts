import { describe, expect, it } from "vitest";

import { gameTitle } from "./title";

describe("gameTitle", () => {
  it("names Puddles by default", () => {
    expect(gameTitle()).toBe("Puddles the Duck");
  });

  it("uses a custom duck name", () => {
    expect(gameTitle("Quackers")).toBe("Quackers the Duck");
  });
});
