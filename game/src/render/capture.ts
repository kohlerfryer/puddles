import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import {
  fixtureFileName,
  GESTURES,
  toFrame,
  type Gesture,
  type PoseFrame,
} from "../core/poseFixture";

// Dev-only tool for recording gesture fixtures (issue #28). Assets load from the
// MediaPipe CDN; the game itself will bundle them for offline play.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const COUNTDOWN_S = 3;
const RECORD_MS = 10_000;
const SAMPLE_MS = 66;

const video = document.getElementById("video") as HTMLVideoElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const banner = document.getElementById("banner") as HTMLDivElement;
const status = document.getElementById("status") as HTMLDivElement;
const who = document.getElementById("who") as HTMLInputElement;
const buttons = document.getElementById("buttons") as HTMLDivElement;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

function download(name: string, data: unknown): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  link.download = name;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
  }, 0);
}

function drawPoints(frame: PoseFrame | undefined): void {
  const ctx = overlay.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = "#ffd23f";
  for (const l of frame?.landmarks ?? []) {
    ctx.beginPath();
    ctx.arc(l.x * overlay.width, l.y * overlay.height, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function detect(pose: PoseLandmarker, start: number): PoseFrame | undefined {
  const now = performance.now();
  const person = pose.detectForVideo(video, now).landmarks[0];
  return person ? toFrame(now - start, person) : undefined;
}

async function countdown(): Promise<void> {
  for (let s = COUNTDOWN_S; s > 0; s--) {
    banner.textContent = String(s);
    await sleep(1000);
  }
}

async function record(pose: PoseLandmarker, gesture: Gesture): Promise<PoseFrame[]> {
  await countdown();
  banner.textContent = `${gesture.toUpperCase()}!`;
  const frames: PoseFrame[] = [];
  const start = performance.now();
  while (performance.now() - start < RECORD_MS) {
    const frame = detect(pose, start);
    if (frame) frames.push(frame);
    drawPoints(frame);
    await sleep(SAMPLE_MS);
  }
  banner.textContent = "";
  return frames;
}

function setButtonsEnabled(enabled: boolean): void {
  buttons.querySelectorAll("button").forEach((b) => (b.disabled = !enabled));
}

async function saveRecording(pose: PoseLandmarker, gesture: Gesture, button: HTMLButtonElement) {
  const frames = await record(pose, gesture);
  const name = fixtureFileName(gesture, who.value);
  if (frames.length === 0) {
    status.textContent = "No body detected. Step back so you're fully in view and try again.";
    return;
  }
  download(name, { gesture, who: who.value.trim() || "anon", frames });
  button.classList.add("done");
  status.textContent = `Saved ${name} (${String(frames.length)} frames).`;
}

async function onRecord(pose: PoseLandmarker, gesture: Gesture, button: HTMLButtonElement) {
  setButtonsEnabled(false);
  try {
    await saveRecording(pose, gesture, button);
  } catch (error: unknown) {
    banner.textContent = "";
    status.textContent = `Recording failed: ${String(error)}`;
  } finally {
    setButtonsEnabled(true);
  }
}

async function start(): Promise<void> {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
  });
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  const vision = await FilesetResolver.forVisionTasks(WASM);
  const pose = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL },
    runningMode: "VIDEO",
  });
  for (const gesture of GESTURES) {
    const button = document.createElement("button");
    button.textContent = `Record ${gesture}`;
    button.addEventListener("click", () => void onRecord(pose, gesture, button));
    buttons.appendChild(button);
  }
  status.textContent = "Ready. Pick a gesture.";
}

start().catch((error: unknown) => {
  status.textContent = `Couldn't start: ${String(error)}`;
});
