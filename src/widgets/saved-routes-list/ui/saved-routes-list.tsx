import { AppTheme, BottomTabInset } from '@/constants/theme';
import { SavedRoute, getSavedRoutes } from '@/entities/route';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { lineString } from '@turf/helpers';
import length from '@turf/length';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

function RiverPathSvg({ widthPx }: { widthPx: number }) {
  const w = Math.max(160, widthPx);
  return (
    <Svg width={w} height={32} viewBox="0 0 300 30" preserveAspectRatio="xMidYMid meet">
      <Path
        d="M 0 15 Q 50 5, 100 15 T 200 15 Q 250 20, 300 15"
        stroke="rgba(43, 122, 75, 0.45)"
        strokeWidth={2}
        fill="none"
      />
      <Circle cx={0} cy={15} r={4} fill={AppTheme.primary} />
      <Circle cx={300} cy={15} r={4} fill={AppTheme.primary} />
    </Svg>
  );
}

type PresetFilter = 'all' | 'popular' | 'recent' | 'nearby';

const PRESET_LABELS: { id: PresetFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'popular', label: 'Популярные' },
  { id: 'recent', label: 'Недавние' },
  { id: 'nearby', label: 'Ближайшие ко мне' },
];

function formatListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function routeLengthKm(route: SavedRoute): number {
  const pts = route.route;
  if (!pts || pts.length < 2) return 0;
  try {
    const coords = pts.map((p) => [p.longitude, p.latitude] as [number, number]);
    return length(lineString(coords), { units: 'kilometers' });
  } catch {
    return 0;
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function HomeRouteCard({
  route,
  onOpen,
  onStart,
}: {
  route: SavedRoute;
  onOpen: () => void;
  onStart: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const riverPathWidth = Math.max(160, windowWidth - 64);
  const km = routeLengthKm(route);
  const kmLabel = km < 0.05 ? '<0.1' : km < 10 ? km.toFixed(1) : Math.round(km).toString();

  return (
    <View style={cardStyles.wrap}>
      <View style={cardStyles.row}>
        <Pressable style={cardStyles.mainTap} onPress={onOpen}>
          <Text style={cardStyles.title} numberOfLines={2}>
            {route.title}
          </Text>
          <Text style={cardStyles.rivers} numberOfLines={1}>
            {route.rivers.length > 0 ? route.rivers.join(', ') : 'Река не указана'}
          </Text>
          <View style={cardStyles.metaRow}>
            <View style={cardStyles.metaItem}>
              <MaterialCommunityIcons name="calendar-outline" size={16} color={AppTheme.mutedForeground} />
              <Text style={cardStyles.metaText}>{formatListDate(route.createdAt)}</Text>
            </View>
            <View style={cardStyles.metaItem}>
              <MaterialCommunityIcons name="navigation-variant" size={16} color={AppTheme.mutedForeground} />
              <Text style={cardStyles.metaText}>{kmLabel} км</Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          style={({ pressed }) => [cardStyles.startBtn, pressed && cardStyles.startBtnPressed]}
          onPress={onStart}>
          <Text style={cardStyles.startBtnText}>Старт</Text>
        </Pressable>
      </View>
      <View style={cardStyles.riverViz}>
        <RiverPathSvg widthPx={riverPathWidth} />
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrap: {
    backgroundColor: AppTheme.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mainTap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.foreground,
    marginBottom: 8,
  },
  rivers: {
    fontSize: 14,
    color: AppTheme.mutedForeground,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: AppTheme.mutedForeground,
    fontWeight: '500',
  },
  startBtn: {
    backgroundColor: AppTheme.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
  },
  startBtnPressed: {
    opacity: 0.9,
  },
  startBtnText: {
    color: AppTheme.primaryForeground,
    fontSize: 15,
    fontWeight: '600',
  },
  riverViz: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
});

export default function SavedRoutesListWidget() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PresetFilter>('all');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);

  const loadRoutes = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (showLoading) setLoading(true);
    try {
      const savedRoutes = await getSavedRoutes();
      const sorted = [...savedRoutes].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setRoutes(sorted);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoutes({ showLoading: false });
    }, [loadRoutes])
  );

  useEffect(() => {
    if (preset !== 'nearby') {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }
      } catch {
        if (!cancelled) setUserLoc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preset]);

  const filteredRoutes = useMemo(() => {
    let list = [...routes];
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    if (preset === 'popular') {
      list = list.filter((r) => r.rivers.length >= 2);
    } else if (preset === 'recent') {
      list = list.filter((r) => now - new Date(r.updatedAt).getTime() <= monthMs);
    } else if (preset === 'nearby' && userLoc) {
      list = [...list].sort((a, b) => {
        const da = haversineKm(userLoc.lat, userLoc.lon, a.start.lat, a.start.lon);
        const db = haversineKm(userLoc.lat, userLoc.lon, b.start.lat, b.start.lon);
        return da - db;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = `${r.title} ${r.rivers.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [routes, preset, searchQuery, userLoc]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + BottomTabInset + 24 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Мои маршруты</Text>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
              onPress={() => {}}>
              <MaterialCommunityIcons name="account-outline" size={20} color={AppTheme.foreground} />
            </Pressable>
          </View>

          <View style={styles.chipsRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
              {PRESET_LABELS.map(({ id, label }) => {
                const on = preset === id;
                return (
                  <Pressable
                    key={id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setPreset(id)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={({ pressed }) => [styles.chipIcon, pressed && styles.pressed]}
                onPress={() => setSearchVisible((v) => !v)}>
                <MaterialCommunityIcons name="tune-vertical" size={18} color={AppTheme.foreground} />
              </Pressable>
            </ScrollView>
          </View>

          {searchVisible ? (
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Поиск по названию или реке"
              placeholderTextColor={AppTheme.mutedForeground}
            />
          ) : null}
        </View>

        <View style={styles.listBlock}>
          {loading && <Text style={styles.statusText}>Загрузка…</Text>}

          {!loading && routes.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Нет маршрутов</Text>
              <Text style={styles.emptySubtitle}>
                Создайте маршрут во вкладке «Построить» и нажмите «Начать».
              </Text>
              <Pressable
                style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
                onPress={() => router.navigate('/explore')}>
                <Text style={styles.emptyBtnText}>Построить</Text>
              </Pressable>
            </View>
          )}

          {!loading && routes.length > 0 && filteredRoutes.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Ничего не найдено</Text>
              <Text style={styles.emptySubtitle}>
                {preset === 'nearby' && !userLoc
                  ? 'Разрешите геолокацию для сортировки по расстоянию.'
                  : 'Измените фильтр или поиск.'}
              </Text>
            </View>
          )}

          {!loading &&
            filteredRoutes.map((route) => (
              <View key={route.id} style={styles.cardGap}>
                <HomeRouteCard
                  route={route}
                  onOpen={() => router.push(`/route-modal?routeId=${encodeURIComponent(route.id)}`)}
                  onStart={() =>
                    router.push({
                      pathname: '/map',
                      params: { savedRouteId: route.id },
                    })
                  }
                />
              </View>
            ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  header: {
    backgroundColor: AppTheme.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
    paddingBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: AppTheme.foreground,
    letterSpacing: -0.3,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    marginBottom: 0,
  },
  chipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AppTheme.card,
  },
  chipOn: {
    backgroundColor: AppTheme.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: AppTheme.foreground,
  },
  chipTextOn: {
    color: AppTheme.primaryForeground,
    fontWeight: '600',
  },
  chipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  searchInput: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: AppTheme.inputBackground,
    color: AppTheme.foreground,
    fontSize: 15,
  },
  listBlock: {
    gap: 12,
  },
  cardGap: {
    marginBottom: 12,
  },
  statusText: {
    color: AppTheme.mutedForeground,
    fontSize: 15,
  },
  emptyCard: {
    backgroundColor: AppTheme.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppTheme.border,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.foreground,
  },
  emptySubtitle: {
    fontSize: 14,
    color: AppTheme.mutedForeground,
    marginTop: 8,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: AppTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: {
    color: AppTheme.primaryForeground,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.75,
  },
});
