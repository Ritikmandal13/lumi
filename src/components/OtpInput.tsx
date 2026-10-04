/**
 * OtpInput component
 * Battle-tested single-underlying-input pattern:
 * - 6 beautifully animated visual boxes with active glow & cursor
 * - Single hidden TextInput handling all keystrokes, numeric keyboard, paste & backspace
 * - Native one-time-code autofill support (SMS / email)
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../theme';
import { typography, spacing, radius } from '../theme/tokens';

export interface OtpInputProps {
  value: string;
  length?: number;
  codeLength?: number;
  onChange?: (code: string) => void;
  onChangeText?: (code: string) => void;
  error?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function OtpInput({
  value,
  length,
  codeLength = 6,
  onChange,
  onChangeText,
  error,
  autoFocus = true,
  disabled = false,
}: OtpInputProps) {
  const effectiveLength = length || codeLength;
  const colors = useColors();
  const inputRef = useRef<TextInput>(null);
  const shakeX = useSharedValue(0);
  const [isFocused, setIsFocused] = useState(false);

  const notifyChange = (val: string) => {
    if (onChange) onChange(val);
    if (onChangeText) onChangeText(val);
  };

  useEffect(() => {
    if (error) {
      shakeX.value = withSequence(
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 50 }),
        withTiming(-10, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [error, shakeX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleChangeText = (text: string) => {
    const cleaned = text.replace(/[^0-9A-Za-z]/g, '').slice(0, effectiveLength);
    notifyChange(cleaned);
  };

  const handleContainerPress = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Generate array of length effectiveLength
  const slots = Array.from({ length: effectiveLength }, (_, i) => value[i] || '');

  return (
    <View style={styles.wrapper}>
      {/* Hidden real TextInput */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        maxLength={effectiveLength}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        editable={!disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={styles.hiddenInput}
        caretHidden
      />

      {/* Visual digit boxes */}
      <Pressable onPress={handleContainerPress} accessibilityRole="button">
        <Animated.View style={[styles.container, animatedStyle]}>
          {slots.map((digit, index) => {
            const isFilled = !!digit;
            // The currently active box (waiting for next digit)
            const isCurrent = isFocused && (value.length === index || (value.length === effectiveLength && index === effectiveLength - 1));

            return (
              <View
                key={index}
                style={[
                  styles.box,
                  {
                    borderColor: error
                      ? colors.danger
                      : isCurrent
                      ? colors.primary
                      : isFilled
                      ? colors.primary + '80'
                      : colors.border,
                    backgroundColor: isFilled
                      ? colors.primarySoft
                      : colors.surfaceRaised,
                    borderWidth: isCurrent ? 2.5 : 1.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.digitText,
                    {
                      color: colors.textPrimary,
                    },
                  ]}
                >
                  {digit}
                </Text>
              </View>
            );
          })}
        </Animated.View>
      </Pressable>

      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    position: 'relative',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    zIndex: -1,
  },
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  box: {
    width: 48,
    height: 58,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  digitText: {
    ...typography.h1,
    textAlign: 'center',
    fontWeight: '700',
  },
  error: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
