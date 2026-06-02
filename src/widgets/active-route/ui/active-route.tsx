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
import { useRustoreReviewOnFirstBuiltRoute } from '@/features/app-review';
import { useRiverRoute } from '@/features/route-tracking';
import { DEFAULT_MAP_REGION_CENTER } from '@/shared/config/map-defaults';
import {
  maplibreRouteLineLayerStyle,
  maplibreRouteMarkersCircleLayerStyle,
} from '@/shared/config/maplibre-layers';
import { MAPLIBRE_OSM_STYLE } from '@/shared/config/maplibre-osm-style';
import { appleMapsCameraFromRoutePoints } from '@/shared/lib/apple-maps-camera';
import { getReliableCurrentPositionAsync } from '@/shared/lib/get-reliable-current-position';
import { getAndroidMapLibre } from '@/shared/lib/maplibre-android';
import {
  geoJsonFeatureCollectionForMarkers,
  geoJsonLineStringFromRoutePoints,
} from '@/shared/lib/route-geojson';
import { resolveRouteCountries } from '@/shared/lib/route-countries';
import { firstRouterParam } from '@/shared/lib/router-param';
import type { CameraStop } from '@maplibre/maplibre-react-native';
import along from '@turf/along';
import { lineString, point } from '@turf/helpers';
import length from '@turf/length';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import * as Location from 'expo-location';
import { AppleMaps } from 'expo-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const FAKE_ROUTE_PROGRESS_FOR_TEST: number | null = __DEV__ ? 0.73 : null;
const MAP_ROUTE_LINE_REMAINING = 'rgba(43, 122, 75, 0.55)';

