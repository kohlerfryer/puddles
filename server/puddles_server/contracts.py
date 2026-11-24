"""Generated from shared/contracts.schema.json by just gen. Do not edit."""

from typing import Literal, NotRequired, TypedDict

type EventType = str


class KernelEvent(TypedDict):
    """One entry in the kernel's append-only event log. Plugins talk only through events."""

    t: float
    type: EventType
    source: str
    data: dict[str, object]


class Pose(TypedDict):
    """Where the kid is in the window, 0 to 1 from the left and the top."""

    x: float
    y: float


class Kid(TypedDict):
    present: bool
    pose: NotRequired[Pose]
    gesture: NotRequired[str]
    attention: float
    distance: float


class HeldObject(TypedDict):
    id: str
    confidence: float


class Smile(TypedDict):
    level: float
    delta: float


class Speech(TypedDict):
    active: bool
    command: NotRequired[str]


class Entity(TypedDict):
    """Something in the world near Puddles, and what he can do with it."""

    id: str
    affords: list[str]


class WorldView(TypedDict):
    near: list[Entity]


type Mood = Literal["happy", "curious", "scared", "silly", "proud", "grossed_out"]


class SelfState(TypedDict):
    mood: Mood
    needs: dict[str, float]
    doing: str


class Observation(TypedDict):
    """The snapshot brains read: what Puddles senses this tick. Summaries only, never raw media."""

    kid: Kid
    held_object: NotRequired[HeldObject]
    smile: Smile
    laugh: NotRequired[bool]
    speech: NotRequired[Speech]
    world: WorldView
    self: SelfState


type IntentKind = Literal["routine", "behavior", "goal"]


class Step(TypedDict):
    """One skill call. A reaction step maps onto it: do is the skill, target is args.target."""

    skill: str
    args: dict[str, str | float | bool]
    say: NotRequired[str]
    mood: NotRequired[Mood]
    think: NotRequired[str]


class BehaviorCall(TypedDict):
    id: str
    params: dict[str, str | float | bool]


class Intent(TypedDict):
    """What a brain wants Puddles to do. The guardian checks it before the executor plays it."""

    brain: str
    priority: int
    kind: IntentKind
    steps: NotRequired[list[Step]]
    behavior: NotRequired[BehaviorCall]
    why: str
    features: NotRequired[list[str]]


class Outcome(TypedDict):
    """How a step or behavior ended. Skills emit it in outcome.* events."""

    step: int
    status: Literal["done", "failed", "interrupted"]
    reason: NotRequired[str]
    effects: NotRequired[dict[str, object]]


class Reward(TypedDict):
    """How the kid took a bit, attributed to the bit that caused it."""

    bit_id: str
    smile_delta: float
    laugh: bool
    talk: bool
    attention: float
    window_ms: int


class ManifestCommon(TypedDict):
    """A plugin's manifest.json: the common fields plus the fields of its kind."""

    id: str
    contract: str
    name: str
    authors: list[str]
    license: str
    tags: NotRequired[list[str]]


class SenseManifest(ManifestCommon):
    kind: Literal["sense"]
    inputs: list[str]
    emits: list[EventType]
    budget_ms: float


class OnEvent(TypedDict):
    on: EventType


class EverySeconds(TypedDict):
    every_s: float


type Cadence = Literal["tick"] | OnEvent | EverySeconds


class BrainManifest(ManifestCommon):
    kind: Literal["brain"]
    cadence: Cadence
    autonomy: int
    latency_budget_ms: float
    intents: list[IntentKind]


class SkillManifest(ManifestCommon):
    kind: Literal["skill"]
    params: dict[str, str]
    needs: list[str]
    duration_s: float
    energy: float
    outcomes: list[str]


class ContentManifest(ManifestCommon):
    kind: Literal["content"]
    type: Literal[
        "prop", "place", "scene", "character", "personality", "bit_pack", "art_pack", "sound_pack"
    ]


type Manifest = SenseManifest | BrainManifest | SkillManifest | ContentManifest


class Contracts(TypedDict):
    """One of each kernel contract: the root for type generators and a table of test examples."""

    event: KernelEvent
    observation: Observation
    intent: Intent
    step: Step
    outcome: Outcome
    reward: Reward
    manifest: Manifest
