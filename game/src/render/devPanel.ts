import { DEV_PRESETS, parsePastedReaction, TRAIT_CHOICES } from "../core/devPanel";
import type { Actor } from "./play";

/** The key that shows and hides the panel. */
const TOGGLE_KEY = "`";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  parent: HTMLElement,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function choice<T extends string>(label: string, options: readonly T[], parent: HTMLElement) {
  const row = element("label", parent, `${label} `);
  row.style.display = "block";
  const select = element("select", row);
  for (const option of options) element("option", select, option);
  return (): T | undefined => options[select.selectedIndex];
}

/** Sticker traits picked from dropdowns and a checkbox, with a button that drops the sticker. */
function stickerForm(box: HTMLElement, actor: Actor): void {
  element("strong", box, "Sticker");
  const pickSize = choice("size", TRAIT_CHOICES.size, box);
  const pickWeight = choice("weight", TRAIT_CHOICES.weight, box);
  const pickShape = choice("shape", TRAIT_CHOICES.shape, box);
  const edibleRow = element("label", box, "edible ");
  edibleRow.style.display = "block";
  const edible = element("input", edibleRow);
  edible.type = "checkbox";
  element("button", box, "Drop sticker").addEventListener("click", () => {
    const size = pickSize();
    const weight = pickWeight();
    const shape = pickShape();
    if (!size || !weight || !shape) return;
    actor.spawn({ size, weight, shape, edible: edible.checked });
  });
}

function presetButtons(box: HTMLElement, actor: Actor): void {
  element("strong", box, "Presets").style.display = "block";
  for (const preset of DEV_PRESETS) {
    element("button", box, preset.name).addEventListener("click", () => {
      actor.spawn(preset.traits);
      actor.play(preset.script);
    });
  }
}

/** A box for a pasted reaction: plays it with its sticker when valid, lists schema errors when not. */
function pasteBox(box: HTMLElement, actor: Actor): void {
  element("strong", box, "Paste a reaction").style.display = "block";
  const text = element("textarea", box);
  text.rows = 6;
  text.style.cssText = "width:100%;box-sizing:border-box;font:12px monospace";
  const errors = element("pre", box);
  errors.style.cssText = "margin:4px 0;color:#ffb3b3;white-space:pre-wrap";
  element("button", box, "Play pasted").addEventListener("click", () => {
    const pasted = parsePastedReaction(text.value);
    errors.textContent = pasted.ok ? "" : pasted.errors.join("\n");
    if (!pasted.ok) return;
    actor.spawn(pasted.traits);
    actor.play(pasted.script);
  });
}

/** Hidden Wizard-of-Oz panel: drop stickers and play scripts without a camera or model. */
export function createDevPanel(host: HTMLElement, actor: Actor): void {
  const box = element("div", host);
  box.style.cssText =
    "position:fixed;right:12px;top:12px;width:280px;padding:8px 12px;border-radius:8px;display:none;" +
    "background:rgba(0,0,0,.75);color:#fff;font:14px/1.6 system-ui,sans-serif";
  stickerForm(box, actor);
  presetButtons(box, actor);
  pasteBox(box, actor);
  window.addEventListener("keydown", (event) => {
    if (event.key !== TOGGLE_KEY || event.target instanceof HTMLTextAreaElement) return;
    box.style.display = box.style.display === "none" ? "block" : "none";
  });
}
