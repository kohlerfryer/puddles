import { type Application, Container, Graphics } from "pixi.js";

import { advanceIdle, idlePosition, startIdle } from "../core/idle";
import { POND, SCENE_WIDTH } from "../core/pond";
import type { Mood, Step } from "../core/reaction";
import type { createRunner } from "../core/runner";
import { frameAt, type Plan, planVerb } from "../core/verbs";

type Runner = ReturnType<typeof createRunner>;
type Playing = Extract<ReturnType<Runner["update"]>, { state: "playing" }>;

interface Puddles {
  setMood: (mood: Mood) => void;
}

const COLOURS = {
  body: "#f7d84a",
  wing: "#e8c23a",
  beak: "#f08a24",
  eye: "#222222",
  white: "#ffffff",
  tongue: "#e86a8a",
  gross: "#7fae3c",
};

const LINE = { width: 3, color: COLOURS.eye, cap: "round" } as const;
/** Eye centres in head space; the head is a circle of radius 30 around the origin. */
const EYES = [
  { x: -6, y: -8 },
  { x: 12, y: -8 },
] as const;
const PREEN_SWAY = 0.35;
const WADDLE = 0.06;

function beak(g: Graphics, open: boolean): void {
  if (open) {
    g.poly([22, 0, 46, -4, 26, 4]).fill(COLOURS.beak);
    g.poly([22, 8, 44, 12, 26, 4]).fill(COLOURS.beak);
    return;
  }
  g.ellipse(36, 4, 14, 6).fill(COLOURS.beak);
}

function tongue(g: Graphics, colour: string): void {
  g.ellipse(34, 12, 5, 8).fill(colour);
}

function dotEyes(g: Graphics, radius: number, pupilShift: (side: number) => number): void {
  EYES.forEach((eye, side) => {
    g.circle(eye.x, eye.y, radius)
      .fill(COLOURS.white)
      .stroke({ ...LINE, width: 1.5 });
    g.circle(eye.x + pupilShift(side), eye.y, Math.max(radius / 3, 2)).fill(COLOURS.eye);
  });
}

const FACES: Record<Mood, (g: Graphics) => void> = {
  happy: (g) => {
    for (const eye of EYES) g.arc(eye.x, eye.y + 3, 5, Math.PI, 2 * Math.PI).stroke(LINE);
    beak(g, false);
  },
  curious: (g) => {
    g.circle(EYES[0].x, EYES[0].y, 3).fill(COLOURS.eye);
    g.circle(EYES[1].x, EYES[1].y, 7)
      .fill(COLOURS.white)
      .stroke({ ...LINE, width: 1.5 });
    g.circle(EYES[1].x + 2, EYES[1].y, 3).fill(COLOURS.eye);
    g.moveTo(EYES[1].x - 7, EYES[1].y - 12)
      .lineTo(EYES[1].x + 7, EYES[1].y - 16)
      .stroke(LINE);
    beak(g, false);
  },
  scared: (g) => {
    dotEyes(g, 7, () => 0);
    for (const eye of EYES)
      g.moveTo(eye.x - 6, eye.y - 10)
        .lineTo(eye.x + 4, eye.y - 15)
        .stroke(LINE);
    beak(g, true);
  },
  silly: (g) => {
    dotEyes(g, 6, (side) => (side === 0 ? 3 : -3));
    beak(g, true);
    tongue(g, COLOURS.tongue);
  },
  proud: (g) => {
    for (const eye of EYES) {
      g.circle(eye.x, eye.y, 5).fill(COLOURS.eye);
      g.rect(eye.x - 6, eye.y - 6, 12, 6).fill(COLOURS.body);
      g.moveTo(eye.x - 6, eye.y)
        .lineTo(eye.x + 6, eye.y)
        .stroke(LINE);
    }
    beak(g, false);
  },
  grossed_out: (g) => {
    for (const [eye, dir] of [
      [EYES[0], 1],
      [EYES[1], -1],
    ] as const) {
      g.moveTo(eye.x - 4 * dir, eye.y - 4)
        .lineTo(eye.x + 4 * dir, eye.y)
        .stroke(LINE);
      g.lineTo(eye.x - 4 * dir, eye.y + 4).stroke(LINE);
    }
    beak(g, true);
    tongue(g, COLOURS.gross);
  },
};

