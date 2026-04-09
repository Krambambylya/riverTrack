import { router } from 'expo-router';
import { AppleMaps } from 'expo-maps';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabInset } from '@/constants/theme';

const FALLBACK_CENTER = { latitude: 48.67, longitude: 45.29 };

export default function ExploreScreen() {
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
  }, [finishLatNum, finishLonNum, startLatNum, startLonNum]);
  const hasStartPoint = useMemo(
    () => Number.isFinite(startLatNum) && Number.isFinite(startLonNum),
    [startLatNum, startLonNum]
  );
  const hasFinishPoint = useMemo(
    () => Number.isFinite(finishLatNum) && Number.isFinite(finishLonNum),
    [finishLatNum, finishLonNum]
  );

  const startNavigation = () => {
    if (!isValid) return;
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
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + BottomTabInset + 16 },
      ]}>
      <Text style={styles.title}>Построение водного маршрута</Text>
      <Text style={styles.subtitle}>
        Выберите активную точку и тапните по карте, либо введите координаты вручную
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
            <Text style={styles.modeButtonText}>Ставлю Старт</Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeButton,
              selectionMode === 'finish' && styles.modeButtonActiveFinish,
            ]}
            onPress={() => setSelectionMode('finish')}>
            <Text style={styles.modeButtonText}>Ставлю Финиш</Text>
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
                    tintColor: '#228B22',
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
          <Text style={styles.secondaryButtonText}>Моё местоположение как Старт</Text>
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
            !isValid && styles.buttonDisabled,
            pressed && isValid && styles.buttonPressed,
          ]}
          onPress={startNavigation}
          disabled={!isValid}>
          <Text style={styles.buttonText}>Начать</Text>
        </Pressable>

        {!isValid && <Text style={styles.errorText}>Введите корректные координаты.</Text>}
        {!isValid && (
          <Text style={styles.errorTextHint}>
            Широта: -90..90, долгота: -180..180.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F4F8FF',
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0A2A66',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#5B6785',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9E1F2',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F8FAFF',
  },
  modeButtonActiveStart: {
    backgroundColor: '#E6F6EA',
    borderColor: '#228B22',
  },
  modeButtonActiveFinish: {
    backgroundColor: '#FFEAEA',
    borderColor: '#D93A3A',
  },
  modeButtonText: {
    color: '#1D2A4A',
    fontWeight: '600',
  },
  map: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D2A4A',
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D9E1F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1B2233',
    backgroundColor: '#FAFCFF',
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
    backgroundColor: '#0A66FF',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#96B7F5',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  secondaryButton: {
    marginBottom: 6,
    backgroundColor: '#EAF3FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFD8FF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonText: {
    color: '#0A4DBA',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 6,
    color: '#D13B3B',
    fontSize: 13,
  },
  errorTextHint: {
    color: '#D13B3B',
    fontSize: 12,
  },
});
