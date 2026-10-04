/**
 * S01 Splash Screen
 * LUMI's OLED Eye Screen Hero on deep midnight dark theme,
 * matching the authentic hardware design language.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { OledEyePanel } from '../../src/components/OledEyePanel';
import { Button } from '../../src/components/Button';
import { typography, spacing } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/features/auth/useAuthStore';

export default function SplashScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { initialize, isAuthenticated } = useAuthStore();
  const [showRetry, setShowRetry] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Subtle pulsing glow for loading state
  const dotOpacity = useSharedValue(0.3);
  useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(0.3, { duration: 500 }),
      ),
      -1,
      true,
    );
  }, [dotOpacity]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  useEffect(() => {
    const timeout = setTimeout(() => setShowRetry(true), 6000);

    const initApp = async () => {
      try {
        await initialize();
        await new Promise((r) => setTimeout(r, 1200));
        setIsInitializing(false);
      } catch {
        setShowRetry(true);
      }
    };

    initApp();

    return () => clearTimeout(timeout);
  }, [initialize]);

  useEffect(() => {
    if (!isInitializing) {
      if (isAuthenticated) {
        router.replace('/(tabs)/robots' as any);
      } else {
        router.replace('/(auth)/onboarding' as any);
      }
    }
  }, [isInitializing, isAuthenticated, router]);

  const handleRetry = async () => {
    setShowRetry(false);
    setIsInitializing(true);
    try {
      await initialize();
      setIsInitializing(false);
    } catch {
      setShowRetry(true);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        {/* OLED Eye Panel Hero */}
        <View style={styles.oledWrapper}>
          <OledEyePanel mode="open" width={220} height={110} />
        </View>

        {!showRetry && (
          <Animated.View style={[styles.dots, dotStyle]}>
            <Text style={styles.dotText}>• • •</Text>
          </Animated.View>
        )}

        {showRetry && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={styles.retryContainer}
          >
            <Text style={styles.retryText}>
              {t('splash.retryMessage', 'Unable to connect to service.')}
            </Text>
            <Button
              title={t('splash.retry', 'Retry')}
              variant="secondary"
              size="medium"
              onPress={handleRetry}
              fullWidth={false}
              style={{ paddingHorizontal: 32 }}
            />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  oledWrapper: {
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontSize: 34,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 15,
    fontFamily: 'Figtree_400Regular',
    color: '#94A3B8',
    marginTop: 8,
  },
  dots: {
    marginTop: spacing.xl,
  },
  dotText: {
    fontSize: 24,
    letterSpacing: 8,
    color: '#64748B',
  },
  retryContainer: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.base,
  },
  retryText: {
    ...typography.body,
    fontFamily: 'Figtree_400Regular',
    color: '#94A3B8',
    textAlign: 'center',
  },
});
