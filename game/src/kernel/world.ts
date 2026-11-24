/**
 * The world: everything in Puddles' scene as entities with components, held in a miniplex ECS.
 * Scenes are LDtk files; each entity's fields carry its size, affordances and slots.
 */

import { type Entity, type LDtk, World } from "ldtk";
import { World as Ecs } from "miniplex";

import { contractValidators } from "../core/contractsSchema";

interface Position {
  readonly x: number;
  readonly y: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** One entity. `position` is its top-left corner in scene units. */
export interface Thing {
  readonly id: string;
  readonly kind: string;
  readonly position: Position;
  readonly size: Size;
  /** What Puddles can do with it, e.g. `hide_behind`, `sit_on`. */
  readonly affords?: readonly string[];
  /** Where other things can go on it: `hang`, `top`, `under`, `inside`. */
  readonly slots?: readonly string[];
}

export type GameWorld = Ecs<Thing>;

interface Scene {
  readonly size: Size;
  readonly things: readonly Thing[];
}

export function createWorld(things: readonly Thing[]): GameWorld {
  const world = new Ecs<Thing>();
  for (const thing of things) world.add(thing);
  return world;
}

/** Everything in the world that affords `action`, in scene order. */
export function affording(world: GameWorld, action: string): Thing[] {
  return world.entities.filter((thing) => thing.affords?.includes(action));
}

export function ofKind(world: GameWorld, kind: string): Thing[] {
  return world.entities.filter((thing) => thing.kind === kind);
}

/** The one thing of `kind`, for scenes that need exactly one (a pond has one bank). */
export function only(world: GameWorld, kind: string): Thing {
  const [thing, ...rest] = ofKind(world, kind);
  if (!thing || rest.length > 0) throw new Error(`the scene needs exactly one ${kind}`);
  return thing;
}

function numberField(entity: Entity, name: string): number {
  const value = entity.fields[name]?.value;
  if (typeof value !== "number") throw new Error(`${entity.id} needs a number field "${name}"`);
  return value;
}

function stringsField(entity: Entity, name: string): string[] | undefined {
  const value = entity.fields[name]?.value;
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : undefined;
}

function toThing(entity: Entity, index: number): Thing {
  const size = { width: numberField(entity, "width"), height: numberField(entity, "height") };
  const { pos, pivot } = entity;
  const affords = stringsField(entity, "affords");
  const slots = stringsField(entity, "slots");
  const kind = entity.id.toLowerCase();
  return {
    id: `${kind}-${String(index)}`,
    kind,
    position: { x: pos.x - pivot.x * size.width, y: pos.y - pivot.y * size.height },
    size,
    ...(affords && { affords }),
    ...(slots && { slots }),
  };
}

/** Reads a scene plugin: its manifest and the LDtk project holding a level named by its id. */
export function loadScene(manifest: unknown, ldtk: string): Scene {
  if (!contractValidators.manifest(manifest)) throw new Error("not a valid manifest");
  if (manifest.kind !== "content" || manifest.type !== "scene") {
    throw new Error(`${manifest.id} is not a scene`);
  }
  const project = World.fromJSON(JSON.parse(ldtk) as LDtk.World);
  const level = project.levelMap[manifest.id];
  if (!level) throw new Error(`no level named ${manifest.id}`);
  const entities = level.layers.flatMap((layer) => layer.entities ?? []);
  return { size: level.size, things: entities.map(toThing) };
}
