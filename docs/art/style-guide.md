# Puddles style guide

How Puddles and the things in his world look. The reference is `docs/art/puddles-concept.svg` (rendered: `puddles-concept.png`); the spec is `docs/spec/m3-kernel.md` §15. Art packs, props and new characters should match this page.

## Palette

| Use | Colour |
| --- | --- |
| Outline (everything) | `#7a5230` warm brown |
| Head fluff, radial, lit from the upper left | `#fffbe0` → `#ffeb94` (60%) → `#ffdb5c` |
| Body and wing fluff | `#fff6c4` → `#ffe372` (70%) → `#ffd24d` |
| Bill and feet, top to bottom | `#ffb46b` → `#ff8a3d` |
| Eyes: dark, iris | `#2b1d12`, `#4a2f1c` |
| Eye sparkles | `#ffffff` (the smallest at 80% opacity) |
| Blush | `#ff8fa3` at 55% opacity |
| Tongue | `#ff6b81`; `#7fae3c` when grossed out |

Use pastels and warm tones. No pure black: the darkest colour is the eye brown `#2b1d12`. The game's code keeps this palette in `game/src/render/puppet/paths.ts`.

## Outline

- Fluff (head, body) and tufts: **5** units wide. Smaller parts (bill, feet, wing, eye whites): **4.5**.
- Round joins and caps everywhere; no sharp corners.
- Units are concept-art units; the game draws Puddles at half size, so a 5-unit outline is 2.5 px at full window scale.

## Proportions

- Duckling proportions: the head is as big as the body (head 76 × 70 radius, body 66 × 58).
- Head centre 138 units above the feet; body centre 68 above the feet. A small tuft of two flicks sits on top of the head.
- Big, low-set eyes, together about two thirds of the head's width, each with **three sparkles**: big upper right, small lower left, faint lower right.
- Tiny bill just under the eyes, between the blush spots.
- Fluff is scalloped: a ring of outlined puffs (head 26 puffs of radius 13, body 22 of radius 12, wing 8 of radius 7) under a plain fill, so only the outer edge of each puff shows.

## Puppet parts

Puddles is a set of layered vector parts, drawn back to front: body, wing, feet, head (tuft, fluff, blush, eyes, bill). Code in `game/src/render/puppet/` draws the parts; code in `game/src/core/puppet.ts` decides the pose each frame. Rendering never decides how Puddles moves.

| Motion | Part | Comes from |
| --- | --- | --- |
| Squash and stretch | whole body, about the feet, keeping its area | breathing, hops (stretch with height), mood (crouch when scared, puff up when proud), falling over (flat) |
| Blink | eyes | every few seconds for open, wide, crossed and proud eyes; shut for a nap |
| Head tilt | head, about its centre | looks (peck, sniff, preen, look at camera), curious mood, head shakes |
| Wing flap | wing, about the shoulder | waves from verbs, beating in the flap pose |
| Bill open | bill, blending the concept's shut and open bill | mood (half open when happy, wide when scared, silly or grossed out), pecking |
| Lean | whole body | waddling while walking or running |

Eyes per mood: happy `^ ^` smiles; curious the open sparkly eyes (also when idling contentedly); scared wide whites with small pupils; silly crossed; proud half-lidded; grossed out squeezed `> <`.

A renderer such as Rive may replace these parts later; it should take the same pose from core.

## Props

- Same outline colour and widths, same light from the upper left, same soft radial fills.
- Simple rounded silhouettes that read at 60 px; at most three fill colours plus the outline.
- Faces on props only when the prop is a character.
- Sized against Puddles: a ball fits under his wing, a box fits him inside.
