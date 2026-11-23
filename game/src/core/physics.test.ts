import { describe, expect, it } from "vitest";

import { createPhysics, stickerProps, type Pond } from "./physics";
import type { Traits } from "./reaction";

const pond: Pond = { width: 800, height: 600, bankEdge: 300, bankTop: 400, waterline: 450 };

const ball: Traits = { size: "small", weight: "medium", shape: "round", edible: false };
const book: Traits = { size: "medium", weight: "medium", shape: "flat", edible: false };
const leaf: Traits = { size: "small", weight: "light", shape: "flat", edible: false };
const rock: Traits = { size: "small", weight: "heavy", shape: "other", edible: false };

const FRAME_MS = 1000 / 60;

function run(physics: ReturnType<typeof createPhysics>, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) {
    physics.step(FRAME_MS);
  }
}

describe("stickerProps", () => {
  it("maps size to scale and weight to mass", () => {
    expect(stickerProps(rock).mass).toBeGreaterThan(stickerProps(ball).mass);
    expect(stickerProps(ball).mass).toBeGreaterThan(stickerProps(leaf).mass);
    expect(stickerProps(book).scale).toBeGreaterThan(stickerProps(ball).scale);
  });

  it("makes round stickers bouncier and only round stickers roll", () => {
    expect(stickerProps(ball).bounce).toBeGreaterThan(stickerProps(book).bounce);
    expect(stickerProps(ball).rolls).toBe(true);
    expect(stickerProps(book).rolls).toBe(false);
  });
});

describe("createPhysics", () => {
  it("settles a dropped sticker on the bank", () => {
    const physics = createPhysics(pond);
    const sticker = physics.addSticker(book, 150, 100);
    run(physics, 3);
    expect(sticker.position.y).toBeLessThan(pond.bankTop);
    expect(sticker.position.y).toBeGreaterThan(pond.bankTop - stickerProps(book).scale * 80);
    expect(Math.abs(sticker.velocity.y)).toBeLessThan(0.1);
  });

  it("floats a light sticker at the waterline", () => {
    const physics = createPhysics(pond);
    const sticker = physics.addSticker(leaf, 550, 100);
    run(physics, 6);
    expect(Math.abs(sticker.position.y - pond.waterline)).toBeLessThan(30);
  });

  it("sinks a heavy sticker to the pond floor", () => {
    const physics = createPhysics(pond);
    const sticker = physics.addSticker(rock, 550, 100);
    run(physics, 6);
    expect(sticker.position.y).toBeGreaterThan(pond.height - 60);
  });

  it("stacks one sticker on another", () => {
    const physics = createPhysics(pond);
    const bottom = physics.addSticker(book, 150, 300);
    const top = physics.addSticker(book, 150, 100);
    run(physics, 3);
    expect(top.position.y).toBeLessThan(bottom.position.y - 10);
  });

  it("moves a sticker when nudged", () => {
    const physics = createPhysics(pond);
    const sticker = physics.addSticker(book, 150, 300);
    run(physics, 2);
    const before = sticker.position.x;
    physics.nudge(sticker, { x: 10, y: -5 });
    run(physics, 1);
    expect(sticker.position.x).toBeGreaterThan(before + 20);
  });

  it("rolls a round sticker when nudged", () => {
    const physics = createPhysics(pond);
    const sticker = physics.addSticker(ball, 100, 300);
    run(physics, 2);
    const before = sticker.angle;
    physics.nudge(sticker, { x: 10, y: 0 });
    run(physics, 1);
    expect(sticker.angle - before).toBeGreaterThan(1);
  });

  it("stops moving a removed sticker and lets others land where it was", () => {
    const physics = createPhysics(pond);
    const removed = physics.addSticker(book, 150, 300);
    run(physics, 2);
    const { x, y } = removed.position;
    physics.remove(removed);
    const falling = physics.addSticker(ball, 150, 100);
    run(physics, 2);
    expect(removed.position).toEqual({ x, y });
    expect(falling.position.y).toBeCloseTo(pond.bankTop - stickerProps(ball).scale * 40, 0);
  });

  it("reports a sticker once, on the step it first lands in the water", () => {
    const physics = createPhysics(pond);
    const sticker = physics.addSticker(rock, 550, 100);
    const splashes = Array.from({ length: 360 }, () => physics.step(FRAME_MS));
    const landed = splashes.findIndex((bodies) => bodies.length > 0);
    expect(splashes.flat()).toEqual([sticker]);
    expect(landed).toBeGreaterThan(0);
  });

  it("reports no splash for a sticker landing on the bank", () => {
    const physics = createPhysics(pond);
    physics.addSticker(book, 150, 100);
    expect(Array.from({ length: 180 }, () => physics.step(FRAME_MS)).flat()).toEqual([]);
  });
});
