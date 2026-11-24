import {
  AUTONOMY_LEVELS,
  forgetEverything,
  type Save,
  type SaveServer,
  SESSION_LIMIT_MIN,
  type Settings,
  THEMES,
  withSettings,
} from "../kernel/saves";
import { element } from "./devPanel";

function row(parent: HTMLElement, label: string): HTMLLabelElement {
  const node = element("label", parent, `${label} `);
  node.style.display = "block";
  return node;
}

function checkbox(parent: HTMLElement, label: string, checked: boolean) {
  const input = element("input", row(parent, label));
  input.type = "checkbox";
  input.checked = checked;
  return input;
}

function select(parent: HTMLElement, label: string, options: readonly (string | number)[]) {
  const input = element("select", row(parent, label));
  for (const option of options) element("option", input, String(option));
  return input;
}

/** The panel's controls, set to `settings`. */
function controls(box: HTMLElement, settings: Settings) {
  const mic = checkbox(box, "Microphone", settings.mic);
  const camera = checkbox(box, "Camera", settings.camera);
  const autonomy = select(box, "Autonomy level", AUTONOMY_LEVELS);
  autonomy.selectedIndex = AUTONOMY_LEVELS.indexOf(settings.autonomy);
  const limit = element("input", row(box, "Break after (minutes)"));
  Object.assign(limit, { type: "number", min: SESSION_LIMIT_MIN.min, max: SESSION_LIMIT_MIN.max });
  limit.value = String(settings.session_limit_min);
  const theme = select(box, "Theme", THEMES);
  theme.selectedIndex = THEMES.indexOf(settings.theme);
  const forget = element("button", box, "Forget everything");
  const status = element("div", box);
  return { mic, camera, autonomy, limit, theme, forget, status };
}

/** A hidden box with a corner button that shows and hides it. */
function panel(host: HTMLElement): HTMLDivElement {
  const open = element("button", host, "Grown-ups");
  open.style.cssText = "position:fixed;left:12px;bottom:12px;opacity:.6";
  const box = element("div", host);
  box.style.cssText =
    "position:fixed;left:12px;bottom:48px;width:260px;padding:8px 12px;border-radius:8px;display:none;" +
    "background:rgba(0,0,0,.75);color:#fff;font:14px/1.8 system-ui,sans-serif";
  open.addEventListener("click", () => {
    box.style.display = box.style.display === "none" ? "block" : "none";
  });
  return box;
}

/**
 * The grown-ups panel: mic and camera, autonomy level, session limit, theme and "forget
 * everything". Every change is written to the save straight away; a camera change reloads.
 */
export function createParentPanel(host: HTMLElement, saves: SaveServer, loaded: Save): void {
  let save = loaded;
  const { mic, camera, autonomy, limit, theme, forget, status } = controls(
    panel(host),
    save.settings,
  );

  const store = async (next: Save) => {
    save = next;
    limit.value = String(save.settings.session_limit_min);
    try {
      await saves.store(save);
      status.textContent = "Saved.";
    } catch {
      status.textContent = "Couldn't reach the save. Is the server running?";
    }
  };
  const change = (changes: Partial<Settings>) => store(withSettings(save, changes));

  mic.addEventListener("change", () => void change({ mic: mic.checked }));
  camera.addEventListener("change", () => {
    void change({ camera: camera.checked }).then(() => {
      window.location.reload();
    });
  });
  autonomy.addEventListener("change", () => {
    const level = AUTONOMY_LEVELS[autonomy.selectedIndex];
    if (level !== undefined) void change({ autonomy: level });
  });
  limit.addEventListener("change", () => void change({ session_limit_min: Number(limit.value) }));
  theme.addEventListener("change", () => {
    const picked = THEMES[theme.selectedIndex];
    if (picked) void change({ theme: picked });
  });
  forget.addEventListener("click", () => {
    if (window.confirm("Forget everything Puddles has learned? Parent settings stay.")) {
      void store(forgetEverything(save));
    }
  });
}
