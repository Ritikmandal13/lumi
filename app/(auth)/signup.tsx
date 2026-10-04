/**
 * S02 Sign Up Screen
 * Bespoke hardware aesthetic featuring LUMI's happy curved OLED Eyes,
 * Bricolage Grotesque and Figtree typography, dark top with elevated white sheet.
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
import { Sun, Moon, User, Mail, Lock, Check, ArrowRight } from 'lucide-react-native';
import { TextField } from '../../src/components/TextField';
import { OledEyePanel } from '../../src/components/OledEyePanel';
import { GoogleLogo } from '../../src/components/GoogleLogo';
import { useTheme } from '../../src/theme';
import { useAuthStore } from '../../src/features/auth/useAuthStore';

export default function SignUpScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = theme.colors;
  const router = useRouter();
  const { signUp, signInWithGoogle, isLoading, error, clearError } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isFieldFocused, setIsFieldFocused] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) errors.fullName = 'Full name is required';
    if (!email.includes('@')) errors.email = 'Enter a valid email';
    if (password.length < 8) errors.password = 'Must be at least 8 characters';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignUp = async () => {
    clearError();
    if (!validate()) return;
    try {
      await signUp(fullName.trim(), email.trim().toLowerCase(), password);
      const state = useAuthStore.getState();
      if (state.isAuthenticated) {
        router.replace('/(tabs)/robots' as any);
      } else {
        router.push('/(auth)/verify' as any);
      }
    } catch {
      // Error is set in store
    }
  };

  const handleGoogleSignUp = async () => {
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
            <Text style={styles.logoText}>LUMI</Text>

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

          {/* OLED Eyes Screen Hero — Happy Smiling Eyes (^ ^) */}
          <View style={styles.oledContainer}>
            <OledEyePanel
              mode="happy"
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
            {/* Header: Warmer Copy */}
            <Text
              style={[
                styles.sheetTitle,
                { color: isDark ? colors.textPrimary : '#0F172A' },
              ]}
            >
              Say hi to LUMI
            </Text>
            <Text style={styles.sheetSubtitle}>
              Create your account in a minute.
            </Text>

            {error && (
              <View style={[styles.errorBanner, { backgroundColor: colors.danger + '18' }]}>
                <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
              </View>
            )}

            {/* Full Name Field */}
            <TextField
              label="Full name"
              placeholder="Your name"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                if (fieldErrors.fullName) setFieldErrors((e) => ({ ...e, fullName: '' }));
              }}
              error={fieldErrors.fullName}
              leftIcon={<User size={20} color="#94A3B8" />}
              onFocus={() => setIsFieldFocused(true)}
              onBlur={() => setIsFieldFocused(false)}
            />

            {/* Email Field */}
            <TextField
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: '' }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={fieldErrors.email}
              leftIcon={<Mail size={20} color="#94A3B8" />}
              onFocus={() => setIsFieldFocused(true)}
              onBlur={() => setIsFieldFocused(false)}
            />

            {/* Password Field */}
            <TextField
              label="Password"
              placeholder="8+ characters, a letter and a num"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: '' }));
              }}
              error={fieldErrors.password}
              isPassword
              leftIcon={<Lock size={20} color="#94A3B8" />}
              onFocus={() => setIsFieldFocused(true)}
              onBlur={() => setIsFieldFocused(false)}
            />

            {/* Terms Checkbox */}
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setAgreedToTerms(!agreedToTerms)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreedToTerms }}
              accessibilityLabel="Agree to terms and privacy policy"
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: agreedToTerms ? '#4F46E5' : 'transparent',
                    borderColor: agreedToTerms ? '#4F46E5' : '#CBD5E1',
                  },
                ]}
              >
                {agreedToTerms && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={styles.checkboxText}>
                I agree to the <Text style={styles.legalHighlight}>Terms</Text> and{' '}
                <Text style={styles.legalHighlight}>Privacy Policy</Text>
              </Text>
            </Pressable>

            {/* Primary Action Button: Dark Pill with Amber Circle Arrow */}
            <Pressable
              onPress={handleSignUp}
              disabled={isLoading || isGoogleLoading || !agreedToTerms}
              style={({ pressed }) => [
                styles.primaryBtn,
                !agreedToTerms && styles.disabledBtn,
                pressed && styles.pressedBtn,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Create account</Text>
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
              onPress={handleGoogleSignUp}
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
              <Text style={styles.footerText}>Already have an account? </Text>
              <Pressable
                onPress={() => router.push('/(auth)/login' as any)}
                accessibilityRole="link"
                accessibilityLabel="Log in"
                hitSlop={8}
              >
                <Text style={styles.footerLinkText}>Log in</Text>
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 24,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxText: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#64748B',
    flex: 1,
  },
  legalHighlight: {
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
