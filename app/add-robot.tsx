/**
 * S08-S10 Add / Pair Robot Flow
 * Step 1: Setup instructions
 * Step 2: Enter 6-digit pairing code shown on LUMI's face
 * Step 3: Name LUMI, pick robot color & room
 * Step 4: Success celebration & quick actions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
  X,
  Zap,
  Wifi,
  KeyRound,
  ArrowLeft,
  HelpCircle,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from '../src/theme';
import { typography, spacing, radius, robotColors, type RobotColorKey } from '../src/theme/tokens';
import { Button } from '../src/components/Button';
import { TextField } from '../src/components/TextField';
import { OtpInput } from '../src/components/OtpInput';
import { RobotFace } from '../src/components/RobotFace';
import { robotService } from '../src/services';
import { showAlert } from '../src/features/dialog/dialogStore';
import { haptics } from '../src/utils/haptics';
import type { Robot } from '../src/types';

const COLOR_OPTIONS: { key: RobotColorKey; label: string; hex: string }[] = [
  { key: 'violet', label: 'Violet', hex: robotColors.violet },
  { key: 'mint', label: 'Mint', hex: robotColors.mint },
  { key: 'coral', label: 'Coral', hex: robotColors.coral },
  { key: 'amber', label: 'Amber', hex: robotColors.amber },
  { key: 'sky', label: 'Sky', hex: robotColors.sky },
  { key: 'rose', label: 'Rose', hex: robotColors.rose },
];

export default function AddRobotScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pairingCode, setPairingCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Paired robot state
  const [pairedRobot, setPairedRobot] = useState<Robot | null>(null);
  const [robotName, setRobotName] = useState('LUMI');
  const [selectedColor, setSelectedColor] = useState<RobotColorKey>('violet');
  const [room, setRoom] = useState('Living room');
  const [isSaving, setIsSaving] = useState(false);

  // Step 2: Handle code submission
  const handleVerifyCode = async (code: string) => {
    if (code.length !== 6) return;
    setIsVerifying(true);
    setCodeError(null);

    try {
      const robot = await robotService.pairRobot(code);
      haptics.success();
      setPairedRobot(robot);
      setRobotName(robot.name || 'LUMI');
      setSelectedColor((robot.color as RobotColorKey) || 'violet');
      setStep(3);
    } catch (e: any) {
      haptics.error();
      setCodeError(e.message || t('addRobot.wrongCode', "That code isn't right. Check LUMI's screen."));
    } finally {
      setIsVerifying(false);
    }
  };

  // Step 3: Handle naming & personalization
  const handleFinishSetup = async () => {
    if (!pairedRobot) return;
    if (!robotName.trim()) {
      showAlert('Required', 'Please give your LUMI a name', undefined, 'warning');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await robotService.nameRobot(
        pairedRobot.id,
        robotName.trim(),
        selectedColor,
        room.trim() || undefined,
      );
      haptics.success();
      setPairedRobot(updated);
      setStep(4);
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to save settings', undefined, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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
        {step > 1 && step < 4 ? (
          <Pressable
            onPress={() => setStep((s) => (s - 1) as any)}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {step === 4
            ? t('addRobot.finishSetup', 'LUMI Ready')
            : t('home.addRobot', 'Add a robot')}
        </Text>

        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.iconBtn}
        >
          <X size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Wizard Step 1: Preparation instructions */}
      {step === 1 && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.stepContainer}
        >
          <ScrollView contentContainerStyle={styles.scrollInner}>
            <View style={styles.heroCenter}>
              <RobotFace size={96} color={robotColors.violet} emotion="curious" />
              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                {t('addRobot.introTitle', "Let's set up your LUMI")}
              </Text>
            </View>

            <View style={styles.instructionsList}>
              <View
                style={[
                  styles.instructionCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.stepBadge,
                    { backgroundColor: colors.primary + '20' },
                  ]}
                >
                  <Zap size={20} color={colors.primary} />
                </View>
                <View style={styles.instructionTextCol}>
                  <Text style={[styles.stepNum, { color: colors.primary }]}>
                    STEP 1
                  </Text>
                  <Text
                    style={[styles.stepDesc, { color: colors.textPrimary }]}
                  >
                    {t('addRobot.step1', 'Charge and turn on LUMI')}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.instructionCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.stepBadge,
                    { backgroundColor: colors.accent + '20' },
                  ]}
                >
                  <Wifi size={20} color={colors.accent} />
                </View>
                <View style={styles.instructionTextCol}>
                  <Text style={[styles.stepNum, { color: colors.accent }]}>
                    STEP 2
                  </Text>
                  <Text
                    style={[styles.stepDesc, { color: colors.textPrimary }]}
                  >
                    {t('addRobot.step2', 'Connect LUMI to WiFi')}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.instructionCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.stepBadge,
                    { backgroundColor: colors.success + '20' },
                  ]}
                >
                  <KeyRound size={20} color={colors.success} />
                </View>
                <View style={styles.instructionTextCol}>
                  <Text style={[styles.stepNum, { color: colors.success }]}>
                    STEP 3
                  </Text>
                  <Text
                    style={[styles.stepDesc, { color: colors.textPrimary }]}
                  >
                    {t('addRobot.step3', "Find the 6-digit code on LUMI's face")}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { borderTopColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => setStep(2)}
            >
              {t('addRobot.myLumiShowsCode', 'My LUMI shows a code')}
            </Button>
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onPress={() => {
                haptics.light();
                showAlert(
                  'Need Help?',
                  'Make sure your LUMI robot is powered on and connected to the same WiFi network. Once connected, a 6-digit code appears on its face screen.',
                  undefined,
                  'info'
                );
              }}
            >
              {t('addRobot.needHelp', 'I need help')}
            </Button>
          </View>
        </Animated.View>
      )}

      {/* Wizard Step 2: Code input */}
      {step === 2 && (
        <Animated.View
          entering={FadeInRight.duration(250)}
          style={styles.stepContainer}
        >
          <ScrollView contentContainerStyle={styles.scrollInner}>
            <View style={styles.heroCenter}>
              <View
                style={[
                  styles.codeIconCircle,
                  { backgroundColor: colors.primary + '18' },
                ]}
              >
                <KeyRound size={40} color={colors.primary} />
              </View>
              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                {t('addRobot.enterCode', "Enter the code on LUMI's screen")}
              </Text>
              <Text
                style={[styles.heroSubheading, { color: colors.textSecondary }]}
              >
                Enter the 6-digit pairing code displayed on your robot.
              </Text>
            </View>

            <View style={styles.otpWrapper}>
              <OtpInput
                length={6}
                value={pairingCode}
                onChangeText={(val) => {
                  setPairingCode(val);
                  setCodeError(null);
                  if (val.length === 6) {
                    handleVerifyCode(val);
                  }
                }}
                error={codeError || undefined}
                autoFocus
              />
            </View>

            <Pressable
              onPress={() => {
                haptics.light();
                showAlert(
                  'Code Not Showing?',
                  'Double-tap the power button on the back of LUMI to cycle to the pairing code screen.',
                  undefined,
                  'info'
                );
              }}
              style={styles.helpLink}
            >
              <HelpCircle size={16} color={colors.primary} />
              <Text style={[styles.helpLinkText, { color: colors.primary }]}>
                {t('addRobot.codeNotShowing', 'Code not showing?')}
              </Text>
            </Pressable>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { borderTopColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isVerifying}
              disabled={pairingCode.length !== 6 || isVerifying}
              onPress={() => handleVerifyCode(pairingCode)}
            >
              {t('addRobot.continue', 'Continue')}
            </Button>
          </View>
        </Animated.View>
      )}

      {/* Wizard Step 3: Name & Color */}
      {step === 3 && (
        <Animated.View
          entering={FadeInRight.duration(250)}
          style={styles.stepContainer}
        >
          <ScrollView contentContainerStyle={styles.scrollInner}>
            <View style={styles.heroCenter}>
              <RobotFace
                size={88}
                color={robotColors[selectedColor]}
                emotion="happy"
              />
              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                {t('addRobot.nameYourLumi', 'Name your LUMI')}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <TextField
                label={t('addRobot.robotName', 'Robot name')}
                value={robotName}
                onChangeText={setRobotName}
                placeholder="e.g. Sparky, Wall-E, Lumi"
              />

              {/* Color picker */}
              <View style={styles.colorSection}>
                <Text
                  style={[styles.colorSectionLabel, { color: colors.textPrimary }]}
                >
                  {t('addRobot.chooseColor', 'Choose a color')}
                </Text>
                <View style={styles.colorsGrid}>
                  {COLOR_OPTIONS.map((c) => {
                    const isSelected = selectedColor === c.key;
                    return (
                      <Pressable
                        key={c.key}
                        onPress={() => {
                          haptics.selection();
                          setSelectedColor(c.key);
                        }}
                        style={[
                          styles.colorOption,
                          {
                            borderColor: isSelected
                              ? colors.textPrimary
                              : 'transparent',
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.colorDot,
                            { backgroundColor: c.hex },
                          ]}
                        />
                        <Text
                          style={[
                            styles.colorLabel,
                            {
                              color: isSelected
                                ? colors.textPrimary
                                : colors.textSecondary,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <TextField
                label={t('addRobot.roomLabel', 'Room or location (optional)')}
                value={room}
                onChangeText={setRoom}
                placeholder="e.g. Living room, Office"
              />
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { borderTopColor: colors.border, backgroundColor: colors.background },
            ]}
          >
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={isSaving}
              disabled={!robotName.trim() || isSaving}
              onPress={handleFinishSetup}
            >
              {t('addRobot.finishSetup', 'Finish setup')}
            </Button>
          </View>
        </Animated.View>
      )}

      {/* Wizard Step 4: Success */}
      {step === 4 && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={styles.stepContainer}
        >
          <View style={styles.successContent}>
            <View style={styles.heroCenter}>
              <RobotFace
                size={110}
                color={robotColors[selectedColor]}
                emotion="excited"
              />
              <View
                style={[
                  styles.sparkleBadge,
                  { backgroundColor: colors.accent + '25' },
                ]}
              >
                <Sparkles size={16} color={colors.accent} />
                <Text style={[styles.sparkleText, { color: colors.accent }]}>
                  PAIRED & READY
                </Text>
              </View>
              <Text style={[styles.heroHeading, { color: colors.textPrimary }]}>
                Meet {robotName}!
              </Text>
              <Text
                style={[styles.heroSubheading, { color: colors.textSecondary }]}
              >
                {t('addRobot.successBody', "It's ready to go.")}
              </Text>
            </View>

            <View style={styles.successActions}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => {
                  router.replace({
                    pathname: '/robot/[id]/drive',
                    params: { id: pairedRobot?.id || 'robot-1' },
                  });
                }}
              >
                {t('addRobot.connectNow', 'Connect now')}
              </Button>

              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => {
                  router.replace({
                    pathname: '/robot/[id]/members',
                    params: { id: pairedRobot?.id || 'robot-1' },
                  });
                }}
              >
                {t('addRobot.inviteSomeone', 'Invite someone')}
              </Button>

              <Button
                variant="ghost"
                size="md"
                fullWidth
                onPress={() => router.replace('/(tabs)/robots')}
              >
                {t('addRobot.goToHome', 'Go to home')}
              </Button>
            </View>
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  stepContainer: {
    flex: 1,
  },
  scrollInner: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  heroCenter: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  heroHeading: {
    ...typography.h2,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  heroSubheading: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  instructionsList: {
    gap: spacing.md,
  },
  instructionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  stepBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionTextCol: {
    flex: 1,
    gap: 2,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  stepDesc: {
    ...typography.bodyBold,
  },
  codeIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  otpWrapper: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  helpLinkText: {
    ...typography.caption,
    fontWeight: '600',
  },
  formGroup: {
    gap: spacing.lg,
  },
  colorSection: {
    gap: spacing.sm,
  },
  colorSectionLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  colorLabel: {
    ...typography.caption,
  },
  successContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['2xl'],
  },
  sparkleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  sparkleText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  successActions: {
    gap: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
});
