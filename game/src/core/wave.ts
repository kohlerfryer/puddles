/** How high the wing is held while waving, in radians from resting against the body. */
const RAISED = 1.6;
/** How far the wing swings either side of raised. */
const SWING = 0.4;
/** Back-and-forth swings over one step. */
const WAGGLES = 3;
/** Share of the step spent raising the wing at the start and lowering it at the end. */
const LIFTING = 0.15;

/** Wing angle `progress` (0 to 1) through a wave: raised, waggling, and resting at both ends. */
export function waveWing(progress: number): number {
  const raise = Math.min(1, progress / LIFTING, (1 - progress) / LIFTING);
  if (raise <= 0) return 0;
  return raise * (RAISED + SWING * Math.sin(2 * Math.PI * WAGGLES * progress));
}
