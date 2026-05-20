import type { CameraRef, CameraStop } from '@maplibre/maplibre-react-native';
import type React from 'react';

export function applyRouteConstructorCamera(
  cameraRef: React.RefObject<CameraRef | null>,
  latitude: number,
  longitude: number
) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cameraRef.current?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 13,
        animationDuration: 0,
        animationMode: 'moveTo',
      } satisfies CameraStop);
    });
  });
}
