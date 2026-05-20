import type { LatLon, RoutePoint } from '@/entities/route';

export type MapMarkerRole = 'start' | 'finish' | 'user';

export function geoJsonLineStringFromRoutePoints(points: RoutePoint[]) {
  return {
    type: 'Feature' as const,
    properties: {} as Record<string, never>,
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map((p) => [p.longitude, p.latitude]),
    },
  };
}

export function geoJsonFeatureCollectionForMarkers(
  markers: Array<{ role: MapMarkerRole; longitude: number; latitude: number }>
) {
  return {
    type: 'FeatureCollection' as const,
    features: markers.map((m) => ({
      type: 'Feature' as const,
      properties: { role: m.role },
      geometry: {
        type: 'Point' as const,
        coordinates: [m.longitude, m.latitude],
      },
    })),
  };
}

export function geoJsonStartFinishMarkers(start: LatLon, finish: LatLon) {
  return geoJsonFeatureCollectionForMarkers([
    { role: 'start', longitude: start.lon, latitude: start.lat },
    { role: 'finish', longitude: finish.lon, latitude: finish.lat },
  ]);
}
