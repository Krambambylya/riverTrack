import { AppTheme } from '@/constants/theme';
import { AppStatusBar } from '@/shared/ui/app-status-bar';
import { AnimatedSplashOverlay } from '@/shared/ui/animated-icon';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppStatusBar />
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
