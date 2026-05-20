import { AppTheme, BottomTabInset } from '@/constants/theme';
import { getSavedRoutes, SavedRoute, setSavedRouteFavorited } from '@/entities/route';
import { getReliableCurrentPositionAsync } from '@/shared/lib/get-reliable-current-position';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PRESET_LABELS } from '../lib/constants';
import { haversineKm, sortRoutesByCreatedAt } from '../lib/route-metrics';
import type { PresetFilter, RoutesYearSection } from '../lib/types';
import { HomeRouteCard } from './home-route-card';
import { YearSectionHeader } from './year-section-header';

export default function SavedRoutesListWidget() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<PresetFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [filterBarHeight, setFilterBarHeight] = useState(140);

  const loadRoutes = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (showLoading) setLoading(true);
    try {
      const savedRoutes = await getSavedRoutes();
      const sorted = [...savedRoutes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setRoutes(sorted);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggleFavorite = useCallback(async (id: string, next: boolean) => {
    const updated = await setSavedRouteFavorited(id, next);
    if (updated) {
      setRoutes((prev) => prev.map((r) => (r.id === id ? updated : r)));
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
        const pos = await getReliableCurrentPositionAsync();
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

    if (preset === 'favorites') {
      list = list.filter((r) => r.favorited);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = `${r.title} ${r.rivers.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (preset === 'nearby' && userLoc) {
      list = [...list].sort((a, b) => {
        const da = haversineKm(userLoc.lat, userLoc.lon, a.start.lat, a.start.lon);
        const db = haversineKm(userLoc.lat, userLoc.lon, b.start.lat, b.start.lon);
        return da - db;
      });
    } else if (preset === 'oldest') {
      list = sortRoutesByCreatedAt(list, 'asc');
    } else {
      list = sortRoutesByCreatedAt(list, 'desc');
    }

    return list;
  }, [routes, preset, searchQuery, userLoc]);

  const routeSections = useMemo((): RoutesYearSection[] => {
    if (filteredRoutes.length === 0) return [];
    const byYear = new Map<number, SavedRoute[]>();
    for (const route of filteredRoutes) {
      const t = new Date(route.createdAt).getTime();
      const year = Number.isFinite(t) ? new Date(route.createdAt).getFullYear() : new Date().getFullYear();
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(route);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, data]) => ({ year, data }));
  }, [filteredRoutes]);

  const listBottomPadding = insets.bottom + BottomTabInset + 24;

  return (
    <View style={styles.root}>
      {loading ? (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: filterBarHeight + 4,
              paddingBottom: listBottomPadding,
            },
          ]}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.statusText}>Загрузка…</Text>
        </ScrollView>
      ) : (
        <View style={[styles.listViewport, { paddingTop: filterBarHeight + 4 }]}>
          <SectionList
            style={styles.screen}
            sections={routeSections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled
            showsVerticalScrollIndicator={false}
            renderSectionHeader={({ section }) => <YearSectionHeader year={section.year} />}
            renderItem={({ item }) => (
              <View style={styles.cardGap}>
                <HomeRouteCard
                  route={item}
                  favorited={!!item.favorited}
                  onOpen={() => router.push(`/route-modal?routeId=${encodeURIComponent(item.id)}`)}
                  onStart={() =>
                    router.push({
                      pathname: '/map',
                      params: { savedRouteId: item.id },
                    })
                  }
                  onToggleFavorite={() => void handleToggleFavorite(item.id, !item.favorited)}
                />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.listEmptyInner}>
                {routes.length === 0 ? (
                  <>
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>Нет маршрутов</Text>
                      <Text style={styles.emptySubtitle}>
                        Создайте маршрут во вкладке «Построить» и нажмите «Начать».
                      </Text>
                      <Pressable
                        style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
                        onPress={() => router.navigate('/explore')}>
                        <Text style={styles.emptyBtnText}>Построить маршрут</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>Ничего не найдено</Text>
                    <Text style={styles.emptySubtitle}>
                      {preset === 'nearby' && !userLoc
                        ? 'Разрешите геолокацию для сортировки по расстоянию.'
                        : preset === 'favorites'
                          ? 'Отметьте маршруты звёздочкой под кнопкой «Старт».'
                          : 'Измените фильтр или поиск.'}
                    </Text>
                  </View>
                )}
              </View>
            }
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: listBottomPadding, flexGrow: 1 },
            ]}
          />
        </View>
      )}

      <View
        style={[styles.filterOverlay, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setFilterBarHeight(e.nativeEvent.layout.height)}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Мои маршруты</Text>
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
            </ScrollView>
          </View>

          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Поиск по названию или реке"
            placeholderTextColor={AppTheme.mutedForeground}
          />
        </View>
      </View>
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
  listViewport: {
    flex: 1,
  },
  listEmptyInner: {
    paddingTop: 8,
  },
  filterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    backgroundColor: AppTheme.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  header: {
    paddingBottom: 12,
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
  searchInput: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: AppTheme.inputBackground,
    color: AppTheme.foreground,
    fontSize: 15,
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
