/**
 * Button component
 * Variants: primary, secondary, ghost, danger / destructive
 * Sizes: large / lg (56h), medium / md (48h), small / sm (36h)
 * States: loading, disabled
 * Min 48x48 touch target, accessibility label, pressed state
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type PressableProps,
  type StyleProp,
} from 'react-native';
import { useColors } from '../theme';
import { typography, spacing, radius } from '../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
export type ButtonSize = 'large' | 'medium' | 'small' | 'lg' | 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title?: string;
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  children,
  variant = 'primary',
  size = 'large',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
  onPress,
  ...rest
}: ButtonProps) {
  const colors = useColors();
  const isDisabled = disabled || loading;
  const isDanger = variant === 'danger' || variant === 'destructive';

  const getBackgroundColor = useCallback(
    (pressed: boolean) => {
      if (isDisabled) {
        return variant === 'ghost' ? 'transparent' : colors.surfaceRaised;
      }
      if (isDanger) {
        return pressed ? colors.danger + 'CC' : colors.danger;
      }
      switch (variant) {
        case 'primary':
          return pressed ? colors.primary + 'CC' : colors.primary;
        case 'secondary':
          return pressed ? colors.surfaceRaised : colors.surface;
        case 'ghost':
          return pressed ? colors.surfaceRaised : 'transparent';
        default:
          return colors.primary;
      }
    },
    [variant, isDisabled, colors, isDanger],
  );

  const getTextColor = useCallback(() => {
    if (isDisabled) return colors.textSecondary;
    if (isDanger) return '#FFFFFF';
    switch (variant) {
      case 'primary':
        return '#FFFFFF';
      case 'secondary':
        return colors.textPrimary;
      case 'ghost':
        return colors.primary;
      default:
        return '#FFFFFF';
    }
  }, [variant, isDisabled, colors, isDanger]);

  const getBorder = useCallback(() => {
    if (variant === 'secondary') {
      return { borderWidth: 1, borderColor: colors.border };
    }
    return {};
  }, [variant, colors]);

  const isSmall = size === 'small' || size === 'sm';
  const isMed = size === 'medium' || size === 'md';

  const buttonHeight = isSmall ? 36 : isMed ? 48 : 56;
  const content = children != null ? children : title;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: buttonHeight,
          backgroundColor: getBackgroundColor(pressed),
          opacity: pressed ? 0.92 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        getBorder(),
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {icon && <>{icon}</>}
          {typeof content === 'string' ? (
            <Text
              style={[
                styles.text,
                isSmall && styles.textSmall,
                { color: getTextColor() },
              ]}
            >
              {content}
            </Text>
          ) : (
            content
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    minHeight: 36,
  },
  text: {
    ...typography.button,
  },
  textSmall: {
    fontSize: 14,
  },
});
