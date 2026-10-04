/**
 * S16 Activity Log Tab
 * Displays past driving sessions with filters (All, Driven by me, Others).
 * Shows robot face, duration, driver, and session rating.
 */

import React, { useState, useMemo, useCallback } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  User as UserIcon,
  Smile,
  Meh,
  AlertTriangle,
  History,
} from 'lucide-react-native';
import { useTheme } from '../../src/theme';
import { typography, spacing, radius, robotColors } from '../../src/theme/tokens';
import { sessionService, robotService } from '../../src/services';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { RobotFace } from '../../src/components/RobotFace';
import type { Robot } from '../../src/types';

type FilterType = 'all' | 'me' | 'others';

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'Ongoing';
  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

export default function ActivityScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const {
    data: sessions = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionService.listSessions(),
  });

  const { data: robots = [] } = useQuery({
    queryKey: ['robots'],
    queryFn: () => robotService.listRobots(),
  });

  const robotMap = useMemo(() => {
    const map = new Map<string, Robot>();
    robots.forEach((r) => map.set(r.id, r));
    return map;
  }, [robots]);

  const filteredSessions = useMemo(() => {
    if (activeFilter === 'me') {
      return sessions.filter((s) => s.userId === user?.id || s.userName === user?.fullName);
    }
    if (activeFilter === 'others') {
      return sessions.filter((s) => s.userId !== user?.id && s.userName !== user?.fullName);
    }
    return sessions;
  }, [sessions, activeFilter, user]);

  const { isDark } = useTheme();

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
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top + spacing.sm,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {t('activity.title', 'Activity')}
        </Text>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setActiveFilter('all')}
          style={[
            styles.filterChip,
            {
              backgroundColor:
                activeFilter === 'all' ? colors.primary : colors.surface,
              borderColor:
                activeFilter === 'all' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              {
                color:
                  activeFilter === 'all' ? colors.primaryText : colors.textSecondary,
                fontWeight: activeFilter === 'all' ? '700' : '500',
              },
            ]}
          >
            {t('activity.all', 'All')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveFilter('me')}
          style={[
            styles.filterChip,
            {
              backgroundColor:
                activeFilter === 'me' ? colors.primary : colors.surface,
              borderColor:
                activeFilter === 'me' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              {
                color:
                  activeFilter === 'me' ? colors.primaryText : colors.textSecondary,
                fontWeight: activeFilter === 'me' ? '700' : '500',
              },
            ]}
          >
            {t('activity.drivenByMe', 'Driven by me')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveFilter('others')}
          style={[
            styles.filterChip,
            {
              backgroundColor:
                activeFilter === 'others' ? colors.primary : colors.surface,
              borderColor:
                activeFilter === 'others' ? colors.primary : colors.border,
            },
          ]}
        >
          <Text
            style={[
              styles.filterChipText,
              {
                color:
                  activeFilter === 'others' ? colors.primaryText : colors.textSecondary,
                fontWeight: activeFilter === 'others' ? '700' : '500',
              },
            ]}
          >
            {t('activity.others', 'Others')}
          </Text>
        </Pressable>
      </View>

      {/* Sessions List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {filteredSessions.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <History size={36} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {t('activity.emptyTitle', 'No sessions yet')}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              {t('activity.emptyBody', 'Your driving sessions will appear here.')}
            </Text>
          </View>
        ) : (
          filteredSessions.map((session, index) => {
            const robot = robotMap.get(session.robotId);
            const robotColor =
              (robotColors as Record<string, string>)[robot?.color || 'violet'] ||
              robotColors.violet;

            return (
              <Animated.View
                key={session.id}
                entering={FadeInDown.delay(index * 60).duration(300)}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.robotIdentity}>
                    <View
                      style={[
                        styles.faceMiniWrapper,
                        { backgroundColor: robotColor + '1A' },
                      ]}
                    >
                      <RobotFace
                        size={36}
                        color={robotColor}
                        emotion={session.rating === 'great' ? 'happy' : 'neutral'}
                      />
                    </View>
                    <View style={styles.robotNameCol}>
                      <Text
                        style={[styles.robotName, { color: colors.textPrimary }]}
                      >
                        {session.robotName || robot?.name || 'LUMI'}
                      </Text>
                      <Text
                        style={[styles.sessionDate, { color: colors.textTertiary }]}
                      >
                        {formatDate(session.startedAt)}
                      </Text>
                    </View>
                  </View>

                  {/* Rating Badge */}
                  {session.rating && (
                    <View
                      style={[
                        styles.ratingBadge,
                        {
                          backgroundColor:
                            session.rating === 'great'
                              ? colors.success + '1A'
                              : session.rating === 'problem'
                              ? colors.error + '1A'
                              : colors.warning + '1A',
                        },
                      ]}
                    >
                      {session.rating === 'great' && (
                        <Smile size={16} color={colors.success} />
                      )}
                      {session.rating === 'ok' && (
                        <Meh size={16} color={colors.warning} />
                      )}
                      {session.rating === 'problem' && (
                        <AlertTriangle size={16} color={colors.error} />
                      )}
                      <Text
                        style={[
                          styles.ratingText,
                          {
                            color:
                              session.rating === 'great'
                                ? colors.success
                                : session.rating === 'problem'
                                ? colors.error
                                : colors.warning,
                          },
                        ]}
                      >
                        {session.rating.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Session Meta */}
                <View
                  style={[
                    styles.cardFooter,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <View style={styles.metaItem}>
                    <Clock size={14} color={colors.textSecondary} />
                    <Text
                      style={[styles.metaText, { color: colors.textSecondary }]}
                    >
                      {formatDuration(session.startedAt, session.endedAt)}
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <UserIcon size={14} color={colors.textSecondary} />
                    <Text
                      style={[styles.metaText, { color: colors.textSecondary }]}
                    >
                      {session.userName || 'You'}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterChipText: {
    ...typography.caption,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  robotIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  faceMiniWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  robotNameCol: {
    gap: 2,
  },
  robotName: {
    ...typography.bodyBold,
  },
  sessionDate: {
    ...typography.caption,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    ...typography.caption,
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
