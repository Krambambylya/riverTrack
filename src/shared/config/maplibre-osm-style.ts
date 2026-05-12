/**
 * Растровые тайлы OpenStreetMap (tile.openstreetmap.org).
 * Важно: публичный OSM — только для лёгкого использования; при частых запросах,
 * медленной сети или одновременно нескольких MapView возможны таймауты тайлов (см. LogBox).
 * Для продакшена лучше свой тайловый CDN (MapTiler, Mapbox, self-hosted и т.д.).
 */
export const MAPLIBRE_OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
} as const;
