import { AppTheme } from '@/constants/theme';
import type { SavedRoute } from '@/entities/route';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { STAR_ICON_GREEN, STAR_ICON_LIGHT } from '../lib/constants';
import { formatListDate } from '../lib/format-list-date';
import { routeLengthKm } from '../lib/route-metrics';

type HomeRouteCardProps = {
  route: SavedRoute;
  favorited: boolean;
  onOpen: () => void;
  onStart: () => void;
  onToggleFavorite: () => void;
};

export function HomeRouteCard({
  route,
  favorited,
  onOpen,
  onStart,
  onToggleFavorite,
}: HomeRouteCardProps) {
  const km = routeLengthKm(route);
  const kmLabel = km < 0.05 ? '<0.1' : km < 10 ? km.toFixed(1) : Math.round(km).toString();

  return (
    <View style={cardStyles.wrap}>
      <View style={cardStyles.row}>
        <Pressable style={cardStyles.mainTap} onPress={onOpen}>
          <Text style={cardStyles.title} numberOfLines={1} ellipsizeMode="tail">
            {route.title}
          </Text>
          <Text style={cardStyles.rivers} numberOfLines={1}>
            Реки: {route.rivers.length > 0 ? route.rivers.join(', ') : 'Река не указана'}
          </Text>
          <Text style={cardStyles.countries} numberOfLines={1}>
            Страны: {route.countries && route.countries.length > 0 ? route.countries.join(', ') : 'Не определены'}
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
    marginBottom: 4,
  },
  countries: {
    fontSize: 13,
    color: AppTheme.mutedForeground,
    marginBottom: 10,
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
});
