import { AppTheme, BottomTabInset } from '@/constants/theme';
import { getSavedRoutes, SavedRoute, setSavedRouteFavorited, type RoutePoint } from '@/entities/route';
import { getReliableCurrentPositionAsync } from '@/shared/lib/get-reliable-current-position';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lineString } from '@turf/helpers';
import length from '@turf/length';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

const RIVER_VIEW_W = 300;
/** Высота viewBox: больше — маршрут не «сплющен» по вертикали на карточке */
const RIVER_VIEW_H = 100;
const RIVER_PAD = 6;
const RIVER_MAX_POINTS = 96;

const STAR_ICON_LIGHT = require('@/assets/images/icons/star/light/star.png');
const STAR_ICON_GREEN = require('@/assets/images/icons/star/green/star.png');

function decimateRoutePoints(pts: RoutePoint[], max: number): RoutePoint[] {
  if (pts.length <= max) return pts;
  const out: RoutePoint[] = [];
  const last = pts.length - 1;
  for (let i = 0; i < max; i++) {
    const t = i / (max - 1);
    const idx = Math.round(t * last);
    out.push(pts[idx]);
  }
  return out;
}

function collectPolylineForPreview(route: SavedRoute): RoutePoint[] {
  const r = route.route;
  if (r && r.length >= 2) {
    return decimateRoutePoints(r, RIVER_MAX_POINTS);
  }
  if (r && r.length === 1) {
    return [
      { latitude: route.start.lat, longitude: route.start.lon },
      r[0],
      { latitude: route.finish.lat, longitude: route.finish.lon },
    ];
  }
  return [
    { latitude: route.start.lat, longitude: route.start.lon },
    { latitude: route.finish.lat, longitude: route.finish.lon },
  ];
}

function buildRiverSvgPreview(route: SavedRoute): {
  d: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
} | null {
  const pts = collectPolylineForPreview(route);
  if (pts.length < 2) return null;

  const lats = pts.map((p) => p.latitude);
  const lons = pts.map((p) => p.longitude);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const eps = 1e-6;
  if (latSpan < eps) {
    minLat -= eps;
    maxLat += eps;
  }
  if (lonSpan < eps) {
    minLon -= eps;
    maxLon += eps;
  }

  const innerW = RIVER_VIEW_W - 2 * RIVER_PAD;
  const innerH = RIVER_VIEW_H - 2 * RIVER_PAD;

  const midLat = (minLat + maxLat) / 2;
  const cosMid = Math.cos((midLat * Math.PI) / 180);

  let widthGeo = (maxLon - minLon) * cosMid;
  let heightGeo = maxLat - minLat;
  if (widthGeo < eps) widthGeo = eps;
  if (heightGeo < eps) heightGeo = eps;

  const scale = Math.min(innerW / widthGeo, innerH / heightGeo);
  const scaledW = widthGeo * scale;
  const scaledH = heightGeo * scale;
  const offX = RIVER_PAD + (innerW - scaledW) / 2;
  const offY = RIVER_PAD + (innerH - scaledH) / 2;

  const project = (p: RoutePoint) => {
    const x = offX + (p.longitude - minLon) * cosMid * scale;
    const y = offY + (maxLat - p.latitude) * scale;
    return { x, y };
  };

  const projected = pts.map(project);
  const d = projected.map((q, i) => `${i === 0 ? 'M' : 'L'} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' ');
  const first = projected[0];
  const last = projected[projected.length - 1];
  return { d, sx: first.x, sy: first.y, ex: last.x, ey: last.y };
}

function RiverPathSvg({ widthPx, route }: { widthPx: number; route: SavedRoute }) {
  const w = Math.max(160, widthPx);
  const preview = useMemo(() => buildRiverSvgPreview(route), [route]);
  const svgH = Math.max(40, Math.round((w * RIVER_VIEW_H) / RIVER_VIEW_W));

  if (!preview) {
    return (
      <Svg width={w} height={svgH} viewBox={`0 0 ${RIVER_VIEW_W} ${RIVER_VIEW_H}`} preserveAspectRatio="xMidYMid meet">
        <Path
          d={`M 0 ${RIVER_VIEW_H / 2} Q 50 ${RIVER_VIEW_H / 2 - 12}, 100 ${RIVER_VIEW_H / 2} T 200 ${RIVER_VIEW_H / 2} Q 250 ${RIVER_VIEW_H / 2 + 8}, 300 ${RIVER_VIEW_H / 2}`}
          stroke="rgba(43, 122, 75, 0.45)"
          strokeWidth={2}
          fill="none"
        />
      </Svg>
    );
  }

  return (
    <Svg width={w} height={svgH} viewBox={`0 0 ${RIVER_VIEW_W} ${RIVER_VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      <Path
        d={preview.d}
        stroke="rgba(43, 122, 75, 0.45)"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={preview.sx} cy={preview.sy} r={4} fill={AppTheme.primary} />
      <Circle cx={preview.ex} cy={preview.ey} r={4} fill={AppTheme.mapPointFinish} />
    </Svg>
  );
}

type PresetFilter = 'all' | 'favorites' | 'newest' | 'oldest' | 'nearby';

type RoutesYearSection = {
  year: number;
  data: SavedRoute[];
};

const PRESET_LABELS: { id: PresetFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'favorites', label: 'Избранные' },
  { id: 'nearby', label: 'Ближайшие ко мне' },
  { id: 'newest', label: 'Сначала новые' },
  { id: 'oldest', label: 'Сначала старые' },
];

