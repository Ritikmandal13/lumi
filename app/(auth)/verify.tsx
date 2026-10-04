/**
 * S06 Verify Email Screen
 * Displays confirmation message when a verification link is sent via Supabase email auth.
 * Allows user to open their email app, resend the link, or proceed to login.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar as RNStatusBar, Linking } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Mail, ArrowRight, RefreshCw } from 'lucide-react-native';
import { Button } from '../../src/components/Button';
import { RobotFace } from '../../src/components/RobotFace';
import { useTheme } from '../../src/theme';
import { typography, spacing, radius } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { showAlert } from '../../src/features/dialog/dialogStore';
import { haptics } from '../../src/utils/haptics';

export default function VerifyEmailScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;
  const router = useRouter();
  const { user, resendVerification, isLoading, clearError } = useAuthStore();

  const [resendCountdown, setResendCountdown] = useState(30);
  const [resendSuccess, setResendSuccess] = useState(false);

  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      if (Platform.OS === 'android') {
        RNStatusBar.setBackgroundColor('transparent');
        RNStatusBar.setTranslucent(true);
      }
    }, [isDark])
  );

  const userEmail = user?.email || 'your email';

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const handleOpenEmailApp = async () => {
    try {
      haptics.light();
      if (Platform.OS === 'android') {
        await Linking.openURL('mailto:');
      } else {
        await Linking.openURL('message:');
      }
    } catch {
      showAlert('Open Email', 'Please check your email client for the LUMI verification link.', undefined, 'info');
    }
  };

  const handleResend = async () => {
    clearError();
    try {
      haptics.light();
      await resendVerification(user?.email);
      haptics.success();
      setResendSuccess(true);
      setResendCountdown(60);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (e: any) {
      showAlert('Resend Failed', e.message || 'Could not resend email link.', undefined, 'error');
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
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Animated.View
        entering={FadeInDown.duration(400)}
        style={styles.content}
      >
        <View style={styles.faceWrap}>
          <RobotFace size={100} emotion="happy" animate />
          <View style={[styles.mailBadge, { backgroundColor: colors.primary }]}>
            <Mail size={18} color="#FFFFFF" />
          </View>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Check your email
        </Text>
        
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {"We've sent a confirmation link to:"}
        </Text>
        
        <View style={[styles.emailBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emailText, { color: colors.primary }]}>
            {userEmail}
          </Text>
        </View>

        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          Tap the link in your email to activate your account and jump straight into LUMI.
        </Text>

        {resendSuccess && (
          <View style={[styles.successBanner, { backgroundColor: colors.success + '20', borderColor: colors.success }]}>
            <Text style={[styles.successText, { color: colors.success }]}>
              New verification link sent!
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <Button
            title="Open Email App"
            variant="primary"
            size="large"
            icon={<Mail size={18} color="#FFF" style={{ marginRight: 8 }} />}
            onPress={handleOpenEmailApp}
          />

          <Button
            title="I've confirmed my email — Log in"
            variant="secondary"
            size="large"
            icon={<ArrowRight size={18} color={colors.textPrimary} style={{ marginRight: 8 }} />}
            onPress={() => router.replace('/(auth)/login' as any)}
          />

          <Button
            title={
              resendCountdown > 0
                ? `Resend link in ${resendCountdown}s`
                : 'Resend confirmation link'
            }
            variant="ghost"
            size="medium"
            disabled={resendCountdown > 0 || isLoading}
            icon={<RefreshCw size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />}
            onPress={handleResend}
          />

          <Button
            title="Use a different email"
            variant="ghost"
            size="medium"
            onPress={() => router.back()}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  faceWrap: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  mailBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0D0E1A',
  },
  title: {
    ...typography.h1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emailBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  emailText: {
    ...typography.title,
    fontWeight: '700',
  },
  desc: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
    lineHeight: 18,
  },
  successBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  successText: {
    fontSize: 12,
    fontWeight: '600',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
    alignItems: 'center',
  },
});
