/**
 * StatusPill — Online, Offline, Busy, Low battery
 * Color + icon + text, never color alone.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff, Circle, BatteryLow, Users } from 'lucide-react-native';
import { useColors } from '../theme';
import { typography, spacing, radius } from '../theme/tokens';
import type { RobotStatus } from '../types';

interface StatusPillProps {
  status: RobotStatus;
  batteryLow?: boolean;
}

export function StatusPill({ status, batteryLow }: StatusPillProps) {
  const colors = useColors();

  const statusConfigs = {
    online: {
      color: colors.success,
      bg: colors.success + '18',
      label: 'Online',
      Icon: Circle,
    },
    offline: {
      color: colors.textSecondary,
      bg: colors.surfaceRaised,
      label: 'Offline',
      Icon: WifiOff,
    },
    busy: {
      color: colors.warning,
      bg: colors.warning + '18',
      label: 'Busy',
      Icon: Users,
    },
  };

  const config = { ...(statusConfigs[status] || statusConfigs.offline) };

  // Override for low battery
  if (batteryLow && status === 'online') {
    config.color = colors.warning;
    config.bg = colors.warning + '18';
    config.label = 'Low battery';
    config.Icon = BatteryLow;
  }

  const { color, bg, label, Icon } = config;

  return (
    <View
      style={[styles.pill, { backgroundColor: bg }]}
      accessibilityLabel={`Status: ${label}`}
    >
      <Icon size={12} color={color} fill={status === 'online' && !batteryLow ? color : undefined} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    gap: 4,
    alignSelf: 'flex-start',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
});
