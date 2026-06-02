export type LatLon = {
  lat: number;
  lon: number;
};

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type SavedRoute = {
  id: string;
  title: string;
  start: LatLon;
  finish: LatLon;
  rivers: string[];
  countries?: string[];
  coveredDistanceKm?: number;
  route: RoutePoint[];
  createdAt: string;
  updatedAt: string;
  favorited?: boolean;
};
