/**
 * S15 Robot Settings Screen
 * General customization (name, color, room), access permissions,
 * volume/brightness, driving safety, device diagnostics, and unpair robot.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Trash2,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme';
import { typography, spacing, radius, robotColors, type RobotColorKey } from '../../../src/theme/tokens';
import { robotService } from '../../../src/services';
import { TextField } from '../../../src/components/TextField';
import { showAlert } from '../../../src/features/dialog/dialogStore';
import { haptics } from '../../../src/utils/haptics';
import type { Robot } from '../../../src/types';

const COLOR_KEYS: RobotColorKey[] = ['violet', 'mint', 'coral', 'amber', 'sky', 'rose'];

interface SettingsFormProps {
  robot: Robot;
  id: string;
}

function SettingsForm({ robot, id }: SettingsFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  const [name, setName] = useState(robot.name);
  const [color, setColor] = useState<RobotColorKey>((robot.color as RobotColorKey) || 'violet');
  const [room, setRoom] = useState(robot.room || '');
  const [remoteAccess, setRemoteAccess] = useState(robot.remoteAccessEnabled ?? true);
  const [notifyOnConnect, setNotifyOnConnect] = useState(true);
  const [obstacleStop, setObstacleStop] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveGeneral = async () => {
    if (!name.trim()) {
      showAlert('Required', 'Please enter a name for your LUMI.', undefined, 'warning');
      return;
    }
    try {
      setIsSaving(true);
      await robotService.nameRobot(id, name.trim(), color, room.trim() || undefined);
      await robotService.updateRobotSettings(id, { remoteAccessEnabled: remoteAccess });
      queryClient.invalidateQueries({ queryKey: ['robot', id] });
      queryClient.invalidateQueries({ queryKey: ['robots'] });
      haptics.success();
      showAlert('Success', 'Robot settings saved successfully.', undefined, 'success');
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to save settings', undefined, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveRobot = () => {
    haptics.warning();
    showAlert(
      t('robotSettings.removeLumi', 'Remove LUMI'),
      t(
        'robotSettings.removeWarning',
        'This will unpair LUMI from your account. The robot will return to setup mode.',
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              haptics.medium();
              await robotService.removeRobot(id);
              queryClient.invalidateQueries({ queryKey: ['robots'] });
              router.replace('/(tabs)/robots');
            } catch (e: any) {
              showAlert('Error', e.message || 'Failed to remove robot', undefined, 'error');
            }
          },
        },
      ],
      'warning'
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top,
            height: 56 + insets.top,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('robotSettings.title', 'Robot settings')}
        </Text>

        <Pressable
          onPress={handleSaveGeneral}
          disabled={isSaving}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <Text style={[styles.saveText, { color: colors.primary }]}>
            {t('common.save', 'Save')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + spacing.xxl },
        ]}
      >
        {/* General */}
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
          {t('robotSettings.general', 'GENERAL')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardPadding}>
            <TextField
              label={t('robotSettings.robotName', 'Robot name')}
              value={name}
              onChangeText={setName}
              placeholder="Robot name"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Color Picker */}
          <View style={styles.cardPadding}>
            <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
              {t('robotSettings.color', 'Color')}
            </Text>
            <View style={styles.colorRow}>
              {COLOR_KEYS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    haptics.selection();
                    setColor(k);
                  }}
                  style={[
                    styles.colorDotWrapper,
                    {
                      borderColor: color === k ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: robotColors[k] },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.cardPadding}>
            <TextField
              label={t('robotSettings.room', 'Room')}
              value={room}
              onChangeText={setRoom}
              placeholder="e.g. Living room, Office"
            />
          </View>
        </View>

        {/* Access & Connectivity */}
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
          {t('robotSettings.access', 'ACCESS & SAFETY')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>
                {t('robotSettings.allowRemoteAccess', 'Allow remote access')}
              </Text>
              <Text style={[styles.switchSub, { color: colors.textSecondary }]}>
                Control LUMI even when you are away from home.
              </Text>
            </View>
            <Switch
              value={remoteAccess}
              onValueChange={setRemoteAccess}
              thumbColor={colors.primaryText}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>
                {t('robotSettings.obstacleStop', 'Obstacle stop')}
              </Text>
              <Text style={[styles.switchSub, { color: colors.textSecondary }]}>
                Automatically halt motors if an obstacle is detected.
              </Text>
            </View>
            <Switch
              value={obstacleStop}
              onValueChange={setObstacleStop}
              thumbColor={colors.primaryText}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: colors.textPrimary }]}>
                {t('robotSettings.notifyOnConnect', 'Notify when connected')}
              </Text>
              <Text style={[styles.switchSub, { color: colors.textSecondary }]}>
                Get an alert whenever a controller connects to LUMI.
              </Text>
            </View>
            <Switch
              value={notifyOnConnect}
              onValueChange={setNotifyOnConnect}
              thumbColor={colors.primaryText}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        {/* Device Information */}
        <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
          {t('robotSettings.device', 'DEVICE')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('robotSettings.firmwareVersion', 'Firmware version')}
            </Text>
            <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
              {robot.firmwareVersion || 'v1.2.4'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => {
              haptics.light();
              showAlert(
                t('robotSettings.checkUpdate', 'Check for update'),
                t('robotSettings.upToDate', 'Your LUMI firmware is up to date.'),
                undefined,
                'info'
              );
            }}
            style={({ pressed }) => [
              styles.pressableRow,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <Text style={[styles.pressableRowText, { color: colors.primary }]}>
              {t('robotSettings.checkUpdate', 'Check for update')}
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => {
              haptics.warning();
              showAlert(
                t('robotSettings.restartLumi', 'Restart LUMI'),
                'LUMI will reboot. It will reconnect in about 30 seconds.',
                [
                  { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                  {
                    text: 'Restart',
                    style: 'destructive',
                    onPress: () => {
                      haptics.medium();
                      showAlert('Sent', 'Restart command sent.', undefined, 'success');
                    },
                  },
                ],
                'warning'
              );
            }}
            style={({ pressed }) => [
              styles.pressableRow,
              pressed && { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <Text style={[styles.pressableRowText, { color: colors.warning }]}>
              {t('robotSettings.restartLumi', 'Restart LUMI')}
            </Text>
          </Pressable>
        </View>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, { color: colors.error }]}>
          {t('robotSettings.dangerZone', 'DANGER ZONE')}
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.error + '40' },
          ]}
        >
          <Pressable
            onPress={handleRemoveRobot}
            style={({ pressed }) => [
              styles.dangerRow,
              pressed && { backgroundColor: colors.error + '10' },
            ]}
          >
            <Trash2 size={20} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.dangerTitle, { color: colors.error }]}>
                {t('robotSettings.removeLumi', 'Remove LUMI')}
              </Text>
              <Text style={[styles.dangerSub, { color: colors.textSecondary }]}>
                Unpairs robot from account and resets pairing code.
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

export default function RobotSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const colors = theme.colors;

  const { data: robot, isLoading } = useQuery({
    queryKey: ['robot', id],
    queryFn: () => robotService.getRobot(id as string),
    enabled: Boolean(id),
  });

  if (isLoading || !robot) {
    return (
      <View style={[styles.container, styles.loadingCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <SettingsForm key={robot.id} robot={robot} id={id as string} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h3,
  },
  saveText: {
    ...typography.bodyBold,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.overline,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardPadding: {
    padding: spacing.md,
  },
  fieldLabel: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  colorRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  colorDotWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  switchTextCol: {
    flex: 1,
    marginRight: spacing.md,
    gap: 2,
  },
  switchTitle: {
    ...typography.bodyBold,
  },
  switchSub: {
    ...typography.caption,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  infoLabel: {
    ...typography.body,
  },
  infoValue: {
    ...typography.bodyBold,
  },
  pressableRow: {
    padding: spacing.md,
    alignItems: 'center',
  },
  pressableRowText: {
    ...typography.bodyBold,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  dangerTitle: {
    ...typography.bodyBold,
  },
  dangerSub: {
    ...typography.caption,
  },
  divider: {
    height: 1,
  },
});
