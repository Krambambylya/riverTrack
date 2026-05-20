import type { SavedRoute } from '@/entities/route';

export type PresetFilter = 'all' | 'favorites' | 'newest' | 'oldest' | 'nearby';

export type RoutesYearSection = {
  year: number;
  data: SavedRoute[];
};
