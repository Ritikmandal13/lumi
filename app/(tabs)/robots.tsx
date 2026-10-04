/**
 * S07 Home: My Robots
 * Shows every robot the user owns or has access to.
 * Connect in one tap from the card.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Bell,
  MoreVertical,
  Wifi,
  BatteryMedium,
  BatteryLow,
  User,
  Sun,
  Moon,
} from 'lucide-react-native';
import { RobotFace } from '../../src/components/RobotFace';
import { Button } from '../../src/components/Button';
import { StatusPill } from '../../src/components/StatusPill';
import { useTheme } from '../../src/theme';
import { typography, spacing, radius, robotColors } from '../../src/theme/tokens';
import { robotService } from '../../src/services';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { showAlert } from '../../src/features/dialog/dialogStore';
import { haptics } from '../../src/utils/haptics';
import type { Robot, RobotColorKey } from '../../src/types';

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RobotCard({ robot, index }: { robot: Robot; index: number }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const router = useRouter();
  const { t } = useTranslation();

  const faceColor =
    (robotColors as Record<string, string>)[robot.color] || robotColors.violet;
  const isLowBattery = (robot.batteryPercent ?? 100) < 15;
  const canConnect = robot.status === 'online' && !isLowBattery;

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.95 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
          theme.mode === 'light' && {
            shadowColor: '#14142B',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 12,
            elevation: 3,
          },
        ]}
        onPress={() => router.push(`/robot/${robot.id}` as any)}
        accessibilityLabel={`${robot.name}, ${robot.status}`}
      >
        {/* Top section with face and info */}
        <View style={styles.cardTop}>
          <View
            style={[
              styles.faceContainer,
              { backgroundColor: faceColor + '15' },
            ]}
          >
            <RobotFace
              size={72}
              emotion={
                robot.status === 'offline'
                  ? 'sleepy'
                  : robot.status === 'busy'
                    ? 'surprised'
                    : 'happy'
              }
              color={robot.color as RobotColorKey}
              animate={robot.status === 'online'}
            />
          </View>

          <View style={styles.cardInfo}>
            <Text style={[styles.robotName, { color: colors.textPrimary }]}>
              {robot.name}
            </Text>

            <View style={styles.statusRow}>
              <StatusPill
                status={robot.status}
                batteryLow={isLowBattery}
              />
            </View>

            <View style={styles.metaRow}>
              {/* Battery */}
              {robot.batteryPercent != null && (
                <View style={styles.metaItem}>
                  {isLowBattery ? (
                    <BatteryLow size={14} color={colors.warning} />
                  ) : (
                    <BatteryMedium size={14} color={colors.textSecondary} />
                  )}
                  <Text
                    style={[
                      styles.metaText,
                      {
                        color: isLowBattery
                          ? colors.warning
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {robot.batteryPercent}%
                  </Text>
                </View>
              )}

              {/* WiFi */}
              {robot.wifiSignal != null && (
                <View style={styles.metaItem}>
                  <Wifi size={14} color={colors.textSecondary} />
                  <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                    {robot.wifiSignal}/4
                  </Text>
                </View>
              )}
            </View>

            {/* Role label */}
            <View style={styles.roleRow}>
              <User size={12} color={colors.textSecondary} />
              <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                {robot.role === 'owner'
                  ? t('home.yours')
                  : t('home.sharedBy', { name: robot.ownerName })}
              </Text>
            </View>

            {robot.status === 'offline' && (
              <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
                {t('home.lastSeen', { time: timeAgo(robot.lastSeenAt) })}
              </Text>
            )}
          </View>

          <Pressable
            style={styles.menuButton}
            accessibilityLabel="Robot menu"
            hitSlop={8}
            onPress={(e) => {
              e?.stopPropagation?.();
              haptics.medium();
              showAlert(
                robot.name,
                'Choose an action for this robot:',
                [
                  {
                    text: 'Drive LUMI 🎮',
                    onPress: () => router.push(`/robot/${robot.id}/drive` as any),
                  },
                  {
                    text: 'Dashboard & Telemetry',
                    onPress: () => router.push(`/robot/${robot.id}` as any),
                  },
                  {
                    text: 'Settings & Appearance',
                    onPress: () => router.push(`/robot/${robot.id}/settings` as any),
                  },
                  {
                    text: 'Manage Members & Access',
                    onPress: () => router.push(`/robot/${robot.id}/members` as any),
                  },
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                ],
                'info'
              );
            }}
          >
            <MoreVertical size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Connect button */}
        <View style={styles.cardBottom}>
          <Button
            title={
              robot.status === 'busy'
                ? t('home.busy')
                : robot.status === 'offline'
                  ? t('home.offlineReason')
                  : t('home.connect')
            }
            variant={canConnect ? 'primary' : 'secondary'}
            size="medium"
            disabled={!canConnect}
            onPress={(e) => {
              e?.stopPropagation?.();
              router.push(`/robot/${robot.id}/drive` as any);
            }}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function EmptyState() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={styles.emptyState}
    >
      <RobotFace size={120} emotion="sleepy" animate={false} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        {t('home.emptyTitle')}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
        {t('home.emptyBody')}
      </Text>
      <View style={styles.emptyButtons}>
        <Button
          title={t('home.addRobot')}
          variant="primary"
          size="large"
          onPress={() => router.push('/add-robot' as any)}
        />
        <Button
          title={t('home.haveInvite')}
          variant="ghost"
          size="medium"
          onPress={() => router.push('/join' as any)}
        />
      </View>
    </Animated.View>
  );
}

