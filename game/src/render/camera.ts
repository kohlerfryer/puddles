import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import { createGestureWatch } from "../core/gestureWatch";
import type { BodyGesture } from "../core/gestures";
import { type PoseFrame, toFrame } from "../core/poseFixture";

// Assets load from the MediaPipe CDN for now; bundling them for offline play is a follow-up.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
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

/**
 * Runs MediaPipe Pose on the webcam and calls `onGesture` for each gesture the player makes.
 * `now` is `performance.now()` when the gesture was seen.
 */
export async function watchCamera(
  onGesture: (gesture: BodyGesture, now: number) => void,
  onFrame?: (frame: PoseFrame | undefined) => void,
): Promise<void> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  await openCamera(video);
  const pose = await loadPose();
  const watch = createGestureWatch();
  let sampledAt = -Infinity;

  const sample = (now: number): void => {
    requestAnimationFrame(sample);
    if (now - sampledAt < SAMPLE_MS) return;
    sampledAt = now;
    const person = pose.detectForVideo(video, now).landmarks[0];
    const frame = person ? toFrame(now, person) : undefined;
    onFrame?.(frame);
    if (!frame) return;
    for (const gesture of watch.push(frame)) onGesture(gesture, now);
  };
  requestAnimationFrame(sample);
}
