/**
 * Subtle Premium Haptic Feedback Utilities
 * Centralized haptic feedback using expo-haptics with safe fallbacks.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  /** Soft, subtle click for standard buttons, tabs, and toggles */
  light: () => {
    if (!isAvailable) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  },

  /** Defined mechanical click for important controls, drawers, locks */
  medium: () => {
    if (!isAvailable) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  },

  /** Strong thud for emergency stop, disconnects, high-impact actions */
  heavy: () => {
    if (!isAvailable) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
  },

  /** Light tick for selection lists, speed pickers, sliders, and tab changes */
  selection: () => {
    if (!isAvailable) return;
    try {
      Haptics.selectionAsync();
    } catch {}
  },

  /** Celebration pulse for pairing success, saving settings */
  success: () => {
    if (!isAvailable) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  },

  /** Warning double-pulse for low battery, warnings, destructive confirmations */
  warning: () => {
    if (!isAvailable) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
  },

  /** Sharp pulse for validation errors, denied permissions */
  error: () => {
    if (!isAvailable) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  },
};
