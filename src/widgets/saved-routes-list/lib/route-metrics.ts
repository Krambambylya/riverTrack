import type { SavedRoute } from '@/entities/route';
import { lineString } from '@turf/helpers';
import length from '@turf/length';

export function sortRoutesByCreatedAt(routes: SavedRoute[], direction: 'asc' | 'desc'): SavedRoute[] {
  return [...routes].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    const cmp = ta - tb;
    return direction === 'desc' ? -cmp : cmp;
  });
}

export function routeLengthKm(route: SavedRoute): number {
  const pts = route.route;
  if (!pts || pts.length < 2) return 0;
  try {
    const coords = pts.map((p) => [p.longitude, p.latitude] as [number, number]);
    return length(lineString(coords), { units: 'kilometers' });
  } catch {
    return 0;
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
