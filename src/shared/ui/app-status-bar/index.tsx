import { useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

function segmentList(segments: readonly string[]): string[] {
  return segments as string[];
}

/**
 * Светлые иконки статус-бара на тёмном UI (вкладка «Маршруты», модалка со скримом),
 * тёмные — на светлом фоне под статус-баром (карта на «Построить» / «В пути»).
 */
export function AppStatusBar() {
  const segments = useSegments();
  const segs = segmentList(segments);
  const root = segs[0];
  const leaf = segs[segs.length - 1] ?? '';

  if (!root) {
    return <StatusBar style="light" />;
  }

  if (root === 'route-modal' || segs.includes('route-modal')) {
    return <StatusBar style="light" />;
  }

  const isHomeTab =
    root === '(tabs)' &&
    (segs.length === 1 || (leaf !== 'explore' && leaf !== 'map'));

  if (isHomeTab) {
    return <StatusBar style="light" />;
  }

  return <StatusBar style="dark" />;
}
