/**
 * S19 Notifications Screen
 * Center for all robot events (battery warnings, disconnects, invites, access changes).
 * Mark all as read, tap to view, and unread badges.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bell,
  WifiOff,
  BatteryLow,
  UserCheck,
  Mail,
  ShieldAlert,
  Zap,
  CheckCheck,
} from 'lucide-react-native';
import { useTheme } from '../src/theme';
import { typography, spacing, radius } from '../src/theme/tokens';
import { notificationService } from '../src/services';
import type { AppNotification, NotificationType } from '../src/types';

function formatNotificationTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationIcon(type: NotificationType, colors: any) {
  switch (type) {
    case 'robot_offline':
      return <WifiOff size={20} color={colors.error} />;
    case 'battery_low':
      return <BatteryLow size={20} color={colors.warning} />;
    case 'someone_connected':
      return <UserCheck size={20} color={colors.primary} />;
    case 'invited':
      return <Mail size={20} color={colors.accent} />;
    case 'access_removed':
      return <ShieldAlert size={20} color={colors.error} />;
    case 'firmware_update':
      return <Zap size={20} color={colors.success} />;
    default:
      return <Bell size={20} color={colors.primary} />;
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  const {
    data: notifications = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.listNotifications(),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationPress = (notif: AppNotification) => {
    if (!notif.read) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.robotId) {
      router.push(`/robot/${notif.robotId}`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top,
            height: 56 + insets.top,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('notifications.title', 'Notifications')}
        </Text>

        <Pressable
          onPress={() => markAllReadMutation.mutate()}
          hitSlop={8}
          style={styles.markAllBtn}
        >
          <CheckCheck size={18} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + spacing.xxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {notifications.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <Bell size={36} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {t('notifications.empty', 'No notifications')}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              {"You're all caught up! Updates about your robots will show up here."}
            </Text>
          </View>
        ) : (
          notifications.map((notif, index) => (
            <Animated.View
              key={notif.id}
              entering={FadeInDown.delay(index * 40).duration(250)}
            >
              <Pressable
                onPress={() => handleNotificationPress(notif)}
                style={({ pressed }) => [
                  styles.notificationItem,
                  {
                    backgroundColor: notif.read
                      ? colors.surface
                      : colors.primary + '0A',
                    borderColor: notif.read ? colors.border : colors.primary + '30',
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  {getNotificationIcon(notif.type, colors)}
                </View>

                <View style={styles.textCol}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[
                        styles.notifTitle,
                        {
                          color: colors.textPrimary,
                          fontWeight: notif.read ? '600' : '800',
                        },
                      ]}
                    >
                      {notif.title}
                    </Text>
                    {!notif.read && (
                      <View
                        style={[
                          styles.unreadDot,
                          { backgroundColor: colors.primary },
                        ]}
                      />
                    )}
                  </View>

                  <Text
                    style={[styles.notifBody, { color: colors.textSecondary }]}
                  >
                    {notif.body}
                  </Text>

                  <Text
                    style={[styles.timeText, { color: colors.textTertiary }]}
                  >
                    {formatNotificationTime(notif.createdAt)}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h3,
  },
  markAllBtn: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifTitle: {
    ...typography.body,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notifBody: {
    ...typography.caption,
    lineHeight: 18,
  },
  timeText: {
    fontSize: 10,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
  },
});
