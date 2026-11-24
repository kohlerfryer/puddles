import { newSamples, type ReadCamera } from "../../../core/cameraSample";
import type { KernelEvent } from "../../../core/contracts";
import type { PluginFolder } from "../../../kernel/plugins";
import { BODY_GESTURES, type BodyGesture } from "./gestures";
import manifest from "./manifest.json";
import { createGestureWatch } from "./watch";

const GESTURE = "observation.gesture";

/** Emits `observation.gesture` for each body gesture the kid makes; the landmarks stay here. */
export function gesturesSense(read: ReadCamera): PluginFolder {
  const fresh = newSamples(read);
  const watch = createGestureWatch();
  return {
    manifest,
    code: {
      sense: ({ t }) => {
        const pose = fresh(t)?.pose;
        if (!pose) return [];
        return watch.push(pose).map((gesture) => ({ type: GESTURE, data: { gesture } }));
      },
    },
  };
}

/** The gesture an `observation.gesture` event reports, or nothing for any other event. */
export function gestureOf({ type, data }: KernelEvent): BodyGesture | undefined {
  if (type !== GESTURE) return undefined;
  return BODY_GESTURES.find((gesture) => gesture === data.gesture);
}
