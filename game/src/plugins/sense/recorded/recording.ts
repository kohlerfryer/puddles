/** Recorded input streams, so the senses can run without a camera, a microphone or a kid. */

import type { CameraSample, Point } from "../../../core/cameraSample";
import { isFrame, isPoseFixture, type PoseFrame } from "../../../core/poseFixture";
import { isPoint } from "../held_object";

export interface HandsSample {
  readonly t: number;
  readonly hands: readonly (readonly Point[])[];
}

export interface SmileSample {
  readonly t: number;
  readonly level: number;
  readonly delta: number;
}

export interface VoiceSample {
  readonly t: number;
  readonly active: boolean;
  readonly command?: string;
}

/** Each stream in time order, with `t` in ms from the start of the recording. */
export interface Recording {
  readonly pose: readonly PoseFrame[];
  readonly hands: readonly HandsSample[];
  readonly smile: readonly SmileSample[];
  readonly voice: readonly VoiceSample[];
}

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isBetween = (value: unknown, low: number, high: number): value is number =>
  isNumber(value) && value >= low && value <= high;

const isHands = (value: unknown): value is HandsSample =>
  isFields(value) &&
  isNumber(value.t) &&
  Array.isArray(value.hands) &&
  value.hands.every((hand) => Array.isArray(hand) && hand.every(isPoint));

const isSmile = (value: unknown): value is SmileSample =>
  isFields(value) &&
  isNumber(value.t) &&
  isBetween(value.level, 0, 1) &&
  isBetween(value.delta, -1, 1);

const isVoice = (value: unknown): value is VoiceSample =>
  isFields(value) &&
  isNumber(value.t) &&
  typeof value.active === "boolean" &&
  (value.command === undefined || (typeof value.command === "string" && value.command !== ""));

const STREAMS = { pose: isFrame, hands: isHands, smile: isSmile, voice: isVoice };

function stream<T extends { t: number }>(
  fields: Fields,
  name: keyof typeof STREAMS,
  check: (value: unknown) => value is T,
): T[] {
  const samples = fields[name] ?? [];
  if (!Array.isArray(samples) || !samples.every(check)) {
    throw new Error(`recording: ${name} has a sample that doesn't fit its stream`);
  }
  return [...samples].sort((a, b) => a.t - b.t);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("recording: not JSON", { cause: error });
  }
}

/** Reads a recording, or a gesture fixture as a recording of its pose landmarks; throws when neither. */
export function parseRecording(text: string): Recording {
  const data = parseJson(text);
  if (isPoseFixture(data)) return { pose: data.frames, hands: [], smile: [], voice: [] };
  if (!isFields(data)) throw new Error("recording: expected an object of streams");
  const unknown = Object.keys(data).filter((name) => !(name in STREAMS));
  if (unknown.length > 0) throw new Error(`recording: unknown streams ${unknown.join(", ")}`);
  return {
    pose: stream(data, "pose", STREAMS.pose),
    hands: stream(data, "hands", STREAMS.hands),
    smile: stream(data, "smile", STREAMS.smile),
    voice: stream(data, "voice", STREAMS.voice),
  };
}

/** The camera samples the camera senses read: each pose frame with the hands seen last by then. */
export function cameraSamples({ pose, hands }: Recording): CameraSample[] {
  return pose.map((frame) => ({
    t: frame.t,
    pose: frame,
    hands: hands.filter((sample) => sample.t <= frame.t).at(-1)?.hands ?? [],
  }));
}

/** When the last sample in any stream was recorded. */
export function recordingEnd({ pose, hands, smile, voice }: Recording): number {
  return Math.max(0, ...[pose, hands, smile, voice].flatMap((samples) => samples.map((s) => s.t)));
}
