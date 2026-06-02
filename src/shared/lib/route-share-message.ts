import type { SavedRoute } from '@/entities/route';

export function buildRouteShareMessage(route: SavedRoute): string {
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
  ];
  if (route.favorited) {
    lines.push('', 'Избранное: да');
  }
  lines.push('', `Идентификатор: ${route.id}`);
  return lines.join('\n');
}
