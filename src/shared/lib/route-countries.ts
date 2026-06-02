import type { LatLon, RoutePoint } from '@/entities/route';
import * as Location from 'expo-location';

const MAX_REVERSE_GEOCODE_POINTS = 5;

const pushUniquePoint = (
  acc: Array<{ latitude: number; longitude: number }>,
  point: { latitude: number; longitude: number }
) => {
  const key = `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
  const exists = acc.some((entry) => `${entry.latitude.toFixed(4)},${entry.longitude.toFixed(4)}` === key);
  if (!exists) acc.push(point);
};

const samplePointsForCountryDetection = (
  start: LatLon,
  finish: LatLon,
  route: RoutePoint[]
): Array<{ latitude: number; longitude: number }> => {
  const points: Array<{ latitude: number; longitude: number }> = [];
  pushUniquePoint(points, { latitude: start.lat, longitude: start.lon });

  if (route.length > 2) {
    const indexes = [Math.floor(route.length * 0.25), Math.floor(route.length * 0.5), Math.floor(route.length * 0.75)];
    indexes.forEach((idx) => {
      const point = route[idx];
      if (!point) return;
      pushUniquePoint(points, { latitude: point.latitude, longitude: point.longitude });
    });
  }

  pushUniquePoint(points, { latitude: finish.lat, longitude: finish.lon });
  return points.slice(0, MAX_REVERSE_GEOCODE_POINTS);
};

export async function resolveRouteCountries(input: {
  start: LatLon;
  finish: LatLon;
  route: RoutePoint[];
}): Promise<string[]> {
  const countries = new Set<string>();
  const sampledPoints = samplePointsForCountryDetection(input.start, input.finish, input.route);

  for (const point of sampledPoints) {
    try {
      const geo = await Location.reverseGeocodeAsync(point);
      const country = geo[0]?.country?.trim();
      if (country) countries.add(country);
    } catch {
      // best-effort enrichment: ignore reverse-geocode failures
    }
  }
  return Array.from(countries);
}
