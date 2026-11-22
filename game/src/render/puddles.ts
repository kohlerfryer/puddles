import { type Application, Container, Graphics } from "pixi.js";

import { advanceIdle, idlePosition, startIdle } from "../core/idle";
import { POND, SCENE_WIDTH } from "../core/pond";
import type { Mood } from "../core/reaction";

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

/** Draws placeholder Puddles on the bank of `scene` and runs the idle loop: wander, preen and nap. */
export function drawPuddles(app: Application, scene: Container): Puddles {
  const duck = new Container();
  const body = drawBody();
  const { head, face } = drawHead();
  duck.addChild(body, head);
  duck.position.y = POND.bank.top + POND.bank.height / 3;
  scene.addChild(duck);

  let mood: Mood = "happy";
  let state = startIdle(SCENE_WIDTH / 2, Math.random);
  let clock = 0;
  let shownFace = "";

  app.ticker.add((ticker) => {
    const seconds = ticker.deltaMS / 1000;
    clock += seconds;
    state = advanceIdle(state, seconds, Math.random);
    const { kind, from, to } = state.action;
    duck.position.x = idlePosition(state);
    if (to !== from) duck.scale.x = to > from ? 1 : -1;
    duck.rotation = kind === "wander" ? Math.sin(clock * 10) * WADDLE : 0;
    head.rotation = kind === "preen" ? 1.2 + Math.sin(clock * 6) * PREEN_SWAY : 0;

    const wanted = kind === "nap" ? "nap" : mood;
    if (wanted === shownFace) return;
    shownFace = wanted;
    face.clear();
    if (wanted === "nap") sleepFace(face);
    else FACES[mood](face);
  });

  return {
    setMood: (next) => {
      mood = next;
    },
  };
}
