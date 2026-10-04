/**
 * S18 Join by Invite Screen
 * Allows entering an invite code to become a controller of someone's LUMI.
 * Displays preview of who invited and permissions, with Accept/Decline actions.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
  X,
  MailOpen,
  Eye,
  Mic,
  Gamepad2,
} from 'lucide-react-native';
import { useTheme } from '../src/theme';
import { typography, spacing, radius, robotColors } from '../src/theme/tokens';
import { robotService } from '../src/services';
import { OtpInput } from '../src/components/OtpInput';
import { Button } from '../src/components/Button';
import { RobotFace } from '../src/components/RobotFace';
import type { Robot } from '../src/types';

export default function JoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRobot, setPreviewRobot] = useState<Robot | null>(null);

  const handleVerifyCode = async (inviteCode: string) => {
    if (inviteCode.length !== 6) return;
    setIsVerifying(true);
    setError(null);

    try {
      // In mock, acceptInvite returns the robot
      const robot = await robotService.acceptInvite(inviteCode);
      setPreviewRobot(robot);
    } catch (e: any) {
      setError(e.message || t('join.invalidCode', "This invite code isn't valid."));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAccept = () => {
    if (!previewRobot) return;
    Alert.alert('Joined!', `You now have access to control ${previewRobot.name}.`, [
      {
        text: 'View Robot',
        onPress: () => {
          router.replace({
            pathname: '/robot/[id]',
            params: { id: previewRobot.id },
          });
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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
        <View style={{ width: 22 }} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('join.title', 'Join by invite')}
        </Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <X size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View
        style={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 16) + spacing.xl },
        ]}
      >
        {!previewRobot ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.inputSection}>
            <View style={styles.heroCenter}>
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: colors.primary + '18' },
                ]}
              >
                <MailOpen size={40} color={colors.primary} />
              </View>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {t('join.enterCode', 'Enter the invite code')}
              </Text>
              <Text
                style={[styles.heroSubtitle, { color: colors.textSecondary }]}
              >
                Enter the 6-character code shared by the LUMI owner.
              </Text>
            </View>

            <View style={styles.otpWrapper}>
              <OtpInput
                length={6}
                value={code}
                onChangeText={(val) => {
                  setCode(val);
                  setError(null);
                  if (val.length === 6) {
                    handleVerifyCode(val);
                  }
                }}
                error={error || undefined}
                autoFocus
              />
            </View>

            <View style={styles.bottomBtn}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={isVerifying}
                disabled={code.length !== 6 || isVerifying}
                onPress={() => handleVerifyCode(code)}
              >
                {t('addRobot.continue', 'Continue')}
              </Button>
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={styles.previewSection}
          >
            <View style={styles.heroCenter}>
              <RobotFace
                size={90}
                color={robotColors.violet}
                emotion="excited"
              />
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {previewRobot.name}
              </Text>
              <Text
                style={[styles.heroSubtitle, { color: colors.textSecondary }]}
              >
                {t('join.inviteFrom', {
                  name: previewRobot.ownerName || 'The owner',
                  robot: previewRobot.name,
                })}
              </Text>
            </View>

            {/* Permissions list */}
            <View
              style={[
                styles.permissionsCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text
                style={[
                  styles.permissionsHeader,
                  { color: colors.textTertiary },
                ]}
              >
                WHAT YOU CAN DO
              </Text>

              <View style={styles.permissionItem}>
                <Eye size={18} color={colors.primary} />
                <Text
                  style={[styles.permissionText, { color: colors.textPrimary }]}
                >
                  Watch real-time live camera feed
                </Text>
              </View>

              <View style={styles.permissionItem}>
                <Mic size={18} color={colors.primary} />
                <Text
                  style={[styles.permissionText, { color: colors.textPrimary }]}
                >
                  Talk through LUMI with two-way voice
                </Text>
              </View>

              <View style={styles.permissionItem}>
                <Gamepad2 size={18} color={colors.primary} />
                <Text
                  style={[styles.permissionText, { color: colors.textPrimary }]}
                >
                  Drive with joystick and trigger gestures
                </Text>
              </View>
            </View>

            <View style={styles.previewActions}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onPress={handleAccept}
              >
                {t('join.accept', 'Accept')}
              </Button>

              <Button
                variant="ghost"
                size="md"
                fullWidth
                onPress={() => router.back()}
              >
                {t('join.decline', 'Decline')}
              </Button>
            </View>
          </Animated.View>
        )}
      </View>
    </KeyboardAvoidingView>
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
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  inputSection: {
    flex: 1,
    justifyContent: 'space-between',
  },
  heroCenter: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.h2,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  otpWrapper: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  bottomBtn: {
    marginBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
  previewSection: {
    flex: 1,
    justifyContent: 'space-between',
  },
  permissionsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  permissionsHeader: {
    ...typography.overline,
    marginBottom: 2,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  permissionText: {
    ...typography.body,
    flex: 1,
  },
  previewActions: {
    gap: spacing.sm,
    marginBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
});
