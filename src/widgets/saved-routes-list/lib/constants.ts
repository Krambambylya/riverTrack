import type { PresetFilter } from './types';

export const PRESET_LABELS: { id: PresetFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'favorites', label: 'Избранные' },
  { id: 'nearby', label: 'Ближайшие ко мне' },
  { id: 'newest', label: 'Сначала новые' },
  { id: 'oldest', label: 'Сначала старые' },
];

export const STAR_ICON_LIGHT = require('@/assets/images/icons/star/light/star.png');
export const STAR_ICON_GREEN = require('@/assets/images/icons/star/green/star.png');

export const RIVER_VIEW_W = 300;
export const RIVER_VIEW_H = 100;
export const RIVER_PAD = 6;
export const RIVER_MAX_POINTS = 96;

export const RIVER_PREVIEW_STROKE = 'rgba(43, 122, 75, 0.45)';
