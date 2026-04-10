import { BottomTabInset } from '@/constants/theme';
import * as Location from 'expo-location';
import { AppleMaps } from 'expo-maps';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FALLBACK_CENTER = { latitude: 48.67, longitude: 45.29 };

export default function RouteConstructorWidget() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isInlineCoordinates = width >= 360;
  const [startLat, setStartLat] = useState('');
  const [startLon, setStartLon] = useState('');
  const [finishLat, setFinishLat] = useState('');
  const [finishLon, setFinishLon] = useState('');
  const [selectionMode, setSelectionMode] = useState<'start' | 'finish'>('start');
  const [mapCenter, setMapCenter] = useState(FALLBACK_CENTER);
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

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!active) return;

        setMapCenter({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        // keep fallback center
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

  const startNavigation = () => {
    if (!canStartRoute) return;
    router.navigate({
      pathname: '/map',
      params: {
        startLat,
        startLon,
        finishLat,
        finishLon,
      },
    });
  };

  const setSelectedPointFromMap = (event: any) => {
    const coordinates = event?.coordinates ?? event?.nativeEvent?.coordinates;
    if (!coordinates) return;

    const nextLat = String(Number(coordinates.latitude).toFixed(6));
    const nextLon = String(Number(coordinates.longitude).toFixed(6));

    if (selectionMode === 'start') {
      setStartLat(nextLat);
      setStartLon(nextLon);
      setSelectionMode('finish');
      return;
    }
    setFinishLat(nextLat);
    setFinishLon(nextLon);
  };
  const useCurrentLocationAsStart = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextLat = String(Number(position.coords.latitude).toFixed(6));
      const nextLon = String(Number(position.coords.longitude).toFixed(6));

      setStartLat(nextLat);
      setStartLon(nextLon);
      setMapCenter({
        latitude: Number(nextLat),
        longitude: Number(nextLon),
      });
      setSelectionMode('finish');
    } catch (error) {
      // keep current values
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + BottomTabInset + 16 },
      ]}>
      <Text style={styles.title}>Создание водного маршрута</Text>
      <Text style={styles.subtitle}>
        Крупные кнопки и быстрый выбор: поставьте старт и финиш на карте.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Выбор точки на карте</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[
              styles.modeButton,
              selectionMode === 'start' && styles.modeButtonActiveStart,
            ]}
            onPress={() => setSelectionMode('start')}>
            <Text style={styles.modeButtonText}>Точка старта</Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeButton,
              selectionMode === 'finish' && styles.modeButtonActiveFinish,
            ]}
            onPress={() => setSelectionMode('finish')}>
            <Text style={styles.modeButtonText}>Точка финиша</Text>
          </Pressable>
        </View>
        <AppleMaps.View
          style={styles.map}
          onMapClick={setSelectedPointFromMap}
          cameraPosition={{
            coordinates: mapCenter,
            zoom: 13,
          }}
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
                  tintColor: '#38B6FF',
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
                  tintColor: '#D93A3A',
                },
              ]
              : []),
          ]}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Старт</Text>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
          onPress={useCurrentLocationAsStart}>
          <Text style={styles.secondaryButtonText}>Моё местоположение = Старт</Text>
        </Pressable>
        <View style={[styles.coordinatesRow, isInlineCoordinates ? styles.inlineRow : styles.stackedRow]}>
          <TextInput
            style={[styles.input, isInlineCoordinates && styles.inlineInput]}
            value={startLat}
            onChangeText={setStartLat}
            keyboardType="decimal-pad"
            placeholder="Широта"
            placeholderTextColor="#8A8A8A"
          />
          <TextInput
            style={[styles.input, isInlineCoordinates && styles.inlineInput]}
            value={startLon}
            onChangeText={setStartLon}
            keyboardType="decimal-pad"
            placeholder="Долгота"
            placeholderTextColor="#8A8A8A"
          />
        </View>

        <Text style={styles.sectionTitle}>Финиш</Text>
        <View style={[styles.coordinatesRow, isInlineCoordinates ? styles.inlineRow : styles.stackedRow]}>
          <TextInput
            style={[styles.input, isInlineCoordinates && styles.inlineInput]}
            value={finishLat}
            onChangeText={setFinishLat}
            keyboardType="decimal-pad"
            placeholder="Широта"
            placeholderTextColor="#8A8A8A"
          />
          <TextInput
            style={[styles.input, isInlineCoordinates && styles.inlineInput]}
            value={finishLon}
            onChangeText={setFinishLon}
            keyboardType="decimal-pad"
            placeholder="Долгота"
            placeholderTextColor="#8A8A8A"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            !canStartRoute && styles.buttonDisabled,
            pressed && canStartRoute && styles.buttonPressed,
          ]}
          onPress={startNavigation}
          disabled={!canStartRoute}>
          <Text style={styles.buttonText}>Старт маршрута</Text>
        </Pressable>

        {!canStartRoute && <Text style={styles.errorText}>Сначала задайте старт и финиш.</Text>}
        {!canStartRoute && (
          <Text style={styles.errorTextHint}>
            Широта: -90..90, долгота: -180..180.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#061A35',
  },
  container: {
    backgroundColor: '#061A35',
    paddingHorizontal: 20,
    gap: 14,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    color: '#B5CCEE',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#0C2A52',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A4F84',
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#3A5E91',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#133763',
  },
  modeButtonActiveStart: {
    backgroundColor: '#1D4F85',
    borderColor: '#6CC4FF',
  },
  modeButtonActiveFinish: {
    backgroundColor: '#5A2B2B',
    borderColor: '#FF7E7E',
  },
  modeButtonText: {
    color: '#E6F1FF',
    fontWeight: '700',
    fontSize: 16,
  },
  map: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E6F1FF',
    marginTop: 6,
  },
  input: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: '#4C6E9F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#FFFFFF',
    backgroundColor: '#12345E',
  },
  coordinatesRow: {
    gap: 10,
  },
  inlineRow: {
    flexDirection: 'row',
  },
  stackedRow: {
    flexDirection: 'column',
  },
  inlineInput: {
    flex: 1,
  },
  button: {
    marginTop: 14,
    minHeight: 60,
    backgroundColor: '#38B6FF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#466E8C',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  secondaryButton: {
    marginBottom: 6,
    minHeight: 56,
    backgroundColor: '#1B4D7D',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#82CCFF',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonText: {
    color: '#D8ECFF',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  errorText: {
    marginTop: 6,
    color: '#FF9292',
    fontSize: 14,
    fontWeight: '700',
  },
  errorTextHint: {
    color: '#FFADAD',
    fontSize: 13,
  },
});
