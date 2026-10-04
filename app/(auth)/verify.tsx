/**
 * S06 Verify Email Screen
 * OTP 6-digit code, resend timer, change email link.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar as RNStatusBar } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { OtpInput } from '../../src/components/OtpInput';
import { Button } from '../../src/components/Button';
import { RobotFace } from '../../src/components/RobotFace';
import { useTheme } from '../../src/theme';
import { typography, spacing } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/features/auth/useAuthStore';

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;
  const router = useRouter();
  const { user, verifyEmail, resendVerification, isLoading, error, clearError } = useAuthStore();

  const [code, setCode] = useState('');
  const [resendCountdown, setResendCountdown] = useState(30);

  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      if (Platform.OS === 'android') {
        RNStatusBar.setBackgroundColor('transparent');
        RNStatusBar.setTranslucent(true);
      }
    }, [isDark])
  );

  const userEmail = user?.email;

  const handleVerify = useCallback(
    async (verifyCode: string) => {
      if (verifyCode.length !== 6) return;
      clearError();
      try {
        await verifyEmail(verifyCode, userEmail);
        router.replace('/(tabs)/robots' as any);
      } catch {
        // Error set in store, shake handled by OtpInput
      }
    },
    [clearError, router, verifyEmail, userEmail],
  );

  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  useEffect(() => {
    if (code.length === 6) {
      handleVerify(code);
    }
  }, [code, handleVerify]);

  const handleResend = async () => {
    clearError();
    await resendVerification(user?.email);
    setResendCountdown(30);
    setCode('');
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
        <RobotFace size={100} emotion="surprised" animate />

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('auth.verifyEmail', 'Verify your email')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('auth.verifyEmailBody', { email: user?.email || 'your email' })}
        </Text>

        <View style={styles.otpContainer}>
          <OtpInput
            value={code}
            onChange={setCode}
            error={error || undefined}
            disabled={isLoading}
            autoFocus
          />
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={t('auth.confirm', 'Verify code')}
            variant="primary"
            size="large"
            disabled={code.length !== 6}
            loading={isLoading}
            onPress={() => handleVerify(code)}
          />

          <Button
            title={
              resendCountdown > 0
                ? t('auth.resendIn', { seconds: resendCountdown })
                : t('auth.resendCode', 'Resend code')
            }
            variant="ghost"
            size="medium"
            disabled={resendCountdown > 0 || isLoading}
            onPress={handleResend}
          />

          <Button
            title={t('auth.changeEmail', 'Change email')}
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
  title: {
    ...typography.h1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 300,
  },
  otpContainer: {
    marginBottom: spacing.xl,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
    alignItems: 'center',
  },
});
