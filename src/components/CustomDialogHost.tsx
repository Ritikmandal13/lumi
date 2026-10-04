/**
 * Custom Dialog Host Component
 * Renders the custom LUMI dialog modal with theme awareness, spring animations, and haptics.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { AlertTriangle, AlertOctagon, CheckCircle2, Info } from 'lucide-react-native';
import { useDialogStore, type DialogButton } from '../features/dialog/dialogStore';
import { useTheme } from '../theme';
import { typography, spacing, radius } from '../theme/tokens';
import { haptics } from '../utils/haptics';

export function CustomDialogHost() {
  const { isOpen, options, close } = useDialogStore();
  const { theme, isDark } = useTheme();
  const colors = theme.colors;

  if (!isOpen || !options) return null;

  const { title, message, type = 'info', buttons = [] } = options;

  const getIcon = () => {
    switch (type) {
      case 'danger':
      case 'error':
        return <AlertOctagon size={28} color={colors.danger} />;
      case 'warning':
        return <AlertTriangle size={28} color={colors.warning} />;
      case 'success':
        return <CheckCircle2 size={28} color={colors.success} />;
      default:
        return <Info size={28} color={colors.primary} />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'danger':
      case 'error':
        return colors.danger + '18';
      case 'warning':
        return colors.warning + '18';
      case 'success':
        return colors.success + '18';
      default:
        return colors.primary + '18';
    }
  };

  const handleButtonPress = (btn: DialogButton) => {
    if (btn.style === 'destructive') {
      haptics.heavy();
    } else {
      haptics.light();
    }
    close();
    btn.onPress?.();
  };

  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={styles.backdrop}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              entering={ZoomIn.duration(200)}
              exiting={ZoomOut.duration(150)}
              style={[
                styles.dialogCard,
                {
                  backgroundColor: isDark ? '#141726' : '#FFFFFF',
                  borderColor: isDark ? '#282D4A' : '#E2E8F0',
                },
              ]}
            >
              {/* Icon */}
              <View style={[styles.iconCircle, { backgroundColor: getIconBg() }]}>
                {getIcon()}
              </View>

              {/* Title & Message */}
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                {title}
              </Text>

              {message ? (
                <Text style={[styles.message, { color: colors.textSecondary }]}>
                  {message}
                </Text>
              ) : null}

              {/* Buttons Stack */}
              <View style={styles.buttonStack}>
                {buttons.map((btn, idx) => {
                  const isDestructive = btn.style === 'destructive';
                  const isCancel = btn.style === 'cancel';

                  let btnBg = colors.primary;
                  let textColor = '#FFFFFF';

                  if (isDestructive) {
                    btnBg = colors.danger;
                  } else if (isCancel) {
                    btnBg = isDark ? '#1F2438' : '#F1F5F9';
                    textColor = colors.textPrimary;
                  }

                  return (
                    <Pressable
                      key={idx}
                      onPress={() => handleButtonPress(btn)}
                      style={({ pressed }) => [
                        styles.dialogBtn,
                        {
                          backgroundColor: btnBg,
                          opacity: pressed ? 0.85 : 1,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        },
                      ]}
                    >
                      <Text style={[styles.btnText, { color: textColor }]}>
                        {btn.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screenPadding,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  buttonStack: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dialogBtn: {
    width: '100%',
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
});
