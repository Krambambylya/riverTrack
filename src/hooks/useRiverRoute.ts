import { useEffect, useRef, useState } from "react";

// =====================
// TYPES
// =====================

type LatLng = {
  lat: number;
  lon: number;
};

type PolylinePoint = {
  latitude: number;
  longitude: number;
};

type OverpassElement =
  | {
      type: "node";
      id: number;
      lat: number;
      lon: number;
    }
  | {
      type: "way";
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
  route: PolylinePoint[];
  rivers: string[];
  loading: boolean;
  error: string | null;
};

// =====================
// CONFIG
// =====================

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const MAX_DISTANCE = 30000; // 30 км
const DEBOUNCE_MS = 400;

// =====================
// UTILS
// =====================

const R = 6371e3;

const toRad = (v: number) => (v * Math.PI) / 180;

const distance = (a: LatLng, b: LatLng): number => {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lon - a.lon);

  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// адаптивный bbox
const buildBBox = (start: LatLng, end: LatLng): string => {
  const d =
    Math.abs(start.lat - end.lat) + Math.abs(start.lon - end.lon);

  const padding = Math.min(0.01, d * 0.3);

  return [
    Math.min(start.lat, end.lat) - padding,
    Math.min(start.lon, end.lon) - padding,
    Math.max(start.lat, end.lat) + padding,
    Math.max(start.lon, end.lon) + padding,
  ].join(",");
};

// =====================
// CACHE (in-memory)
// =====================

const cache = new Map<string, OverpassResponse>();
const routeCache = new Map<string, { route: PolylinePoint[]; rivers: string[] }>();

// =====================
// API (fallback)
// =====================

const fetchRiverData = async (
  bbox: string
): Promise<OverpassResponse> => {
  if (cache.has(bbox)) {
    return cache.get(bbox)!;
  }

  const query = `
  [out:json][timeout:20];
  (
    way["waterway"~"river|stream|canal"](${bbox});
  );
  out body;
  >;
  out skel qt;
  `;

  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: query,
      });

      if (!res.ok) continue;

      const data = await res.json();

      cache.set(bbox, data);
      return data;
    } catch (e) {
      // fallback
    }
  }

  throw new Error("Overpass unavailable");
};

// =====================
// GRAPH
// =====================

const buildGraph = (data: OverpassResponse): Graph => {
  const graph: Graph = {};

  data.elements.forEach((el) => {
    if (el.type === "node") {
      graph[el.id] = {
        lat: el.lat,
        lon: el.lon,
        neighbors: [],
      };
    }
  });

  data.elements.forEach((el) => {
    if (el.type === "way") {
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const a = el.nodes[i];
        const b = el.nodes[i + 1];

        if (!graph[a] || !graph[b]) continue;

        const dist = distance(graph[a], graph[b]);

        const riverName = el.tags?.name ?? el.tags?.waterway;
        graph[a].neighbors.push({ id: b, dist, riverName });
        graph[b].neighbors.push({ id: a, dist, riverName });
      }
    }
  });

  return graph;
};

// =====================
// NEAREST
// =====================

const findNearestNode = (
  graph: Graph,
  point: LatLng
): number | null => {
  let min = Infinity;
  let closest: number | null = null;

  for (const id in graph) {
    const d = distance(point, graph[Number(id)]);
    if (d < min) {
      min = d;
      closest = Number(id);
    }
  }

  return closest;
};

// =====================
// A*
// =====================

const aStar = (
  graph: Graph,
  startId: number,
  endId: number
): number[] => {
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
      if (current === null || f[id] < f[current]) {
        current = id;
      }
    });

    if (current === null) break;
    if (current === endId) break;

    open.delete(current);

    for (const n of graph[current].neighbors) {
      const tentative = g[current] + n.dist;

      if (tentative < g[n.id]) {
        cameFrom[n.id] = current;
        g[n.id] = tentative;
        f[n.id] =
          tentative + distance(graph[n.id], graph[endId]);

        open.add(n.id);
      }
    }
  }

  const path: number[] = [];
  let cur: number | undefined = endId;

  while (cur !== undefined) {
    path.unshift(cur);
    cur = cameFrom[cur];
  }

  return path;
};

// =====================
// SIMPLIFY
// =====================

const simplify = (
  points: PolylinePoint[],
  step = 2
): PolylinePoint[] => {
  return points.filter((_, i) => i % step === 0);
};

// =====================
// HOOK
// =====================

export const useRiverRoute = (
  start: LatLng | null,
  end: LatLng | null
): UseRiverRouteResult => {
  const [route, setRoute] = useState<PolylinePoint[]>([]);
  const [rivers, setRivers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!start || !end) {
      setRoute([]);
      setRivers([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (distance(start, end) > MAX_DISTANCE) {
      setError("Route too long (>30km)");
      setRoute([]);
      setRivers([]);
      setLoading(false);
      return;
    }

    const routeCacheKey = `${start.lat.toFixed(6)},${start.lon.toFixed(6)}|${end.lat.toFixed(
      6
    )},${end.lon.toFixed(6)}`;
    const cachedRoute = routeCache.get(routeCacheKey);
    if (cachedRoute) {
      setRoute(cachedRoute.route);
      setRivers(cachedRoute.rivers);
      setLoading(false);
      setError(null);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Сразу очищаем предыдущий маршрут при смене точек,
    // чтобы не показывать старую линию во время нового запроса.
    setRoute([]);
    setRivers([]);
    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(() => {
      let cancelled = false;

      const run = async () => {
        try {
          const bbox = buildBBox(start, end);

          const data = await fetchRiverData(bbox);
          const graph = buildGraph(data);

          const startNode = findNearestNode(graph, start);
          const endNode = findNearestNode(graph, end);

          if (!startNode || !endNode) {
            setRoute([]);
            setRivers([]);
            return;
          }

          const path = aStar(graph, startNode, endNode);

          let polyline: PolylinePoint[] = path.map((id) => ({
            latitude: graph[id].lat,
            longitude: graph[id].lon,
          }));

          const usedRivers = new Set<string>();
          for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            const edge = graph[from].neighbors.find((neighbor) => neighbor.id === to);
            if (edge?.riverName) usedRivers.add(edge.riverName);
          }

          polyline = simplify(polyline, 2);

          if (!cancelled) {
            const riversFromPath = Array.from(usedRivers);
            routeCache.set(routeCacheKey, { route: polyline, rivers: riversFromPath });
            setRoute(polyline);
            setRivers(riversFromPath);
          }
        } catch (e: any) {
          if (!cancelled) {
            setError(e.message || "Route error");
            setRoute([]);
            setRivers([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      run();

      return () => {
        cancelled = true;
      };
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [start, end]);

  return { route, rivers, loading, error };
};