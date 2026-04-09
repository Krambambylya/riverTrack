// screens/MapScreen.js (финальная версия)
import { useRiverRoute } from '@/hooks/useRiverRoute';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import { AppleMaps } from 'expo-maps';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

export default function MapScreen() {
    const params = useLocalSearchParams<{
        startLat?: string;
        startLon?: string;
        finishLat?: string;
        finishLon?: string;
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
    const [distanceCovered, setDistanceCovered] = useState(0);
    const [distanceRemaining, setDistanceRemaining] = useState(0);
    // const routePoints = riverRoute.geometry.coordinates.map(([longitude, latitude]) => ({
    //     latitude,
    //     longitude,
    // }));
    const { route: routePoints, loading, error } = useRiverRoute(
        startPoint ? { lat: startPoint.latitude, lon: startPoint.longitude } : null,
        finishPoint ? { lat: finishPoint.latitude, lon: finishPoint.longitude } : null
    );
    const routeCoordinates = useMemo(
        () => routePoints.map((point) => [point.longitude, point.latitude]),
        [routePoints]
    );
    const totalDistance = useMemo(
        () =>
            routeCoordinates.length > 1
                ? turf.length(turf.lineString(routeCoordinates), { units: 'kilometers' })
                : 0,
        [routeCoordinates]
    );
    const hasRoute = routePoints.length > 1;
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
    const cameraPosition = useMemo(() => {
        if (hasRoute) {
            const latitudes = routePoints.map((point) => point.latitude);
            const longitudes = routePoints.map((point) => point.longitude);
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
            coordinates: startPoint ?? { latitude: 48.67, longitude: 45.29 },
            zoom: 14,
        };
    }, [hasRoute, routePoints, startPoint]);

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
                                  coordinates: routePoints,
                                  color: '#0066CC',
                                  width: 4,
                              },
                          ]
                        : []
                }
                markers={[
                    ...(startPoint
                        ? [
                              {
                                  id: 'start',
                                  coordinates: startPoint,
                                  title: 'Старт',
                                  tintColor: '#228B22',
                              },
                          ]
                        : []),
                    ...(finishPoint
                        ? [
                              {
                                  id: 'finish',
                                  coordinates: finishPoint,
                                  title: 'Финиш',
                                  tintColor: '#FF0000',
                              },
                          ]
                        : []),
                ]}
            />
            {/* Информационная панель */}
            <View style={styles.infoPanel}>
                {!hasSelectedPoints && (
                    <Text style={styles.statusText}>Выберите старт и финиш в Explore и нажмите "Начать"</Text>
                )}
                {loading && <Text style={styles.statusText}>Строим маршрут...</Text>}
                {!loading && !!error && <Text style={styles.errorText}>Ошибка: {error}</Text>}
                {!loading && hasSelectedPoints && !error && !hasRoute && (
                    <Text style={styles.statusText}>Маршрут не найден</Text>
                )}
                <Text style={styles.infoText}>Пройдено: {distanceCovered.toFixed(2)} км</Text>
                <Text style={styles.infoText}>Осталось: {distanceRemaining.toFixed(2)} км</Text>
                <Text style={styles.infoText}>Всего: {totalDistance.toFixed(2)} км</Text>
                <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
                </View>
                <Text style={styles.progressText}>{progressPercent}% маршрута пройдено</Text>
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
});