import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/shared/ui/animated-icon';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack
        screenOptions={{
          headerShown: false,
          // Единый фон карты стека, чтобы при снятии модалки не было белой вспышки.
          contentStyle: { backgroundColor: '#061A35' },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="route-modal"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: '#0C2A52' },
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
