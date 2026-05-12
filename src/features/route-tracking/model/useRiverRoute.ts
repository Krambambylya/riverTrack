import { useEffect, useRef, useState } from 'react';

import { LatLon, RoutePoint } from '@/entities/route/model/types';

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
const OVERPASS_REQUEST_TIMEOUT_MS = 9000;

const MAX_DISTANCE = 30000;
const DEBOUNCE_MS = 400;
const R = 6371e3;

const toRad = (value: number) => (value * Math.PI) / 180;

const distance = (a: LatLon, b: LatLon): number => {
  const f1 = toRad(a.lat);
  const f2 = toRad(b.lat);
  const df = toRad(b.lat - a.lat);
  const dl = toRad(b.lon - a.lon);

  const x = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

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

const overpassCache = new Map<string, OverpassResponse>();
const routeCache = new Map<string, { route: RoutePoint[]; rivers: string[] }>();

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
      const response = await fetch(url, { method: 'POST', body: query, signal: controller.signal });
      if (!response.ok) {
        onStatus?.(
          `Сервер карт не ответил (${index + 1}/${OVERPASS_URLS.length}), пробуем другой...`
        );
        continue;
      }
      const data = await response.json();
      overpassCache.set(bbox, data);
      return data;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      onStatus?.(
        isTimeout
          ? `Сервер не ответил за ${Math.round(OVERPASS_REQUEST_TIMEOUT_MS / 1000)} c, переключаемся...`
          : `Ошибка сети (${index + 1}/${OVERPASS_URLS.length}), повторяем...`
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  throw new Error('Сервис данных рек временно недоступен');
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
      const riverName = element.tags?.name ?? element.tags?.waterway;
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

const simplify = (points: RoutePoint[], step = 2): RoutePoint[] =>
  points.filter((_, index) => index % step === 0);

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

  useEffect(() => {
    if (!start || !end) {
      setRoute([]);
      setRivers([]);
      setLoading(false);
      setError(null);
      setLoadingStatus(null);
      return;
    }

    if (distance(start, end) > MAX_DISTANCE) {
      setError('Маршрут слишком длинный (более 30 км)');
      setRoute([]);
      setRivers([]);
      setLoading(false);
      setLoadingStatus(null);
      return;
    }

    const cacheKey = `${start.lat.toFixed(6)},${start.lon.toFixed(6)}|${end.lat.toFixed(
      6
    )},${end.lon.toFixed(6)}`;
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

    debounceRef.current = setTimeout(() => {
      let cancelled = false;

      const run = async () => {
        try {
          if (!cancelled) setLoadingStatus('Собираем область маршрута...');
          const bbox = buildBBox(start, end);
          const data = await fetchRiverData(bbox, (status) => {
            if (!cancelled) setLoadingStatus(status);
          });
          if (!cancelled) setLoadingStatus('Строим граф рек...');
          const graph = buildGraph(data);
          if (!cancelled) setLoadingStatus('Ищем ближайшие точки старта и финиша...');
          const startNode = findNearestNode(graph, start);
          const endNode = findNearestNode(graph, end);

          if (!startNode || !endNode) {
            setRoute([]);
            setRivers([]);
            setLoadingStatus('Не нашли ближайшие точки воды для маршрута.');
            return;
          }

          if (!cancelled) setLoadingStatus('Прокладываем путь по руслам...');
          const path = aStar(graph, startNode, endNode);
          const usedRivers = new Set<string>();
          for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const edge = graph[from].neighbors.find((neighbor) => neighbor.id === to);
            if (edge?.riverName) usedRivers.add(edge.riverName);
          }

          let polyline: RoutePoint[] = path.map((id) => ({
            latitude: graph[id].lat,
            longitude: graph[id].lon,
          }));
          if (!cancelled) setLoadingStatus('Оптимизируем маршрут для карты...');
          polyline = simplify(polyline, 2);

          if (!cancelled) {
            const riversFromPath = Array.from(usedRivers);
            routeCache.set(cacheKey, { route: polyline, rivers: riversFromPath });
            setRoute(polyline);
            setRivers(riversFromPath);
            setLoadingStatus('Маршрут успешно построен.');
          }
        } catch (requestError: any) {
          if (!cancelled) {
            setError(requestError.message || 'Ошибка построения маршрута');
            setRoute([]);
            setRivers([]);
            setLoadingStatus('Ошибка при построении маршрута.');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      run();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [start, end, retryToken]);

  return { route, rivers, loading, error, loadingStatus };
};
