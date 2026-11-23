import Matter from "matter-js";

import type { Shape, Size, Traits, Weight } from "./reaction";

/** Pond layout in pixels, y pointing down. The bank fills x < bankEdge below bankTop; water fills the rest. */
export interface Pond {
  width: number;
  height: number;
  bankEdge: number;
  bankTop: number;
  waterline: number;
}

interface Impulse {
  x: number;
  y: number;
}

interface StickerProps {
  scale: number;
  mass: number;
  bounce: number;
  friction: number;
  aspect: number;
  rolls: boolean;
}

const BASE_SIZE = 80;
const WALL = 100;
const AIR_DRAG = 0.01;
const WATER_DRAG = 0.15;
const BUOYANCY = 1.5;

const TRAITS: {
  size: Record<Size, Pick<StickerProps, "scale">>;
  weight: Record<Weight, Pick<StickerProps, "mass">>;
  shape: Record<Shape, Pick<StickerProps, "bounce" | "friction" | "aspect" | "rolls">>;
} = {
  size: { tiny: { scale: 0.4 }, small: { scale: 0.7 }, medium: { scale: 1 }, big: { scale: 1.5 } },
  weight: { light: { mass: 0.5 }, medium: { mass: 2 }, heavy: { mass: 6 } },
  shape: {
    round: { bounce: 0.5, friction: 0.4, aspect: 1, rolls: true },
    flat: { bounce: 0.1, friction: 0.6, aspect: 0.5, rolls: false },
    long: { bounce: 0.15, friction: 0.5, aspect: 0.3, rolls: false },
    other: { bounce: 0.2, friction: 0.4, aspect: 0.8, rolls: false },
  },
};

export function stickerProps(traits: Traits): StickerProps {
  return {
    ...TRAITS.size[traits.size],
    ...TRAITS.weight[traits.weight],
    ...TRAITS.shape[traits.shape],
  };
}

function stickerBody(traits: Traits, x: number, y: number): Matter.Body {
  const props = stickerProps(traits);
  const side = BASE_SIZE * props.scale;
  const options = { restitution: props.bounce, friction: props.friction, frictionAir: AIR_DRAG };
  const body = props.rolls
    ? Matter.Bodies.circle(x, y, side / 2, options)
    : Matter.Bodies.rectangle(x, y, side, side * props.aspect, options);
  Matter.Body.setMass(body, props.mass);
  return body;
}

function pondWalls(pond: Pond): Matter.Body[] {
  const { width, height, bankEdge, bankTop } = pond;
  const wall = (x: number, y: number, w: number, h: number): Matter.Body =>
    Matter.Bodies.rectangle(x + w / 2, y + h / 2, w, h, { isStatic: true });
  return [
    wall(0, bankTop, bankEdge, height - bankTop),
    wall(-WALL, height, width + 2 * WALL, WALL),
    wall(-WALL, -height, WALL, 2 * height),
    wall(width, -height, WALL, 2 * height),
  ];
}

export function createPhysics(pond: Pond) {
  const engine = Matter.Engine.create();
  const floaters = new Set<Matter.Body>();
  /** Stickers that have been in the water, so each splashes only once. */
  const wet = new Set<Matter.Body>();
  Matter.Composite.add(engine.world, pondWalls(pond));

  /** Slows and floats stickers in the water, returning those that have just gone in. */
  function applyWater(): Matter.Body[] {
    const { gravity } = engine;
    const splashed: Matter.Body[] = [];
    for (const body of Matter.Composite.allBodies(engine.world)) {
      const inWater = !body.isStatic && body.position.y > pond.waterline;
      body.frictionAir = inWater ? WATER_DRAG : AIR_DRAG;
      if (!inWater) continue;
      if (!wet.has(body)) splashed.push(body);
      wet.add(body);
      if (floaters.has(body)) body.force.y -= body.mass * gravity.y * gravity.scale * BUOYANCY;
    }
    return splashed;
  }

  return {
    addSticker(traits: Traits, x: number, y: number): Matter.Body {
      const body = stickerBody(traits, x, y);
      if (traits.weight === "light") {
        floaters.add(body);
      }
      Matter.Composite.add(engine.world, body);
      return body;
    },
    /** Takes the sticker out of the world, so nothing moves it or rests on it. */
    remove(body: Matter.Body): void {
      floaters.delete(body);
      wet.delete(body);
      Matter.Composite.remove(engine.world, body);
    },
    /** Moves the world on `deltaMs` and returns the stickers that landed in the water. */
    step(deltaMs: number): Matter.Body[] {
      const splashed = applyWater();
      Matter.Engine.update(engine, deltaMs);
      return splashed;
    },
    /** Adds impulse / mass to the sticker's velocity, in pixels per 1/60 s. */
    nudge(body: Matter.Body, impulse: Impulse): void {
      const { velocity, mass } = body;
      const kick = Matter.Vector.create(impulse.x / mass, impulse.y / mass);
      Matter.Body.setVelocity(body, Matter.Vector.add(velocity, kick));
    },
  };
}