export default function ActiveRouteWidget() {
  const MapLibre = getAndroidMapLibre();
  const router = useRouter();
  const params = useLocalSearchParams<{
    startLat?: string | string[];
    startLon?: string | string[];
    finishLat?: string | string[];
    finishLon?: string | string[];
    savedRouteId?: string;
  }>();
  const normalizedParamSavedRouteId = useMemo(
    () => firstRouterParam(params.savedRouteId),
    [params.savedRouteId]
  );
  const normalizedStartLat = useMemo(() => firstRouterParam(params.startLat), [params.startLat]);
  const normalizedStartLon = useMemo(() => firstRouterParam(params.startLon), [params.startLon]);
  const normalizedFinishLat = useMemo(() => firstRouterParam(params.finishLat), [params.finishLat]);
  const normalizedFinishLon = useMemo(() => firstRouterParam(params.finishLon), [params.finishLon]);
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
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);

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
        ? length(lineString(routeCoordinates), { units: 'kilometers' })
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
  const shouldRequestRustoreReview =
    !resolvedSavedRouteId &&
    !loading &&
    !savedRouteLoading &&
    !error &&
    hasCompleteRouteData;
  useRustoreReviewOnFirstBuiltRoute({ enabled: shouldRequestRustoreReview });
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
  const gpsSignal = useMemo(() => {
    if (gpsAccuracyMeters == null || !Number.isFinite(gpsAccuracyMeters)) {
      return { label: 'GPS: поиск', bars: '▱▱▱' };
    }
    if (gpsAccuracyMeters <= 10) return { label: `GPS: сильный (${Math.round(gpsAccuracyMeters)}м)`, bars: '▰▰▰' };
    if (gpsAccuracyMeters <= 25) return { label: `GPS: средний (${Math.round(gpsAccuracyMeters)}м)`, bars: '▰▰▱' };
    return { label: `GPS: слабый (${Math.round(gpsAccuracyMeters)}м)`, bars: '▰▱▱' };
  }, [gpsAccuracyMeters]);
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
    if (hasRoute && effectiveRoutePoints.length > 1) {
      const fromRoute = appleMapsCameraFromRoutePoints(effectiveRoutePoints);
      if (fromRoute) return fromRoute;
    }
    return {
      coordinates: effectiveStartPoint ?? { ...DEFAULT_MAP_REGION_CENTER },
      zoom: 14,
    };
  }, [effectiveStartPoint, hasRoute, routeIdentity]);

  const androidCameraStop = useMemo((): CameraStop => {
    const panelBottomPad = Platform.OS === 'android' ? 200 : 220;
    if (hasRoute && effectiveRoutePoints.length > 1) {
      const latitudes = effectiveRoutePoints.map((p) => p.latitude);
      const longitudes = effectiveRoutePoints.map((p) => p.longitude);
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const minLon = Math.min(...longitudes);
      const maxLon = Math.max(...longitudes);
      const latPad = Math.max((maxLat - minLat) * 0.1, 0.002);
      const lonPad = Math.max((maxLon - minLon) * 0.1, 0.002);
      return {
        bounds: {
          ne: [maxLon + lonPad, maxLat + latPad],
          sw: [minLon - lonPad, minLat - latPad],
          paddingTop: 56,
          paddingBottom: panelBottomPad,
          paddingLeft: 20,
          paddingRight: 20,
        },
        animationDuration: 0,
        animationMode: 'moveTo',
      };
    }
    const lat = effectiveStartPoint?.latitude ?? DEFAULT_MAP_REGION_CENTER.latitude;
    const lon = effectiveStartPoint?.longitude ?? DEFAULT_MAP_REGION_CENTER.longitude;
    return {
      centerCoordinate: [lon, lat],
      zoomLevel: 14,
      animationDuration: 0,
      animationMode: 'moveTo',
    };
  }, [effectiveStartPoint?.latitude, effectiveStartPoint?.longitude, hasRoute, routeIdentity]);

  const androidRouteLine = useMemo(
    () => geoJsonLineStringFromRoutePoints(effectiveRoutePoints),
    [effectiveRoutePoints]
  );
  const segmentedRoutePoints = useMemo(() => {
    if (effectiveRoutePoints.length < 2 || totalDistance <= 0) {
      return { covered: [] as RoutePoint[], remaining: [] as RoutePoint[] };
    }
    const clampedCovered = Math.max(0, Math.min(totalDistance, distanceCovered));
    if (clampedCovered <= 0) {
      return { covered: [] as RoutePoint[], remaining: effectiveRoutePoints };
    }
    if (clampedCovered >= totalDistance) {
      return { covered: effectiveRoutePoints, remaining: [] as RoutePoint[] };
    }

    const line = lineString(routeCoordinates);
    const splitPoint = along(line, Math.min(clampedCovered, totalDistance * 0.999999), {
      units: 'kilometers',
    });
    const [splitLon, splitLat] = splitPoint.geometry.coordinates as [number, number];
    const splitRoutePoint: RoutePoint = { latitude: splitLat, longitude: splitLon };

    const covered: RoutePoint[] = [effectiveRoutePoints[0]];
    let consumedKm = 0;
    let splitInserted = false;

    for (let i = 1; i < effectiveRoutePoints.length; i += 1) {
      const prev = effectiveRoutePoints[i - 1];
      const curr = effectiveRoutePoints[i];
      const segKm = length(
        lineString([
          [prev.longitude, prev.latitude],
          [curr.longitude, curr.latitude],
        ]),
        { units: 'kilometers' }
      );
      if (consumedKm + segKm < clampedCovered) {
        covered.push(curr);
        consumedKm += segKm;
        continue;
      }
      covered.push(splitRoutePoint);
      splitInserted = true;
      break;
    }

    if (!splitInserted) {
      return { covered: effectiveRoutePoints, remaining: [] as RoutePoint[] };
    }

    const coveredLast = covered[covered.length - 1];
    const remainingStartIndex = effectiveRoutePoints.findIndex(
      (point) => point.latitude === coveredLast.latitude && point.longitude === coveredLast.longitude
    );
    const remaining =
      remainingStartIndex >= 0
        ? effectiveRoutePoints.slice(remainingStartIndex)
        : [splitRoutePoint, ...effectiveRoutePoints.slice(Math.max(1, covered.length - 1))];

    if (
      remaining.length > 0 &&
      (remaining[0].latitude !== splitRoutePoint.latitude ||
        remaining[0].longitude !== splitRoutePoint.longitude)
    ) {
      remaining.unshift(splitRoutePoint);
    }

    return { covered, remaining };
  }, [distanceCovered, effectiveRoutePoints, routeCoordinates, totalDistance]);
  const androidCoveredRouteLine = useMemo(
    () => geoJsonLineStringFromRoutePoints(segmentedRoutePoints.covered),
    [segmentedRoutePoints.covered]
  );
  const androidRemainingRouteLine = useMemo(
    () => geoJsonLineStringFromRoutePoints(segmentedRoutePoints.remaining),
    [segmentedRoutePoints.remaining]
  );

  const androidRouteMarkers = useMemo(() => {
    const markers: Array<{
      role: 'start' | 'finish' | 'user';
      longitude: number;
      latitude: number;
    }> = [];
    if (effectiveStartPoint) {
      markers.push({
        role: 'start',
        longitude: effectiveStartPoint.longitude,
        latitude: effectiveStartPoint.latitude,
      });
    }
    if (effectiveFinishPoint) {
      markers.push({
        role: 'finish',
        longitude: effectiveFinishPoint.longitude,
        latitude: effectiveFinishPoint.latitude,
      });
    }
    if (userLocationPoint) {
      markers.push({
        role: 'user',
        longitude: userLocationPoint.longitude,
        latitude: userLocationPoint.latitude,
      });
    }
    return geoJsonFeatureCollectionForMarkers(markers);
  }, [effectiveFinishPoint, effectiveStartPoint, userLocationPoint]);

  const updateDistances = useCallback(
    (coords: Location.LocationObjectCoords) => {
      if (routeCoordinates.length < 2) return;
      const currentPoint = point([coords.longitude, coords.latitude]);
      const line = lineString(routeCoordinates);
      const snapped = nearestPointOnLine(line, currentPoint, { units: 'kilometers' });
      const rawCovered = snapped.properties.location;
      const covered = Math.max(0, Math.min(totalDistance, Number(rawCovered) || 0));
      setDistanceCovered(covered);
      const remaining = totalDistance - covered;
      setDistanceRemaining(remaining > 0 ? remaining : 0);
      setUserLocationPoint({ latitude: coords.latitude, longitude: coords.longitude });
      if (typeof coords.accuracy === 'number' && Number.isFinite(coords.accuracy)) {
        setGpsAccuracyMeters(coords.accuracy);
      }
    },
    [routeCoordinates, totalDistance]
  );

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      if (loading || routeCoordinates.length < 2) return;
      if (FAKE_ROUTE_PROGRESS_FOR_TEST != null) return;

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
      setGpsAccuracyMeters(null);
      progressAnim.setValue(0);
      if (!loading) {
        setLocationStatusError(false);
        setLocationStatusMessage('');
      }
    }
  }, [loading, hasRoute, progressAnim]);

  useEffect(() => {
    setDistanceCovered(0);
    setDistanceRemaining(0);
    progressAnim.setValue(0);
  }, [progressAnim, routeIdentity]);

  useEffect(() => {
    if (FAKE_ROUTE_PROGRESS_FOR_TEST == null) return;
    if (loading || routeCoordinates.length < 2 || totalDistance <= 0) return;
    const line = lineString(routeCoordinates);
    const kmAlong = Math.min(
      totalDistance * FAKE_ROUTE_PROGRESS_FOR_TEST,
      totalDistance * 0.999999
    );
    const pt = along(line, kmAlong, { units: 'kilometers' });
    const [lon, lat] = pt.geometry.coordinates;
    const fakeCoords: Location.LocationObjectCoords = {
      latitude: lat,
      longitude: lon,
      altitude: null,
      accuracy: 12,
      altitudeAccuracy: null,
      heading: null,
      speed: 0,
    };
    updateDistances(fakeCoords);
  }, [loading, routeCoordinates, routeIdentity, totalDistance, updateDistances]);

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
    let active = true;
    (async () => {
      try {
        const countries = await resolveRouteCountries({
          start: routeStart,
          finish: routeFinish,
          route: effectiveRoutePoints,
        });
        const savedRoute = await upsertSavedRoute({
          start: routeStart,
          finish: routeFinish,
          rivers,
          countries,
          route: effectiveRoutePoints,
        });
        if (!active) return;
        await setActiveRouteId(savedRoute.id);
        if (!active) return;
        setSaveStatus('saved');
      } catch {
        if (!active) return;
        setSaveStatus('error');
      }
    })();
    return () => {
      active = false;
    };
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
      <View style={styles.gpsBadgeWrap} pointerEvents="none">
        <View style={styles.gpsBadge}>
          <Text style={styles.gpsBars}>{gpsSignal.bars}</Text>
          <Text style={styles.gpsText}>{gpsSignal.label}</Text>
        </View>
      </View>
      {Platform.OS === 'android' && MapLibre ? (
        <MapLibre.MapView style={styles.map} mapStyle={MAPLIBRE_OSM_STYLE} logoEnabled={false}>
          <MapLibre.Camera {...androidCameraStop} />
          {segmentedRoutePoints.remaining.length > 1 && (
            <MapLibre.ShapeSource id="active-route-line-remaining-source" shape={androidRemainingRouteLine}>
              <MapLibre.LineLayer
                id="active-route-line-remaining-layer"
                style={{ ...maplibreRouteLineLayerStyle, lineColor: MAP_ROUTE_LINE_REMAINING }}
              />
            </MapLibre.ShapeSource>
          )}
          {segmentedRoutePoints.covered.length > 1 && (
            <MapLibre.ShapeSource id="active-route-line-source" shape={androidCoveredRouteLine}>
              <MapLibre.LineLayer id="active-route-line-layer" style={maplibreRouteLineLayerStyle} />
            </MapLibre.ShapeSource>
          )}
          {androidRouteMarkers.features.length > 0 && (
            <MapLibre.ShapeSource id="active-route-points-source" shape={androidRouteMarkers}>
              <MapLibre.CircleLayer
                id="active-route-points-layer"
                style={maplibreRouteMarkersCircleLayerStyle}
              />
            </MapLibre.ShapeSource>
          )}
        </MapLibre.MapView>
      ) : (
        <AppleMaps.View
          style={styles.map}
          cameraPosition={cameraPosition}
          properties={{ isMyLocationEnabled: false }}
          polylines={[
            ...(segmentedRoutePoints.remaining.length > 1
              ? [
                {
                  coordinates: segmentedRoutePoints.remaining,
                  color: MAP_ROUTE_LINE_REMAINING,
                  width: 4,
                },
              ]
              : []),
            ...(segmentedRoutePoints.covered.length > 1
              ? [
                {
                  coordinates: segmentedRoutePoints.covered,
                  color: AppTheme.mapRouteLine,
                  width: 4,
                },
              ]
              : []),
          ]}
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
            ...(userLocationPoint
              ? [
                {
                  id: 'user',
                  coordinates: userLocationPoint,
                  title: 'Вы здесь',
                  tintColor: AppTheme.mapUserOrLineBlue,
                },
              ]
              : []),
          ]}
        />
      )}
      <View style={styles.infoPanel}>
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
  gpsBadgeWrap: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 18 : 56,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(30, 30, 30, 0.72)',
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gpsBars: {
    color: AppTheme.mapPointStart,
    fontSize: 13,
    fontWeight: '700',
  },
  gpsText: {
    color: AppTheme.foreground,
    fontSize: 12,
    fontWeight: '600',
  },
  infoPanel: {
    position: 'absolute',
    bottom: Platform.OS === 'android' ? 20 : 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(30, 30, 30, 0.83)',
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
    padding: 10,
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
