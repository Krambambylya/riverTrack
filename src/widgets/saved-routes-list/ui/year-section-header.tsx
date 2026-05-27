import { AppTheme } from '@/constants/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function YearSectionHeader({ year }: { year: number }) {
  const rawId = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fillId = `yearHdr-${rawId}`;

  return (
    <View style={styles.yearHeader}>
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AppTheme.background} stopOpacity={1} />
            <Stop offset="0.45" stopColor={AppTheme.background} stopOpacity={0.55} />
            <Stop offset="1" stopColor={AppTheme.background} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${fillId})`} />
      </Svg>
      <Text style={styles.yearHeaderText}>{year}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  yearHeader: {
    position: 'relative',
    overflow: 'hidden',
    paddingTop: 6,
    paddingBottom: 12,
    alignItems: 'center',
  },
  yearHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppTheme.mutedForeground,
    letterSpacing: 1.2,
    textAlign: 'center',
    width: '100%',
    zIndex: 1,
  },
});
