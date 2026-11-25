const AMBIENT_INTENSITY_KEY = 'indian_bike_rider_3d_ambient_intensity';

export const DEFAULT_AMBIENT_INTENSITY = 1.0;
export const MIN_AMBIENT_INTENSITY = 0.25;
export const MAX_AMBIENT_INTENSITY = 2.0;

export function clampAmbientIntensity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AMBIENT_INTENSITY;
  return Math.min(MAX_AMBIENT_INTENSITY, Math.max(MIN_AMBIENT_INTENSITY, Math.round(value * 100) / 100));
}

export function loadStoredAmbientIntensity(): number {
  try {
    const raw = localStorage.getItem(AMBIENT_INTENSITY_KEY);
    if (raw !== null) {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) {
        return clampAmbientIntensity(parsed);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_AMBIENT_INTENSITY;
}

export function saveStoredAmbientIntensity(value: number): void {
  try {
    localStorage.setItem(AMBIENT_INTENSITY_KEY, String(clampAmbientIntensity(value)));
  } catch {
    // Ignore storage errors
  }
}
