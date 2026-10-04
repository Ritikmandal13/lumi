/**
 * S13 Session End Screen
 * Shown right after ending a live driving session.
 * Displays duration, prompts for rating (Great / OK / Problem),
 * and offers quick return to drive or home.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
  Smile,
  Meh,
  AlertTriangle,
  Clock,
  MessageSquare,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme';
import { typography, spacing, radius, robotColors } from '../../../src/theme/tokens';
import { sessionService } from '../../../src/services';
import { RobotFace } from '../../../src/components/RobotFace';
import { Button } from '../../../src/components/Button';
import { showAlert } from '../../../src/features/dialog/dialogStore';
import { haptics } from '../../../src/utils/haptics';

export default function SessionEndScreen() {
  const { id, sessionId, duration, robotName } = useLocalSearchParams<{
    id: string;
    sessionId?: string;
    duration?: string;
    robotName?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  const [rating, setRating] = useState<'great' | 'ok' | 'problem' | null>(null);

  const seconds = Number(duration || 0);
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  const durationFormatted =
    minutes > 0
      ? `${minutes}m ${remainingSecs}s`
      : `${remainingSecs}s`;

  const handleRate = async (selected: 'great' | 'ok' | 'problem') => {
    if (selected === 'great') haptics.success();
    else if (selected === 'ok') haptics.light();
    else haptics.warning();

    setRating(selected);
    if (sessionId) {
      try {
        await sessionService.rateSession(sessionId, selected);
      } catch (err) {
        console.warn('Failed to rate session:', err);
      }
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: Math.max(insets.bottom, 16) + spacing.lg,
        },
      ]}
    >
      <Animated.View
        entering={FadeInDown.duration(350)}
        style={styles.content}
      >
        {/* Top Celebration / Face */}
        <View style={styles.heroCenter}>
          <RobotFace
            size={96}
            color={robotColors.violet}
            emotion={rating === 'problem' ? 'sad' : 'happy'}
          />

          <View
            style={[
              styles.sparkleBadge,
              { backgroundColor: colors.primary + '18' },
            ]}
          >
            <Clock size={14} color={colors.primary} />
            <Text style={[styles.sparkleText, { color: colors.primary }]}>
              {durationFormatted}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('live.sessionEnded', 'Session ended')}
          </Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            with {robotName || 'LUMI'}
          </Text>
        </View>

        {/* Rating Section */}
        <View
          style={[
            styles.ratingCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.ratingPrompt, { color: colors.textPrimary }]}>
            {t('live.howWasIt', 'How was your session?')}
          </Text>

          <View style={styles.ratingButtonsRow}>
            {/* Great */}
            <Pressable
              onPress={() => handleRate('great')}
              style={[
                styles.ratingBtn,
                {
                  backgroundColor:
                    rating === 'great'
                      ? colors.success + '20'
                      : colors.surfaceAlt,
                  borderColor:
                    rating === 'great' ? colors.success : colors.border,
                },
              ]}
            >
              <Smile
                size={28}
                color={rating === 'great' ? colors.success : colors.textSecondary}
              />
              <Text
                style={[
                  styles.ratingLabel,
                  {
                    color:
                      rating === 'great' ? colors.success : colors.textPrimary,
                    fontWeight: rating === 'great' ? '700' : '500',
                  },
                ]}
              >
                {t('live.great', 'Great')}
              </Text>
            </Pressable>

            {/* OK */}
            <Pressable
              onPress={() => handleRate('ok')}
              style={[
                styles.ratingBtn,
                {
                  backgroundColor:
                    rating === 'ok'
                      ? colors.warning + '20'
                      : colors.surfaceAlt,
                  borderColor:
                    rating === 'ok' ? colors.warning : colors.border,
                },
              ]}
            >
              <Meh
                size={28}
                color={rating === 'ok' ? colors.warning : colors.textSecondary}
              />
              <Text
                style={[
                  styles.ratingLabel,
                  {
                    color:
                      rating === 'ok' ? colors.warning : colors.textPrimary,
                    fontWeight: rating === 'ok' ? '700' : '500',
                  },
                ]}
              >
                {t('live.ok', 'OK')}
              </Text>
            </Pressable>

            {/* Problem */}
            <Pressable
              onPress={() => handleRate('problem')}
              style={[
                styles.ratingBtn,
                {
                  backgroundColor:
                    rating === 'problem'
                      ? colors.error + '20'
                      : colors.surfaceAlt,
                  borderColor:
                    rating === 'problem' ? colors.error : colors.border,
                },
              ]}
            >
              <AlertTriangle
                size={28}
                color={rating === 'problem' ? colors.error : colors.textSecondary}
              />
              <Text
                style={[
                  styles.ratingLabel,
                  {
                    color:
                      rating === 'problem' ? colors.error : colors.textPrimary,
                    fontWeight: rating === 'problem' ? '700' : '500',
                  },
                ]}
              >
                {t('live.problem', 'Problem')}
              </Text>
            </Pressable>
          </View>

          {rating === 'problem' && (
            <Pressable
              onPress={() => {
                haptics.light();
                showAlert(
                  'Report a Problem',
                  'Thanks for reporting. We logged network telemetry from this session to help improve connection stability.',
                  undefined,
                  'info'
                );
              }}
              style={styles.problemReportLink}
            >
              <MessageSquare size={14} color={colors.primary} />
              <Text style={[styles.problemReportText, { color: colors.primary }]}>
                {t('live.reportProblem', 'Tell us what went wrong')}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => {
              router.replace({
                pathname: '/robot/[id]/drive',
                params: { id: id as string },
              });
            }}
          >
            {t('live.connectAgain', 'Connect again')}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => router.replace('/(tabs)/robots')}
          >
            {t('live.backToHome', 'Back to home')}
          </Button>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    gap: spacing.xl,
  },
  heroCenter: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  sparkleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  sparkleText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  title: {
    ...typography.h2,
    marginTop: spacing.xs,
  },
  subTitle: {
    ...typography.body,
  },
  ratingCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  ratingPrompt: {
    ...typography.h3,
    textAlign: 'center',
  },
  ratingButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ratingBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    gap: 6,
  },
  ratingLabel: {
    fontSize: 12,
  },
  problemReportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.xs,
  },
  problemReportText: {
    ...typography.caption,
    fontWeight: '600',
  },
  actions: {
    gap: spacing.md,
  },
});
