# Puddles: kernel and plugin architecture (M3 spec)

Status: draft for M3. Owner: @kohlerfryer. Product context: the [PRD](https://claude.ai/artifact/PQUr3xFBaaxoWcRiiREpic) ("the magic window"). Decision record: `docs/adr/2026-11-23-one-kernel-four-plugin-kinds.md`.

Puddles becomes a small, closed **kernel** plus four kinds of **plugins** that talk only through **events**. Everything kids, artists, joke writers, game devs and ML folks want to change is a plugin or a data pack. Everything that must stay safe, private and correct is in the kernel. M3 builds the kernel, moves today's game into plugins, and adds the first learning loop: a bandit that learns which bits make *this* kid smile.

---

## 1. Principles

1. **Small closed kernel, open everything else.** The kernel is clock, event log, registry, guardian, save and replay. It changes rarely and is reviewed carefully.
2. **Plugins only talk through events.** No plugin imports another plugin. Contracts live in `shared/`.
3. **Data over code.** Places, props, scenes, personalities, bits and art are data packs. A new tree needs no code.
4. **Every output passes the guardian.** Brains can be swapped freely because safety is checked in one place.
5. **Deterministic and replayable.** Fixed tick, seeded randomness, append-only event log. Any session can be replayed, tested and explained.
6. **Local and private.** Camera, microphone and photos never leave the machine. Brains see summaries, never raw media.
7. **Delight, not engagement.** We reward smiles per bit, never session length. Puddles gets sleepy and suggests breaks.
8. **The magic window.** The kid stays in their room; Puddles lives behind the glass. No avatar. Interactions reach *through* the window.
9. **Graceful degradation.** Planner → small model → templates → reflexes. Puddles never freezes.

## 2. Architecture

```
                 ┌───────────────── KERNEL (small, closed) ─────────────────┐
                 │ clock · event log · registry · guardian · save · replay  │
                 └──────────────────────────────────────────────────────────┘
 SENSE plugins ──events──►  BRAIN plugins ──intents──►  guardian ──►  SKILL plugins ──events──► (log)
 pose, hands, smiles,       reflexes, object matcher,                  walk, peck, wear,
 voice, held object         bandit, planner                            juggle, hide_in …
                    CONTENT plugins (data): places · props · scenes · characters ·
                    personalities · bit packs · art packs · sound packs · seasons
```

One loop per tick (30 Hz simulation; rendering runs at display rate and only reads state):

1. Senses emit observation events.
2. The kernel folds events into the **observation snapshot** and the **world state**.
3. Brains that are due (each declares its cadence) read the snapshot and emit **intents**.
4. The guardian checks intents and either passes, rewrites (safe fallback) or rejects them.
5. The executor runs the current intent's steps through skills; skills emit **outcome** events.
6. Reward events (smiles, laughs, talking, attention) are attributed to the bit that caused them.

## 3. Kernel

| Part | Responsibility |
| --- | --- |
| **Clock** | Fixed 30 Hz tick, monotonic `t` in ms, pausable; the only time source plugins see. |
| **Event log** | Append-only, typed events (`shared/events.schema.json`), JSON lines. Ring buffer in memory; optional write to the local save for replay. |
| **Registry** | Discovers plugins from manifests, checks `contract` versions, wires subscriptions, enforces cadences and budgets. |
| **Guardian** | Checks every intent and every outward signal (see §10). |
| **Executor** | Plays intents step by step through skills; handles interruption and preemption by priority. |
| **Save** | One local, inspectable save (§11) with a "forget everything" reset. |
| **Replay** | Re-runs a recorded event log against any brain or skill version and diffs decisions. |

The kernel ships with a **headless mode** (no camera, no rendering) used by CI, the simulator and brain evals.

## 4. Contracts (all in `shared/`, JSON Schema 2020-12, TypeScript and Python types generated)

| Contract | Shape (abridged) |
| --- | --- |
| **Event** | `{ t, type, source, data }`. Types: `observation.*`, `intent.*`, `action.*`, `outcome.*`, `reward.*`, `world.*`, `memory.*`, `guardian.*`. |
| **Observation** | `{ kid: { present, pose?, gesture?, attention, distance }, held_object?: { id, confidence }, smile: { level, delta }, laugh?, speech?: { active, command? }, world: { entities near Puddles }, self: { mood, needs, doing } }` |
| **Intent** | `{ brain, priority, kind: "routine" \| "behavior" \| "goal", steps?: Step[], behavior?: { id, params }, why, features?: string[] }` |
| **Step** | `{ skill, args, say?, mood?, think?: icon }` (today's reaction steps are a subset) |
| **Outcome** | `{ step, status: "done" \| "failed" \| "interrupted", reason?, effects? }` |
| **Reward** | `{ bit_id, smile_delta, laugh, talk, attention, window_ms }` |
| **Manifest** | see §5 |

Today's `reaction.schema.json` becomes the **reaction intent** used by object brains; it stays backward compatible.

## 5. Plugins

Every plugin is a folder:

```
plugins/<kind>/<id>/
  manifest.json      # required
  index.ts           # sense, brain (in-game) and skill plugins
  <id>.test.ts       # plugin's own tests
  assets/            # art, sounds (content)
```

Python brains live in `server/brains/<id>/` with the same manifest and talk to the game through the brain API (§8).

Common manifest fields:

```json
{ "kind": "skill", "id": "juggle", "contract": "1", "name": "Juggle",
  "authors": ["…"], "license": "MIT", "tags": ["show_off", "silly"] }
```

### 5.1 Sense plugins
Read raw input (camera frames, microphone audio, hand landmarks), emit `observation.*` events. Declare `inputs`, `emits`, and a per-tick time budget. Raw media never leaves the sense.

### 5.2 Brain plugins
`decide(snapshot, memory, world) → Intent | null`. Declare `cadence` (every tick, on event, every N seconds), `autonomy` level (§9), `latency_budget_ms`, and which intents they may emit.

### 5.3 Skill plugins
Atomic actions. Manifest declares `params`, `needs` (affordances or conditions), `duration_s`, `energy`, `tags` (the bandit's comedy features), `outcomes`. Code exports `plan(args, self, world) → Move[]` (pure, tested, like today's verb plans). Rendering plays moves.

```json
{ "kind": "skill", "id": "wear", "params": { "target": "prop" },
  "needs": ["target.affords:wear", "target.size<=small"], "duration_s": 1.5,
  "energy": -0.02, "tags": ["silly", "uses_object"], "outcomes": ["done", "dropped"] }
```

### 5.4 Content plugins (data only)

| Type | What it holds |
| --- | --- |
| **prop** | art, physics traits, affordances, slots (`hang`, `top`, `under`, `inside`), sounds, default opinion |
| **place** | an area of the world with props and affordances (`enter`, `hide_in`, `sleep_in`) |
| **scene** | an LDtk level placing places and props; theme and season tags |
| **character** | body art (rig parts), skill set, personality reference: Puddles, or a frog, or a puppy |
| **personality** | trait weights, need dynamics, starting opinions and bits |
| **bit pack** | routines (§6.2) with features and lines |
| **art / sound pack** | reskins against the style guide (§13), quack language patterns |

## 6. Body

### 6.1 Core skills (M3 ports today's verbs; the catalogue grows as starter issues)
- **Moving:** `walk_to`, `run_to`, `run_away`, `hide_behind`, `circle`, `jump`, `jump_over`, `approach_glass`, `enter`, `exit`
- **With objects:** `sniff`, `peck`, `eat`, `push`, `wear`, `sit_on`, `pick_up`, `carry`, `drop`, `toss`, `place_in_slot`
- **Expressive:** `look_at`, `dance`, `flap`, `freeze`, `fall_over`, `tap_glass`, `shake_head`, `quack`, `think` (thought bubble), `nap`
- **With the kid:** `copy_gesture`, `ask_for` (vetted request list), `celebrate`

### 6.2 Routines and behaviors
- **Routine:** JSON sequence of steps with limited control flow (`repeat n`, `until outcome`, `if outcome`), max 8 steps and 20 s. Contributors and planner brains can write them; the kernel validates them against installed skills.
- **Behavior:** tested code that runs a small state machine using skills (today's copy-me loop is the first). Ends with a single outcome so the bandit can reward it as one choice (an "option").

## 7. World

- **Entities** with components (`Position`, `Art`, `Physics`, `Affordances`, `Slots`, `Owner`, `Opinion`), held in a small ECS (`miniplex`). Brains query by affordance ("everything I can hide in, near me").
- **Scenes** are LDtk files; entity fields in LDtk carry affordances and slots. Hot-reloaded in dev.
- **Seasons and themes** are scene or art packs selected by date or setting (December brings the tree).

### 7.1 Objects come through the window as in-world props
1. **Library match.** The object brain's answer is constrained to the installed prop ids plus `other`. Matched → spawn that prop (its art, physics and affordances).
2. **Archetype + color.** `other` → choose an archetype (ball, box, plush animal, stick, fruit, cup, flat thing), take the dominant color from the crop, size from traits, spawn a stylized generic prop.
3. **Photo sticker** fallback and setting (today's behavior).
The crop is used once to identify and color the prop, then discarded. Library-match accuracy is a headline eval.

## 8. Mind

| Brain (first versions) | Cadence | Job |
| --- | --- | --- |
| **reflexes** | every tick | copy gestures, eye-follow, flinch, approach the glass |
| **object matcher** | on held object | library id / archetype + traits (SmolVLM, constrained; templates as fallback) |
| **bandit** | when idle or after a bit ends | choose the next behavior or bit (§12) |
| **planner** (M4) | every 10–30 s | goals and new routines from a local 3–8B model |

Python brains are served by the existing server at `POST /brain/<id>` with `{snapshot}` → `{intent}`; `/react` stays as the object matcher's endpoint. Fallback chain per decision: planner → bandit → templates → reflexes.

## 9. Autonomy levels (config, earned by evals)

| Level | Unlocked |
| --- | --- |
| 0 | templates only |
| 1 | pick one skill/behavior per event |
| 2 | write routines; answer voice commands; plan around world objects |
| 3 | set goals, invent games, save learned tricks, long-term plans |

## 10. Guardian (kernel)

Checks every intent and outward signal. Rejections are logged with a reason and replaced by a safe fallback.

- **Kid safety:** requests to the kid only from the vetted list (`shared/requests.json`: gestures, colors, shapes, food, soft things…). Never ask for personal information, never direct physical risk ("climb", "go outside", "touch the stove").
- **Content:** lines ≤ 12 words, kind; blocklist; scary intensity capped per personality and setting.
- **Privacy:** no raw media in intents, memory or logs; no network access for brains except the local server.
- **Integrity:** brains can't change rewards, personality, guardian rules or memory wholesale.
- **Budgets:** routine length and duration, model calls per minute, intents per second.
- **Wellbeing:** session soft limit (setting); Puddles yawns and suggests a break.

## 11. Saves and parent controls

`~/Puddles/save/` (inspectable JSON): memory (episodes summary, facts, opinions, learned tricks), bandit statistics, house collection, settings. Controls: mic on/off, camera on/off, autonomy level, session limit, theme, **forget everything**. Transcripts and photos are never saved.

## 12. Learning: feature-based bandit over behaviors

- **Arms** are behaviors and routines (options), each described by **comedy features**: `slapstick`, `surprise`, `callback`, `uses_object`, `copies_kid`, `gross`, `scary_light`, `musical`, `sleepy`.
- **Context:** object archetype, kid engagement, session time, Puddles' mood and needs, and **recency counts per feature** (repetition goes stale).
- **Reward:** `smile_delta` (smile in 0–4 s after the punchline minus the pre-bit baseline, per kid) + laugh bonus + talk + attention, minus walk-away. Best reaction in the room when several faces are seen. No face visible = no data.
- **Algorithm:** Thompson sampling over a linear model of features (start: Beta per object-archetype × arm; then linear). Discounted / sliding window for drift.
- **Arm proposals:** later, the planner proposes new routines with a prior; the bandit decides.
- **Logging:** every choice logs its propensity for offline (IPS) evaluation and becomes preference data for fine-tuning (M6).
- **Personality** sets the priors.

## 13. Senses for engagement (M3: smiles; later: laughs, voice)

- **smile**: MediaPipe Face Landmarker blendshapes (`mouthSmileLeft/Right`, `cheekSquintLeft/Right`); face crop from the pose to get enough pixels at 2 m. Emits per-face level and delta.
- **laugh** (M4): audio classifier, local.
- **speech** (M4): voice activity; wake word "Puddles"; local speech-to-text; quick commands handled by reflexes, open-ended by the planner.
- **attention**: facing the screen, distance.

## 14. Tooling

- **Simulator:** headless kernel + **simulated kids** (preference profiles: "loves slapstick, bored after 3 repeats", "scared of loud") emitting gestures, smiles and walk-aways. Produces regret curves for bandit strategies.
- **Contract test harness:** every plugin gets automatic tests from its manifest: schema validity, budgets, determinism under replay, guardian pass rate.
- **CLI:** `pnpm puddles new <kind> <id>`, `pnpm puddles try <id>`, `pnpm puddles replay <log>`.
- **Replay viewer** (dev overlay): timeline of observation → intent (with `why`) → guardian verdict → outcome → reward.

### 14.1 Developing and testing without a camera

Nobody needs a webcam, a microphone or a kid to build or test Puddles.

- **Recorded input streams.** Senses can read from recordings instead of devices: pose landmarks (the existing gesture fixtures), held-object events, smile and laugh levels, voice-activity and command events. `pnpm -C game dev --input <recording>` runs the real browser game on a recording; the dev panel can switch streams live.
- **Simulation gate in CI.** Every PR runs a few hundred simulated-kid sessions in the headless kernel and fails on crashes or hangs, any unsafe output the guardian should have stopped, regret worse than `main` beyond a tolerance, or latency/budget overruns. Results (regret curves, smiles per bit) are posted to the PR.
- **Scenario tests.** Each showcase scenario (§16) is an automated end-to-end test on the headless kernel with scripted inputs and expected outcomes.
- **Recorded model replies.** Model brains are tested in PRs against recorded replies (cassettes), so CI is fast and deterministic. A nightly job runs the real models on CPU against `ml/bench/photos` and reports drift.
- **Visual checks.** CI runs the browser game on recorded streams with Playwright and attaches screenshots or a short GIF of key moments to each PR that touches `game/`.
- **Real-world calibration stays occasional and human:** the smile spike (K10), playtests, and recording new input streams to add to the library.

## 15. Art direction

Reference: `docs/art/puddles-concept.svg`. Duckling proportions (head ≈ body), big low-set sparkly eyes (three highlights), tiny bill, blush, scalloped fluffy outline, warm brown outline `#7a5230`, pastel yellows `#fffbe0 → #ffdb5c`, orange bill and feet `#ffb46b → #ff8a3d`. Characters are layered vector parts animated by code (squash and stretch, blink, head tilt, wing flap, bill open); poses come from `core/`. A style guide (`docs/art/style-guide.md`) covers palette, outline width, proportions and prop design. Rive may replace the renderer later behind the same poses.

## 16. Showcase scenarios (the design is checked against these)

| Scenario | Plugins involved |
| --- | --- |
| **Bring me something red** | `ask_for` skill (vetted request), thought bubble icon, object matcher, `match` verdict, yes/no quacks, prop spawn |
| **The Christmas tree** | `christmas-tree` prop (slots `hang`, `top`, `under`), seasonal scene, `place_in_slot`, `toss` (into the pond, for things he dislikes), opinions in memory, bandit notices laughs at tossing |
| **Puddles' house collection** | `house` place (`enter`, `sleep_in`, shelf slots), memory of gifts, behavior "show off my collection" |
| **Copy me, then exaggerate** | copy-me behavior with an exaggerate option; bandit learns per kid whether exaggeration is funny |
| **Bored Puddles** | needs model; boredom rises with repetition and low smiles; he wanders home or suggests a game |

## 17. Customization map (who has fun where)

| Who | What | How |
| --- | --- | --- |
| Kids and parents | names, house decor, drawings as props | in game |
| Artists | art packs, props, places | drawing; style guide |
| Sound folks | quack language, sound packs | synth settings or audio |
| World builders | scenes, seasons, themes | LDtk + JSON |
| Character designers | personalities, new creatures | JSON + art |
| Joke writers | bit packs (routines) | JSON |
| Game devs | skills, behaviors, games | TypeScript + tests |
| Input tinkerers | senses, accessibility inputs | TypeScript / ML |
| ML folks | brains, bandit strategies | Python or TS; leaderboard on replays and simulated kids |
| Translators | lines, prompts, commands | text |

Kernel, guardian, contracts and the event/replay format stay core.

## 18. Milestones

### M3: Kernel and learning (this spec)
Exit: the game runs on the kernel with today's features as plugins; replay works; the bandit improves smiles in the simulator (regret curve) and runs live with the smile sense; and every PR is checked by simulation, scenario tests and screenshots without a camera.

| # | Ticket | Who | Blocked by |
| --- | --- | --- | --- |
| K1 | Contracts in `shared/`: events, observation, intent, step, outcome, reward, manifest (+ generated TS/Python types) | owner | – |
| K2 | Kernel core: clock, event log, registry, executor (headless, tested) | agent | K1 |
| K3 | Guardian v1: budgets, content checks, vetted request list, fallback | agent | K1 |
| K4 | Replay: record and re-run an event log; diff decisions | agent | K2 |
| K5 | Plugin harness: manifest validation + automatic contract tests; `puddles new` | agent | K2 |
| K6 | Port verbs to skill plugins (manifests with tags and needs) | agent | K5 |
| K7 | Port senses to sense plugins (pose, gestures, hands/held object) | agent | K5 |
| K8 | Port brains: reflexes, copy-me behavior, object matcher (server `/react`) | agent | K5 |
| K9 | World ECS (miniplex) and pond as a content plugin; render reads world state | agent | K6 |
| K10 | Smile sense spike: face crop + blendshapes at play distance (needs the owner for a test) | owner + agent | K7 |
| K11 | Simulator + simulated kids + regret plot script | agent | K4 |
| K12 | Bandit brain: Thompson over features, attribution window, logging propensities | agent | K11 |
| K13 | Bandit live: smile reward wired in; dev overlay timeline | agent | K10, K12 |
| K14 | Prop library v1 (~30 props) + constrained matcher + archetype/color fallback | agent | K8, K9 |
| K15 | Puppet art: Puddles as layered parts from the concept; style guide | agent | K9 |
| K16 | Saves + parent controls panel (forget everything) | agent | K2 |
| K17 | CI simulation gate: simulated-kid sessions per PR with regret, safety and budget thresholds | agent | K11, K3 |
| K18 | Recorded input streams for senses (`--input`), plus Playwright screenshots in PRs | agent | K7 |
| K19 | Showcase scenarios as end-to-end tests; recorded model replies; nightly real-model bench | agent | K17, K8 |

### M4: Mind
Local planner brain (spike: Qwen2.5-VL 3B/7B, SmolVLM2 2.2B on the Mac), voice commands and wake word, needs/boredom/personality, laugh sense, planner-proposed routines.

### M5: World
Puddles' house and collection, LDtk scenes and seasons (Christmas tree), more skills and critters, opinions about items, `puddles try` for content.

### M6: Distill and evaluate
Fine-tune SmolVLM on logged preferences and planner output; eval table (library match, smiles per bit on replays, safety, latency) against base, templates, planner and (optional) frontier.

## 19. Migration (keep the game playable after every PR)

Strangler pattern: the kernel runs next to today's `main.ts` loop; each port ticket moves one piece behind the kernel and deletes the old wiring in the same PR. `core/` verb plans, runner, validator, gestures and copy-me move nearly unchanged into plugins. The core/render ADR still holds: plugins' logic is pure and tested; rendering only reads state.

## 20. Open questions

- Face size at 2 m for reliable smiles (K10 decides whether a higher-resolution face crop is needed).
- Which local planner model fits latency and quality (M4 spike).
- Simulated-kid realism: how to calibrate profiles against real playtests.
- Pack sharing format and a gallery (after M5).