export default function RobotsScreen() {
  const { t } = useTranslation();
  const { theme, isDark, toggleTheme } = useTheme();
  const colors = theme.colors;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const {
    data: robots,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['robots'],
    queryFn: () => robotService.listRobots(),
  });

  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      if (Platform.OS === 'android') {
        RNStatusBar.setBackgroundColor('transparent');
        RNStatusBar.setTranslucent(true);
      }
    }, [isDark])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={[styles.greeting, { color: colors.textPrimary }]}>
            {t('home.greeting', { name: user?.fullName?.split(' ')[0] || 'there' })}
          </Text>
        </Animated.View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={toggleTheme}
            style={styles.iconButton}
            accessibilityLabel="Toggle Theme"
          >
            {isDark ? (
              <Sun size={22} color={colors.accent} />
            ) : (
              <Moon size={22} color={colors.textPrimary} />
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/notifications' as any)}
            style={styles.iconButton}
            accessibilityLabel="Notifications"
          >
            <Bell size={24} color={colors.textPrimary} />
            {/* Unread dot */}
            <View style={[styles.unreadDot, { backgroundColor: colors.danger }]} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/settings' as any)}
            style={[styles.avatar, { backgroundColor: colors.primarySoft }]}
            accessibilityLabel="Settings"
          >
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {(user?.fullName || 'U').charAt(0).toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Loading skeleton */}
        {isLoading && (
          <View style={styles.skeletonContainer}>
            {[0, 1, 2].map((i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(i * 100).duration(300)}
                style={[styles.skeletonCard, { backgroundColor: colors.surfaceRaised }]}
              />
            ))}
          </View>
        )}

        {/* Empty state */}
        {!isLoading && (!robots || robots.length === 0) && <EmptyState />}

        {/* Robot cards */}
        {robots && robots.length > 0 && (
          <View style={styles.robotList}>
            {robots.map((robot, index) => (
              <RobotCard key={robot.id} robot={robot} index={index} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB - Add Robot */}
      {robots && robots.length > 0 && (
        <Animated.View
          entering={FadeIn.delay(400).duration(300)}
          style={styles.fabContainer}
        >
          <Pressable
            style={({ pressed }) => [
              styles.fab,
              {
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.92 : 1 }],
              },
            ]}
            onPress={() => router.push('/add-robot' as any)}
            accessibilityLabel={t('home.addRobot')}
          >
            <Plus size={28} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.base,
  },
  greeting: {
    ...typography.h1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.title,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: 100,
  },
  skeletonContainer: {
    gap: spacing.base,
    marginTop: spacing.base,
  },
  skeletonCard: {
    height: 180,
    borderRadius: radius.md,
  },
  robotList: {
    gap: spacing.base,
    marginTop: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    padding: spacing.base,
    gap: spacing.base,
  },
  faceContainer: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  robotName: {
    ...typography.title,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.caption,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roleText: {
    ...typography.caption,
  },
  lastSeen: {
    ...typography.caption,
    fontStyle: 'italic',
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBottom: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: spacing.base,
  },
  emptyTitle: {
    ...typography.h2,
    marginTop: spacing.base,
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
    maxWidth: 260,
  },
  emptyButtons: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: spacing.screenPadding,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
