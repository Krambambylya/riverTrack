import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const isLight = scheme === 'light' || scheme === 'unspecified';
  const c = Colors[isLight ? 'light' : 'dark'];

  return (
    <NativeTabs
      backgroundColor={isLight ? '#F0F4F8' : '#081F3E'}
      indicatorColor={isLight ? '#38B6FF' : '#1E5FAF'}
      iconColor={
        isLight
          ? { default: c.textSecondary, selected: c.text }
          : { default: '#9EC6FF', selected: '#FFFFFF' }
      }
      tintColor={isLight ? c.text : '#FFFFFF'}
      labelStyle={
        isLight
          ? {
              default: { color: c.textSecondary },
              selected: { color: c.text, fontWeight: '700' },
            }
          : {
              default: { color: '#9EC6FF' },
              selected: { color: '#FFFFFF', fontWeight: '700' },
            }
      }>
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
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