function sortRoutesByUpdatedAt(routes: SavedRoute[], direction: 'asc' | 'desc'): SavedRoute[] {
  return [...routes].sort((a, b) => {
    const ta = new Date(a.updatedAt).getTime();
    const tb = new Date(b.updatedAt).getTime();
    const cmp = ta - tb;
    return direction === 'desc' ? -cmp : cmp;
  });
}

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
  favorited,
  onOpen,
  onStart,
  onToggleFavorite,
}: {
  route: SavedRoute;
  favorited: boolean;
  onOpen: () => void;
  onStart: () => void;
  onToggleFavorite: () => void;
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
            Реки: {route.rivers.length > 0 ? route.rivers.join(', ') : 'Река не указана'}
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
        <View style={cardStyles.actionsCol}>
          <Pressable
            style={({ pressed }) => [cardStyles.startBtn, pressed && cardStyles.startBtnPressed]}
            onPress={onStart}>
            <Text style={cardStyles.startBtnText}>Старт</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorited ? 'Убрать из избранного' : 'В избранное'}
            style={({ pressed }) => [cardStyles.starBtn, pressed && cardStyles.starBtnPressed]}
            onPress={onToggleFavorite}>
            <Image
              source={favorited ? STAR_ICON_GREEN : STAR_ICON_LIGHT}
              style={cardStyles.starIcon}
              resizeMode="contain"
            />
          </Pressable>
        </View>
      </View>
      <View style={cardStyles.riverViz}>
        <RiverPathSvg widthPx={riverPathWidth} route={route} />
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
  actionsCol: {
    gap: 8,
    alignItems: 'stretch',
    flexShrink: 0,
  },
  starBtn: {
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starBtnPressed: {
    opacity: 0.75,
  },
  starIcon: {
    width: 26,
    height: 26,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [filterBarHeight, setFilterBarHeight] = useState(140);

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
      list = sortRoutesByUpdatedAt(list, 'asc');
    } else {
      list = sortRoutesByUpdatedAt(list, 'desc');
    }

    return list;
  }, [routes, preset, searchQuery, userLoc]);

  const routeSections = useMemo((): RoutesYearSection[] => {
    if (filteredRoutes.length === 0) return [];
    const byYear = new Map<number, SavedRoute[]>();
    for (const route of filteredRoutes) {
      const t = new Date(route.updatedAt).getTime();
      const year = Number.isFinite(t) ? new Date(route.updatedAt).getFullYear() : new Date().getFullYear();
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
            renderSectionHeader={({ section }) => (
              <View style={styles.yearHeader}>
                <Text style={styles.yearHeaderText}>{section.year}</Text>
              </View>
            )}
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
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
              onPress={() => { }}>
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
  yearHeader: {
    backgroundColor: AppTheme.background,
    paddingTop: 6,
    paddingBottom: 12,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  yearHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppTheme.mutedForeground,
    letterSpacing: 1.2,
    textAlign: 'center',
    width: '100%',
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
