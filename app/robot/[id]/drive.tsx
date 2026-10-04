/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/refs */
/**
 * S12 Live Control & Driving Screen
 * Real-time video view, virtual joystick with physics & spring release,
 * Push-To-Talk (PTT) with soundwaves, Speed selector, Emergency stop,
 * Emotions & Gestures drawer, live telemetry HUD, and End Session flow.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  PanResponder,
  Alert,
  Modal,
  ScrollView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import {
  PhoneOff,
  BatteryMedium,
  Wifi,
  Mic,
  MicOff,
  Lock,
  Unlock,
  AlertOctagon,
  Smile,
  Sparkles,
  Video,
  ChevronUp,
  X,
  RefreshCw,
  Heart,
  Eye,
  Zap,
  Moon,
  Laugh,
} from 'lucide-react-native';
import { useTheme } from '../../../src/theme';
import { spacing, radius, robotColors } from '../../../src/theme/tokens';
import { VideoView } from '@livekit/react-native';
import {
  robotService,
  liveService,
  controlChannel,
  sessionService,
  subscribeToRobotVideoTrack,
  setRobotMicrophone,
} from '../../../src/services';
import { RobotFace, type Emotion } from '../../../src/components/RobotFace';
import type { Robot, ConnectionState, Telemetry } from '../../../src/types';

const JOYSTICK_RADIUS = 70;
const PUCK_RADIUS = 30;
const MAX_DRAG = JOYSTICK_RADIUS - PUCK_RADIUS;

const EMOTIONS_LIST: { name: Emotion; label: string; Icon: any }[] = [
  { name: 'happy', label: 'Happy', Icon: Smile },
  { name: 'curious', label: 'Curious', Icon: Eye },
  { name: 'love', label: 'Love', Icon: Heart },
  { name: 'excited', label: 'Excited', Icon: Zap },
  { name: 'wink', label: 'Wink', Icon: Laugh },
  { name: 'sleepy', label: 'Sleepy', Icon: Moon },
];

const GESTURES_LIST = [
  { name: 'nod', label: 'Nod Yes' },
  { name: 'shake', label: 'Shake No' },
  { name: 'spin', label: 'Spin 360' },
  { name: 'dance', label: 'Wiggle Dance' },
  { name: 'peekaboo', label: 'Peekaboo' },
];

export default function DriveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const colors = theme.colors;
  const { t } = useTranslation();

  const [robot, setRobot] = useState<Robot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [telemetry, setTelemetry] = useState<Telemetry>({
    batteryPercent: 82,
    wifiSignal: 4,
    latencyMs: 54,
    currentEmotion: 'happy',
  });

  const [sessionStartTime] = useState<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Speed Mode: 0.5 (slow), 1.0 (normal), 1.5 (fast)
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);

  // PTT State
  const [isTalking, setIsTalking] = useState(false);
  const [isMicLocked, setIsMicLocked] = useState(false);

  // LiveKit Video Track
  const [videoTrack, setVideoTrack] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = subscribeToRobotVideoTrack((track) => {
      setVideoTrack(track);
    });
    return unsubscribe;
  }, []);

  // Sync PTT talk state with robot microphone
  useEffect(() => {
    setRobotMicrophone(isTalking || isMicLocked);
  }, [isTalking, isMicLocked]);

  const ensureMicrophonePermission = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        if (hasPermission) return true;
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'LUMI needs access to your microphone so you can talk through your robot.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        return status === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('[PTT] Permission error:', err);
        return false;
      }
    }
    return true;
  };

  // Actions Drawer
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeEmotion, setActiveEmotion] = useState<Emotion>('happy');

  // Virtual Joystick Shared Values
  const puckX = useSharedValue(0);
  const puckY = useSharedValue(0);

  // PTT Wave Animation
  const waveScale = useSharedValue(1);

  // Session duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  // Load robot & connect to live stream
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const r = await robotService.getRobot(id as string);
        if (mounted) setRobot(r);

        await liveService.connect(id as string, {
          onConnectionStateChange: (state) => {
            if (mounted) setConnectionState(state);
          },
          onTelemetry: (telem) => {
            if (mounted) {
              setTelemetry(telem);
              if (telem.currentEmotion) {
                setActiveEmotion(telem.currentEmotion as Emotion);
              }
            }
          },
          onError: (err) => {
            Alert.alert('Connection Error', err);
          },
        });
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to connect');
      }
    }

    init();

    return () => {
      mounted = false;
      liveService.disconnect();
      controlChannel.stopDriving();
    };
  }, [id]);

  // Handle Joystick PanResponder
  const lastSentTime = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const dx = gestureState.dx;
        const dy = gestureState.dy;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let clampedX = dx;
        let clampedY = dy;

        if (distance > MAX_DRAG) {
          const ratio = MAX_DRAG / distance;
          clampedX = dx * ratio;
          clampedY = dy * ratio;
        }

        puckX.value = clampedX;
        puckY.value = clampedY;

        // Throttle sending commands (every 50ms)
        const now = Date.now();
        if (now - lastSentTime.current > 50) {
          lastSentTime.current = now;
          const normalizedX = Number((clampedX / MAX_DRAG).toFixed(2));
          // Invert Y so up is positive
          const normalizedY = Number((-clampedY / MAX_DRAG).toFixed(2));
          controlChannel.startDriving(
            normalizedX * speedMultiplier,
            normalizedY * speedMultiplier,
          );
        }
      },
      onPanResponderRelease: () => {
        puckX.value = withSpring(0, { damping: 15, stiffness: 200 });
        puckY.value = withSpring(0, { damping: 15, stiffness: 200 });
        controlChannel.stopDriving();
      },
    }),
  ).current;

  const animatedPuckStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: puckX.value }, { translateY: puckY.value }],
  }));

  // PTT Wave pulse
  useEffect(() => {
    if (isTalking || isMicLocked) {
      waveScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 400 }),
          withTiming(1.0, { duration: 400 }),
        ),
        -1,
        true,
      );
    } else {
      waveScale.value = withTiming(1.0, { duration: 200 });
    }
  }, [isTalking, isMicLocked, waveScale]);

  const animatedWaveStyle = useAnimatedStyle(() => ({
    transform: [{ scale: waveScale.value }],
    opacity: isTalking || isMicLocked ? 0.35 : 0,
  }));

  // Emergency Stop
  const handleEmergencyStop = () => {
    puckX.value = withSpring(0);
    puckY.value = withSpring(0);
    controlChannel.send({ t: 'stop' });
  };

  // End Session flow
  const handleConfirmEndSession = () => {
    Alert.alert(
      t('live.endSessionConfirm', 'End this session?'),
      `Session duration: ${formatTimer(elapsedSeconds)}`,
      [
        { text: t('live.keepDriving', 'Keep driving'), style: 'cancel' },
        {
          text: t('live.end', 'End'),
          style: 'destructive',
          onPress: async () => {
            await liveService.disconnect();
            let sessionId = '';
            try {
              const sess = await sessionService.createSession(
                id as string,
                new Date(sessionStartTime).toISOString(),
                new Date().toISOString()
              );
              sessionId = sess.id;
            } catch (err) {
              console.warn('Failed to record session:', err);
            }
            router.replace({
              pathname: '/robot/[id]/end',
              params: {
                id: id as string,
                sessionId,
                duration: elapsedSeconds.toString(),
                robotName: robot?.name || 'LUMI',
              },
            });
          },
        },
      ],
    );
  };

  const handleSendEmotion = (emotion: Emotion) => {
    setActiveEmotion(emotion);
    controlChannel.sendEmotion(emotion);
  };

  const handleSendGesture = (gestureName: string) => {
    controlChannel.sendGesture(gestureName);
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const faceColor =
    (robotColors as Record<string, string>)[robot?.color || 'violet'] ||
    robotColors.violet;

  return (
    <View style={[styles.container, { backgroundColor: '#090A0F' }]}>
      {/* ── Top HUD Bar ── */}
      <View style={[styles.topHud, { paddingTop: insets.top + spacing.xs }]}>
        {/* Robot & Emotion preview */}
        <View style={styles.hudLeft}>
          <View style={[styles.miniFaceWrap, { backgroundColor: faceColor + '2A' }]}>
            <RobotFace size={26} color={faceColor} emotion={activeEmotion} />
          </View>
          <View>
            <Text style={styles.robotHudName}>{robot?.name || 'LUMI'}</Text>
            <View style={styles.liveBadgeRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
              <Text style={styles.timerText}>{formatTimer(elapsedSeconds)}</Text>
            </View>
          </View>
        </View>

        {/* Telemetry stats */}
        <View style={styles.hudRight}>
          <View style={styles.telemetryTag}>
            <Wifi size={13} color="#22C55E" />
            <Text style={styles.telemetryTagText}>{telemetry.latencyMs}ms</Text>
          </View>

          <View style={styles.telemetryTag}>
            <BatteryMedium
              size={14}
              color={telemetry.batteryPercent < 20 ? '#EF4444' : '#E2E8F0'}
            />
            <Text
              style={[
                styles.telemetryTagText,
                telemetry.batteryPercent < 20 && { color: '#EF4444' },
              ]}
            >
              {telemetry.batteryPercent}%
            </Text>
          </View>

          {/* End Call Button */}
          <Pressable
            onPress={handleConfirmEndSession}
            style={styles.endBtn}
            hitSlop={8}
          >
            <PhoneOff size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* ── Status Banner (if weak or reconnecting) ── */}
      {connectionState === 'weak' && (
        <View style={[styles.statusBanner, { backgroundColor: '#EAB308' }]}>
          <Text style={styles.statusBannerText}>
            {t('live.weakConnection', 'Weak connection — video may lag')}
          </Text>
        </View>
      )}

      {connectionState === 'reconnecting' && (
        <View style={[styles.statusBanner, { backgroundColor: '#F97316' }]}>
          <RefreshCw size={14} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={styles.statusBannerText}>
            {t('live.reconnecting', 'Reconnecting to LUMI…')}
          </Text>
        </View>
      )}

      {/* ── Camera Viewport (LiveKit Video / HUD) ── */}
      <View style={styles.cameraViewport}>
        {Platform.OS !== 'web' && videoTrack ? (
          <VideoView
            videoTrack={videoTrack}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : (
          <>
            {/* Room grid simulation */}
            <View style={styles.perspectiveFloor} />
            <View style={styles.reticleCenter}>
              <View style={styles.reticleLineH} />
              <View style={styles.reticleLineV} />
            </View>
          </>
        )}

        {/* Bottom stream indicators */}
        <View style={styles.viewportOverlayBottom}>
          <View style={styles.videoQualityTag}>
            <Video size={12} color="#94A3B8" />
            <Text style={styles.videoQualityText}>720p 30fps</Text>
          </View>
          <Text style={styles.timestampOverlay}>
            {new Date().toLocaleTimeString()}
          </Text>
        </View>

        {/* Connecting overlay */}
        {connectionState === 'connecting' && (
          <View style={styles.connectingOverlay}>
            <RobotFace size={60} color={faceColor} emotion="curious" />
            <Text style={styles.connectingText}>
              {t('live.findingLumi', 'Connecting to LUMI…')}
            </Text>
          </View>
        )}
      </View>

      {/* ── Control Console Area ── */}
      <View
        style={[
          styles.controlsArea,
          { paddingBottom: Math.max(insets.bottom, 16) + spacing.sm },
        ]}
      >
        {/* Middle quick tool row: Speed selector, Emergency stop, Emotes button */}
        <View style={styles.toolRow}>
          {/* Speed selector */}
          <View style={styles.speedSelector}>
            {[
              { val: 0.5, label: '0.5x' },
              { val: 1.0, label: '1x' },
              { val: 1.5, label: '1.5x' },
            ].map(({ val, label }) => (
              <Pressable
                key={val}
                onPress={() => setSpeedMultiplier(val)}
                style={[
                  styles.speedChip,
                  speedMultiplier === val && styles.speedChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.speedChipText,
                    speedMultiplier === val && styles.speedChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Emergency Stop Button */}
          <Pressable
            onPress={handleEmergencyStop}
            style={styles.emergencyBtn}
          >
            <AlertOctagon size={18} color="#FFF" />
            <Text style={styles.emergencyText}>STOP</Text>
          </Pressable>

          {/* Emotions & Gestures trigger */}
          <Pressable
            onPress={() => setShowDrawer(true)}
            style={styles.emotesDrawerBtn}
          >
            <Smile size={18} color="#A78BFA" />
            <Text style={styles.emotesDrawerText}>Emotes</Text>
            <ChevronUp size={16} color="#A78BFA" />
          </Pressable>
        </View>

        {/* ── Lower Area: Joystick & PTT Mic ── */}
        <View style={styles.bottomControls}>
          {/* Virtual Joystick */}
          <View style={styles.joystickContainer}>
            <View style={styles.joystickBase} {...panResponder.panHandlers}>
              {/* Radial guides */}
              <View style={styles.guideRing} />
              <View style={styles.crosshairH} />
              <View style={styles.crosshairV} />

              {/* Draggable Puck */}
              <Animated.View style={[styles.joystickPuck, animatedPuckStyle]}>
                <View style={styles.puckDot} />
              </Animated.View>
            </View>
            <Text style={styles.controlHint}>DRIVE</Text>
          </View>

          {/* Push-to-Talk (PTT) Mic Button */}
          <View style={styles.pttContainer}>
            <View style={styles.pttButtonWrapper}>
              <Animated.View
                style={[
                  styles.pttWavePulse,
                  { backgroundColor: colors.primary },
                  animatedWaveStyle,
                ]}
              />

              <Pressable
                onPressIn={async () => {
                  if (!isMicLocked) {
                    const ok = await ensureMicrophonePermission();
                    if (ok) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      setIsTalking(true);
                    }
                  }
                }}
                onPressOut={() => {
                  if (!isMicLocked) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setIsTalking(false);
                  }
                }}
                pressRetentionOffset={{ top: 30, bottom: 30, left: 30, right: 30 }}
                hitSlop={10}
                style={[
                  styles.pttMainBtn,
                  {
                    backgroundColor:
                      isTalking || isMicLocked ? colors.primary : '#1E293B',
                    borderColor:
                      isTalking || isMicLocked ? colors.primary : '#334155',
                  },
                ]}
              >
                {isTalking || isMicLocked ? (
                  <Mic size={32} color="#FFF" />
                ) : (
                  <MicOff size={32} color="#94A3B8" />
                )}
              </Pressable>

              {/* Lock Toggle Button */}
              <Pressable
                onPress={() => {
                  const nextLock = !isMicLocked;
                  setIsMicLocked(nextLock);
                  setIsTalking(false);
                }}
                style={[
                  styles.lockBtn,
                  {
                    backgroundColor: isMicLocked ? colors.primary : '#1E293B',
                  },
                ]}
                hitSlop={6}
              >
                {isMicLocked ? (
                  <Lock size={12} color="#FFF" />
                ) : (
                  <Unlock size={12} color="#94A3B8" />
                )}
              </Pressable>
            </View>

            <Text style={styles.controlHint}>
              {isMicLocked
                ? t('live.micLocked', 'MIC ON')
                : isTalking
                ? 'TALKING…'
                : t('live.pushToTalk', 'HOLD TO TALK')}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Emotions & Gestures Modal Drawer ── */}
      <Modal
        visible={showDrawer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDrawer(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowDrawer(false)}
        >
          <Pressable style={styles.drawerCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerHeaderLeft}>
                <Sparkles size={20} color={colors.primary} />
                <Text style={styles.drawerTitle}>Emotions & Gestures</Text>
              </View>
              <Pressable
                onPress={() => setShowDrawer(false)}
                hitSlop={8}
                style={styles.closeDrawerBtn}
              >
                <X size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Emotions */}
              <Text style={styles.drawerSectionLabel}>EXPRESSIONS</Text>
              <View style={styles.drawerEmotionsGrid}>
                {EMOTIONS_LIST.map(({ name, label, Icon }) => {
                  const isCurrent = activeEmotion === name;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => handleSendEmotion(name)}
                      style={[
                        styles.drawerEmoteChip,
                        isCurrent && styles.drawerEmoteChipActive,
                      ]}
                    >
                      <Icon
                        size={20}
                        color={isCurrent ? colors.primary : '#94A3B8'}
                      />
                      <Text
                        style={[
                          styles.drawerEmoteText,
                          isCurrent && { color: colors.primary, fontWeight: '700' },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Gestures */}
              <Text style={styles.drawerSectionLabel}>GESTURES & TRICKS</Text>
              <View style={styles.drawerGesturesGrid}>
                {GESTURES_LIST.map(({ name, label }) => (
                  <Pressable
                    key={name}
                    onPress={() => handleSendGesture(name)}
                    style={styles.drawerGestureBtn}
                  >
                    <Text style={styles.drawerGestureText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHud: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  hudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  miniFaceWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  robotHudName: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 15,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  liveText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timerText: {
    color: '#94A3B8',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  hudRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  telemetryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  telemetryTagText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '600',
  },
  endBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  statusBannerText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  cameraViewport: {
    flex: 1,
    backgroundColor: '#020617',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  perspectiveFloor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#0B132B',
    opacity: 0.4,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  reticleCenter: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.35,
  },
  reticleLineH: {
    position: 'absolute',
    width: 50,
    height: 1,
    backgroundColor: '#38BDF8',
  },
  reticleLineV: {
    position: 'absolute',
    width: 1,
    height: 50,
    backgroundColor: '#38BDF8',
  },
  viewportOverlayBottom: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  videoQualityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  videoQualityText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  timestampOverlay: {
    color: '#64748B',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  connectingText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  controlsArea: {
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.lg,
    gap: spacing.md,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  speedSelector: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: radius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  speedChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  speedChipActive: {
    backgroundColor: '#7C3AED',
  },
  speedChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  speedChipTextActive: {
    color: '#FFF',
  },
  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  emergencyText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emotesDrawerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emotesDrawerText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  joystickContainer: {
    alignItems: 'center',
    gap: 6,
  },
  joystickBase: {
    width: JOYSTICK_RADIUS * 2,
    height: JOYSTICK_RADIUS * 2,
    borderRadius: JOYSTICK_RADIUS,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideRing: {
    width: JOYSTICK_RADIUS * 1.2,
    height: JOYSTICK_RADIUS * 1.2,
    borderRadius: JOYSTICK_RADIUS * 0.6,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    position: 'absolute',
  },
  crosshairH: {
    position: 'absolute',
    width: JOYSTICK_RADIUS * 1.5,
    height: 1,
    backgroundColor: '#334155',
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: JOYSTICK_RADIUS * 1.5,
    backgroundColor: '#334155',
  },
  joystickPuck: {
    width: PUCK_RADIUS * 2,
    height: PUCK_RADIUS * 2,
    borderRadius: PUCK_RADIUS,
    backgroundColor: '#7C3AED',
    borderWidth: 3,
    borderColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  puckDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF',
  },
  pttContainer: {
    alignItems: 'center',
    gap: 6,
  },
  pttButtonWrapper: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pttWavePulse: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  pttMainBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  lockBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  controlHint: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  drawerCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    maxHeight: '60%',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: spacing.md,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: spacing.sm,
  },
  drawerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  drawerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  closeDrawerBtn: {
    padding: 4,
  },
  drawerSectionLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  drawerEmotionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  drawerEmoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  drawerEmoteChipActive: {
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },
  drawerEmoteText: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  drawerGesturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  drawerGestureBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#334155',
  },
  drawerGestureText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
});
