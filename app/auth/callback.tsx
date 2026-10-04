import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { useTheme } from '../../src/theme';
import { typography, spacing } from '../../src/theme/tokens';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { initialize } = useAuthStore();

  useEffect(() => {
    let isMounted = true;

    async function handleAuth() {
      try {
        const code = typeof params.code === 'string' ? params.code : undefined;
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        // Refresh user store session
        await initialize();

        if (isMounted) {
          router.replace('/(tabs)/robots' as any);
        }
      } catch {
        if (isMounted) {
          router.replace('/(auth)/login' as any);
        }
      }
    }

    handleAuth();

    return () => {
      isMounted = false;
    };
  }, [params, router, initialize]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        Signing you in with Google...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.base,
    padding: spacing.xl,
  },
  text: {
    ...typography.body,
    fontWeight: '600',
  },
});
