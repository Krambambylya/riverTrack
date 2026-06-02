import { useEffect, useRef, useState } from 'react';

import { LatLon, RoutePoint } from '@/entities/route/model/types';
import {
  buildRouteBySegments,
  makeRouteCacheKey,
  Segment,
  SegmentBuildResult,
} from './route-segments';

type OverpassElement =
  | {
      type: 'node';
      id: number;
      lat: number;
      lon: number;
    }
  | {
      type: 'way';
      id: number;
      nodes: number[];
      tags?: {
        name?: string;
        waterway?: string;
      };
    };

type OverpassResponse = {
  elements: OverpassElement[];
};

type GraphNode = {
  lat: number;
  lon: number;
  neighbors: { id: number; dist: number; riverName?: string }[];
};

type Graph = Record<number, GraphNode>;

type UseRiverRouteResult = {
  route: RoutePoint[];
  rivers: string[];
  loading: boolean;
  error: string | null;
  loadingStatus: string | null;
};

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];
const OVERPASS_REQUEST_TIMEOUT_MS = 14_000;

const SOFT_DISTANCE = 30_000;
const MAX_DISTANCE = 120_000;
const TARGET_SEGMENT_DISTANCE = 25_000;
const MAX_SEGMENTS = 6;
const MAX_ROUTE_BUILD_MS = 45_000;
const DEBOUNCE_MS = 400;
const R = 6371e3;
const WATERWAY_TYPE_NAMES = new Set(['river', 'stream', 'canal']);

const toRad = (value: number) => (value * Math.PI) / 180;

const distance = (a: LatLon, b: LatLon): number => {
  const f1 = toRad(a.lat);
  const f2 = toRad(b.lat);
  const df = toRad(b.lat - a.lat);
  const dl = toRad(b.lon - a.lon);

  const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const interpolatePoint = (start: LatLon, end: LatLon, t: number): LatLon => ({
  lat: start.lat + (end.lat - start.lat) * t,
  lon: start.lon + (end.lon - start.lon) * t,
});

const buildBBox = (start: LatLon, end: LatLon): string => {
  const diff = Math.abs(start.lat - end.lat) + Math.abs(start.lon - end.lon);
  const padding = Math.min(0.01, diff * 0.3);

  return [
    Math.min(start.lat, end.lat) - padding,
    Math.min(start.lon, end.lon) - padding,
    Math.max(start.lat, end.lat) + padding,
    Math.max(start.lon, end.lon) + padding,
  ].join(',');
};

const buildBBoxWithPaddingMultiplier = (start: LatLon, end: LatLon, multiplier: number): string => {
  const diff = Math.abs(start.lat - end.lat) + Math.abs(start.lon - end.lon);
  const basePadding = Math.min(0.01, diff * 0.3);
  const padding = Math.min(0.05, basePadding * multiplier);
  return [
    Math.min(start.lat, end.lat) - padding,
    Math.min(start.lon, end.lon) - padding,
    Math.max(start.lat, end.lat) + padding,
    Math.max(start.lon, end.lon) + padding,
  ].join(',');
};

const overpassCache = new Map<string, OverpassResponse>();
const routeCache = new Map<string, { route: RoutePoint[]; rivers: string[] }>();

const overpassRequestBody = (overpassQl: string) =>
  `data=${encodeURIComponent(overpassQl.trim())}`;

const OVERPASS_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'User-Agent': 'RiverTrack/1.0 (OSM Overpass consumer; contact via app store listing)',
};

