import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { SavedRoute, deleteSavedRoute, getSavedRoutes, renameSavedRoute } from '@/storage/routes';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

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

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + BottomTabInset + 16 },
      ]}>
      <Text style={styles.title}>Сохраненные маршруты</Text>
      <Text style={styles.subtitle}>Продолжайте любой маршрут без нового API-запроса.</Text>

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

      {!loading &&
        routes.map((route) => (
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
  container: {
    backgroundColor: '#F4F8FF',
    paddingHorizontal: 20,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0A2A66',
  },
  subtitle: {
    color: '#5B6785',
    fontSize: 15,
    marginBottom: 8,
  },
  statusText: {
    color: '#5B6785',
    fontSize: 15,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyTitle: {
    color: '#1D2A4A',
    fontSize: 17,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#5B6785',
    marginTop: 6,
  },
  emptyActionButton: {
    marginTop: 14,
    backgroundColor: '#0A66FF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  routeTitle: {
    color: '#1D2A4A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  routeMeta: {
    color: '#4F5B78',
    fontSize: 14,
  },
  continueButton: {
    flex: 1,
    backgroundColor: '#0A66FF',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  continueButtonPressed: {
    opacity: 0.85,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  renameButton: {
    backgroundColor: '#EAF3FF',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  renameButtonText: {
    color: '#0A4DBA',
    fontSize: 13,
    fontWeight: '700',
  },
  renameSaveButton: {
    backgroundColor: '#E8F8ED',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  renameSaveText: {
    color: '#1D7F45',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#F3F5F9',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  cancelButtonText: {
    color: '#5E6A87',
    fontSize: 13,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#FFEAEA',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  deleteButtonText: {
    color: '#B83232',
    fontSize: 13,
    fontWeight: '700',
  },
  renameInput: {
    borderWidth: 1,
    borderColor: '#D9E1F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#1D2A4A',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: '#FAFCFF',
  },
});
