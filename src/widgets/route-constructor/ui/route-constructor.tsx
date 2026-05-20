import { AppTheme } from '@/constants/theme';
import { setPendingRouteSelection } from '@/entities/route';
import { DEFAULT_MAP_REGION_CENTER } from '@/shared/config/map-defaults';
import { maplibreStartFinishCircleLayerStyle } from '@/shared/config/maplibre-layers';
import { MAPLIBRE_OSM_STYLE } from '@/shared/config/maplibre-osm-style';
import { getReliableCurrentPositionAsync } from '@/shared/lib/get-reliable-current-position';
import { getAndroidMapLibre } from '@/shared/lib/maplibre-android';
import { applyRouteConstructorCamera } from '@/shared/lib/maplibre-route-constructor-camera';
import { geoJsonFeatureCollectionForMarkers } from '@/shared/lib/route-geojson';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { AppleMaps } from 'expo-maps';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROUTE_CONSTRUCTOR_MAP_INITIAL_CAMERA = {
  zoomLevel: 13,
  centerCoordinate: [DEFAULT_MAP_REGION_CENTER.longitude, DEFAULT_MAP_REGION_CENTER.latitude] as [
    number,
    number,
  ],
};

export default function RouteConstructorWidget() {
  const MapLibre = getAndroidMapLibre();
  const insets = useSafeAreaInsets();
  const [startLat, setStartLat] = useState('');
  const [startLon, setStartLon] = useState('');
  const [finishLat, setFinishLat] = useState('');
  const [finishLon, setFinishLon] = useState('');
  const [selectionMode, setSelectionMode] = useState<'start' | 'finish'>('start');
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_REGION_CENTER);
  const cameraRef = useRef<CameraRef | null>(null);
  const startLatNum = Number(startLat);
  const startLonNum = Number(startLon);
  const finishLatNum = Number(finishLat);
  const finishLonNum = Number(finishLon);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const position = await getReliableCurrentPositionAsync();
        if (!active) return;

        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMapCenter(next);
        applyRouteConstructorCamera(cameraRef, next.latitude, next.longitude);
      } catch {
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const isValid = useMemo(() => {
    const hasValues =
      startLat.trim().length > 0 &&
      startLon.trim().length > 0 &&
      finishLat.trim().length > 0 &&
      finishLon.trim().length > 0;
    if (!hasValues) return false;
    const hasFinite =
      Number.isFinite(startLatNum) &&
      Number.isFinite(startLonNum) &&
      Number.isFinite(finishLatNum) &&
      Number.isFinite(finishLonNum);
    if (!hasFinite) return false;
    const isInRange =
      startLatNum >= -90 &&
      startLatNum <= 90 &&
      finishLatNum >= -90 &&
      finishLatNum <= 90 &&
      startLonNum >= -180 &&
      startLonNum <= 180 &&
      finishLonNum >= -180 &&
      finishLonNum <= 180;
    return isInRange;
  }, [finishLat, finishLatNum, finishLon, finishLonNum, startLat, startLatNum, startLon, startLonNum]);

  const hasStartPoint = useMemo(
    () =>
      startLat.trim().length > 0 &&
      startLon.trim().length > 0 &&
      Number.isFinite(startLatNum) &&
      Number.isFinite(startLonNum),
    [startLat, startLatNum, startLon, startLonNum]
  );
  const hasFinishPoint = useMemo(
    () =>
      finishLat.trim().length > 0 &&
      finishLon.trim().length > 0 &&
      Number.isFinite(finishLatNum) &&
      Number.isFinite(finishLonNum),
    [finishLat, finishLatNum, finishLon, finishLonNum]
  );
  const canStartRoute = isValid && hasStartPoint && hasFinishPoint;

  const startNavigation = async () => {
    if (!canStartRoute) return;
    await setPendingRouteSelection({
      start: { lat: Number(startLat), lon: Number(startLon) },
      finish: { lat: Number(finishLat), lon: Number(finishLon) },
    });
    router.push({
      pathname: '/map',
      params: {
        startLat,
        startLon,
        finishLat,
        finishLon,
      },
    });
  };

  const setSelectedPoint = (latitude: number, longitude: number) => {
    const nextLat = String(Number(latitude).toFixed(6));
    const nextLon = String(Number(longitude).toFixed(6));

    if (selectionMode === 'start') {
      setStartLat(nextLat);
      setStartLon(nextLon);
      setSelectionMode('finish');
      return;
    }
    setFinishLat(nextLat);
    setFinishLon(nextLon);
  };
  const setSelectedPointFromAppleMap = (event: any) => {
    const coordinates = event?.coordinates ?? event?.nativeEvent?.coordinates;
    if (!coordinates) return;
    setSelectedPoint(coordinates.latitude, coordinates.longitude);
  };
  const setSelectedPointFromAndroidMap = (event: any) => {
    const trySetFromLngLat = (rawLongitude: unknown, rawLatitude: unknown) => {
      const longitude = Number(rawLongitude);
      const latitude = Number(rawLatitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
      setSelectedPoint(latitude, longitude);
      return true;
    };

    const directFeatureCoords = event?.geometry?.coordinates;
    if (Array.isArray(directFeatureCoords) && directFeatureCoords.length >= 2) {
      const [longitude, latitude] = directFeatureCoords;
      if (trySetFromLngLat(longitude, latitude)) return;
    }

    const featureListCoords = event?.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(featureListCoords) && featureListCoords.length >= 2) {
      const [longitude, latitude] = featureListCoords;
      if (trySetFromLngLat(longitude, latitude)) return;
    }

    if (trySetFromLngLat(event?.coordinates?.longitude, event?.coordinates?.latitude)) return;

    if (trySetFromLngLat(event?.nativeEvent?.payload?.geometry?.coordinates?.[0], event?.nativeEvent?.payload?.geometry?.coordinates?.[1])) return;

    if (trySetFromLngLat(event?.nativeEvent?.payload?.coordinates?.longitude, event?.nativeEvent?.payload?.coordinates?.latitude)) return;
  };

  const appleCameraPosition = useMemo(
    () => ({
      coordinates: mapCenter,
      zoom: 13,
    }),
    [mapCenter]
  );

  const androidSelectionPoints = useMemo(() => {
    const markers: Array<{
      role: 'start' | 'finish';
      longitude: number;
      latitude: number;
    }> = [];
    if (hasStartPoint) {
      markers.push({
        role: 'start',
        longitude: Number(startLon),
        latitude: Number(startLat),
      });
    }
    if (hasFinishPoint) {
      markers.push({
        role: 'finish',
        longitude: Number(finishLon),
        latitude: Number(finishLat),
      });
    }
    return geoJsonFeatureCollectionForMarkers(markers);
  }, [finishLat, finishLon, hasFinishPoint, hasStartPoint, startLat, startLon]);

  const useCurrentLocationAsStart = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const position = await getReliableCurrentPositionAsync();
      const nextLat = String(Number(position.coords.latitude).toFixed(6));
      const nextLon = String(Number(position.coords.longitude).toFixed(6));

      setStartLat(nextLat);
      setStartLon(nextLon);
      const nextCenter = {
        latitude: Number(nextLat),
        longitude: Number(nextLon),
      };
      setMapCenter(nextCenter);
      applyRouteConstructorCamera(cameraRef, nextCenter.latitude, nextCenter.longitude);
      setSelectionMode('finish');
    } catch {
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.mapLayer}>
        {Platform.OS === 'android' && MapLibre ? (
          <MapLibre.MapView
            style={styles.map}
            mapStyle={MAPLIBRE_OSM_STYLE}
            logoEnabled={false}
            onPress={setSelectedPointFromAndroidMap}
            onLongPress={setSelectedPointFromAndroidMap}>
            <MapLibre.Camera ref={cameraRef} defaultSettings={ROUTE_CONSTRUCTOR_MAP_INITIAL_CAMERA} />
            <MapLibre.ShapeSource id="route-constructor-points-source" shape={androidSelectionPoints}>
              <MapLibre.CircleLayer
                id="route-constructor-points-layer"
                style={maplibreStartFinishCircleLayerStyle}
              />
            </MapLibre.ShapeSource>
          </MapLibre.MapView>
        ) : (
          <AppleMaps.View
            style={styles.map}
            onMapClick={setSelectedPointFromAppleMap}
            cameraPosition={appleCameraPosition}
            markers={[
              ...(hasStartPoint
                ? [
                  {
                    id: 'start',
                    coordinates: {
                      latitude: Number(startLat),
                      longitude: Number(startLon),
                    },
                    title: 'Старт',
                    tintColor: AppTheme.mapPointStart,
                  },
                ]
                : []),
              ...(hasFinishPoint
                ? [
                  {
                    id: 'finish',
                    coordinates: {
                      latitude: Number(finishLat),
                      longitude: Number(finishLon),
                    },
                    title: 'Финиш',
                    tintColor: AppTheme.mapPointFinish,
                  },
                ]
                : []),
            ]}
          />
        )}
      </View>

      <View style={[styles.topOverlay, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.topPanel} pointerEvents="auto">
          <View style={styles.modeRow}>
            <Pressable
              style={({ pressed }) => [
                styles.modeButton,
                selectionMode === 'start' && styles.modeButtonActiveStart,
                pressed && styles.modeButtonPressed,
              ]}
              onPress={() => setSelectionMode('start')}>
              <Text
                style={[
                  styles.modeButtonText,
                  selectionMode === 'start' && styles.modeButtonTextActiveStart,
                ]}>
                Точка старта
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modeButton,
                selectionMode === 'finish' && styles.modeButtonActiveFinish,
                pressed && styles.modeButtonPressed,
              ]}
              onPress={() => setSelectionMode('finish')}>
              <Text
                style={[
                  styles.modeButtonText,
                  selectionMode === 'finish' && styles.modeButtonTextActiveFinish,
                ]}>
                Точка финиша
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={[styles.bottomOverlay, { paddingBottom: 16 }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            !canStartRoute && styles.startButtonDisabled,
            pressed && canStartRoute && styles.startButtonPressed,
          ]}
          onPress={startNavigation}
          disabled={!canStartRoute}>
          <Text style={[styles.startButtonText, !canStartRoute && styles.startButtonTextDisabled]}>Начать</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  topPanel: {
    gap: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppTheme.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppTheme.borderStrong,
  },
  modeButtonPressed: {
    opacity: 0.88,
  },
  modeButtonActiveStart: {
    backgroundColor: AppTheme.primary,
    borderColor: AppTheme.primary,
  },
  modeButtonActiveFinish: {
    backgroundColor: AppTheme.red,
    borderWidth: 2,
    borderColor: AppTheme.mapPointFinish,
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: AppTheme.mutedForeground,
  },
  modeButtonTextActiveStart: {
    color: AppTheme.primaryForeground,
    fontWeight: '600',
  },
  modeButtonTextActiveFinish: {
    color: AppTheme.foreground,
    fontWeight: '600',
  },
  secondaryButton: {
    minHeight: 44,
    backgroundColor: AppTheme.secondary,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AppTheme.borderStrong,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonText: {
    color: AppTheme.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  startButton: {
    minHeight: 56,
    backgroundColor: AppTheme.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonDisabled: {
    backgroundColor: AppTheme.secondary,
    opacity: 0.65,
  },
  startButtonPressed: {
    opacity: 0.88,
  },
  startButtonText: {
    color: AppTheme.primaryForeground,
    fontSize: 18,
    fontWeight: '800',
  },
  startButtonTextDisabled: {
    color: AppTheme.mutedForeground,
  },
});