const fetchRiverData = async (
  bbox: string,
  onStatus?: (status: string) => void
): Promise<OverpassResponse> => {
  if (overpassCache.has(bbox)) return overpassCache.get(bbox)!;

  const query = `
  [out:json][timeout:20];
  (
    way["waterway"~"river|stream|canal"](${bbox});
  );
  out body;
  >;
  out skel qt;
  `;

  for (let index = 0; index < OVERPASS_URLS.length; index += 1) {
    const url = OVERPASS_URLS[index];
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      onStatus?.(`Запрашиваем данные рек (${index + 1}/${OVERPASS_URLS.length})...`);
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);
      const response = await fetch(url, {
        method: 'POST',
        headers: OVERPASS_HEADERS,
        body: overpassRequestBody(query),
        signal: controller.signal,
      });
      if (!response.ok) {
        let bodyPreview = '';
        try {
          bodyPreview = (await response.text()).slice(0, 4000);
        } catch {
          bodyPreview = '(не удалось прочитать тело ответа)';
        }
        console.log('[RiverTrack][Overpass] сервис недоступен или ответил с ошибкой', {
          url,
          status: response.status,
          statusText: response.statusText,
          body: bodyPreview || '(пустое тело)',
        });
        onStatus?.(
          `Сервер карт не ответил (${index + 1}/${OVERPASS_URLS.length}), пробуем другой...`
        );
        continue;
      }
      const data = (await response.json()) as OverpassResponse & { remark?: string; error?: string };
      if (typeof data.remark === 'string' && data.remark.trim().length > 0) {
        console.log('[RiverTrack][Overpass] remark от API', { url, remark: data.remark });
      }
      if (typeof data.error === 'string' && data.error.trim().length > 0) {
        console.error('[RiverTrack][Overpass] error от API', { url, error: data.error });
        onStatus?.(`Ошибка Overpass (${index + 1}/${OVERPASS_URLS.length}), пробуем другой...`);
        continue;
      }
      if (!Array.isArray(data.elements)) {
        console.error('[RiverTrack][Overpass] ответ без elements', { url, keys: Object.keys(data) });
        onStatus?.(`Некорректный ответ сервера (${index + 1}/${OVERPASS_URLS.length}), пробуем другой...`);
        continue;
      }
      overpassCache.set(bbox, data);
      return data;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      console.log('[RiverTrack][Overpass] запрос не выполнен', {
        url,
        isTimeout,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
      });
      onStatus?.(
        isTimeout
          ? `Сервер не ответил за ${Math.round(OVERPASS_REQUEST_TIMEOUT_MS / 1000)} c, переключаемся...`
          : `Ошибка сети (${index + 1}/${OVERPASS_URLS.length}), повторяем...`
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const backendError = new Error('Сервис данных рек временно недоступен');
  console.log('[RiverTrack][Overpass] все зеркала недоступны', { tried: OVERPASS_URLS });
  throw backendError;
};

const buildGraph = (data: OverpassResponse): Graph => {
  const graph: Graph = {};

  data.elements.forEach((element) => {
    if (element.type === 'node') {
      graph[element.id] = { lat: element.lat, lon: element.lon, neighbors: [] };
    }
  });

  data.elements.forEach((element) => {
    if (element.type !== 'way') return;

    for (let i = 0; i < element.nodes.length - 1; i++) {
      const a = element.nodes[i];
      const b = element.nodes[i + 1];
      if (!graph[a] || !graph[b]) continue;

      const dist = distance(graph[a], graph[b]);
      const namedRiver = element.tags?.name?.trim();
      const waterwayType = element.tags?.waterway?.trim().toLowerCase();
      const riverName =
        namedRiver && namedRiver.length > 0
          ? namedRiver
          : waterwayType && !WATERWAY_TYPE_NAMES.has(waterwayType)
            ? waterwayType
            : undefined;
      graph[a].neighbors.push({ id: b, dist, riverName });
      graph[b].neighbors.push({ id: a, dist, riverName });
    }
  });

  return graph;
};

const findNearestNode = (graph: Graph, point: LatLon): number | null => {
  let minDistance = Infinity;
  let closest: number | null = null;

  for (const id in graph) {
    const d = distance(point, graph[Number(id)]);
    if (d < minDistance) {
      minDistance = d;
      closest = Number(id);
    }
  }

  return closest;
};

const aStar = (graph: Graph, startId: number, endId: number): number[] => {
  const open = new Set<number>([startId]);
  const cameFrom: Record<number, number | undefined> = {};
  const g: Record<number, number> = {};
  const f: Record<number, number> = {};

  Object.keys(graph).forEach((id) => {
    const n = Number(id);
    g[n] = Infinity;
    f[n] = Infinity;
  });

  g[startId] = 0;
  f[startId] = distance(graph[startId], graph[endId]);

  while (open.size) {
    let current: number | null = null;
    open.forEach((id) => {
      if (current === null || f[id] < f[current]) current = id;
    });

    if (current === null || current === endId) break;
    open.delete(current);

    for (const neighbor of graph[current].neighbors) {
      const tentative = g[current] + neighbor.dist;
      if (tentative < g[neighbor.id]) {
        cameFrom[neighbor.id] = current;
        g[neighbor.id] = tentative;
        f[neighbor.id] = tentative + distance(graph[neighbor.id], graph[endId]);
        open.add(neighbor.id);
      }
    }
  }

  const path: number[] = [];
  let current: number | undefined = endId;
  while (current !== undefined) {
    path.unshift(current);
    current = cameFrom[current];
  }

  return path;
};

const simplify = (points: RoutePoint[], step = 2): RoutePoint[] => {
  if (points.length <= 2 || step <= 1) return points;
  const simplified = points.filter((_, index) => index % step === 0);
  const lastOriginal = points[points.length - 1];
  const lastSimplified = simplified[simplified.length - 1];
  if (
    !lastSimplified ||
    lastSimplified.latitude !== lastOriginal.latitude ||
    lastSimplified.longitude !== lastOriginal.longitude
  ) {
    simplified.push(lastOriginal);
  }
  return simplified;
};

const buildSegments = (start: LatLon, end: LatLon): Segment[] => {
  const directDistance = distance(start, end);
  if (directDistance <= SOFT_DISTANCE) {
    return [{ start, end }];
  }
  const segmentCount = Math.min(
    MAX_SEGMENTS,
    Math.max(2, Math.ceil(directDistance / TARGET_SEGMENT_DISTANCE))
  );
  const points: LatLon[] = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    points.push(interpolatePoint(start, end, i / segmentCount));
  }
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push({ start: points[i], end: points[i + 1] });
  }
  return segments;
};

