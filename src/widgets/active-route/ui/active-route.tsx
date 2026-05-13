import { AppTheme } from '@/constants/theme';
import {
  getActiveRouteId,
  getPendingRouteSelection,
  getSavedRouteById,
  RoutePoint,
  setActiveRouteId,
  setPendingRouteSelection,
  upsertSavedRoute,
} from '@/entities/route';
import { useRiverRoute } from '@/features/route-tracking';
import { MAPLIBRE_OSM_STYLE } from '@/shared/config/maplibre-osm-style';
import { getReliableCurrentPositionAsync } from '@/shared/lib/get-reliable-current-position';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import { AppleMaps } from 'expo-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ActiveRouteWidget() {
  const MapLibre = Platform.OS === 'android' ? require('@maplibre/maplibre-react-native') : null;
  const router = useRouter();
  const params = useLocalSearchParams<{
    startLat?: string | string[];
    startLon?: string | string[];
    finishLat?: string | string[];
    finishLon?: string | string[];
    savedRouteId?: string;
  }>();
  const getParamValue = useCallback((value?: string | string[]) => {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
  }, []);
  const normalizedParamSavedRouteId = useMemo(() => {
    if (!params.savedRouteId) return undefined;
    return Array.isArray(params.savedRouteId) ? params.savedRouteId[0] : params.savedRouteId;
  }, [params.savedRouteId]);
  const normalizedStartLat = useMemo(() => getParamValue(params.startLat), [getParamValue, params.startLat]);
  const normalizedStartLon = useMemo(() => getParamValue(params.startLon), [getParamValue, params.startLon]);
  const normalizedFinishLat = useMemo(() => getParamValue(params.finishLat), [getParamValue, params.finishLat]);
  const normalizedFinishLon = useMemo(() => getParamValue(params.finishLon), [getParamValue, params.finishLon]);
  const [pendingSelection, setPendingSelection] = useState<{
    start: { lat: number; lon: number };
    finish: { lat: number; lon: number };
  } | null>(null);
  const [resolvedSavedRouteId, setResolvedSavedRouteId] = useState<string | null>(
    normalizedParamSavedRouteId ?? null
  );
  const startLat = Number(normalizedStartLat ?? pendingSelection?.start.lat);
  const startLon = Number(normalizedStartLon ?? pendingSelection?.start.lon);
  const finishLat = Number(normalizedFinishLat ?? pendingSelection?.finish.lat);
  const finishLon = Number(normalizedFinishLon ?? pendingSelection?.finish.lon);
  const hasSelectedPoints =
    Number.isFinite(startLat) &&
    Number.isFinite(startLon) &&
    Number.isFinite(finishLat) &&
    Number.isFinite(finishLon);
  const startPoint = useMemo(
    () => (hasSelectedPoints ? { latitude: startLat, longitude: startLon } : null),
    [hasSelectedPoints, startLat, startLon]
  );
  const finishPoint = useMemo(
    () => (hasSelectedPoints ? { latitude: finishLat, longitude: finishLon } : null),
    [hasSelectedPoints, finishLat, finishLon]
  );
  const routeStart = useMemo(
    () =>
      resolvedSavedRouteId
        ? null
        : startPoint
          ? { lat: startPoint.latitude, lon: startPoint.longitude }
          : null,
    [resolvedSavedRouteId, startPoint]
  );
  const routeFinish = useMemo(
    () =>
      resolvedSavedRouteId
        ? null
        : finishPoint
          ? { lat: finishPoint.latitude, lon: finishPoint.longitude }
          : null,
    [finishPoint, resolvedSavedRouteId]
  );
  const [distanceCovered, setDistanceCovered] = useState(0);
  const [distanceRemaining, setDistanceRemaining] = useState(0);
  const [userLocationPoint, setUserLocationPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [savedRoutePoints, setSavedRoutePoints] = useState<RoutePoint[]>([]);
  const [savedRivers, setSavedRivers] = useState<string[]>([]);
  const [savedStartPoint, setSavedStartPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [savedFinishPoint, setSavedFinishPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [savedRouteLoading, setSavedRouteLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [locationStatusMessage, setLocationStatusMessage] = useState<string>('');
  const [locationStatusError, setLocationStatusError] = useState(false);
  const [routeRetryToken, setRouteRetryToken] = useState(0);
  const { route: routePoints, rivers, loading, error, loadingStatus } = useRiverRoute(
    routeStart,
    routeFinish,
    routeRetryToken
  );
  const effectiveRoutePoints = resolvedSavedRouteId ? savedRoutePoints : routePoints;
  const routeCoordinates = useMemo(
    () => effectiveRoutePoints.map((point) => [point.longitude, point.latitude]),
    [effectiveRoutePoints]
  );
  const totalDistance = useMemo(
    () =>
      routeCoordinates.length > 1
        ? turf.length(turf.lineString(routeCoordinates), { units: 'kilometers' })
        : 0,
    [routeCoordinates]
  );
  const hasRoute = effectiveRoutePoints.length > 1;
  const hasCompleteRouteData = useMemo(
    () =>
      effectiveRoutePoints.length > 1 &&
      effectiveRoutePoints.every(
        (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
      ),
    [effectiveRoutePoints]
  );
  const progressRatio = useMemo(() => {
    if (!hasRoute || totalDistance <= 0) return 0;
    const rawValue = distanceCovered / totalDistance;
    return Math.max(0, Math.min(1, rawValue));
  }, [distanceCovered, hasRoute, totalDistance]);
  const progressPercent = useMemo(() => Math.round(progressRatio * 100), [progressRatio]);
  const formatDistanceKm = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '0.00';
    if (value < 1) return value.toFixed(3);
    return value.toFixed(2);
  }, []);
  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const progressWidth = useMemo(
    () =>
      progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    [progressAnim]
  );
  const effectiveStartPoint = startPoint ?? savedStartPoint;
  const effectiveFinishPoint = finishPoint ?? savedFinishPoint;
  const hasAnySelectedPoints = hasSelectedPoints || !!resolvedSavedRouteId;
  const canRetryRouteLoading = !loading && !savedRouteLoading && !hasRoute && hasAnySelectedPoints && !!error;
  const handleRetryRouteLoading = useCallback(() => {
    setRouteRetryToken((current) => current + 1);
  }, []);
  const routeIdentity = useMemo(() => {
    if (!hasRoute) return 'no-route';
    const first = effectiveRoutePoints[0];
    const last = effectiveRoutePoints[effectiveRoutePoints.length - 1];
    return `${effectiveRoutePoints.length}:${first.latitude},${first.longitude}:${last.latitude},${last.longitude}`;
  }, [effectiveRoutePoints, hasRoute]);
  const cameraPosition = useMemo(() => {
    if (hasRoute) {
      const latitudes = effectiveRoutePoints.map((point) => point.latitude);
      const longitudes = effectiveRoutePoints.map((point) => point.longitude);
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLon = Math.min(...longitudes);
      const maxLon = Math.max(...longitudes);
      const latSpan = Math.max(0.0001, maxLat - minLat);
      const lonSpan = Math.max(0.0001, maxLon - minLon);
      const maxSpan = Math.max(latSpan, lonSpan);

      let zoom = 12;
      if (maxSpan < 0.01) zoom = 14;
      else if (maxSpan < 0.03) zoom = 13;
      else if (maxSpan < 0.08) zoom = 12;
      else if (maxSpan < 0.16) zoom = 11;
      else zoom = 10;

      return {
        coordinates: {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLon + maxLon) / 2,
        },
        zoom,
      };
    }

    return {
      coordinates: effectiveStartPoint ?? { latitude: 48.67, longitude: 45.29 },
      zoom: 14,
    };
  }, [effectiveRoutePoints, effectiveStartPoint, hasRoute]);
  const cameraCenterCoordinate = useMemo(
    () => [cameraPosition.coordinates.longitude, cameraPosition.coordinates.latitude],
    [cameraPosition]
  );
  const androidRouteLine = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: effectiveRoutePoints.map((point) => [point.longitude, point.latitude]),
      },
    }),
    [effectiveRoutePoints]
  );
  const androidRouteMarkers = useMemo(() => {
    const features: {
      type: 'Feature';
      properties: { role: 'start' | 'finish' | 'user' };
      geometry: { type: 'Point'; coordinates: number[] };
    }[] = [];
    if (effectiveStartPoint) {
      features.push({
        type: 'Feature',
        properties: { role: 'start' },
        geometry: {
          type: 'Point',
          coordinates: [effectiveStartPoint.longitude, effectiveStartPoint.latitude],
        },
      });
    }
    if (effectiveFinishPoint) {
      features.push({
        type: 'Feature',
        properties: { role: 'finish' },
        geometry: {
          type: 'Point',
          coordinates: [effectiveFinishPoint.longitude, effectiveFinishPoint.latitude],
        },
      });
    }
    if (userLocationPoint) {
      features.push({
        type: 'Feature',
        properties: { role: 'user' },
        geometry: {
          type: 'Point',
          coordinates: [userLocationPoint.longitude, userLocationPoint.latitude],
        },
      });
    }
    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [effectiveFinishPoint, effectiveStartPoint, userLocationPoint]);

  const updateDistances = useCallback(
    (coords: Location.LocationObjectCoords) => {
      if (routeCoordinates.length < 2) return;
      const currentPoint = turf.point([coords.longitude, coords.latitude]);
      const line = turf.lineString(routeCoordinates);
      const snapped = turf.nearestPointOnLine(line, currentPoint, { units: 'kilometers' });
      const rawCovered = snapped.properties.location;
      const covered = Math.max(0, Math.min(totalDistance, Number(rawCovered) || 0));
      setDistanceCovered(covered);
      const remaining = totalDistance - covered;
      setDistanceRemaining(remaining > 0 ? remaining : 0);
      setUserLocationPoint({ latitude: coords.latitude, longitude: coords.longitude });
    },
    [routeCoordinates, totalDistance]
  );

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      if (loading || routeCoordinates.length < 2) return;
      setLocationStatusError(false);
      setLocationStatusMessage('Запрашиваем доступ к геолокации...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatusError(true);
        setLocationStatusMessage('Доступ к геолокации не получен. Разрешите доступ и повторите.');
        return;
      }
      const maxAttempts = 3;
      let initialLocation: Location.LocationObject | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          setLocationStatusError(false);
          setLocationStatusMessage(
            attempt === 1
              ? 'Получаем текущие координаты...'
              : `Не удалось получить координаты. Повтор ${attempt}/${maxAttempts}...`
          );
          initialLocation = await getReliableCurrentPositionAsync();
          break;
        } catch {
          if (attempt === maxAttempts) {
            setLocationStatusError(false);
            setLocationStatusMessage(
              'Маршрут построен. Пока не удалось определить позицию, продолжаем попытки...'
            );
          }
        }
      }
      subscription = await Location.watchPositionAsync(
        {
          accuracy:
            Platform.OS === 'android' ? Location.Accuracy.Low : Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          setLocationStatusError(false);
          setLocationStatusMessage('Позиция обновляется каждые 5 секунд.');
          updateDistances(location.coords);
        }
      );
      if (!initialLocation) return;
      setLocationStatusError(false);
      setLocationStatusMessage('Координаты получены. Включаем отслеживание движения...');
      updateDistances(initialLocation.coords);
      setLocationStatusMessage('Отслеживание маршрута активно.');
    })();
    return () => {
      if (subscription) subscription.remove();
    };
  }, [loading, routeCoordinates.length, updateDistances]);

  useEffect(() => {
    if (loading || !hasRoute) {
      setDistanceCovered(0);
      setDistanceRemaining(0);
      progressAnim.setValue(0);
      if (!loading) {
        setLocationStatusError(false);
        setLocationStatusMessage('');
      }
    }
  }, [loading, hasRoute, progressAnim]);

  useEffect(() => {
    // При смене маршрута принудительно сбрасываем прогресс,
    // чтобы исключить визуальный перенос значения с прошлого трека.
    setDistanceCovered(0);
    setDistanceRemaining(0);
    progressAnim.setValue(0);
  }, [progressAnim, routeIdentity]);

  useEffect(() => {
    let active = true;
    (async () => {
      const hasParams =
        normalizedStartLat !== undefined &&
        normalizedStartLon !== undefined &&
        normalizedFinishLat !== undefined &&
        normalizedFinishLon !== undefined;
      if (hasParams || normalizedParamSavedRouteId) {
        setPendingSelection(null);
        return;
      }
      const pending = await getPendingRouteSelection();
      if (!active) return;
      setPendingSelection(pending);
      if (pending) {
        setPendingRouteSelection(null).catch(() => undefined);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    normalizedFinishLat,
    normalizedFinishLon,
    normalizedParamSavedRouteId,
    normalizedStartLat,
    normalizedStartLon,
  ]);

  useEffect(() => {
    let active = true;
    if (normalizedParamSavedRouteId) {
      setResolvedSavedRouteId(normalizedParamSavedRouteId);
      return;
    }
    if (hasSelectedPoints) {
      setResolvedSavedRouteId(null);
      return;
    }
    (async () => {
      const lastRouteId = await getActiveRouteId();
      if (!active) return;
      setResolvedSavedRouteId(lastRouteId);
    })();
    return () => {
      active = false;
    };
  }, [hasSelectedPoints, normalizedParamSavedRouteId]);

  useEffect(() => {
    if (!resolvedSavedRouteId) {
      setSavedRoutePoints([]);
      setSavedRivers([]);
      setSavedStartPoint(null);
      setSavedFinishPoint(null);
      setSavedRouteLoading(false);
      return;
    }
    let active = true;
    setSavedRouteLoading(true);
    (async () => {
      const savedRoute = await getSavedRouteById(resolvedSavedRouteId);
      if (!active) return;
      setSavedRoutePoints(savedRoute?.route ?? []);
      setSavedRivers(savedRoute?.rivers ?? []);
      setSavedStartPoint(savedRoute ? { latitude: savedRoute.start.lat, longitude: savedRoute.start.lon } : null);
      setSavedFinishPoint(savedRoute ? { latitude: savedRoute.finish.lat, longitude: savedRoute.finish.lon } : null);
      setSavedRouteLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [resolvedSavedRouteId]);

  useEffect(() => {
    if (
      !hasCompleteRouteData ||
      !routeStart ||
      !routeFinish ||
      resolvedSavedRouteId ||
      loading ||
      !!error
    ) {
      return;
    }
    upsertSavedRoute({
      start: routeStart,
      finish: routeFinish,
      rivers,
      route: effectiveRoutePoints,
    })
      .then(async (savedRoute) => {
        await setActiveRouteId(savedRoute.id);
        setSaveStatus('saved');
      })
      .catch(() => setSaveStatus('error'));
  }, [effectiveRoutePoints, error, hasCompleteRouteData, loading, resolvedSavedRouteId, rivers, routeFinish, routeStart]);

  useEffect(() => {
    if (!resolvedSavedRouteId) return;
    setActiveRouteId(resolvedSavedRouteId).catch(() => undefined);
  }, [resolvedSavedRouteId]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = setTimeout(() => setSaveStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressRatio,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [progressAnim, progressRatio]);

  return (
    <View style={styles.container}>
      {Platform.OS === 'android' && MapLibre ? (
        <MapLibre.MapView style={styles.map} mapStyle={MAPLIBRE_OSM_STYLE} logoEnabled={false}>
          <MapLibre.Camera
            zoomLevel={cameraPosition.zoom}
            centerCoordinate={cameraCenterCoordinate}
            animationDuration={0}
          />
          {hasRoute && (
            <MapLibre.ShapeSource id="active-route-line-source" shape={androidRouteLine}>
              <MapLibre.LineLayer
                id="active-route-line-layer"
                style={{
                  lineColor: AppTheme.mapRouteLine,
                  lineWidth: 4,
                }}
              />
            </MapLibre.ShapeSource>
          )}
          {androidRouteMarkers.features.length > 0 && (
            <MapLibre.ShapeSource id="active-route-points-source" shape={androidRouteMarkers}>
              <MapLibre.CircleLayer
                id="active-route-points-layer"
                style={{
                  circleRadius: 6,
                  circleColor: [
                    'match',
                    ['get', 'role'],
                    'start',
                    AppTheme.mapPointStart,
                    'finish',
                    AppTheme.mapPointFinish,
                    'user',
                    AppTheme.mapUserLocation,
                    AppTheme.foreground,
                  ],
                  circleStrokeWidth: 2,
                  circleStrokeColor: AppTheme.foreground,
                }}
              />
            </MapLibre.ShapeSource>
          )}
        </MapLibre.MapView>
      ) : (
        <AppleMaps.View
          style={styles.map}
          cameraPosition={cameraPosition}
          properties={{ isMyLocationEnabled: true }}
          polylines={
            hasRoute
              ? [
                {
                  coordinates: effectiveRoutePoints,
                  color: AppTheme.mapRouteLine,
                  width: 4,
                },
              ]
              : []
          }
          markers={[
            ...(effectiveStartPoint
              ? [
                {
                  id: 'start',
                  coordinates: effectiveStartPoint,
                  title: 'Старт',
                  tintColor: AppTheme.mapPointStart,
                },
              ]
              : []),
            ...(effectiveFinishPoint
              ? [
                {
                  id: 'finish',
                  coordinates: effectiveFinishPoint,
                  title: 'Финиш',
                  tintColor: AppTheme.mapPointFinish,
                },
              ]
              : []),
          ]}
        />
      )}
      <View style={styles.infoPanel}>
        {/* {!hasAnySelectedPoints && (
          <Text style={styles.statusText}>Выберите старт и финиш во вкладке «Построить» и нажмите «Начать»</Text>
        )} */}
        {loading && <Text style={styles.statusText}>{loadingStatus ?? 'Строим маршрут...'}</Text>}
        {savedRouteLoading && <Text style={styles.statusText}>Загружаем сохраненный маршрут...</Text>}
        {!loading && !!error && <Text style={styles.errorText}>Ошибка: {error}</Text>}
        {!loading && hasRoute && !!locationStatusMessage && (
          <Text style={locationStatusError ? styles.errorText : styles.statusText}>{locationStatusMessage}</Text>
        )}
        {!loading && hasAnySelectedPoints && !error && !hasRoute && (
          <Text style={styles.statusText}>Маршрут не найден</Text>
        )}
        {canRetryRouteLoading && (
          <>
            <Text style={styles.statusText}>Не удалось получить координаты рек. Попробуйте снова.</Text>
            <Pressable
              style={({ pressed }) => [
                styles.exploreButton,
                pressed && styles.exploreButtonPressed,
              ]}
              onPress={handleRetryRouteLoading}>
              <Text style={styles.exploreButtonText}>Повторить</Text>
            </Pressable>
          </>
        )}
        {!canRetryRouteLoading && !loading && !savedRouteLoading && !hasRoute && (
          <>
            <Text style={styles.statusText}>
              Чтобы начать маршрут, выберите старт и финиш во вкладке «Построить».
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.exploreButton,
                pressed && styles.exploreButtonPressed,
              ]}
              onPress={() => router.navigate('/explore')}>
              <Text style={styles.exploreButtonText}>Построить маршрут</Text>
            </Pressable>
          </>
        )}
        {!!(resolvedSavedRouteId ? savedRivers : rivers).length && (
          <Text style={styles.riverText}>
            Река: {(resolvedSavedRouteId ? savedRivers : rivers).join(', ')}
          </Text>
        )}
        {saveStatus === 'saved' && <Text style={styles.savedText}>Сохранено на устройстве</Text>}
        {saveStatus === 'error' && <Text style={styles.errorText}>Не удалось сохранить маршрут</Text>}
        {hasRoute && (
          <>
            <Text style={styles.infoText}>Пройдено: {formatDistanceKm(distanceCovered)} км</Text>
            <Text style={styles.infoText}>Осталось: {formatDistanceKm(distanceRemaining)} км</Text>
            <Text style={styles.infoText}>Всего: {formatDistanceKm(totalDistance)} км</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressText}>{progressPercent}% маршрута пройдено</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  infoPanel: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 20 : 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.93)',
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  infoText: {
    color: AppTheme.foreground,
    fontSize: 18,
    fontWeight: '800',
  },
  statusText: {
    color: AppTheme.foreground,
    fontSize: 17,
    fontWeight: '400',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: AppTheme.errorSoft,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 14,
    backgroundColor: AppTheme.secondary,
    borderWidth: 1.5,
    borderColor: AppTheme.borderStrong,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: AppTheme.primary,
    borderRadius: 999,
  },
  progressText: {
    color: AppTheme.mutedForeground,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  riverText: {
    color: AppTheme.mapPointStart,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  savedText: {
    color: AppTheme.mutedForeground,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  exploreButton: {
    marginTop: 8,
    minHeight: 58,
    minWidth: 220,
    backgroundColor: AppTheme.primary,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exploreButtonPressed: {
    opacity: 0.85,
  },
  exploreButtonText: {
    color: AppTheme.primaryForeground,
    fontSize: 18,
    fontWeight: '800',
  },
});
