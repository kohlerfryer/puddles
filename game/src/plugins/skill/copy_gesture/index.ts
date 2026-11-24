import type { Step } from "../../../core/contracts";
import type { Activity, PluginContext } from "../../../kernel/plugins";
import { gestureOf } from "../../sense/gestures";
import manifest from "./manifest.json";

/**
 * Waits for the kid to make a gesture until `until` (kernel ms; the manifest's duration from now
 * by default), ending with the gesture seen in its effects, or with none once the wait is over.
 */
export function copyGesture(args: Step["args"], { t }: PluginContext): Activity {
  const until = typeof args.until === "number" ? args.until : t + manifest.duration_s * 1000;
  return {
    tick(now, events) {
      const gesture = events.map(gestureOf).find((seen) => seen !== undefined);
      if (gesture) return { status: "done", effects: { gesture } };
      return now >= until ? { status: "done" } : "running";
    },
  };
}
