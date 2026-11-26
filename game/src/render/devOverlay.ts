import type { KernelEvent } from "../core/contracts";
import { rowText, timeline } from "../core/timeline";
import { element } from "./devPanel";

/** The key that shows and hides the overlay. */
const TOGGLE_KEY = "~";
/** How many events the overlay keeps; older ones scroll away. */
const KEPT_EVENTS = 3000;
const SHOWN_ROWS = 12;
const REDRAW_MS = 500;

/**
 * Hidden replay viewer (spec §14): the latest intents as observation → intent (why) → verdict →
 * outcome → reward, built from the event log. Returns where to send each event the kernel logs.
 */
export function createDevOverlay(host: HTMLElement): (event: KernelEvent) => void {
  const box = element("pre", host);
  box.style.cssText =
    "position:fixed;left:12px;bottom:12px;max-width:70vw;margin:0;padding:8px 12px;display:none;" +
    "border-radius:8px;background:rgba(0,0,0,.75);color:#fff;font:12px/1.5 monospace;" +
    "white-space:pre-wrap";
  let events: KernelEvent[] = [];
  let drawnAt = -Infinity;
  const draw = () => {
    drawnAt = performance.now();
    box.textContent = timeline(events).slice(-SHOWN_ROWS).map(rowText).join("\n");
  };
  window.addEventListener("keydown", (event) => {
    if (event.key !== TOGGLE_KEY || event.target instanceof HTMLTextAreaElement) return;
    box.style.display = box.style.display === "none" ? "block" : "none";
    draw();
  });
  return (event) => {
    events.push(event);
    if (events.length > KEPT_EVENTS) events = events.slice(-KEPT_EVENTS);
    if (box.style.display !== "none" && performance.now() - drawnAt > REDRAW_MS) draw();
  };
}
