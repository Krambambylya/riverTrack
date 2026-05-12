import { BottomTabInset } from '@/constants/theme';
import { SavedRoute, getSavedRoutes } from '@/entities/route';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// const BG_SVG = require('@/assets/images/bg.svg');
const BG_SVG = require('@/assets/images/bg 2.png');

export default function SavedRoutesListWidget() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRiver, setSelectedRiver] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

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

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Неизвестно';
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };
  const riverOptions = useMemo(() => {
    const uniqueRivers = new Set<string>();
    routes.forEach((route) => route.rivers.forEach((river) => uniqueRivers.add(river)));
    return ['all', ...Array.from(uniqueRivers).sort((a, b) => a.localeCompare(b, 'ru-RU'))];
  }, [routes]);

  const filteredRoutes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const base = routes.filter((route) => {
      const byRiver = selectedRiver === 'all' || route.rivers.includes(selectedRiver);
      if (!byRiver) return false;
      if (!query) return true;
      const haystack = `${route.title} ${route.rivers.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
    base.sort((a, b) => {
      const left = new Date(a.updatedAt).getTime();
      const right = new Date(b.updatedAt).getTime();
      return sortOrder === 'newest' ? right - left : left - right;
    });
    return base;
  }, [routes, searchQuery, selectedRiver, sortOrder]);

  return (
    <View style={styles.root}>
      <Image source={BG_SVG} style={styles.bgImage} contentFit="cover" transition={0} />
      <View style={styles.bgTint} pointerEvents="none" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + BottomTabInset + 16 },
        ]}>
        <Text style={styles.title}>Сохраненные маршруты</Text>
        <Text style={styles.subtitle}>Быстрый доступ к маршрутам для выхода на воду без интернета.</Text>
        {!loading && routes.length > 0 && (
          <View style={styles.filtersCard}>
            <TextInput
              style={styles.filterInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Поиск по названию или реке"
              placeholderTextColor="#666666"
            />
            <View style={styles.filterRow}>
              <Pressable
                style={[
                  styles.filterChip,
                  sortOrder === 'newest' && styles.filterChipActive,
                ]}
                onPress={() => setSortOrder('newest')}>
                <Text style={[styles.filterChipText, sortOrder === 'newest' && styles.filterChipTextActive]}>
                  Сначала новые
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.filterChip,
                  sortOrder === 'oldest' && styles.filterChipActive,
                ]}
                onPress={() => setSortOrder('oldest')}>
                <Text style={[styles.filterChipText, sortOrder === 'oldest' && styles.filterChipTextActive]}>
                  Сначала старые
                </Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.riverChipsRow}>
              {riverOptions.map((river) => {
                const active = selectedRiver === river;
                return (
                  <Pressable
                    key={river}
                    style={[styles.riverChip, active && styles.riverChipActive]}
                    onPress={() => setSelectedRiver(river)}>
                    <Text style={[styles.riverChipText, active && styles.riverChipTextActive]}>
                      {river === 'all' ? 'Все реки' : river}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {loading && <Text style={styles.statusText}>Загрузка...</Text>}
        {!loading && routes.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Маршрутов пока нет</Text>
            <Text style={styles.emptySubtitle}>
              Создайте маршрут во вкладке «Построить» и нажмите «Начать».
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyActionButton, pressed && styles.continueButtonPressed]}
              onPress={() => router.navigate('/explore')}>
              <Text style={styles.emptyActionButtonText}>Перейти в «Построить»</Text>
            </Pressable>
          </View>
        )}
        {!loading && routes.length > 0 && filteredRoutes.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Ничего не найдено</Text>
            <Text style={styles.emptySubtitle}>Измените фильтры или строку поиска.</Text>
          </View>
        )}

        {!loading &&
          filteredRoutes.map((route) => (
            <Pressable
              key={route.id}
              style={({ pressed }) => [styles.routeCard, pressed && styles.continueButtonPressed]}
              onPress={() => router.push(`/route-modal?routeId=${encodeURIComponent(route.id)}`)}>
              <View style={styles.routeHeaderRow}>
                <Text style={styles.routeTitle}>{route.title}</Text>
                <Text style={styles.routeDate}>{formatDate(route.createdAt)}</Text>
              </View>
              <Text style={styles.routeMeta}>Реки: {route.rivers.join(', ') || 'Не определены'}</Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
  },
  bgTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    gap: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#000000',
  },
  subtitle: {
    color: '#1A1A1A',
    fontSize: 17,
    marginBottom: 8,
  },
  statusText: {
    color: '#333333',
    fontSize: 16,
  },
  filtersCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 10,
    gap: 8,
  },
  filterInput: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: '#CCCCCC',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#000000',
    fontSize: 15,
    backgroundColor: '#F7F7F7',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  filterChipActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
  },
  filterChipText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#000000',
  },
  riverChipsRow: {
    gap: 6,
    paddingRight: 6,
  },
  riverChip: {
    minHeight: 36,
    borderRadius: 9,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D0D0D0',
    backgroundColor: '#F0F0F0',
  },
  riverChipActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
  },
  riverChipText: {
    color: '#000000',
    fontWeight: '700',
    fontSize: 13,
  },
  riverChipTextActive: {
    color: '#000000',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyTitle: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: '#333333',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
  },
  emptyActionButton: {
    marginTop: 14,
    minHeight: 58,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#000000',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '800',
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 18,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  routeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  routeTitle: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  routeDate: {
    color: '#444444',
    fontSize: 14,
    fontWeight: '700',
  },
  routeMeta: {
    color: '#333333',
    fontSize: 16,
  },
  continueButtonPressed: {
    opacity: 0.85,
  },
});
