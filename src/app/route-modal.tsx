import { AppTheme } from '@/constants/theme';
import { deleteSavedRoute, getSavedRouteById, renameSavedRoute } from '@/entities/route';
import {
  maplibreRouteLineLayerStyle,
  maplibreStartFinishCircleLayerStyle,
} from '@/shared/config/maplibre-layers';
import { MAPLIBRE_OSM_STYLE } from '@/shared/config/maplibre-osm-style';
import {
  appleMapsCameraFromRoutePoints,
  fallbackAppleMapsCamera,
} from '@/shared/lib/apple-maps-camera';
import { formatDateRuDayMonthYear } from '@/shared/lib/format-date-ru';
import { getAndroidMapLibre } from '@/shared/lib/maplibre-android';
import {
  geoJsonLineStringFromRoutePoints,
  geoJsonStartFinishMarkers,
} from '@/shared/lib/route-geojson';
import { buildRouteShareMessage } from '@/shared/lib/route-share-message';
import { firstRouterParam } from '@/shared/lib/router-param';
import type { CameraStop } from '@maplibre/maplibre-react-native';
import { lineString } from '@turf/helpers';
import length from '@turf/length';
import { AppleMaps } from 'expo-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RouteModalScreen() {
  const MapLibre = getAndroidMapLibre();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { routeId } = useLocalSearchParams<{ routeId?: string | string[] }>();
  const normalizedRouteId = firstRouterParam(routeId);
  const decodedRouteId = normalizedRouteId ? decodeURIComponent(normalizedRouteId) : undefined;

  const [route, setRoute] = useState<Awaited<ReturnType<typeof getSavedRouteById>>>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!decodedRouteId) {
        setLoading(false);
        return;
      }
      const data = await getSavedRouteById(decodedRouteId);
      if (!active) return;
      setRoute(data ?? null);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [decodedRouteId]);

  const previewCamera = useMemo(() => {
    if (!route || route.route.length < 2) {
      return fallbackAppleMapsCamera(11);
    }
    return appleMapsCameraFromRoutePoints(route.route) ?? fallbackAppleMapsCamera(11);
  }, [route]);

  const androidCenterCoordinate = useMemo(() => {
    return [previewCamera.coordinates.longitude, previewCamera.coordinates.latitude];
  }, [previewCamera]);
  const androidCameraStop = useMemo((): CameraStop => {
    if (!route || route.route.length < 2) {
      return {
        centerCoordinate: androidCenterCoordinate as [number, number],
        zoomLevel: previewCamera.zoom,
        animationDuration: 0,
        animationMode: 'moveTo',
      };
    }
    const latitudes = route.route.map((point) => point.latitude);
    const longitudes = route.route.map((point) => point.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const latPad = Math.max((maxLat - minLat) * 0.12, 0.002);
    const lonPad = Math.max((maxLon - minLon) * 0.12, 0.002);
    return {
      bounds: {
        ne: [maxLon + lonPad, maxLat + latPad],
        sw: [minLon - lonPad, minLat - latPad],
        paddingTop: 28,
        paddingBottom: 28,
        paddingLeft: 28,
        paddingRight: 28,
      },
      animationDuration: 0,
      animationMode: 'moveTo',
    };
  }, [androidCenterCoordinate, previewCamera.zoom, route]);

  const androidRouteLine = useMemo(() => {
    if (!route) return null;
    if (route.route.length === 0) return null;
    return geoJsonLineStringFromRoutePoints(route.route);
  }, [route]);

  const androidRoutePoints = useMemo(() => {
    if (!route) return null;
    return geoJsonStartFinishMarkers(route.start, route.finish);
  }, [route]);
  const totalRouteLengthKm = useMemo(() => {
    if (!route || route.route.length < 2) return 0;
    const coordinates = route.route.map((point) => [point.longitude, point.latitude]);
    return length(lineString(coordinates), { units: 'kilometers' });
  }, [route]);

  const confirmRename = async () => {
    if (!route) return;
    const nextTitle = editingTitle.trim();
    if (!nextTitle || nextTitle === route.title) {
      setEditing(false);
      setEditingTitle('');
      return;
    }
    const updated = await renameSavedRoute(route.id, nextTitle);
    if (updated) setRoute(updated);
    setEditing(false);
    setEditingTitle('');
  };

  const removeRoute = async () => {
    if (!route) return;
    await deleteSavedRoute(route.id);
    router.back();
  };

  const shareRoute = async () => {
    if (!route) return;
    const message = buildRouteShareMessage(route);
    try {
      await Share.share({ message, title: route.title });
    } catch {

    }
  };

  return (
    <View style={styles.screen}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.modalCard, { marginBottom: Math.max(insets.bottom, 12) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          contentContainerStyle={styles.container}>
          {loading && <Text style={styles.statusText}>Загрузка...</Text>}

          {!loading && !route && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Маршрут не найден</Text>
              <Pressable style={styles.primaryButton} onPress={() => router.back()}>
                <Text style={styles.primaryButtonText}>Назад</Text>
              </Pressable>
            </View>
          )}

          {!loading && route && (
            <>
              <View style={styles.titleRow}>
                {editing ? (
                  <TextInput
                    style={styles.titleInput}
                    value={editingTitle}
                    onChangeText={setEditingTitle}
                    placeholder="Название маршрута"
                    placeholderTextColor={AppTheme.mutedForeground}
                    autoFocus
                    returnKeyType="done"
                    onBlur={confirmRename}
                    onSubmitEditing={confirmRename}
                  />
                ) : (
                  <Pressable
                    style={styles.titlePressable}
                    onPress={() => {
                      setEditing(true);
                      setEditingTitle(route.title);
                    }}>
                    <Text style={styles.title}>{route.title}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.closeIconButton} onPress={() => router.back()}>
                  <Text style={styles.closeIconText}>×</Text>
                </Pressable>
              </View>

              <Text style={styles.meta}>
                Старт: {route.start.lat.toFixed(5)}, {route.start.lon.toFixed(5)}
              </Text>
              <Text style={styles.meta}>
                Финиш: {route.finish.lat.toFixed(5)}, {route.finish.lon.toFixed(5)}
              </Text>
              <Text style={styles.meta}>Реки: {route.rivers.join(', ') || 'Не определены'}</Text>
              <Text style={styles.meta}>
                Страны: {route.countries && route.countries.length > 0 ? route.countries.join(', ') : 'Не определены'}
              </Text>
              <Text style={styles.meta}>Длина маршрута: {totalRouteLengthKm.toFixed(2)} км</Text>
              <Text style={styles.meta}>
                Пройдено: {Math.max(0, route.coveredDistanceKm ?? 0).toFixed(2)} км
              </Text>
              <Text style={styles.meta}>Дата: {formatDateRuDayMonthYear(route.createdAt)}</Text>

              {Platform.OS === 'android' && MapLibre ? (
                <MapLibre.MapView style={styles.previewMap} mapStyle={MAPLIBRE_OSM_STYLE} logoEnabled={false}>
                  <MapLibre.Camera {...androidCameraStop} />
                  {androidRouteLine && (
                    <MapLibre.ShapeSource id="route-modal-line-source" shape={androidRouteLine}>
                      <MapLibre.LineLayer id="route-modal-line-layer" style={maplibreRouteLineLayerStyle} />
                    </MapLibre.ShapeSource>
                  )}
                  {androidRoutePoints && (
                    <MapLibre.ShapeSource id="route-modal-points-source" shape={androidRoutePoints}>
                      <MapLibre.CircleLayer
                        id="route-modal-points-layer"
                        style={maplibreStartFinishCircleLayerStyle}
                      />
                    </MapLibre.ShapeSource>
                  )}
                </MapLibre.MapView>
              ) : (
                <AppleMaps.View
                  style={styles.previewMap}
                  cameraPosition={previewCamera}
                  polylines={[
                    {
                      coordinates: route.route,
                      color: AppTheme.mapRouteLine,
                      width: 4,
                    },
                  ]}
                  markers={[
                    {
                      id: 'start',
                      coordinates: {
                        latitude: route.start.lat,
                        longitude: route.start.lon,
                      },
                      title: 'Старт',
                      tintColor: AppTheme.mapPointStart,
                    },
                    {
                      id: 'finish',
                      coordinates: {
                        latitude: route.finish.lat,
                        longitude: route.finish.lon,
                      },
                      title: 'Финиш',
                      tintColor: AppTheme.mapPointFinish,
                    },
                  ]}
                />
              )}

              <View style={styles.actions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() =>
                    router.replace({
                      pathname: '/map',
                      params: { savedRouteId: route.id },
                    })
                  }>
                  <Text style={styles.primaryButtonText}>Продолжить маршрут</Text>
                </Pressable>
                <View style={styles.shareDeleteRow}>
                  <Pressable
                    style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
                    onPress={() => void shareRoute()}>
                    <Text style={styles.shareButtonText} numberOfLines={1}>
                      Поделиться
                    </Text>
                  </Pressable>
                  <Pressable style={styles.deleteButton} onPress={removeRoute}>
                    <Text style={styles.deleteButtonText} numberOfLines={1}>
                      Удалить
                    </Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppTheme.overlayScrim,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 72,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    paddingTop: 12,
    maxHeight: '100%',
    backgroundColor: AppTheme.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
    overflow: 'hidden',
  },
  container: {
    paddingHorizontal: 14,
    gap: 10,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titlePressable: {
    flex: 1,
  },
  statusText: {
    color: AppTheme.mutedForeground,
    fontSize: 16,
  },
  emptyCard: {
    backgroundColor: AppTheme.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
    padding: 14,
    gap: 10,
  },
  emptyTitle: {
    color: AppTheme.foreground,
    fontSize: 20,
    fontWeight: '800',
  },
  title: {
    color: AppTheme.foreground,
    fontSize: 24,
    fontWeight: '800',
    minHeight: 34,
    paddingVertical: 2,
  },
  titleInput: {
    flex: 1,
    color: AppTheme.foreground,
    fontSize: 24,
    fontWeight: '800',
    minHeight: 34,
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderWidth: 0,
  },
  meta: {
    color: AppTheme.mutedForeground,
    fontSize: 15,
  },
  closeIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
    backgroundColor: AppTheme.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    color: AppTheme.foreground,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '800',
  },
  previewMap: {
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
  },
  actions: {
    marginTop: 6,
    gap: 10,
  },
  shareDeleteRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  shareButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppTheme.secondary,
    borderWidth: 1,
    borderColor: AppTheme.borderStrong,
  },
  shareButtonPressed: {
    opacity: 0.88,
  },
  shareButtonText: {
    color: AppTheme.foreground,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 56,
    backgroundColor: AppTheme.primary,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: AppTheme.primaryForeground,
    fontSize: 18,
    fontWeight: '800',
  },
  deleteButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: AppTheme.deleteBackground,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: AppTheme.deleteForeground,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
