import { describe, expect, it } from "vitest";

import {
  defaultSave,
  forgetEverything,
  loadSave,
  parseSave,
  type Save,
  type SaveServer,
  saveUrl,
  SESSION_LIMIT_MIN,
  withSettings,
} from "./saves";

const PLAYED: Save = {
  version: 1,
  settings: { mic: true, camera: false, autonomy: 2, session_limit_min: 30, theme: "pond" },
  memory: {
    episodes: ["ate a banana"],
    facts: ["likes red"],
    opinions: { banana: "loves" },
    tricks: ["spin-wave"],
  },
  bandit: { "fruit:peck": { successes: 3, failures: 1 } },
  house: ["red-ball"],
};

/** A server whose stored save is the JSON text in `stored`, or that fails when it is null. */
function server(stored: string | null): SaveServer & { stored: string | null } {
  return {
    stored,
    load() {
      return this.stored === null
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(JSON.parse(this.stored) as unknown);
    },
    store(save) {
      this.stored = JSON.stringify(save);
      return Promise.resolve();
    },
  };
}

describe("parseSave", () => {
  it("round-trips a save through JSON unchanged", () => {
    expect(parseSave(JSON.parse(JSON.stringify(PLAYED)))).toEqual(PLAYED);
  });

  it("starts fresh from nothing", () => {
    expect(parseSave(undefined)).toEqual(defaultSave());
    expect(parseSave({})).toEqual(defaultSave());
    expect(parseSave("nonsense")).toEqual(defaultSave());
  });

  it("keeps parent controls off the mic and on the camera by default", () => {
    expect(defaultSave().settings).toMatchObject({ mic: false, camera: true });
  });

  it("drops fields it does not know, so transcripts and photos never persist", () => {
    const parsed = parseSave({
      ...PLAYED,
      transcript: "my name is",
      photo: "data:image/png;base64,AAAA",
      memory: { ...PLAYED.memory, photos: ["data:image/png;base64,AAAA"] },
    });

    expect(parsed).toEqual(PLAYED);
  });

  it("replaces only the fields that are invalid", () => {
    const parsed = parseSave({
      ...PLAYED,
      settings: { ...PLAYED.settings, autonomy: 9, theme: "lava", mic: "yes" },
      memory: { ...PLAYED.memory, facts: ["ok", 3], opinions: { banana: 1, apple: "likes" } },
      bandit: { good: { successes: 1, failures: 0 }, bad: { successes: -1, failures: 0 } },
      house: "red-ball",
    });

    expect(parsed.settings).toEqual({ ...PLAYED.settings, autonomy: 1, theme: "pond", mic: false });
    expect(parsed.memory.facts).toEqual(["ok"]);
    expect(parsed.memory.opinions).toEqual({ apple: "likes" });
    expect(parsed.bandit).toEqual({ good: { successes: 1, failures: 0 } });
    expect(parsed.house).toEqual([]);
  });

  it("clamps the session limit to whole minutes in range", () => {
    const limit = (minutes: unknown) =>
      parseSave({ settings: { session_limit_min: minutes } }).settings.session_limit_min;

    expect(limit(0)).toBe(SESSION_LIMIT_MIN.min);
    expect(limit(10_000)).toBe(SESSION_LIMIT_MIN.max);
    expect(limit(12.6)).toBe(13);
    expect(limit(Number.NaN)).toBe(SESSION_LIMIT_MIN.default);
  });
});

describe("withSettings", () => {
  it("changes only the given settings", () => {
    const changed = withSettings(PLAYED, { mic: false, autonomy: 0 });

    expect(changed.settings).toEqual({ ...PLAYED.settings, mic: false, autonomy: 0 });
    expect(changed.memory).toEqual(PLAYED.memory);
  });

  it("clamps a session limit typed out of range", () => {
    expect(withSettings(PLAYED, { session_limit_min: -4 }).settings.session_limit_min).toBe(
      SESSION_LIMIT_MIN.min,
    );
  });
});

describe("forgetEverything", () => {
  it("clears memory, bandit statistics and the house but keeps parent controls", () => {
    const forgotten = forgetEverything(PLAYED);

    expect(forgotten).toEqual({ ...defaultSave(), settings: PLAYED.settings });
    expect(forgotten.bandit).toEqual({});
    expect(forgotten.memory).toEqual(defaultSave().memory);
  });
});

describe("loadSave", () => {
  it("reads back what was stored", async () => {
    const saves = server("{}");
    await saves.store(PLAYED);

    expect(await loadSave(saves)).toEqual(PLAYED);
  });

  it("stays forgotten after a reset is stored", async () => {
    const saves = server(JSON.stringify(PLAYED));
    await saves.store(forgetEverything(PLAYED));

    const loaded = await loadSave(saves);
    expect(loaded?.bandit).toEqual({});
    expect(loaded?.memory.episodes).toEqual([]);
  });

  it("starts fresh when nothing has been saved yet", async () => {
    expect(await loadSave(server("{}"))).toEqual(defaultSave());
  });

  it("reports an unreachable server as not loaded rather than fresh", async () => {
    expect(await loadSave(server(null))).toBeNull();
  });
});

describe("saveUrl", () => {
  it("points at the local server's save by default", () => {
    expect(saveUrl(undefined)).toBe("http://localhost:8000/save");
    expect(saveUrl("http://box:9000/")).toBe("http://box:9000/save");
  });
});
