/**
 * The one local save (spec §11): memory, bandit statistics, the house collection and parent
 * controls. The local server keeps it as inspectable JSON; the game reads and writes it through
 * the server. Only the fields below are kept, so transcripts and photos are never saved.
 */

export const AUTONOMY_LEVELS = [0, 1, 2, 3] as const;
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];
export const THEMES = ["pond"] as const;
export type Theme = (typeof THEMES)[number];
/** Minutes of play before Puddles suggests a break. */
export const SESSION_LIMIT_MIN = { min: 5, max: 120, default: 20 } as const;
const DEFAULT_SERVER = "http://localhost:8000";

export interface Settings {
  readonly mic: boolean;
  readonly camera: boolean;
  readonly autonomy: Autonomy;
  readonly session_limit_min: number;
  readonly theme: Theme;
}

export interface Memory {
  readonly episodes: readonly string[];
  readonly facts: readonly string[];
  /** What Puddles thinks of each item, by item id. */
  readonly opinions: Readonly<Record<string, string>>;
  readonly tricks: readonly string[];
}

/** Binary-reward counts for one object-archetype × arm pair. */
export interface ArmStats {
  readonly successes: number;
  readonly failures: number;
}

export interface Save {
  readonly version: 1;
  readonly settings: Settings;
  readonly memory: Memory;
  /** Bandit statistics per household, keyed by `archetype:arm`. */
  readonly bandit: Readonly<Record<string, ArmStats>>;
  /** Prop ids in Puddles' house collection. */
  readonly house: readonly string[];
}

/** Reads and writes the save on the local server. */
export interface SaveServer {
  load(): Promise<unknown>;
  store(save: Save): Promise<void>;
}

type Fields = Readonly<Record<string, unknown>>;

const fields = (value: unknown): Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Fields) : {};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function entries<T>(value: unknown, keep: (item: unknown) => item is T): Record<string, T> {
  return Object.fromEntries(
    Object.entries(fields(value)).filter(([, item]) => keep(item)),
  ) as Record<string, T>;
}

const isString = (value: unknown): value is string => typeof value === "string";

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

function isArmStats(value: unknown): value is ArmStats {
  const { successes, failures } = fields(value);
  return isCount(successes) && isCount(failures);
}

function oneOf<T>(options: readonly T[], value: unknown, fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

function sessionLimit(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return SESSION_LIMIT_MIN.default;
  return Math.min(SESSION_LIMIT_MIN.max, Math.max(SESSION_LIMIT_MIN.min, Math.round(value)));
}

function parseSettings(value: unknown): Settings {
  const raw = fields(value);
  return {
    mic: flag(raw.mic, false),
    camera: flag(raw.camera, true),
    autonomy: oneOf(AUTONOMY_LEVELS, raw.autonomy, 1),
    session_limit_min: sessionLimit(raw.session_limit_min),
    theme: oneOf(THEMES, raw.theme, "pond"),
  };
}

function parseMemory(value: unknown): Memory {
  const raw = fields(value);
  return {
    episodes: strings(raw.episodes),
    facts: strings(raw.facts),
    opinions: entries(raw.opinions, isString),
    tricks: strings(raw.tricks),
  };
}

/** The save in `value`, keeping its valid known fields and defaulting the rest. */
export function parseSave(value: unknown): Save {
  const raw = fields(value);
  return {
    version: 1,
    settings: parseSettings(raw.settings),
    memory: parseMemory(raw.memory),
    bandit: entries(raw.bandit, isArmStats),
    house: strings(raw.house),
  };
}

/** A fresh save: nothing remembered and default parent controls. */
export const defaultSave = (): Save => parseSave(undefined);

/** `save` with the `changes` to its parent controls, kept in range. */
export function withSettings(save: Save, changes: Partial<Settings>): Save {
  return { ...save, settings: parseSettings({ ...save.settings, ...changes }) };
}

/** Forget everything: memory, bandit statistics and the house go; parent controls stay. */
export function forgetEverything(save: Save): Save {
  return { ...defaultSave(), settings: save.settings };
}

/**
 * The save on `server`, or null when it can't be read. Null is not a fresh save: storing a fresh
 * save in its place would overwrite the real one.
 */
export async function loadSave(server: SaveServer): Promise<Save | null> {
  try {
    return parseSave(await server.load());
  } catch {
    return null;
  }
}

/** The `/save` endpoint on `server`, or on the local server when none is configured. */
export function saveUrl(server: string | undefined): string {
  return `${(server ?? DEFAULT_SERVER).replace(/\/$/, "")}/save`;
}
