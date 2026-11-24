import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

import type { CameraSample, Point } from "../core/cameraSample";
import { type PoseFrame, toFrame } from "../core/poseFixture";
import { TICK_HZ } from "../kernel/clock";
import type { KernelEvent } from "../core/contracts";
import { createKernel, type Kernel } from "../kernel/kernel";
import { gestureOf, gesturesSense } from "../plugins/sense/gestures";
import type { BodyGesture } from "../plugins/sense/gestures/gestures";
import { heldHand, heldObjectSense } from "../plugins/sense/held_object";
import { type Box, cropBox } from "../plugins/sense/held_object/hold";
import { poseSense } from "../plugins/sense/pose";

// Assets load from the MediaPipe CDN for now; bundling them for offline play is a follow-up.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
/** Photos of held-up objects are this many pixels square. */
const PHOTO_PX = 512;
/** Same rate the gesture fixtures were recorded at, so live input matches what the detector is tested on. */
export const SAMPLE_MS = 66;

/** Starts the webcam playing into `video`. */
export async function openCamera(video: HTMLVideoElement): Promise<void> {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720 },
  });
  await video.play();
}

export async function loadPose(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL },
    runningMode: "VIDEO",
  });
}

async function loadHands(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

/** Crops `box` out of the current video frame as a square JPEG. */
async function photograph(video: HTMLVideoElement, box: Box): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_PX;
  canvas.height = PHOTO_PX;
  canvas
    .getContext("2d")
    ?.drawImage(video, box.x, box.y, box.size, box.size, 0, 0, PHOTO_PX, PHOTO_PX);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("could not encode the photo"));
    }, "image/jpeg");
  });
}

/**
 * Runs MediaPipe Pose on the webcam and feeds the landmarks to the sense plugins in a kernel;
 * calls `onGesture` for each gesture the player makes, with `now` as `performance.now()` when it
 * was seen. With `onPhoto`, it also runs Hand Landmarker and passes a photo of anything held up
 * still; `onPhoto` resolves when the reaction finishes. Only render ever touches the image.
 */
export async function watchCamera(
  onGesture: (gesture: BodyGesture, now: number) => void,
  onFrame?: (frame: PoseFrame | undefined) => void,
  onPhoto?: (photo: Blob) => Promise<void>,
): Promise<void> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  await openCamera(video);
  const pose = await loadPose();
  const hands = onPhoto ? await loadHands() : undefined;
  let latest: CameraSample | undefined;
  const read = () => latest;
  const held = heldObjectSense(read);
  const kernel = createKernel({
    plugins: [poseSense(read), gesturesSense(read), ...(hands ? [held.folder] : [])],
  });
  let sampledAt = -Infinity;

  const sample = (now: number): void => {
    requestAnimationFrame(sample);
    if (now - sampledAt < SAMPLE_MS) return;
    sampledAt = now;
    const person = pose.detectForVideo(video, now).landmarks[0];
    const frame = person ? toFrame(now, person) : undefined;
    onFrame?.(frame);
    latest = { t: now, pose: frame, hands: hands?.detectForVideo(video, now).landmarks ?? [] };
  };
  const photo = (hand: Point[]): void => {
    if (!onPhoto) return;
    void photograph(video, cropBox(hand, video.videoWidth, video.videoHeight))
      .then(onPhoto)
      .finally(() => {
        held.finished(performance.now());
      });
  };
  driveKernel(kernel, (events) => {
    for (const event of events) {
      const gesture = gestureOf(event);
      if (gesture) onGesture(gesture, performance.now());
      const hand = heldHand(event);
      if (hand) photo(hand);
    }
  });
  requestAnimationFrame(sample);
}

/** Ticks `kernel` at its own rate and hands `onTick` each tick's new events; returns how to stop. */
export function driveKernel(
  kernel: Kernel,
  onTick: (events: readonly KernelEvent[]) => void,
): () => void {
  let seen = 0;
  const timer = setInterval(() => {
    kernel.tick();
    const events = kernel.log.since(seen);
    seen = kernel.log.count;
    onTick(events);
  }, 1000 / TICK_HZ);
  return () => {
    clearInterval(timer);
  };
}
