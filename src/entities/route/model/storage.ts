import AsyncStorage from '@react-native-async-storage/async-storage';

import { LatLon, RoutePoint, SavedRoute } from './types';

const ROUTES_STORAGE_KEY = 'rivertrack.saved-routes.v1';
const ACTIVE_ROUTE_ID_STORAGE_KEY = 'rivertrack.active-route-id.v1';
const PENDING_ROUTE_SELECTION_STORAGE_KEY = 'rivertrack.pending-route-selection.v1';
let memoryFallbackRaw = '[]';
let memoryActiveRouteId: string | null = null;
let memoryPendingRouteSelection: { start: LatLon; finish: LatLon } | null = null;

const normalizeCoordinateKey = (value: number) => value.toFixed(6);

const makeRouteKey = (start: LatLon, finish: LatLon) =>
  `${normalizeCoordinateKey(start.lat)},${normalizeCoordinateKey(start.lon)}|${normalizeCoordinateKey(
    finish.lat
  )},${normalizeCoordinateKey(finish.lon)}`;

const makeRouteTitle = (rivers: string[]) => {
  if (!rivers.length) return 'Водный маршрут';
  if (rivers.length === 1) return rivers[0];
  return `${rivers[0]} и еще ${rivers.length - 1}`;
};

export const getSavedRoutes = async (): Promise<SavedRoute[]> => {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(ROUTES_STORAGE_KEY);
  } catch (error) {
    raw = memoryFallbackRaw;
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedRoute[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const writeRoutes = async (routes: SavedRoute[]) => {
  const payload = JSON.stringify(routes);
  memoryFallbackRaw = payload;
  try {
    await AsyncStorage.setItem(ROUTES_STORAGE_KEY, payload);
  } catch (error) {
    // fallback to in-memory storage only
  }
};

export const upsertSavedRoute = async (input: {
  start: LatLon;
  finish: LatLon;
  rivers: string[];
  route: RoutePoint[];
}): Promise<SavedRoute> => {
  const routes = await getSavedRoutes();
  const now = new Date().toISOString();
  const id = makeRouteKey(input.start, input.finish);
  const title = makeRouteTitle(input.rivers);
  const existing = routes.find((route) => route.id === id);

  if (existing) {
    const updated: SavedRoute = {
      ...existing,
      title,
      rivers: input.rivers,
      route: input.route,
      updatedAt: now,
    };
    const nextRoutes = routes.map((route) => (route.id === id ? updated : route));
    await writeRoutes(nextRoutes);
    return updated;
  }

  const created: SavedRoute = {
    id,
    title,
    start: input.start,
    finish: input.finish,
    rivers: input.rivers,
    route: input.route,
    createdAt: now,
    updatedAt: now,
    favorited: false,
  };
  await writeRoutes([created, ...routes]);
  return created;
};

export const getSavedRouteById = async (id: string): Promise<SavedRoute | null> => {
  const routes = await getSavedRoutes();
  return routes.find((route) => route.id === id) ?? null;
};

export const deleteSavedRoute = async (id: string): Promise<void> => {
  const routes = await getSavedRoutes();
  const nextRoutes = routes.filter((route) => route.id !== id);
  await writeRoutes(nextRoutes);
};

export const renameSavedRoute = async (id: string, title: string): Promise<SavedRoute | null> => {
  const routes = await getSavedRoutes();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  const target = routes.find((route) => route.id === id);
  if (!target) return null;
  const updated: SavedRoute = {
    ...target,
    title: trimmedTitle,
    updatedAt: new Date().toISOString(),
  };
  const nextRoutes = routes.map((route) => (route.id === id ? updated : route));
  await writeRoutes(nextRoutes);
  return updated;
};

export const setSavedRouteFavorited = async (id: string, favorited: boolean): Promise<SavedRoute | null> => {
  const routes = await getSavedRoutes();
  const target = routes.find((route) => route.id === id);
  if (!target) return null;
  const updated: SavedRoute = {
    ...target,
    favorited,
    updatedAt: new Date().toISOString(),
  };
  const nextRoutes = routes.map((route) => (route.id === id ? updated : route));
  await writeRoutes(nextRoutes);
  return updated;
};

export const setActiveRouteId = async (routeId: string | null): Promise<void> => {
  memoryActiveRouteId = routeId;
  try {
    if (routeId) {
      await AsyncStorage.setItem(ACTIVE_ROUTE_ID_STORAGE_KEY, routeId);
    } else {
      await AsyncStorage.removeItem(ACTIVE_ROUTE_ID_STORAGE_KEY);
    }
  } catch (error) {
    // fallback to in-memory storage only
  }
};

export const getActiveRouteId = async (): Promise<string | null> => {
  try {
    const value = await AsyncStorage.getItem(ACTIVE_ROUTE_ID_STORAGE_KEY);
    return value ?? memoryActiveRouteId;
  } catch (error) {
    return memoryActiveRouteId;
  }
};

export const setPendingRouteSelection = async (selection: { start: LatLon; finish: LatLon } | null): Promise<void> => {
  memoryPendingRouteSelection = selection;
  try {
    if (selection) {
      await AsyncStorage.setItem(PENDING_ROUTE_SELECTION_STORAGE_KEY, JSON.stringify(selection));
    } else {
      await AsyncStorage.removeItem(PENDING_ROUTE_SELECTION_STORAGE_KEY);
    }
  } catch (error) {
    // fallback to in-memory storage only
  }
};

export const getPendingRouteSelection = async (): Promise<{ start: LatLon; finish: LatLon } | null> => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ROUTE_SELECTION_STORAGE_KEY);
    if (!raw) return memoryPendingRouteSelection;
    const parsed = JSON.parse(raw) as { start?: LatLon; finish?: LatLon };
    if (!parsed?.start || !parsed?.finish) return memoryPendingRouteSelection;
    return parsed.start && parsed.finish ? { start: parsed.start, finish: parsed.finish } : memoryPendingRouteSelection;
  } catch (error) {
    return memoryPendingRouteSelection;
  }
};
