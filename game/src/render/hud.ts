import type { PoseFrame } from "../core/poseFixture";
import { feetInView } from "../plugins/sense/gestures/gestures";

/** Corner readout of what the camera sees, so a missed gesture can be told from a slow duck, and the sound. */
export interface Hud {
  status(text: string): void;
  frame(frame: PoseFrame | undefined): void;
  gesture(name: string, line: string | undefined): void;
  sound(text: string): void;
  server(text: string): void;
  /** The last key moment in a recording, for the screenshot script to wait on. */
  moment(text: string): void;
}

export function createHud(host: HTMLElement): Hud {
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:12px;bottom:12px;padding:8px 12px;border-radius:8px;" +
    "background:rgba(0,0,0,.55);color:#fff;font:14px/1.5 system-ui,sans-serif;pointer-events:none";
  const camera = document.createElement("div");
  const body = document.createElement("div");
  const last = document.createElement("div");
  const sound = document.createElement("div");
  const server = document.createElement("div");
  const moment = document.createElement("div");
  moment.id = "hud-moment";
  box.append(camera, body, last, sound, server, moment);
  host.appendChild(box);
  camera.textContent = "Camera: starting...";
  last.textContent = "Last gesture: none yet";
  server.textContent = "Server: no request yet";

  return {
    status(text) {
      camera.textContent = `Camera: ${text}`;
    },
    frame(frame) {
      if (!frame) {
        body.textContent = "Body: not seen. Step into view.";
      } else if (!feetInView(frame)) {
        body.textContent = "Body: seen, feet hidden. Step back for jump and crouch.";
      } else {
        body.textContent = "Body: seen, head to feet.";
      }
    },
    gesture(name, line) {
      const time = new Date().toLocaleTimeString();
      last.textContent = `Last gesture: ${name} at ${time}${line ? ` ("${line}")` : ""}`;
    },
    sound(text) {
      sound.textContent = `Sound: ${text}`;
    },
    server(text) {
      server.textContent = `Server: ${text}`;
    },
    moment(text) {
      moment.textContent = `Moment: ${text}`;
    },
  };
}
