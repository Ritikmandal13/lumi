/**
 * S17 App Settings Tab
 * Account details, appearance (system/light/dark), language, sound/haptics,
 * about info, log out, and delete account.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Modal,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  User as UserIcon,
  Moon,
  Sun,
  Smartphone,
  Volume2,
  Vibrate,
  Shield,
  FileText,
  Info,
  LogOut,
  Trash2,
  ChevronRight,
  Check,
} from 'lucide-react-native';
import { useTheme } from '../../src/theme';
import { typography, spacing, radius } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/features/auth/useAuthStore';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';

export default function SettingsScreen() {
  const { theme, preference, setPreference, isDark } = useTheme();
  const colors = theme.colors;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user, logOut, deleteAccount } = useAuthStore();

  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      if (Platform.OS === 'android') {
        RNStatusBar.setBackgroundColor('transparent');
        RNStatusBar.setTranslucent(true);
      }
    }, [isDark])
  );

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  // Theme modal
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      t('auth.logOut', 'Log out'),
      'Are you sure you want to log out of LUMI?',
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('auth.logOut', 'Log out'),
          style: 'destructive',
          onPress: async () => {
            await logOut();
            router.replace('/(auth)/login');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Error', 'Please type DELETE to confirm.');
      return;
    }
    if (!deletePassword) {
      Alert.alert('Error', 'Please enter your password.');
      return;
    }

    try {
      setIsDeleting(true);
      await deleteAccount(deletePassword);
      setShowDeleteModal(false);
      router.replace('/(auth)/login');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top + spacing.sm,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {t('robotSettings.title', 'Settings')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + spacing['4xl'] },
        ]}
      >
        {/* User Profile Card */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.avatarCircle,
              { backgroundColor: colors.primary + '20' },
            ]}
          >
            <UserIcon size={32} color={colors.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.fullName || 'LUMI Explorer'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user?.email || 'user@example.com'}
            </Text>
          </View>
        </View>

        {/* Section: Appearance & Experience */}
        <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
          PREFERENCES
        </Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Theme selector */}
          <Pressable
            onPress={() => setShowThemeModal(true)}
            style={({ pressed }) => [
              styles.rowItem,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <View style={styles.rowLeft}>
              {preference === 'dark' ? (
                <Moon size={20} color={colors.primary} />
              ) : preference === 'light' ? (
                <Sun size={20} color={colors.primary} />
              ) : (
                <Smartphone size={20} color={colors.primary} />
              )}
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Theme
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                {preference === 'system'
                  ? 'System'
                  : preference === 'dark'
                  ? 'Dark'
                  : 'Light'}
              </Text>
              <ChevronRight size={18} color={colors.textTertiary} />
            </View>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Sound toggle */}
          <View style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <Volume2 size={20} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Sound Effects
              </Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              thumbColor={colors.primaryText}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Haptics toggle */}
          <View style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <Vibrate size={20} color={colors.primary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Haptic Feedback
              </Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={setHapticsEnabled}
              thumbColor={colors.primaryText}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Section: About */}
        <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
          ABOUT
        </Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <Info size={20} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Version
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              1.0.0 (Build 42)
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => Alert.alert('Privacy Policy', 'LUMI stores minimal session data and adheres to top privacy standards.')}
            style={({ pressed }) => [
              styles.rowItem,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <View style={styles.rowLeft}>
              <Shield size={20} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Privacy Policy
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => Alert.alert('Terms of Service', 'By using LUMI, you agree to responsible robot operation rules.')}
            style={({ pressed }) => [
              styles.rowItem,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <View style={styles.rowLeft}>
              <FileText size={20} color={colors.textSecondary} />
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
                Terms of Service
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Section: Account Actions */}
        <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
          ACCOUNT
        </Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Log Out */}
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.rowItem,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <View style={styles.rowLeft}>
              <LogOut size={20} color={colors.warning} />
              <Text style={[styles.rowLabel, { color: colors.warning }]}>
                {t('auth.logOut', 'Log out')}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Delete Account */}
          <Pressable
            onPress={() => setShowDeleteModal(true)}
            style={({ pressed }) => [
              styles.rowItem,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <View style={styles.rowLeft}>
              <Trash2 size={20} color={colors.error} />
              <Text style={[styles.rowLabel, { color: colors.error }]}>
                {t('auth.deleteAccount', 'Delete account')}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Theme Selection Modal */}
      <Modal
        visible={showThemeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowThemeModal(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Choose Theme
            </Text>

            {(['system', 'light', 'dark'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => {
                  setPreference(mode);
                  setShowThemeModal(false);
                }}
                style={[
                  styles.themeOptionRow,
                  {
                    backgroundColor:
                      preference === mode ? colors.primary + '15' : 'transparent',
                  },
                ]}
              >
                <View style={styles.rowLeft}>
                  {mode === 'system' ? (
                    <Smartphone size={20} color={colors.primary} />
                  ) : mode === 'light' ? (
                    <Sun size={20} color={colors.primary} />
                  ) : (
                    <Moon size={20} color={colors.primary} />
                  )}
                  <Text
                    style={[
                      styles.themeOptionText,
                      {
                        color:
                          preference === mode ? colors.primary : colors.textPrimary,
                        fontWeight: preference === mode ? '700' : '500',
                      },
                    ]}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </View>
                {preference === mode && (
                  <Check size={20} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.deleteIconCircle,
                { backgroundColor: colors.error + '20' },
              ]}
            >
              <Trash2 size={28} color={colors.error} />
            </View>

            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {t('auth.deleteAccount', 'Delete account')}
            </Text>
            <Text
              style={[styles.modalSubtitle, { color: colors.textSecondary }]}
            >
              {t(
                'auth.deleteAccountWarning',
                'This will permanently delete your account, all your robots and their data, and your activity history.',
              )}
            </Text>

            <View style={styles.inputGroup}>
              <TextField
                label={t('auth.typeDelete', 'Type DELETE to confirm')}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="DELETE"
                autoCapitalize="characters"
              />

              <TextField
                label={t('auth.enterPassword', 'Enter your password to confirm')}
                value={deletePassword}
                onChangeText={setDeletePassword}
                placeholder="••••••••"
                secureTextEntry
              />
            </View>

            <View style={styles.modalButtons}>
              <Button
                variant="secondary"
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                style={{ flex: 1 }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant="destructive"
                onPress={handleDeleteAccount}
                loading={isDeleting}
                disabled={
                  deleteConfirmText.trim().toUpperCase() !== 'DELETE' ||
                  !deletePassword
                }
                style={{ flex: 1 }}
              >
                {t('auth.deleteMyAccount', 'Delete my account')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h2,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    ...typography.h3,
  },
  userEmail: {
    ...typography.caption,
  },
  sectionHeader: {
    ...typography.overline,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    ...typography.body,
    fontWeight: '500',
  },
  rowValue: {
    ...typography.caption,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 20 + spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    ...typography.caption,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  themeOptionText: {
    ...typography.body,
  },
  modalCard: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  deleteIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  inputGroup: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
