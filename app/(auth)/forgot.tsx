/**
 * S05 Forgot Password Screen
 * Email field, send reset link, confirmation view.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react-native';
import { TextField } from '../../src/components/TextField';
import { Button } from '../../src/components/Button';
import { useTheme } from '../../src/theme';
import { typography, spacing } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/features/auth/useAuthStore';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;
  const router = useRouter();
  const { forgotPassword, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const handleSend = async () => {
    if (!email.includes('@')) return;
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSent(true);
      startResendCountdown();
    } catch {
      // Error shown by store
    }
  };

  const startResendCountdown = () => {
    setResendCountdown(30);
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    try {
      await forgotPassword(email.trim().toLowerCase());
      startResendCountdown();
    } catch {
      // Error handled
    }
  };

  if (sent) {
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
          entering={FadeInDown.duration(400)}
          style={styles.sentContent}
        >
          <View
            style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}
          >
            <Mail size={40} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Check your email
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('auth.resetSent', { email })}
          </Text>

          <View style={styles.sentButtons}>
            <Button
              title={t('auth.openEmailApp')}
              variant="primary"
              size="large"
              onPress={() => {}}
            />
            <Button
              title={
                resendCountdown > 0
                  ? t('auth.resendIn', { seconds: resendCountdown })
                  : t('auth.resendCode')
              }
              variant="ghost"
              size="medium"
              disabled={resendCountdown > 0}
              onPress={handleResend}
            />
            <Button
              title={t('auth.backToLogin')}
              variant="ghost"
              size="medium"
              onPress={() => router.back()}
            />
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + spacing.xl,
              paddingBottom: Math.max(insets.bottom, 16) + spacing.lg,
            },
          ]}
        >
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t('auth.resetPassword')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {"Enter your email and we'll send you a reset link."}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            <TextField
              label={t('auth.email')}
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
            />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.buttonContainer}
          >
            <Button
              title={t('auth.sendResetLink')}
              variant="primary"
              size="large"
              loading={isLoading}
              disabled={!email.includes('@')}
              onPress={handleSend}
            />
            <Button
              title={t('auth.backToLogin')}
              variant="ghost"
              size="medium"
              onPress={() => router.back()}
            />
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.screenPadding,
  },
  sentContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 300,
  },
  buttonContainer: {
    gap: spacing.base,
  },
  sentButtons: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
