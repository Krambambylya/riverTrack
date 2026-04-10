import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#081F3E"
      indicatorColor="#1E5FAF"
      iconColor="#9EC6FF"
      tintColor="#FFFFFF"
      labelStyle={{ selected: { color: '#FFFFFF', fontWeight: '700' }, color: '#9EC6FF' }}>
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
