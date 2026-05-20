import { AppTheme } from '@/constants/theme';
import type { SavedRoute } from '@/entities/route';
import React, { useMemo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { RIVER_PREVIEW_STROKE, RIVER_VIEW_H, RIVER_VIEW_W } from '../lib/constants';
import { buildRiverSvgPreview } from '../lib/river-preview-geometry';

type RiverPathSvgProps = {
  widthPx: number;
  route: SavedRoute;
};

export function RiverPathSvg({ widthPx, route }: RiverPathSvgProps) {
  const w = Math.max(160, widthPx);
  const preview = useMemo(() => buildRiverSvgPreview(route), [route]);
  const svgH = Math.max(40, Math.round((w * RIVER_VIEW_H) / RIVER_VIEW_W));

  if (!preview) {
    return (
      <Svg
        width={w}
        height={svgH}
        viewBox={`0 0 ${RIVER_VIEW_W} ${RIVER_VIEW_H}`}
        preserveAspectRatio="xMidYMid meet">
        <Path
          d={`M 0 ${RIVER_VIEW_H / 2} Q 50 ${RIVER_VIEW_H / 2 - 12}, 100 ${RIVER_VIEW_H / 2} T 200 ${
            RIVER_VIEW_H / 2
          } Q 250 ${RIVER_VIEW_H / 2 + 8}, 300 ${RIVER_VIEW_H / 2}`}
          stroke={RIVER_PREVIEW_STROKE}
          strokeWidth={2}
          fill="none"
        />
      </Svg>
    );
  }

  return (
    <Svg
      width={w}
      height={svgH}
      viewBox={`0 0 ${RIVER_VIEW_W} ${RIVER_VIEW_H}`}
      preserveAspectRatio="xMidYMid meet">
      <Path
        d={preview.d}
        stroke={RIVER_PREVIEW_STROKE}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={preview.sx} cy={preview.sy} r={4} fill={AppTheme.primary} />
      <Circle cx={preview.ex} cy={preview.ey} r={4} fill={AppTheme.mapPointFinish} />
    </Svg>
  );
}
