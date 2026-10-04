/**
 * S04 Log In Screen
 * Bespoke hardware aesthetic featuring LUMI's OLED Eye Screen Hero,
 * warm copy, distinct amber-arrow action button, and deep layered white sheet.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Sun, Moon, Mail, Lock, ArrowRight } from 'lucide-react-native';
import { TextField } from '../../src/components/TextField';
import { OledEyePanel } from '../../src/components/OledEyePanel';
import { GoogleLogo } from '../../src/components/GoogleLogo';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/features/auth/useAuthStore';

export default function LoginScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;
  const router = useRouter();
  const { logIn, signInWithGoogle, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFieldFocused, setIsFieldFocused] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);

  // Hidden developer tap gesture: 4 taps on the "LUMI" logo auto-fills demo account
  const handleSecretDevTap = () => {
    const nextCount = devTapCount + 1;
    if (nextCount >= 4) {
      setEmail('demo@lumi.app');
      setPassword('password123');
      clearError();
      setDevTapCount(0);
    } else {
      setDevTapCount(nextCount);
    }
  };

  const handleLogin = async () => {
    clearError();
    if (!email.includes('@') || !password) return;
    try {
      await logIn(email.trim().toLowerCase(), password);
      router.replace('/(tabs)/robots' as any);
    } catch {
      // Error is set in store
    }
  };

  const handleGoogleSignIn = async () => {
    clearError();
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/(tabs)/robots' as any);
    } catch {
      // Error is set in store
    } finally {
      setIsGoogleLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      RNStatusBar.setBarStyle('light-content', true);
      if (Platform.OS === 'android') {
        RNStatusBar.setBackgroundColor('transparent');
        RNStatusBar.setTranslucent(true);
      }
    }, [])
  );

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* Dark Hero Section */}
        <View
          style={[
            styles.heroSection,
            { paddingTop: Math.max(insets.top, 16) + 8 },
          ]}
        >
          {/* Top Bar: LUMI Title + Theme Switcher */}
          <View style={styles.topBar}>
            <Pressable
              onPress={handleSecretDevTap}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="LUMI App Logo"
            >
              <Text style={styles.logoText}>LUMI</Text>
            </Pressable>

            <Pressable
              onPress={toggleTheme}
              style={styles.themeCircleBtn}
              accessibilityRole="button"
              accessibilityLabel="Toggle theme"
            >
              {isDark ? (
                <Sun size={20} color="#FFB84D" />
              ) : (
                <Moon size={20} color="#CBD5E1" />
              )}
            </Pressable>
          </View>

          {/* OLED Eyes Screen Hero */}
          <View style={styles.oledContainer}>
            <OledEyePanel
              mode="open"
              isFieldFocused={isFieldFocused}
              width={220}
              height={108}
            />
          </View>
        </View>

        {/* Rounded Bottom Sheet */}
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: isDark ? colors.surface : '#FFFFFF',
              paddingBottom: Math.max(insets.bottom, 24) + 56,
            },
          ]}
        >
          <Animated.View entering={FadeInDown.duration(350)}>
            {/* Warmer Copy Header */}
            <Text
              style={[
                styles.sheetTitle,
                { color: isDark ? colors.textPrimary : '#0F172A' },
              ]}
            >
              Welcome back
            </Text>
            <Text style={styles.sheetSubtitle}>
              Log in to drive your LUMI.
            </Text>

            {error && (
              <View style={[styles.errorBanner, { backgroundColor: colors.danger + '18' }]}>
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            )}

            {/* Email Field with Left Icon */}
            <TextField
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              leftIcon={<Mail size={20} color="#94A3B8" />}
              onFocus={() => setIsFieldFocused(true)}
              onBlur={() => setIsFieldFocused(false)}
            />

            {/* Password Field with Left Icon & Eye Toggle */}
            <TextField
              label="Password"
              placeholder="Your password"
              value={password}
              onChangeText={setPassword}
              isPassword
              leftIcon={<Lock size={20} color="#94A3B8" />}
              onFocus={() => setIsFieldFocused(true)}
              onBlur={() => setIsFieldFocused(false)}
            />

            {/* Forgot Password Link */}
            <Pressable
              onPress={() => router.push('/(auth)/forgot' as any)}
              style={styles.forgotRow}
              accessibilityRole="link"
              accessibilityLabel="Forgot password"
              hitSlop={8}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            {/* Primary Action Button: Dark Pill with Amber Circle Arrow */}
            <Pressable
              onPress={handleLogin}
              disabled={isLoading || isGoogleLoading || !email || !password}
              style={({ pressed }) => [
                styles.primaryBtn,
                (!email || !password) && styles.disabledBtn,
                pressed && styles.pressedBtn,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Log in</Text>
                  <View style={styles.amberArrowBadge}>
                    <ArrowRight size={18} color="#0D0E1A" strokeWidth={2.5} />
                  </View>
                </>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Continue with Google Button */}
            <Pressable
              onPress={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading}
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && styles.pressedBtn,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              {isGoogleLoading ? (
                <ActivityIndicator color="#0D0E1A" size="small" />
              ) : (
                <>
                  <GoogleLogo size={20} />
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </Pressable>

            {/* Footer Navigation Link */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>New to LUMI? </Text>
              <Pressable
                onPress={() => router.push('/(auth)/signup' as any)}
                accessibilityRole="link"
                accessibilityLabel="Create account"
                hitSlop={8}
              >
                <Text style={styles.footerLinkText}>Create account</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#0D0E1A',
  },
  screenScroll: {
    flex: 1,
    backgroundColor: '#0D0E1A',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  heroSection: {
    backgroundColor: '#0D0E1A',
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 22,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 2.5,
  },
  themeCircleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#161829',
    borderWidth: 1,
    borderColor: '#242742',
    justifyContent: 'center',
    alignItems: 'center',
  },
  oledContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  bottomSheet: {
    flex: 1,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 32,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  sheetTitle: {
    fontSize: 30,
    fontFamily: 'BricolageGrotesque_700Bold',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    fontSize: 16,
    fontFamily: 'Figtree_400Regular',
    color: '#64748B',
    marginTop: 6,
    marginBottom: 26,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Figtree_500Medium',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginBottom: 24,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: 'Figtree_600SemiBold',
    color: '#4F46E5',
  },
  primaryBtn: {
    height: 58,
    borderRadius: 20,
    backgroundColor: '#0F1020',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 24,
    paddingRight: 12,
  },
  primaryBtnText: {
    fontSize: 17,
    fontFamily: 'BricolageGrotesque_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  amberArrowBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  pressedBtn: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Figtree_500Medium',
    color: '#94A3B8',
  },
  googleBtn: {
    height: 56,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleGContainer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleGLetter: {
    fontSize: 13,
    fontFamily: 'Figtree_700Bold',
    color: '#1E293B',
  },
  googleBtnText: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
    color: '#0F172A',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  footerText: {
    fontSize: 15,
    fontFamily: 'Figtree_400Regular',
    color: '#64748B',
  },
  footerLinkText: {
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
    color: '#4F46E5',
  },
});
