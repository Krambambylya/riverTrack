import { SavedRoute, deleteSavedRoute, getSavedRoutes, renameSavedRoute } from '@/entities/route';
import { BottomTabInset } from '@/constants/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SavedRoutesListWidget() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRiver, setSelectedRiver] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    const savedRoutes = await getSavedRoutes();
    const sorted = [...savedRoutes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    setRoutes(sorted);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoutes();
    }, [loadRoutes])
  );

  const startRename = (route: SavedRoute) => {
    setEditingRouteId(route.id);
    setEditingTitle(route.title);
  };

  const cancelRename = () => {
    setEditingRouteId(null);
    setEditingTitle('');
  };

  const confirmRename = async () => {
    if (!editingRouteId) return;
    await renameSavedRoute(editingRouteId, editingTitle);
    cancelRename();
    await loadRoutes();
  };

  const removeRoute = async (id: string) => {
    await deleteSavedRoute(id);
    if (editingRouteId === id) cancelRename();
    await loadRoutes();
  };
  const formatDateTime = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Неизвестно';
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + BottomTabInset + 16 },
      ]}>
      <Text style={styles.title}>Сохраненные маршруты</Text>
      <Text style={styles.subtitle}>Быстрый доступ к маршрутам для выхода на воду.</Text>
      {!loading && routes.length > 0 && (
        <View style={styles.filtersCard}>
          <TextInput
            style={styles.filterInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Поиск по названию или реке"
            placeholderTextColor="#8FAED7"
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
            Создайте маршрут во вкладке Explore и нажмите "Начать".
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyActionButton, pressed && styles.continueButtonPressed]}
            onPress={() => router.navigate('/explore')}>
            <Text style={styles.emptyActionButtonText}>Перейти в Explore</Text>
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
          <View key={route.id} style={styles.routeCard}>
            {editingRouteId === route.id ? (
              <TextInput
                style={styles.renameInput}
                value={editingTitle}
                onChangeText={setEditingTitle}
                placeholder="Название маршрута"
                placeholderTextColor="#8A8A8A"
              />
            ) : (
              <Text style={styles.routeTitle}>{route.title}</Text>
            )}
            <Text style={styles.routeMeta}>
              Старт: {route.start.lat.toFixed(5)}, {route.start.lon.toFixed(5)}
            </Text>
            <Text style={styles.routeMeta}>
              Финиш: {route.finish.lat.toFixed(5)}, {route.finish.lon.toFixed(5)}
            </Text>
            <Text style={styles.routeMeta}>Реки: {route.rivers.join(', ') || 'Не определены'}</Text>
            <Text style={styles.routeMeta}>Создан: {formatDateTime(route.createdAt)}</Text>
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [styles.continueButton, pressed && styles.continueButtonPressed]}
                onPress={() =>
                  router.navigate({
                    pathname: '/map',
                    params: { savedRouteId: route.id },
                  })
                }>
                <Text style={styles.continueButtonText}>Продолжить</Text>
              </Pressable>
              {editingRouteId === route.id ? (
                <>
                  <Pressable
                    style={({ pressed }) => [styles.renameSaveButton, pressed && styles.continueButtonPressed]}
                    onPress={confirmRename}>
                    <Text style={styles.renameSaveText}>Сохранить</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.continueButtonPressed]}
                    onPress={cancelRename}>
                    <Text style={styles.cancelButtonText}>Отмена</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.renameButton, pressed && styles.continueButtonPressed]}
                  onPress={() => startRename(route)}>
                  <Text style={styles.renameButtonText}>Переименовать</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.deleteButton, pressed && styles.continueButtonPressed]}
                onPress={() => removeRoute(route.id)}>
                <Text style={styles.deleteButtonText}>Удалить</Text>
              </Pressable>
            </View>
          </View>
        ))}
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
  },
  subtitle: {
    color: '#B5CCEE',
    fontSize: 17,
    marginBottom: 8,
  },
  statusText: {
    color: '#C7DAF5',
    fontSize: 16,
  },
  filtersCard: {
    backgroundColor: '#0C2A52',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A4F84',
    padding: 14,
    gap: 10,
  },
  filterInput: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: '#4F79B0',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 16,
    backgroundColor: '#12345E',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#12345E',
    borderWidth: 1,
    borderColor: '#3B5F92',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  filterChipActive: {
    backgroundColor: '#38B6FF',
    borderColor: '#38B6FF',
  },
  filterChipText: {
    color: '#CDE3FF',
    fontWeight: '700',
    fontSize: 14,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  riverChipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  riverChip: {
    minHeight: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3B5F92',
    backgroundColor: '#12345E',
  },
  riverChipActive: {
    backgroundColor: '#1D4F85',
    borderColor: '#6CC4FF',
  },
  riverChipText: {
    color: '#CDE3FF',
    fontWeight: '700',
    fontSize: 14,
  },
  riverChipTextActive: {
    color: '#E6FFE8',
  },
  emptyCard: {
    backgroundColor: '#0C2A52',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A4F84',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyTitle: {
    color: '#E6F1FF',
    fontSize: 22,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: '#B5CCEE',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
  },
  emptyActionButton: {
    marginTop: 14,
    minHeight: 58,
    backgroundColor: '#38B6FF',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  routeCard: {
    backgroundColor: '#0C2A52',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A4F84',
    padding: 18,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  routeTitle: {
    color: '#E6F1FF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  routeMeta: {
    color: '#C7DAF5',
    fontSize: 16,
  },
  continueButton: {
    flex: 1,
    minHeight: 56,
    backgroundColor: '#38B6FF',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonPressed: {
    opacity: 0.85,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  renameButton: {
    minHeight: 56,
    backgroundColor: '#1B4D7D',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  renameButtonText: {
    color: '#D8ECFF',
    fontSize: 15,
    fontWeight: '700',
  },
  renameSaveButton: {
    minHeight: 56,
    backgroundColor: '#1D4F85',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  renameSaveText: {
    color: '#E3F4FF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: 56,
    backgroundColor: '#3F5A7B',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#E5EEFA',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteButton: {
    minHeight: 56,
    backgroundColor: '#7D2B2B',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFDADA',
    fontSize: 15,
    fontWeight: '700',
  },
  renameInput: {
    minHeight: 56,
    borderWidth: 1.5,
    borderColor: '#5EA5EA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: '#12345E',
  },
});
