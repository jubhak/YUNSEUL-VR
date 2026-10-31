import { LOOK } from "../config.js";

/** Pitch is positive upwards. Always leave sky above the horizon, even when zoomed in. */
export function pitchBounds(fov = LOOK.fovDefault) {
  const halfFov = fov * Math.PI / 360;
  return {
    min: -Math.min(LOOK.pitchDown, Math.max(0, halfFov - LOOK.horizonMargin)),
    max: LOOK.pitchUp,
  };
}
export function clampPitch(pitch, fov) {
  const { min, max } = pitchBounds(fov);
  return Math.max(min, Math.min(max, pitch));
}
