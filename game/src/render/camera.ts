import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";

import { createGestureWatch } from "../core/gestureWatch";
import type { BodyGesture } from "../core/gestures";
import { armRaised, type Box, createHoldWatch, cropBox, highestHand } from "../core/hold";
import { type PoseFrame, toFrame } from "../core/poseFixture";

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
 * Returns a per-sample step that runs Hand Landmarker and, when a raised hand is held still,
 * photographs it and calls `onPhoto`. The watch re-arms once `onPhoto` settles, after a cooldown.
 */
async function watchHands(
  video: HTMLVideoElement,
  onPhoto: (photo: Blob) => Promise<void>,
): Promise<(now: number, frame: PoseFrame | undefined) => void> {
  const hands = await loadHands();
  const watch = createHoldWatch();
  return (now, frame) => {
    const hand = highestHand(hands.detectForVideo(video, now).landmarks);
    const raised = frame !== undefined && armRaised(frame);
    if (!hand || !watch.push({ t: now, raised, hand })) return;
    void photograph(video, cropBox(hand, video.videoWidth, video.videoHeight))
      .then(onPhoto)
      .finally(() => {
        watch.finished(performance.now());
      });
  };
}

/**
 * Runs MediaPipe Pose on the webcam and calls `onGesture` for each gesture the player makes.
 * `now` is `performance.now()` when the gesture was seen. With `onPhoto`, it also runs Hand
 * Landmarker and passes a photo of anything held up still; `onPhoto` resolves when the reaction finishes.
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
  const holdStep = onPhoto ? await watchHands(video, onPhoto) : undefined;
  const watch = createGestureWatch();
  let sampledAt = -Infinity;

  const sample = (now: number): void => {
    requestAnimationFrame(sample);
    if (now - sampledAt < SAMPLE_MS) return;
    sampledAt = now;
    const person = pose.detectForVideo(video, now).landmarks[0];
    const frame = person ? toFrame(now, person) : undefined;
    onFrame?.(frame);
    holdStep?.(now, frame);
    if (!frame) return;
    for (const gesture of watch.push(frame)) onGesture(gesture, now);
  };
  requestAnimationFrame(sample);
}