function sleepFace(g: Graphics): void {
  for (const eye of EYES) g.arc(eye.x, eye.y - 2, 5, 0, Math.PI).stroke(LINE);
  beak(g, false);
}

function drawBody(): Graphics {
  const g = new Graphics();
  g.ellipse(0, -45, 55, 38).fill(COLOURS.body);
  g.ellipse(-8, -48, 30, 18).fill(COLOURS.wing);
  g.poly([-50, -60, -72, -78, -56, -44]).fill(COLOURS.body);
  g.rect(-12, -10, 5, 10).fill(COLOURS.beak);
  g.rect(10, -10, 5, 10).fill(COLOURS.beak);
  return g;
}

function drawHead(): { head: Container; face: Graphics } {
  const head = new Container();
  head.position.set(34, -92);
  head.addChild(new Graphics().circle(0, 0, 30).fill(COLOURS.body));
  const face = new Graphics();
  head.addChild(face);
  return { head, face };
}

function drawDuck(): { duck: Container; head: Container; face: Graphics } {
  const duck = new Container();
  const { head, face } = drawHead();
  duck.addChild(drawBody(), head);
  return { duck, head, face };
}

/** Shows `wanted` on the face unless it is already there. */
function faceShower(face: Graphics): (wanted: Mood | "nap") => void {
  let shown = "";
  return (wanted) => {
    if (wanted === shown) return;
    shown = wanted;
    face.clear();
    if (wanted === "nap") sleepFace(face);
    else FACES[wanted](face);
  };
}

/**
 * Draws placeholder Puddles on the bank of `scene`. Steps from `runner` play first; between
 * them Puddles idles: wander, preen and nap.
 */
export function drawPuddles(app: Application, scene: Container, runner: Runner): Puddles {
  const { duck, head, face } = drawDuck();
  const ground = POND.bank.top + POND.bank.height / 3;
  duck.position.y = ground;
  scene.addChild(duck);
  const showFace = faceShower(face);

  let mood: Mood = "happy";
  let idle = startIdle(SCENE_WIDTH / 2, Math.random);
  let acting: { step: Step; startedAt: number; plan: Plan } | undefined;
  let clock = 0;

  /** Plays the runner's current step; the object sticker isn't on the bank yet, so it sits mid-bank. */
  function act({ step, startedAt }: Playing, now: number): void {
    if (acting?.step !== step || acting.startedAt !== startedAt) {
      const facing = duck.scale.x < 0 ? -1 : 1;
      const plan = planVerb(step, { x: duck.position.x, facing }, { object: SCENE_WIDTH / 2 });
      acting = { step, startedAt, plan };
    }
    const frame = frameAt(acting.plan, (now - startedAt) / 1000);
    duck.position.set(frame.x, ground - frame.height);
    duck.scale.x = frame.facing;
    const moving = frame.pose === "walk" || frame.pose === "run";
    duck.rotation = moving ? Math.sin(clock * 10) * WADDLE : 0;
    head.rotation = 0;
    showFace(step.mood);
  }

  function idleOn(seconds: number): void {
    if (acting) idle = startIdle(duck.position.x, Math.random);
    acting = undefined;
    idle = advanceIdle(idle, seconds, Math.random);
    const { kind, from, to } = idle.action;
    duck.position.set(idlePosition(idle), ground);
    if (to !== from) duck.scale.x = to > from ? 1 : -1;
    duck.rotation = kind === "wander" ? Math.sin(clock * 10) * WADDLE : 0;
    head.rotation = kind === "preen" ? 1.2 + Math.sin(clock * 6) * PREEN_SWAY : 0;
    showFace(kind === "nap" ? "nap" : mood);
  }

  app.ticker.add((ticker) => {
    clock += ticker.deltaMS / 1000;
    const now = performance.now();
    const status = runner.update(now);
    if (status.state === "playing") act(status, now);
    else idleOn(ticker.deltaMS / 1000);
  });

  return {
    setMood: (next) => {
      mood = next;
    },
  };
}
