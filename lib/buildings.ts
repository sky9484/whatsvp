import { distanceMetres } from './utils';
import type { RawEvent } from './types';
import type { BuildingKey } from '@/components/IsoBuilding';

/** Known landmark buildings with hand-authored isometric designs. */
export const LANDMARKS: Array<{ key: BuildingKey; name: string; lat: number; lng: number }> = [
  { key: 'klcc', name: 'Petronas Twin Towers', lat: 3.1579, lng: 101.7115 },
  { key: 'millerz', name: 'Millerz Square', lat: 3.1015, lng: 101.6766 },
  { key: 'mdec', name: 'MDEC Cyberjaya', lat: 2.9220, lng: 101.655 },
];

const LANDMARK_RADIUS_M = 180;

/**
 * Resolve which landmark design (if any) applies to an event: an explicit
 * `building_key` wins; otherwise match by proximity to a known landmark.
 */
export function resolveLandmark(
  event: Pick<RawEvent, 'lat' | 'lng' | 'building_key'>
): BuildingKey | null {
  const explicit = event.building_key as BuildingKey | undefined;
  if (explicit && LANDMARKS.some((l) => l.key === explicit)) return explicit;

  for (const l of LANDMARKS) {
    if (distanceMetres(event.lat, event.lng, l.lat, l.lng) <= LANDMARK_RADIUS_M) {
      return l.key;
    }
  }
  return null;
}
