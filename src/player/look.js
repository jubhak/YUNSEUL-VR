import { LOOK } from "../config.js";

/**
 * Pitch is positive upwards.
 * The camera may look almost straight up at the sky and almost straight down at
 * the ground (±85°). Only a small guard band is kept so the horizon never flips.
 */
export function pitchBounds() {
  return { min: -LOOK.pitchDown, max: LOOK.pitchUp };
}
export function clampPitch(pitch) {
  const { min, max } = pitchBounds();
  return Math.max(min, Math.min(max, pitch));
}
