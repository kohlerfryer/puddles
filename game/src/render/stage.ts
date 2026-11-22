import { Application } from "pixi.js";

const SKY = "#cfe8f3";

export async function createStage(host: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({ resizeTo: window, background: SKY, antialias: true });
  host.appendChild(app.canvas);
  return app;
}
