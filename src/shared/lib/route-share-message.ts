import type { SavedRoute } from '@/entities/route';
import { lineString } from '@turf/helpers';
import length from '@turf/length';

export function buildRouteShareMessage(route: SavedRoute): string {
  const totalRouteLengthKm =
    route.route.length >= 2
      ? length(
          lineString(route.route.map((point) => [point.longitude, point.latitude])),
          { units: 'kilometers' }
        )
      : 0;
  const coveredKm = Math.max(0, route.coveredDistanceKm ?? 0);
  const lines: string[] = [
    'RiverTrack — водный маршрут',
    '',
    `Название: ${route.title}`,
    '',
    `Старт: ${route.start.lat.toFixed(5)}, ${route.start.lon.toFixed(5)}`,
    '',
    `Финиш: ${route.finish.lat.toFixed(5)}, ${route.finish.lon.toFixed(5)}`,
    '',
    `Реки: ${route.rivers.length > 0 ? route.rivers.join(', ') : 'не определены'}`,
    '',
    `Страны: ${route.countries && route.countries.length > 0 ? route.countries.join(', ') : 'не определены'}`,
    '',
    `Длина маршрута: ${totalRouteLengthKm.toFixed(2)} км`,
    '',
    `Пройдено: ${coveredKm.toFixed(2)} км`,
  ];
  if (route.favorited) {
    lines.push('', 'Избранное: да');
  }
  lines.push('', `Идентификатор: ${route.id}`);
  return lines.join('\n');
}
