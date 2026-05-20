import type { RoutePoint, SavedRoute } from '@/entities/route';

import { RIVER_PAD, RIVER_VIEW_H, RIVER_VIEW_W, RIVER_MAX_POINTS } from './constants';

export function decimateRoutePoints(pts: RoutePoint[], max: number): RoutePoint[] {
  if (pts.length <= max) return pts;
  const out: RoutePoint[] = [];
  const last = pts.length - 1;
  for (let i = 0; i < max; i++) {
    const t = i / (max - 1);
    const idx = Math.round(t * last);
    out.push(pts[idx]);
  }
  return out;
}

export function collectPolylineForPreview(route: SavedRoute): RoutePoint[] {
  const r = route.route;
  if (r && r.length >= 2) {
    return decimateRoutePoints(r, RIVER_MAX_POINTS);
  }
  if (r && r.length === 1) {
    return [
      { latitude: route.start.lat, longitude: route.start.lon },
      r[0],
      { latitude: route.finish.lat, longitude: route.finish.lon },
    ];
  }
  return [
    { latitude: route.start.lat, longitude: route.start.lon },
    { latitude: route.finish.lat, longitude: route.finish.lon },
  ];
}

export function buildRiverSvgPreview(route: SavedRoute): {
  d: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
} | null {
  const pts = collectPolylineForPreview(route);
  if (pts.length < 2) return null;

  const lats = pts.map((p) => p.latitude);
  const lons = pts.map((p) => p.longitude);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const eps = 1e-6;
  if (latSpan < eps) {
    minLat -= eps;
    maxLat += eps;
  }
  if (lonSpan < eps) {
    minLon -= eps;
    maxLon += eps;
  }

  const innerW = RIVER_VIEW_W - 2 * RIVER_PAD;
  const innerH = RIVER_VIEW_H - 2 * RIVER_PAD;

  const midLat = (minLat + maxLat) / 2;
  const cosMid = Math.cos((midLat * Math.PI) / 180);

  let widthGeo = (maxLon - minLon) * cosMid;
  let heightGeo = maxLat - minLat;
  if (widthGeo < eps) widthGeo = eps;
  if (heightGeo < eps) heightGeo = eps;

  const scale = Math.min(innerW / widthGeo, innerH / heightGeo);
  const scaledW = widthGeo * scale;
  const scaledH = heightGeo * scale;
  const offX = RIVER_PAD + (innerW - scaledW) / 2;
  const offY = RIVER_PAD + (innerH - scaledH) / 2;

  const project = (p: RoutePoint) => {
    const x = offX + (p.longitude - minLon) * cosMid * scale;
    const y = offY + (maxLat - p.latitude) * scale;
    return { x, y };
  };

  const projected = pts.map(project);
  const d = projected
    .map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`)
    .join(' ');
  const first = projected[0];
  const last = projected[projected.length - 1];
  return { d, sx: first.x, sy: first.y, ex: last.x, ey: last.y };
}
