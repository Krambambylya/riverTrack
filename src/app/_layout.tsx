import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { useColorScheme } from 'react-native';

import { AppTheme } from '@/constants/theme';
import { AnimatedSplashOverlay } from '@/shared/ui/animated-icon';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: AppTheme.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="route-modal"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            animationDuration: 180,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
