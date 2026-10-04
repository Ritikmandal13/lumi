/**
 * TextField component
 * Label, hint, error, password show/hide, clear button.
 * Min 48dp touch area.
 */

import React, { useState, forwardRef } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeOff, X } from 'lucide-react-native';
import { useColors } from '../theme';
import { typography, spacing } from '../theme/tokens';

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  isPassword?: boolean;
  showClear?: boolean;
  leftIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  onClear?: () => void;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(
  (
    {
      label,
      hint,
      error,
      isPassword = false,
      showClear = false,
      leftIcon,
      containerStyle,
      onClear,
      value,
      onChangeText,
      ...rest
    },
    ref,
  ) => {
    const colors = useColors();
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const hasError = !!error;
    const borderColor = hasError
      ? colors.danger
      : isFocused
        ? colors.primary
        : 'transparent';

    return (
      <View style={[styles.container, containerStyle]}>
        {label && (
          <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
        )}
        <View
          style={[
            styles.inputContainer,
            {
              borderColor,
              backgroundColor: colors.surfaceRaised,
            },
          ]}
        >
          {leftIcon && <View style={styles.leftIconWrapper}>{leftIcon}</View>}
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            secureTextEntry={isPassword && !showPassword}
            onFocus={(e) => {
              setIsFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              rest.onBlur?.(e);
            }}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                paddingLeft: leftIcon ? 0 : spacing.base,
              },
            ]}
            accessibilityLabel={label}
            {...rest}
          />
          {isPassword && (
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={styles.iconButton}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              hitSlop={8}
            >
              {showPassword ? (
                <EyeOff size={20} color={colors.textSecondary} />
              ) : (
                <Eye size={20} color={colors.textSecondary} />
              )}
            </Pressable>
          )}
          {showClear && value && value.length > 0 && (
            <Pressable
              onPress={() => {
                onChangeText?.('');
                onClear?.();
              }}
              style={styles.iconButton}
              accessibilityLabel="Clear"
              hitSlop={8}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
        {(hint || error) && (
          <Text
            style={[
              styles.hint,
              { color: hasError ? colors.danger : colors.textSecondary },
            ]}
          >
            {error || hint}
          </Text>
        )}
      </View>
    );
  },
);

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Figtree_600SemiBold',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 18,
    minHeight: 54,
  },
  leftIconWrapper: {
    paddingLeft: spacing.base,
    paddingRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Figtree_400Regular',
    paddingRight: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 50,
  },
  iconButton: {
    paddingHorizontal: spacing.md,
    minWidth: 44,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    ...typography.caption,
    fontFamily: 'Figtree_400Regular',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
