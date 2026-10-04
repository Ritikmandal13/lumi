/**
 * S11 Robot Dashboard / Detail Screen
 * Shows robot status, interactive RobotFace, quick emotion triggers,
 * hardware telemetry, member preview, and big Connect & Drive CTA.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Users,
  Clock,
  BatteryMedium,
  Wifi,
  Smile,
  Heart,
  Eye,
  Zap,
  Moon,
  HelpCircle,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme';
import { typography, spacing, radius, robotColors } from '../../../src/theme/tokens';
import { robotService, controlChannel, sessionService } from '../../../src/services';
import { RobotFace, type Emotion } from '../../../src/components/RobotFace';
import { StatusPill } from '../../../src/components/StatusPill';
import { Button } from '../../../src/components/Button';

const EMOTION_QUICK_ACTIONS: { emotion: Emotion; label: string; Icon: any }[] = [
  { emotion: 'happy', label: 'Happy', Icon: Smile },
  { emotion: 'love', label: 'Love', Icon: Heart },
  { emotion: 'curious', label: 'Curious', Icon: Eye },
  { emotion: 'excited', label: 'Excited', Icon: Zap },
  { emotion: 'sleepy', label: 'Sleepy', Icon: Moon },
];

export default function RobotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('happy');
  const [lastEmoteFeedback, setLastEmoteFeedback] = useState<string | null>(null);

  const {
    data: robot,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['robot', id],
    queryFn: () => robotService.getRobot(id as string),
    enabled: Boolean(id),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', id],
    queryFn: () => robotService.getMembers(id as string),
    enabled: Boolean(id),
  });

  const { data: recentSessions = [] } = useQuery({
    queryKey: ['sessions', id],
    queryFn: () => sessionService.listSessions({ robotId: id as string }),
    enabled: Boolean(id),
  });

  const faceColor =
    (robotColors as Record<string, string>)[robot?.color || 'violet'] ||
    robotColors.violet;

  const isOnline = robot?.status === 'online';
  const isBusy = robot?.status === 'busy';
  const isLowBattery = (robot?.batteryPercent ?? 100) < 15;
  const canConnect = isOnline && !isLowBattery;

  const handleSendQuickEmotion = (emotion: Emotion) => {
    setCurrentEmotion(emotion);
    controlChannel.sendEmotion(emotion);
    setLastEmoteFeedback(`Sent ${emotion}!`);
    setTimeout(() => setLastEmoteFeedback(null), 2000);
  };

  const cycleFaceEmotion = () => {
    const list: Emotion[] = ['happy', 'curious', 'wink', 'surprised', 'excited', 'love'];
    const nextIdx = (list.indexOf(currentEmotion) + 1) % list.length;
    setCurrentEmotion(list[nextIdx]);
  };

  if (isLoading || !robot) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <RobotFace size={64} color={robotColors.violet} emotion="curious" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t('common.loading', 'Loading…')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
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

        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {robot.name}
        </Text>

        <Pressable
          onPress={() => router.push(`/robot/${robot.id}/settings`)}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <SettingsIcon size={22} color={colors.textPrimary} />
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
        {/* Robot Face Card */}
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={[
            styles.heroCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Pressable onPress={cycleFaceEmotion} style={styles.faceTouchWrapper}>
            <RobotFace size={130} color={faceColor} emotion={currentEmotion} />
            <Text style={[styles.tapHint, { color: colors.textTertiary }]}>
              Tap face to emote
            </Text>
          </Pressable>

          <View style={styles.titleRow}>
            <Text style={[styles.robotName, { color: colors.textPrimary }]}>
              {robot.name}
            </Text>
            {robot.room && (
              <View
                style={[
                  styles.roomBadge,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <Text style={[styles.roomText, { color: colors.textSecondary }]}>
                  {robot.room}
                </Text>
              </View>
            )}
          </View>

          {/* Status and Telemetry Pills */}
          <View style={styles.statusRow}>
            <StatusPill status={robot.status} />

            {robot.batteryPercent != null && (
              <View
                style={[
                  styles.telemetryPill,
                  {
                    backgroundColor: isLowBattery
                      ? colors.error + '18'
                      : colors.surfaceAlt,
                  },
                ]}
              >
                <BatteryMedium
                  size={15}
                  color={isLowBattery ? colors.error : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.telemetryText,
                    {
                      color: isLowBattery ? colors.error : colors.textPrimary,
                    },
                  ]}
                >
                  {robot.batteryPercent}%
                </Text>
              </View>
            )}

            {robot.wifiSignal != null && (
              <View
                style={[
                  styles.telemetryPill,
                  { backgroundColor: colors.surfaceAlt },
                ]}
              >
                <Wifi size={15} color={colors.textSecondary} />
                <Text
                  style={[
                    styles.telemetryText,
                    { color: colors.textPrimary },
                  ]}
                >
                  {robot.wifiSignal}/4 bars
                </Text>
              </View>
            )}
          </View>

          {/* Offline / Low Battery Alerts */}
          {!isOnline && (
            <View
              style={[
                styles.alertBox,
                { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
              ]}
            >
              <HelpCircle size={18} color={colors.textSecondary} />
              <Text style={[styles.alertText, { color: colors.textSecondary }]}>
                {t('home.offlineReason', 'LUMI is offline. Make sure it is powered on and connected to WiFi.')}
              </Text>
            </View>
          )}

          {isLowBattery && isOnline && (
            <View
              style={[
                styles.alertBox,
                { backgroundColor: colors.error + '15', borderColor: colors.error + '40' },
              ]}
            >
              <BatteryMedium size={18} color={colors.error} />
              <Text style={[styles.alertText, { color: colors.error }]}>
                {t('robot.lowBattery', 'Battery is low. Charge LUMI soon.')}
              </Text>
            </View>
          )}

          {/* Connect & Drive Button */}
          <View style={styles.ctaWrapper}>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!canConnect}
              onPress={() => router.push(`/robot/${robot.id}/drive`)}
            >
              {isBusy
                ? t('home.busy', 'Someone is driving')
                : !isOnline
                ? t('common.offline', "You're offline")
                : t('home.connect', 'Connect & Drive')}
            </Button>
          </View>
        </Animated.View>

        {/* Quick Emotions Section */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(300)}
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('robot.quickEmotions', 'Quick emotions')}
            </Text>
            {lastEmoteFeedback && (
              <Text style={[styles.feedbackText, { color: colors.primary }]}>
                {lastEmoteFeedback}
              </Text>
            )}
          </View>

          <View style={styles.emotionGrid}>
            {EMOTION_QUICK_ACTIONS.map(({ emotion, label, Icon }) => {
              const isActive = currentEmotion === emotion;
              return (
                <Pressable
                  key={emotion}
                  onPress={() => handleSendQuickEmotion(emotion)}
                  style={[
                    styles.emotionBtn,
                    {
                      backgroundColor: isActive
                        ? colors.primary + '20'
                        : colors.surfaceAlt,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Icon
                    size={22}
                    color={isActive ? colors.primary : colors.textPrimary}
                  />
                  <Text
                    style={[
                      styles.emotionLabel,
                      {
                        color: isActive ? colors.primary : colors.textSecondary,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Sharing & Members Card */}
        <Animated.View
          entering={FadeInDown.delay(150).duration(300)}
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Pressable
            onPress={() => router.push(`/robot/${robot.id}/members`)}
            style={styles.membersRow}
          >
            <View style={styles.membersLeft}>
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colors.accent + '20' },
                ]}
              >
                <Users size={20} color={colors.accent} />
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                  {t('robot.members', 'Members')} ({members.length})
                </Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                  {robot.role === 'owner' ? 'You are Owner' : `Shared by ${robot.ownerName}`}
                </Text>
              </View>
            </View>

            <Button
              variant="secondary"
              size="sm"
              onPress={() => router.push(`/robot/${robot.id}/members`)}
            >
              Manage
            </Button>
          </Pressable>
        </Animated.View>

        {/* Recent Activity Preview */}
        {recentSessions.length > 0 && (
          <Animated.View
            entering={FadeInDown.delay(200).duration(300)}
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('robot.recentActivity', 'Recent activity')}
              </Text>
              <Clock size={16} color={colors.textTertiary} />
            </View>

            {recentSessions.slice(0, 2).map((s) => (
              <View key={s.id} style={styles.activityItem}>
                <View style={styles.activityLeft}>
                  <Text style={[styles.activityUser, { color: colors.textPrimary }]}>
                    {s.userName || 'Driver'}
                  </Text>
                  <Text style={[styles.activityDate, { color: colors.textTertiary }]}>
                    {new Date(s.startedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.ratingPill,
                    {
                      backgroundColor:
                        s.rating === 'great'
                          ? colors.success + '1A'
                          : colors.surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.ratingPillText,
                      {
                        color:
                          s.rating === 'great'
                            ? colors.success
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {s.rating?.toUpperCase() || 'OK'}
                  </Text>
                </View>
              </View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
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
  headerTitle: {
    ...typography.h3,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  heroCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  faceTouchWrapper: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  tapHint: {
    fontSize: 11,
    marginTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  robotName: {
    ...typography.h2,
  },
  roomBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  roomText: {
    ...typography.caption,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  telemetryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  telemetryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    width: '100%',
  },
  alertText: {
    ...typography.caption,
    flex: 1,
  },
  ctaWrapper: {
    width: '100%',
    marginTop: spacing.sm,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.h3,
  },
  feedbackText: {
    ...typography.caption,
    fontWeight: '700',
  },
  emotionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emotionBtn: {
    flex: 1,
    minWidth: 60,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 6,
  },
  emotionLabel: {
    fontSize: 11,
  },
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  membersLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    ...typography.bodyBold,
  },
  cardSub: {
    ...typography.caption,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  activityLeft: {
    gap: 2,
  },
  activityUser: {
    ...typography.body,
    fontWeight: '600',
  },
  activityDate: {
    ...typography.caption,
  },
  ratingPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  ratingPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
