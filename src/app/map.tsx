// screens/MapScreen.js (финальная версия)
import { useRiverRoute } from '@/hooks/useRiverRoute';
import { getSavedRouteById, SavedRoutePoint, upsertSavedRoute } from '@/storage/routes';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import { AppleMaps } from 'expo-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

export default function MapScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        startLat?: string;
        startLon?: string;
        finishLat?: string;
        finishLon?: string;
        savedRouteId?: string;
    }>();
    const startLat = Number(params.startLat);
    const startLon = Number(params.startLon);
    const finishLat = Number(params.finishLat);
    const finishLon = Number(params.finishLon);
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
            params.savedRouteId
                ? null
                : startPoint
                  ? { lat: startPoint.latitude, lon: startPoint.longitude }
                  : null,
        [params.savedRouteId, startPoint]
    );
    const routeFinish = useMemo(
        () =>
            params.savedRouteId
                ? null
                : finishPoint
                  ? { lat: finishPoint.latitude, lon: finishPoint.longitude }
                  : null,
        [finishPoint, params.savedRouteId]
    );
    const [distanceCovered, setDistanceCovered] = useState(0);
    const [distanceRemaining, setDistanceRemaining] = useState(0);
    const [savedRoutePoints, setSavedRoutePoints] = useState<SavedRoutePoint[]>([]);
    const [savedRivers, setSavedRivers] = useState<string[]>([]);
    const [savedStartPoint, setSavedStartPoint] = useState<{ latitude: number; longitude: number } | null>(
        null
    );
    const [savedFinishPoint, setSavedFinishPoint] = useState<{ latitude: number; longitude: number } | null>(
        null
    );
    const [savedRouteLoading, setSavedRouteLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    // const routePoints = riverRoute.geometry.coordinates.map(([longitude, latitude]) => ({
    //     latitude,
    //     longitude,
    // }));
    const { route: routePoints, rivers, loading, error } = useRiverRoute(routeStart, routeFinish);
    const effectiveRoutePoints = params.savedRouteId ? savedRoutePoints : routePoints;
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
    const progressRatio = useMemo(() => {
        if (!hasRoute || totalDistance <= 0) return 0;
        const rawValue = distanceCovered / totalDistance;
        return Math.max(0, Math.min(1, rawValue));
    }, [distanceCovered, hasRoute, totalDistance]);
    const progressPercent = useMemo(() => Math.round(progressRatio * 100), [progressRatio]);
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
    const hasAnySelectedPoints = hasSelectedPoints || !!params.savedRouteId;
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

    // Функция для расчёта пройденного и оставшегося пути
    const updateDistances = useCallback(
        (coords: Location.LocationObjectCoords) => {
            if (routeCoordinates.length < 2) return;
            const currentPoint = turf.point([coords.longitude, coords.latitude]);
            const line = turf.lineString(routeCoordinates);
            const snapped = turf.nearestPointOnLine(line, currentPoint, { units: 'kilometers' });
            const covered = snapped.properties.location;
            setDistanceCovered(covered);
            const remaining = totalDistance - covered;
            setDistanceRemaining(remaining > 0 ? remaining : 0);
        },
        [routeCoordinates, totalDistance]
    );

    // Запрашиваем разрешения и запускаем отслеживание позиции
    useEffect(() => {
        let subscription: Location.LocationSubscription | null = null;
        (async () => {
            if (loading || routeCoordinates.length < 2) return;
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission to access location was denied');
                return;
            }
            // const testCoords = {
            //     latitude: 48.633749,
            //     longitude: 45.196100,
            //     altitude: 0,
            //     accuracy: 10,
            //     altitudeAccuracy: 5,
            //     heading: 0,
            //     speed: 0,
            // };
            subscription = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
                (location) => updateDistances(location.coords)
                // (location) => updateDistances(testCoords)
            );
        })();
        return () => { if (subscription) subscription.remove(); };
    }, [loading, routeCoordinates.length, updateDistances]);

    useEffect(() => {
        if (loading || !hasRoute) {
            setDistanceCovered(0);
            setDistanceRemaining(0);
        }
    }, [loading, hasRoute]);

    useEffect(() => {
        if (!params.savedRouteId) {
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
            const savedRoute = await getSavedRouteById(params.savedRouteId!);
            if (!active) return;
            setSavedRoutePoints(savedRoute?.route ?? []);
            setSavedRivers(savedRoute?.rivers ?? []);
            setSavedStartPoint(
                savedRoute ? { latitude: savedRoute.start.lat, longitude: savedRoute.start.lon } : null
            );
            setSavedFinishPoint(
                savedRoute ? { latitude: savedRoute.finish.lat, longitude: savedRoute.finish.lon } : null
            );
            setSavedRouteLoading(false);
        })();
        return () => {
            active = false;
        };
    }, [params.savedRouteId]);

    useEffect(() => {
        if (!hasRoute || !routeStart || !routeFinish || params.savedRouteId) return;
        upsertSavedRoute({
            start: routeStart,
            finish: routeFinish,
            rivers,
            route: effectiveRoutePoints,
        })
            .then(() => setSaveStatus('saved'))
            .catch(() => setSaveStatus('error'));
    }, [effectiveRoutePoints, hasRoute, params.savedRouteId, rivers, routeFinish, routeStart]);

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
            <AppleMaps.View
                style={styles.map}
                cameraPosition={cameraPosition}
                properties={{ isMyLocationEnabled: true }}
                polylines={
                    hasRoute
                        ? [
                              {
                                  coordinates: effectiveRoutePoints,
                                  color: '#0066CC',
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
                                  tintColor: '#228B22',
                              },
                          ]
                        : []),
                    ...(effectiveFinishPoint
                        ? [
                              {
                                  id: 'finish',
                                  coordinates: effectiveFinishPoint,
                                  title: 'Финиш',
                                  tintColor: '#FF0000',
                              },
                          ]
                        : []),
                ]}
            />
            {/* Информационная панель */}
            <View style={styles.infoPanel}>
                {!hasAnySelectedPoints && (
                    <Text style={styles.statusText}>Выберите старт и финиш в Explore и нажмите "Начать"</Text>
                )}
                {loading && <Text style={styles.statusText}>Строим маршрут...</Text>}
                {savedRouteLoading && <Text style={styles.statusText}>Загружаем сохраненный маршрут...</Text>}
                {!loading && !!error && <Text style={styles.errorText}>Ошибка: {error}</Text>}
                {!loading && hasAnySelectedPoints && !error && !hasRoute && (
                    <Text style={styles.statusText}>Маршрут не найден</Text>
                )}
                {!loading && !savedRouteLoading && !hasRoute && (
                    <>
                        <Text style={styles.statusText}>
                            Чтобы начать маршрут, выберите старт и финиш во вкладке Explore.
                        </Text>
                        <Pressable
                            style={({ pressed }) => [
                                styles.exploreButton,
                                pressed && styles.exploreButtonPressed,
                            ]}
                            onPress={() => router.navigate('/explore')}>
                            <Text style={styles.exploreButtonText}>Перейти в Explore</Text>
                        </Pressable>
                    </>
                )}
                {!!(params.savedRouteId ? savedRivers : rivers).length && (
                    <Text style={styles.riverText}>
                        Река: {(params.savedRouteId ? savedRivers : rivers).join(', ')}
                    </Text>
                )}
                {saveStatus === 'saved' && <Text style={styles.savedText}>Сохранено на устройстве</Text>}
                {saveStatus === 'error' && <Text style={styles.errorText}>Не удалось сохранить маршрут</Text>}
                {hasRoute && (
                    <>
                        <Text style={styles.infoText}>Пройдено: {distanceCovered.toFixed(2)} км</Text>
                        <Text style={styles.infoText}>Осталось: {distanceRemaining.toFixed(2)} км</Text>
                        <Text style={styles.infoText}>Всего: {totalDistance.toFixed(2)} км</Text>
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
        bottom: 120,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    infoText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    statusText: {
        color: '#FFD166',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 6,
    },
    errorText: {
        color: '#FF6B6B',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 6,
        textAlign: 'center',
    },
    progressTrack: {
        width: '100%',
        height: 10,
        backgroundColor: 'rgba(0, 102, 204, 0.22)',
        borderWidth: 1,
        borderColor: 'rgba(133, 193, 255, 0.45)',
        borderRadius: 999,
        overflow: 'hidden',
        marginTop: 10,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#33A1FF',
        borderRadius: 999,
    },
    progressText: {
        color: '#BFE3FF',
        fontSize: 13,
        fontWeight: '600',
        marginTop: 6,
    },
    riverText: {
        color: '#9ED0FF',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 6,
        textAlign: 'center',
    },
    savedText: {
        color: '#8DFFBE',
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
    },
    exploreButton: {
        marginTop: 8,
        backgroundColor: '#0A66FF',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    exploreButtonPressed: {
        opacity: 0.85,
    },
    exploreButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
});