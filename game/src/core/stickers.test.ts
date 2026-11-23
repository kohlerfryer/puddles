import { describe, expect, it } from "vitest";

import { createPhysics, type Pond } from "./physics";
import type { Traits } from "./reaction";
import { createStickers, MAX_STICKERS, photoFrame } from "./stickers";

const pond: Pond = { width: 800, height: 600, bankEdge: 800, bankTop: 400, waterline: 600 };

const ball: Traits = { size: "small", weight: "medium", shape: "round", edible: true };
const book: Traits = { size: "medium", weight: "medium", shape: "flat", edible: false };
const hat: Traits = { size: "big", weight: "light", shape: "other", edible: false };

function shelf() {
  const released: string[] = [];
  const stickers = createStickers<string>(createPhysics(pond), (look) => released.push(look));
  return { stickers, released };
}

describe("photoFrame", () => {
  it("grows with the size trait", () => {
    const sizes = (["tiny", "small", "medium", "big"] as const).map(
      (size) => photoFrame({ ...book, size }).width,
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("matches the sticker's physics body", () => {
    const { stickers } = shelf();
    for (const traits of [ball, book, hat]) {
      const { body, frame } = stickers.drop(traits, { x: 400, y: 100 }, 0, () => "photo");
      expect(body.bounds.max.x - body.bounds.min.x).toBeCloseTo(frame.width, 0);
      expect(body.bounds.max.y - body.bounds.min.y).toBeCloseTo(frame.height, 0);
    }
  });

  it("frames round objects as a circle and others with rounded corners", () => {
    const round = photoFrame(ball);
    expect(round.width).toBe(round.height);
    expect(round.corner).toBe(round.width / 2);
    const flat = photoFrame(book);
    expect(flat.corner).toBeGreaterThan(0);
    expect(flat.corner).toBeLessThan(flat.height / 2);
  });
});

describe("createStickers", () => {
  it("drops photo stickers into physics exactly like test stickers", () => {
    const { stickers } = shelf();
    const photo = stickers.drop(ball, { x: 200, y: 100 }, 0, () => "photo");
    const plain = stickers.drop(ball, { x: 600, y: 100 }, 0, () => "plain");
    expect(photo.frame).toEqual(plain.frame);
    for (let i = 0; i < 120; i++) stickers.physics.step(1000 / 60);
    expect(photo.body.position.y).toBeCloseTo(plain.body.position.y);
    expect(photo.body.mass).toBe(plain.body.mass);
  });

  it("holds a worn sticker and releases the one held before", () => {
    const { stickers, released } = shelf();
    const first = stickers.drop(hat, { x: 200, y: 100 }, 0, () => "first");
    const second = stickers.drop(hat, { x: 300, y: 100 }, 0, () => "second");
    stickers.take(first.body, "head", 0);
    expect(first.held).toEqual({ on: "head", since: 0 });
    stickers.take(second.body, "head", 1000);
    expect(released).toEqual(["first"]);
    expect(stickers.all()).toEqual([second]);
  });

  it("releases an eaten sticker once it is swallowed", () => {
    const { stickers, released } = shelf();
    const food = stickers.drop(ball, { x: 200, y: 100 }, 0, () => "food");
    stickers.take(food.body, "beak", 1000);
    stickers.settle(1500);
    expect(released).toEqual([]);
    stickers.settle(2000);
    expect(released).toEqual(["food"]);
    expect(stickers.all()).toEqual([]);
  });

  it("keeps a worn sticker on the head", () => {
    const { stickers, released } = shelf();
    const worn = stickers.drop(hat, { x: 200, y: 100 }, 0, () => "hat");
    stickers.take(worn.body, "head", 0);
    stickers.settle(60_000);
    expect(released).toEqual([]);
    expect(stickers.all()).toEqual([worn]);
  });

  it("ignores taking a body it does not know", () => {
    const { stickers, released } = shelf();
    const other = createStickers<string>(createPhysics(pond), () => undefined);
    const stranger = other.drop(ball, { x: 200, y: 100 }, 0, () => "stranger");
    stickers.take(stranger.body, "beak", 0);
    expect(released).toEqual([]);
  });

  it("stops growing after 50 objects, releasing the oldest", () => {
    const { stickers, released } = shelf();
    for (let i = 0; i < 50; i++)
      stickers.drop(ball, { x: 100 + i * 10, y: 100 }, i, () => `photo ${String(i)}`);
    expect(stickers.all()).toHaveLength(MAX_STICKERS);
    expect(released).toHaveLength(50 - MAX_STICKERS);
    expect(released[0]).toBe("photo 0");
    expect(stickers.all().at(-1)?.look).toBe("photo 49");
  });

  it("takes released stickers out of physics", () => {
    const { stickers } = shelf();
    const first = stickers.drop(ball, { x: 100, y: 100 }, 0, () => "first");
    for (let i = 1; i <= MAX_STICKERS; i++)
      stickers.drop(ball, { x: 100 + i * 50, y: 100 }, i, () => "next");
    const y = first.body.position.y;
    for (let i = 0; i < 60; i++) stickers.physics.step(1000 / 60);
    expect(first.body.position.y).toBe(y);
  });
});
