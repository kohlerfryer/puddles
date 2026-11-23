import { type Note, type Sound, SOUND_NOTES } from "../core/sounds";

/** The key that mutes and unmutes all sound. */
const MUTE_KEY = "m";
const ATTACK_SECONDS = 0.01;
const SILENT = 0.001;
/** Quacks are a buzz through this band, which makes them sound nasal. */
const QUACK_BAND = { frequency: 1100, Q: 2 };

function slide(param: AudioParam, note: Note, start: number): void {
  param.setValueAtTime(note.from, start);
  param.exponentialRampToValueAtTime(note.to, start + note.seconds);
}

function noise(context: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * seconds),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

/** The note's source, already wired through its filter into `out`. */
function source(context: AudioContext, note: Note, start: number, out: AudioNode) {
  const filter = context.createBiquadFilter();
  filter.connect(out);
  if (note.voice === "noise") {
    filter.type = "lowpass";
    slide(filter.frequency, note, start);
    const burst = noise(context, note.seconds);
    burst.connect(filter);
    return burst;
  }
  const oscillator = context.createOscillator();
  oscillator.type = note.voice === "quack" ? "sawtooth" : "sine";
  slide(oscillator.frequency, note, start);
  filter.type = note.voice === "quack" ? "bandpass" : "allpass";
  filter.frequency.value = QUACK_BAND.frequency;
  filter.Q.value = QUACK_BAND.Q;
  oscillator.connect(filter);
  return oscillator;
}

function playNote(context: AudioContext, note: Note): void {
  const start = context.currentTime + note.at;
  const end = start + note.seconds;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(note.volume, start + ATTACK_SECONDS);
  gain.gain.exponentialRampToValueAtTime(SILENT, end);
  gain.connect(context.destination);
  const sound = source(context, note, start, gain);
  sound.start(start);
  sound.stop(end);
}

/**
 * Synthesizes Puddles' sounds with Web Audio. Audio starts on the first key press or click, as
 * browsers require; `m` mutes and unmutes, and `show` gets the sound state for the readout.
 */
export function createVoice(show: (text: string) => void): (sound: Sound | undefined) => void {
  let context: AudioContext | undefined;
  let muted = false;
  const report = (): void => {
    if (!context) show("starts on a tap or key press");
    else show(muted ? "off (m to unmute)" : "on (m to mute)");
  };
  const start = (): void => {
    context ??= new AudioContext();
    void context.resume();
    report();
  };
  window.addEventListener("pointerdown", start);
  window.addEventListener("keydown", (event) => {
    start();
    if (event.key !== MUTE_KEY || event.target instanceof HTMLTextAreaElement) return;
    muted = !muted;
    report();
  });
  report();
  return (sound) => {
    if (!context || muted || !sound) return;
    for (const note of SOUND_NOTES[sound]) playNote(context, note);
  };
}
