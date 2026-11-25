import { FaceLandmarker, FilesetResolver, type PoseLandmarker } from "@mediapipe/tasks-vision";

import { toFrame } from "../core/poseFixture";
import {
  faceLandmarks,
  smileScore,
  summarize,
  type ProbeMethod,
  type ProbeSample,
  type ProbeSummary,
} from "../core/smileProbe";
import { cropBox } from "../plugins/sense/held_object/hold";
import { loadPose, openCamera, SAMPLE_MS, WASM } from "./camera";

// Dev-only tool for the smile spike (issue #122). Keeps scores only, never images.
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const DISTANCES_M = [0.3, 0.5, 1, 2];
const READY_S = 3;
const HOLD_MS = 5000;
const CROP_PX = 256;

const video = document.getElementById("video") as HTMLVideoElement;
const banner = document.getElementById("banner") as HTMLDivElement;
const status = document.getElementById("status") as HTMLDivElement;
const live = document.getElementById("live") as HTMLDivElement;
const go = document.getElementById("go") as HTMLButtonElement;
const results = document.getElementById("results") as HTMLTableElement;

const crop = document.createElement("canvas");
crop.width = CROP_PX;
crop.height = CROP_PX;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

interface Models {
  pose: PoseLandmarker;
  full: FaceLandmarker;
  cropped: FaceLandmarker;
}

async function loadFace(): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
  });
}

function score(face: FaceLandmarker, source: HTMLVideoElement | HTMLCanvasElement, now: number) {
  const shapes = face.detectForVideo(source, now).faceBlendshapes[0]?.categories;
  return shapes ? smileScore(shapes) : undefined;
}

/** Draws the face found by Pose into the crop canvas; false when there is no face to crop. */
function cropFace(models: Models, now: number): boolean {
  const person = models.pose.detectForVideo(video, now).landmarks[0];
  const face = person ? faceLandmarks(toFrame(now, person)) : [];
  if (!face.length) return false;
  const box = cropBox(face, video.videoWidth, video.videoHeight);
  crop.getContext("2d")?.drawImage(video, box.x, box.y, box.size, box.size, 0, 0, CROP_PX, CROP_PX);
  return true;
}

function measure(models: Models): Record<ProbeMethod, number | undefined> {
  const now = performance.now();
  const full = score(models.full, video, now);
  const cropped = cropFace(models, now) ? score(models.cropped, crop, now) : undefined;
  const show = (v: number | undefined) => (v === undefined ? "no face" : v.toFixed(2));
  live.textContent = `Full frame: ${show(full)} · Face crop: ${show(cropped)}`;
  return { full, crop: cropped };
}

async function hold(models: Models, distanceM: number, face: ProbeSample["face"]) {
  banner.textContent = face === "smile" ? "Big smile!" : "Neutral face";
  const samples: ProbeSample[] = [];
  const end = performance.now() + HOLD_MS;
  while (performance.now() < end) {
    const scores = measure(models);
    for (const method of ["full", "crop"] as const) {
      samples.push({ distanceM, method, face, score: scores[method] });
    }
    await sleep(SAMPLE_MS);
  }
  return samples;
}

async function atDistance(models: Models, distanceM: number): Promise<ProbeSample[]> {
  for (let s = READY_S; s > 0; s--) {
    banner.textContent = `Stand ${String(distanceM)} m away · ${String(s)}`;
    await sleep(1000);
  }
  const neutral = await hold(models, distanceM, "neutral");
  return [...neutral, ...(await hold(models, distanceM, "smile"))];
}

function showResults(summaries: readonly ProbeSummary[]): void {
  const cell = (v: number | undefined) => (v === undefined ? "–" : v.toFixed(2));
  results.innerHTML =
    "<tr><th>m</th><th>method</th><th>found</th><th>neutral</th><th>smile</th><th>sep.</th></tr>" +
    summaries
      .map(
        (s) =>
          `<tr><td>${String(s.distanceM)}</td><td>${s.method}</td><td>${cell(s.detected)}</td>` +
          `<td>${cell(s.neutral)}</td><td>${cell(s.smile)}</td><td>${cell(s.separation)}</td></tr>`,
      )
      .join("");
}

function download(summaries: readonly ProbeSummary[]): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([JSON.stringify({ summaries }, null, 2)], { type: "application/json" }),
  );
  link.download = "smile-probe.json";
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
  }, 0);
}

async function run(models: Models): Promise<void> {
  go.disabled = true;
  const samples: ProbeSample[] = [];
  for (const distanceM of DISTANCES_M) samples.push(...(await atDistance(models, distanceM)));
  banner.textContent = "Done!";
  const summaries = summarize(samples);
  showResults(summaries);
  download(summaries);
  status.textContent = "Saved smile-probe.json. Paste the table or attach the file on issue #122.";
  go.disabled = false;
}

async function start(): Promise<void> {
  await openCamera(video);
  const [pose, full, cropped] = await Promise.all([loadPose(), loadFace(), loadFace()]);
  const models = { pose, full, cropped };
  go.addEventListener("click", () => {
    run(models).catch((error: unknown) => {
      status.textContent = `Probe failed: ${String(error)}`;
      go.disabled = false;
    });
  });
  go.disabled = false;
  status.textContent = "Ready. Put the laptop where the game will run, then press Start.";
}

start().catch((error: unknown) => {
  status.textContent = `Couldn't start: ${String(error)}`;
});
