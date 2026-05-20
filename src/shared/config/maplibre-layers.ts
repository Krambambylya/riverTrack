import { AppTheme } from '@/constants/theme';

export const maplibreRouteLineLayerStyle = {
  lineColor: AppTheme.mapRouteLine,
  lineWidth: 4,
} as const;

export const maplibreStartFinishCircleLayerStyle = {
  circleRadius: 6,
  circleColor: [
    'match',
    ['get', 'role'],
    'start',
    AppTheme.mapPointStart,
    'finish',
    AppTheme.mapPointFinish,
    AppTheme.foreground,
  ],
  circleStrokeWidth: 2,
  circleStrokeColor: AppTheme.foreground,
} as const;

export const maplibreRouteMarkersCircleLayerStyle = {
  circleRadius: 6,
  circleColor: [
    'match',
    ['get', 'role'],
    'start',
    AppTheme.mapPointStart,
    'finish',
    AppTheme.mapPointFinish,
    'user',
    AppTheme.mapUserOrLineBlue,
    AppTheme.foreground,
  ],
  circleStrokeWidth: 2,
  circleStrokeColor: AppTheme.foreground,
} as const;
