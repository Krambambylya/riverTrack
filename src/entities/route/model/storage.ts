import AsyncStorage from '@react-native-async-storage/async-storage';

import { LatLon, RoutePoint, SavedRoute } from './types';

const ROUTES_STORAGE_KEY = 'rivertrack.saved-routes.v1';
let memoryFallbackRaw = '[]';

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