const buildSegmentPolyline = (
  graph: Graph,
  startId: number,
  endId: number
): SegmentBuildResult => {
  const path = aStar(graph, startId, endId);
  const usedRivers = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const edge = graph[from].neighbors.find((neighbor) => neighbor.id === to);
    if (edge?.riverName) usedRivers.add(edge.riverName);
  }
  const polyline = path.map((id) => ({
    latitude: graph[id].lat,
    longitude: graph[id].lon,
  }));
  return { polyline, rivers: Array.from(usedRivers) };
};

const isSegmentBuildError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes('Не нашли ближайшие точки воды') ||
    error.message.includes('Не удалось проложить путь по руслам'));

export const useRiverRoute = (
  start: LatLon | null,
  end: LatLon | null,
  retryToken = 0
): UseRiverRouteResult => {
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [rivers, setRivers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestIdRef = useRef(0);

  useEffect(() => {
    if (!start || !end) {
      setRoute([]);
      setRivers([]);
      setLoading(false);
      setError(null);
      setLoadingStatus(null);
      return;
    }

    const directDistance = distance(start, end);
    if (directDistance > MAX_DISTANCE) {
      setError('Маршрут слишком длинный (более 120 км). Выберите точки ближе.');
      setRoute([]);
      setRivers([]);
      setLoading(false);
      setLoadingStatus(null);
      return;
    }

    const cacheKey = makeRouteCacheKey(start, end);
    const cached = routeCache.get(cacheKey);
    if (cached) {
      setRoute(cached.route);
      setRivers(cached.rivers);
      setLoading(false);
      setError(null);
      setLoadingStatus('Маршрут загружен из кэша.');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setRoute([]);
    setRivers([]);
    setLoading(true);
    setError(null);
    setLoadingStatus('Подготавливаем запрос маршрута...');

    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    const isRequestActive = () => activeRequestIdRef.current === requestId;

    debounceRef.current = setTimeout(() => {
      const run = async () => {
        try {
          const startedAt = Date.now();
          const segments = buildSegments(start, end);
          if (segments.length > 1 && isRequestActive()) {
            setLoadingStatus(`Длинный маршрут, строим по частям (${segments.length} сегм.)...`);
          }

          const { stitchedPolyline, stitchedRivers, builtSegments } = await buildRouteBySegments(
            segments,
            {
              isRequestActive,
              onStatus: setLoadingStatus,
              startedAt,
            },
            {
              buildBBox,
              buildBBoxWithPaddingMultiplier,
              fetchRiverData,
              buildGraph: buildGraph as (data: any) => any,
              findNearestNode: findNearestNode as (graph: any, point: LatLon) => number | null,
              buildSegmentPolyline: buildSegmentPolyline as (
                graph: any,
                startId: number,
                endId: number
              ) => SegmentBuildResult,
            },
            {
              maxRouteBuildMs: MAX_ROUTE_BUILD_MS,
              isSegmentBuildError,
            }
          );

          if (!isRequestActive()) return;
          if (stitchedPolyline.length < 2) {
            setRoute([]);
            setRivers([]);
            setLoadingStatus('Не нашли ближайшие точки воды для маршрута.');
            return;
          }

          setLoadingStatus('Оптимизируем маршрут для карты...');
          const simplifyStep = segments.length > 1 ? 3 : 2;
          const polyline = simplify(stitchedPolyline, simplifyStep);
          const riversFromPath = Array.from(stitchedRivers);
          routeCache.set(cacheKey, { route: polyline, rivers: riversFromPath });
          setRoute(polyline);
          setRivers(riversFromPath);
          setLoadingStatus(
            builtSegments > 1
              ? `Маршрут построен по ${builtSegments} сегментам.`
              : 'Маршрут успешно построен.'
          );
        } catch (requestError: unknown) {
          if (!isRequestActive()) return;
          console.log('[RiverTrack][useRiverRoute] ошибка построения маршрута', requestError);
          setError(requestError instanceof Error ? requestError.message : 'Ошибка построения маршрута');
          setRoute([]);
          setRivers([]);
          setLoadingStatus('Ошибка при построении маршрута.');
        } finally {
          if (!isRequestActive()) return;
          setLoading(false);
        }
      };

      run();
    }, DEBOUNCE_MS);

    return () => {
      activeRequestIdRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [start, end, retryToken]);

  return { route, rivers, loading, error, loadingStatus };
};
