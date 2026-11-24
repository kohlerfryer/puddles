import { newSamples, type ReadCamera } from "../../../core/cameraSample";
import type { PoseFrame } from "../../../core/poseFixture";
import type { PluginFolder } from "../../../kernel/plugins";
import manifest from "./manifest.json";

/** MediaPipe Pose landmark indices: the shoulders and hips, whose middle is where the kid is. */
const TORSO = [11, 12, 23, 24];

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

function middle(frame: PoseFrame, axis: "x" | "y"): number {
  const sum = TORSO.reduce((total, i) => total + (frame.landmarks[i]?.[axis] ?? 0), 0);
  return clamp(sum / TORSO.length);
}

/** Emits `observation.kid` on each camera sample: whether the kid is there, and where. */
export function poseSense(read: ReadCamera): PluginFolder {
  const fresh = newSamples(read);
  return {
    manifest,
    code: {
      sense: ({ t }) => {
        const sample = fresh(t);
        if (!sample) return [];
        const { pose } = sample;
        const data = pose
          ? { present: true, pose: { x: middle(pose, "x"), y: middle(pose, "y") } }
          : { present: false };
        return [{ type: "observation.kid", data }];
      },
    },
  };
}
