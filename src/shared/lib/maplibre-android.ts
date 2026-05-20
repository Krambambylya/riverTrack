import { Platform } from 'react-native';

export type MapLibreNativeModule = typeof import('@maplibre/maplibre-react-native');

export function getAndroidMapLibre(): MapLibreNativeModule | null {
  if (Platform.OS !== 'android') return null;
  return require('@maplibre/maplibre-react-native');
}
