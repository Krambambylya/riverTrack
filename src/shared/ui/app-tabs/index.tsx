import { AppTheme } from '@/constants/theme';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={AppTheme.background}
      indicatorColor={AppTheme.primary}
      iconColor={{ default: AppTheme.mutedForeground, selected: AppTheme.primaryForeground }}
      tintColor={AppTheme.primary}
      labelStyle={{
        default: { color: AppTheme.mutedForeground },
        selected: { color: AppTheme.primaryForeground, fontWeight: '700' },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Маршруты</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Построить</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="map">
        <NativeTabs.Trigger.Label>В пути</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tab-globe.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
