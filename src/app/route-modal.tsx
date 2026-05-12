import { deleteSavedRoute, getSavedRouteById, renameSavedRoute } from '@/entities/route';
import { MAPLIBRE_OSM_STYLE } from '@/shared/config/maplibre-osm-style';
import { AppleMaps } from 'expo-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RouteModalScreen() {
  const MapLibre = Platform.OS === 'android' ? require('@maplibre/maplibre-react-native') : null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { routeId } = useLocalSearchParams<{ routeId?: string | string[] }>();
  const normalizedRouteId = Array.isArray(routeId) ? routeId[0] : routeId;
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

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Неизвестно';
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const previewCamera = useMemo(() => {
    if (!route || route.route.length < 2) {
      return { coordinates: { latitude: 48.67, longitude: 45.29 }, zoom: 11 };
    }
    const latitudes = route.route.map((point) => point.latitude);
    const longitudes = route.route.map((point) => point.longitude);
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
  }, [route]);
  const androidCenterCoordinate = useMemo(() => {
    return [previewCamera.coordinates.longitude, previewCamera.coordinates.latitude];
  }, [previewCamera]);
  const androidRouteLine = useMemo(() => {
    if (!route) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: route.route.map((point) => [point.longitude, point.latitude]),
      },
    };
  }, [route]);
  const androidRoutePoints = useMemo(() => {
    if (!route) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { role: 'start' },
          geometry: {
            type: 'Point' as const,
            coordinates: [route.start.lon, route.start.lat],
          },
        },
        {
          type: 'Feature' as const,
          properties: { role: 'finish' },
          geometry: {
            type: 'Point' as const,
            coordinates: [route.finish.lon, route.finish.lat],
          },
        },
      ],
    };
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

  return (
    <View style={styles.screen}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.modalCard, { marginBottom: Math.max(insets.bottom, 12) }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
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
                    placeholderTextColor="#8A8A8A"
                    autoFocus
                    returnKeyType="done"
                    selection={{ start: editingTitle.length, end: editingTitle.length }}
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
              <Text style={styles.meta}>Дата: {formatDate(route.createdAt)}</Text>

              {Platform.OS === 'android' && MapLibre ? (
                <MapLibre.MapView style={styles.previewMap} mapStyle={MAPLIBRE_OSM_STYLE} logoEnabled={false}>
                  <MapLibre.Camera
                    zoomLevel={previewCamera.zoom}
                    centerCoordinate={androidCenterCoordinate}
                    animationDuration={0}
                  />
                  {androidRouteLine && (
                    <MapLibre.ShapeSource id="route-modal-line-source" shape={androidRouteLine}>
                      <MapLibre.LineLayer
                        id="route-modal-line-layer"
                        style={{
                          lineColor: '#38B6FF',
                          lineWidth: 4,
                        }}
                      />
                    </MapLibre.ShapeSource>
                  )}
                  {androidRoutePoints && (
                    <MapLibre.ShapeSource id="route-modal-points-source" shape={androidRoutePoints}>
                      <MapLibre.CircleLayer
                        id="route-modal-points-layer"
                        style={{
                          circleRadius: 6,
                          circleColor: [
                            'match',
                            ['get', 'role'],
                            'start',
                            '#38B6FF',
                            'finish',
                            '#D93A3A',
                            '#FFFFFF',
                          ],
                          circleStrokeWidth: 2,
                          circleStrokeColor: '#FFFFFF',
                        }}
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
                      color: '#38B6FF',
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
                      tintColor: '#38B6FF',
                    },
                    {
                      id: 'finish',
                      coordinates: {
                        latitude: route.finish.lat,
                        longitude: route.finish.lon,
                      },
                      title: 'Финиш',
                      tintColor: '#D93A3A',
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
                <Pressable style={styles.deleteButton} onPress={removeRoute}>
                  <Text style={styles.deleteButtonText}>Удалить маршрут</Text>
                </Pressable>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 72,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    paddingTop: 12,
    maxHeight: '85%',
    backgroundColor: '#0C2A52',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A4F84',
    overflow: 'hidden',
  },
  container: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
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
    color: '#C7DAF5',
    fontSize: 16,
  },
  emptyCard: {
    backgroundColor: '#12345E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A4F84',
    padding: 14,
    gap: 10,
  },
  emptyTitle: {
    color: '#E6F1FF',
    fontSize: 20,
    fontWeight: '800',
  },
  title: {
    color: '#E6F1FF',
    fontSize: 24,
    fontWeight: '800',
    minHeight: 34,
    paddingVertical: 2,
  },
  titleInput: {
    flex: 1,
    color: '#E6F1FF',
    fontSize: 24,
    fontWeight: '800',
    minHeight: 34,
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderWidth: 0,
  },
  meta: {
    color: '#C7DAF5',
    fontSize: 15,
  },
  closeIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3B5F92',
    backgroundColor: '#12345E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconText: {
    color: '#E6F1FF',
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
  primaryButton: {
    minHeight: 56,
    backgroundColor: '#38B6FF',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  deleteButton: {
    minHeight: 56,
    backgroundColor: '#7D2B2B',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FFDADA',
    fontSize: 18,
    fontWeight: '700',
  },
});
