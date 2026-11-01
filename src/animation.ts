export const STATES = [
  "idle",
  "walk",
  "happy",
  "thinking",
  "talking",
  "sleep",
  "sad",
] as const;
export type PetState = (typeof STATES)[number];
export interface AnimationState {
  state: PetState;
  since: number;
}
/** Explicit UI/native events only; transitions reset the frame clock. */
export function transition(
  current: AnimationState,
  next: PetState,
  now: number,
): AnimationState {
  return current.state === next ? current : { state: next, since: now };
}
export function frameAt(
  states: Partial<Record<PetState, number[]>> & { idle: number[] },
  state: PetState,
  elapsed: number,
  fps: number,
): number {
  const frames = states[state] ?? states.idle;
  return frames[
    Math.floor((Math.max(0, elapsed) * fps) / 1000) % frames.length
  ];
}
/** Positive scale and translation only: alpha hit bounds use exactly this transform. */
export function motion(state: PetState, elapsed: number) {
  const t = elapsed / 1000,
    wave = (hz: number) => Math.sin(t * Math.PI * 2 * hz);
  switch (state) {
    case "idle":
      return { x: 0, y: -2 - 2 * wave(0.4), sx: 1, sy: 1 + 0.02 * wave(0.4) };
    case "walk":
      return { x: 8 * wave(0.6), y: -Math.abs(5 * wave(2)), sx: 1, sy: 1 };
    case "happy":
      return {
        x: 0,
        y: -Math.abs(12 * wave(1.5)),
        sx: 1 + 0.04 * wave(1.5),
        sy: 1,
      };
    case "thinking":
      return { x: 3 * wave(0.7), y: -5, sx: 1, sy: 0.97 };
    case "talking":
      return { x: 0, y: -2, sx: 1 + 0.03 * wave(4), sy: 1 + 0.05 * wave(4) };
    case "sleep":
      return { x: 0, y: 6, sx: 1.05, sy: 0.85 + 0.02 * wave(0.25) };
    case "sad":
      return { x: 0, y: 8, sx: 0.93, sy: 0.9 };
  }
}
