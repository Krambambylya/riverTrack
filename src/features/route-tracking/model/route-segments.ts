import { LatLon, RoutePoint } from '@/entities/route/model/types';

export type Segment = { start: LatLon; end: LatLon };
export type SegmentBuildResult = { polyline: RoutePoint[]; rivers: string[] };
export type BuildSegmentOptions = { expandedBBox?: boolean };
export type BuildContext = {
  isRequestActive: () => boolean;
  onStatus: (status: string) => void;
  startedAt: number;
};

type BuildSingleSegmentDeps = {
  buildBBox: (start: LatLon, end: LatLon) => string;
  buildBBoxWithPaddingMultiplier: (start: LatLon, end: LatLon, multiplier: number) => string;
  fetchRiverData: (bbox: string, onStatus?: (status: string) => void) => Promise<any>;
  buildGraph: (data: any) => any;
  findNearestNode: (graph: any, point: LatLon) => number | null;
  buildSegmentPolyline: (graph: any, startId: number, endId: number) => SegmentBuildResult;
};

export const makeRouteCacheKey = (start: LatLon, end: LatLon): string =>
  `${start.lat.toFixed(6)},${start.lon.toFixed(6)}|${end.lat.toFixed(6)},${end.lon.toFixed(6)}`;

export const stitchSegmentPolyline = (
  stitchedPolyline: RoutePoint[],
  segmentResult: SegmentBuildResult
): RoutePoint[] => {
  if (stitchedPolyline.length === 0) return [...segmentResult.polyline];
  return [...stitchedPolyline, ...segmentResult.polyline.slice(1)];
};

export const buildSingleSegmentRoute = async (
  segment: Segment,
  segmentTitle: string,
  context: BuildContext,
  deps: BuildSingleSegmentDeps,
  options?: BuildSegmentOptions
): Promise<SegmentBuildResult> => {
  context.onStatus(`${segmentTitle}: собираем область...`);
  const bbox = options?.expandedBBox
    ? deps.buildBBoxWithPaddingMultiplier(segment.start, segment.end, 2.5)
    : deps.buildBBox(segment.start, segment.end);
  const data = await deps.fetchRiverData(bbox, (status) => {
    if (context.isRequestActive()) context.onStatus(`${segmentTitle}: ${status}`);
  });
  if (!context.isRequestActive()) return { polyline: [], rivers: [] };

  context.onStatus(`${segmentTitle}: строим граф рек...`);
  const graph = deps.buildGraph(data);
  context.onStatus(`${segmentTitle}: ищем ближайшие точки...`);
  const startNode = deps.findNearestNode(graph, segment.start);
  const endNode = deps.findNearestNode(graph, segment.end);
  if (startNode === null || endNode === null) {
    throw new Error('Не нашли ближайшие точки воды для части маршрута.');
  }

  context.onStatus(`${segmentTitle}: прокладываем путь по руслам...`);
  const result = deps.buildSegmentPolyline(graph, startNode, endNode);
  if (result.polyline.length < 2) {
    throw new Error('Не удалось проложить путь по руслам для части маршрута.');
  }
  return result;
};

export const buildRouteBySegments = async (
  segments: Segment[],
  context: BuildContext,
  deps: BuildSingleSegmentDeps,
  options: {
    maxRouteBuildMs: number;
    isSegmentBuildError: (error: unknown) => boolean;
  }
): Promise<{ stitchedPolyline: RoutePoint[]; stitchedRivers: Set<string>; builtSegments: number }> => {
  let stitchedPolyline: RoutePoint[] = [];
  const stitchedRivers = new Set<string>();
  let builtSegments = 0;

  for (let i = 0; i < segments.length; i += 1) {
    if (!context.isRequestActive()) break;
    if (Date.now() - context.startedAt > options.maxRouteBuildMs) {
      throw new Error('Не успели построить маршрут за отведенное время. Попробуйте точки ближе.');
    }
    const segment = segments[i];
    const segmentTitle = `Сегмент ${i + 1}/${segments.length}`;
    let segmentResult: SegmentBuildResult | null = null;

    try {
      segmentResult = await buildSingleSegmentRoute(segment, segmentTitle, context, deps);
    } catch (segmentError) {
      if (!context.isRequestActive()) break;
      if (!options.isSegmentBuildError(segmentError)) throw segmentError;

      try {
        context.onStatus(`${segmentTitle}: расширяем область и повторяем...`);
        segmentResult = await buildSingleSegmentRoute(segment, segmentTitle, context, deps, {
          expandedBBox: true,
        });
      } catch (expandedError) {
        if (!context.isRequestActive()) break;
        if (!options.isSegmentBuildError(expandedError) || i >= segments.length - 1) {
          throw expandedError;
        }
        const mergedTitle = `Сегменты ${i + 1}-${i + 2}/${segments.length}`;
        const mergedSegment: Segment = { start: segment.start, end: segments[i + 1].end };
        context.onStatus(`${mergedTitle}: объединяем соседние сегменты...`);
        segmentResult = await buildSingleSegmentRoute(mergedSegment, mergedTitle, context, deps, {
          expandedBBox: true,
        });
        i += 1;
      }
    }

    if (!segmentResult || !context.isRequestActive()) break;
    segmentResult.rivers.forEach((river) => stitchedRivers.add(river));
    stitchedPolyline = stitchSegmentPolyline(stitchedPolyline, segmentResult);
    builtSegments += 1;
  }

  return { stitchedPolyline, stitchedRivers, builtSegments };
};
