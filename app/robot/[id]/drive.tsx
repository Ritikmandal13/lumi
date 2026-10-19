/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/refs */
/**
 * S12 Live Control & Driving Screen
 * Real-time video view, virtual joystick with physics & spring release,
 * Push-To-Talk (PTT) with soundwaves, Speed selector, Emergency stop,
 * Emotions & Gestures drawer, live telemetry HUD, and End Session flow.
 */

import { VideoView } from '@livekit/react-native';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BatteryMedium,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Heart,
  Laugh,
  Lock,
  Maximize2,
  Mic,
  Moon,
  PhoneOff,
  RefreshCw,
  Smile,
  Sparkles,
  Video,
  Wifi,
  X,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  Image,
  Modal,
  PanResponder,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Emotion } from '../../../src/components/RobotFace';
import { showAlert } from '../../../src/features/dialog/dialogStore';
import {
  controlChannel,
  liveService,
  robotService,
  sessionService,
  setRobotMicrophone,
  subscribeToCloudVideoFrame,
  subscribeToRobotVideoTrack,
} from '../../../src/services';
import { spacing } from '../../../src/theme/tokens';
import type { ConnectionState, Robot, Telemetry } from '../../../src/types';
import { haptics } from '../../../src/utils/haptics';

const JOYSTICK_RADIUS = 98;
const PUCK_RADIUS = 38;
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
  { name: 'spin', label: '360° Spin' },
  { name: 'surveillance', label: '360° Surveillance' },
  { name: 'nod', label: 'Nod Yes' },
  { name: 'shake', label: 'Shake No' },
  { name: 'dance', label: 'Wiggle Dance' },
  { name: 'peekaboo', label: 'Peekaboo' },
];

interface DoubleBufferedCameraFeedProps {
  videoTrack: any;
  cameraStreamUrl: string | null;
  onHasCloudFrameChange?: (hasFrame: boolean) => void;
  connectionState?: ConnectionState;
}

const DoubleBufferedCameraFeed = React.memo(function DoubleBufferedCameraFeed({
  videoTrack,
  cameraStreamUrl,
  onHasCloudFrameChange,
  connectionState,
}: DoubleBufferedCameraFeedProps) {
  // Dual-slot ping-pong buffer ensures 0% flicker:
  // Slot A and Slot B alternate so the active frame remains 100% visible while the new frame loads.
  const [frameA, setFrameA] = useState<string | null>(null);
  const [frameB, setFrameB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const hasInitialFrameRef = useRef<boolean>(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean reset on reconnect so video feed never freezes on stale frame
  useEffect(() => {
    if (connectionState === 'connecting' || connectionState === 'reconnecting') {
      hasInitialFrameRef.current = false;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    }
  }, [connectionState]);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeToCloudVideoFrame((uri) => {
      if (!mounted) return;
      if (uri) {
        onHasCloudFrameChange?.(true);

        // Immediate first-frame rendering: seed Slot A directly so image shows instantly with opacity 1
        if (!hasInitialFrameRef.current) {
          hasInitialFrameRef.current = true;
          setFrameA(uri);
          setActiveSlot('A');
          activeSlotRef.current = 'A';
          return;
        }

        // Ping-pong: stage the next frame into the background slot
        const targetSlot = activeSlotRef.current === 'A' ? 'B' : 'A';
        if (targetSlot === 'B') {
          setFrameB(uri);
        } else {
          setFrameA(uri);
        }

        // Auto-swap watchdog: if React Native Image onLoad drops or delays,
        // force swap within 70ms so consecutive frames never get blocked behind a stale slot
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
        }
        fallbackTimerRef.current = setTimeout(() => {
          if (mounted) {
            activeSlotRef.current = targetSlot;
            setActiveSlot(targetSlot);
          }
        }, 70);
      } else {
        // If stream momentarily drops or reconnects, keep last frame on screen
        // instead of flashing completely blank/black
        onHasCloudFrameChange?.(false);
      }
    });

    return () => {
      mounted = false;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      unsub();
    };
  }, [onHasCloudFrameChange]);

  const handleFrameALoad = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    activeSlotRef.current = 'A';
    setActiveSlot('A');
  };

  const handleFrameBLoad = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    activeSlotRef.current = 'B';
    setActiveSlot('B');
  };

  // If only one frame exists, guarantee it is 100% visible so the viewport never shows black
  const showOnlyA = !!frameA && !frameB;
  const showOnlyB = !frameA && !!frameB;
  const opacityA = showOnlyA || activeSlot === 'A' ? 1 : 0;
  const opacityB = showOnlyB || activeSlot === 'B' ? 1 : 0;

  if (frameA || frameB) {
    return (
      <View style={StyleSheet.absoluteFill}>
        {frameA && (
          <Image
            source={{ uri: frameA }}
            style={[
              styles.cameraImageFull,
              { opacity: opacityA },
            ]}
            resizeMode="contain"
            fadeDuration={0}
            onLoad={handleFrameALoad}
            onError={handleFrameBLoad}
          />
        )}
        {frameB && (
          <Image
            source={{ uri: frameB }}
            style={[
              styles.cameraImageFull,
              { opacity: opacityB },
            ]}
            resizeMode="contain"
            fadeDuration={0}
            onLoad={handleFrameBLoad}
            onError={handleFrameALoad}
          />
        )}
      </View>
    );
  }

  if (videoTrack) {
    return (
      <VideoView
        videoTrack={videoTrack}
        style={StyleSheet.absoluteFill}
        objectFit="contain"
      />
    );
  }

  if (cameraStreamUrl) {
    return (
      <Image
        source={{ uri: `${cameraStreamUrl}/stream` }}
        style={styles.cameraImageFull}
        resizeMode="contain"
        fadeDuration={0}
      />
    );
  }

  return null;
});

export default function DriveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // Active voice transmission gate ref to eliminate Android hardware restart latencies
  const isTransmittingVoiceRef = useRef(false);
  useEffect(() => {
    isTransmittingVoiceRef.current = isTalking || isMicLocked;
  }, [isTalking, isMicLocked]);

  // Real-time 16kHz 16-bit PCM Microphone Audio Stream for Walkie-Talkie
  const { stream: audioStream } = useAudioStream({
    sampleRate: 16000,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => {
      if (isTransmittingVoiceRef.current && buffer?.data) {
        controlChannel.sendVoiceBytes(new Uint8Array(buffer.data));
      }
    },
  });

  // Pre-warm audio stream once on mount for instant zero-latency PTT
  useEffect(() => {
    let active = true;
    (async () => {
      const ok = await ensureMicrophonePermission();
      if (ok && active) {
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
          });
          await audioStream.start();
        } catch (err) {
          console.warn('[PTT] AudioStream initial start warning:', err);
        }
      }
    })();

    return () => {
      active = false;
      try {
        audioStream.stop();
      } catch { }
    };
  }, [audioStream]);

  // LiveKit Remote Video Track
  const [videoTrack, setVideoTrack] = useState<any>(null);

  // Worldwide LiveKit WebRTC Cloud Video Frame active state
  const [hasCloudFeed, setHasCloudFeed] = useState(false);

  // Local camera stream from robot
  const [cameraStreamUrl, setCameraStreamUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsubTrack = subscribeToRobotVideoTrack((track) => {
      setVideoTrack(track);
    });
    return () => {
      unsubTrack();
    };
  }, []);

  const handleBackPress = useCallback(() => {
    controlChannel.stopDriving();
    liveService.disconnect().catch(() => { });
    router.back();
  }, [router]);

  useEffect(() => {
    const onBackPress = () => {
      handleBackPress();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      sub.remove();
    };
  }, [handleBackPress]);

  // Sync PTT talk state with robot microphone and send walkie-talkie cues
  useEffect(() => {
    const active = isTalking || isMicLocked;
    setRobotMicrophone(active);
    if (active) {
      controlChannel.send({ t: 'mic_start' });
    } else {
      controlChannel.send({ t: 'mic_stop' });
    }
  }, [isTalking, isMicLocked]);

  const ensureMicrophonePermission = async (): Promise<boolean> => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (status.granted) {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        return true;
      }
    } catch {
      // fallback to PermissionsAndroid
    }
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

  const startAudioCapture = async (): Promise<boolean> => {
    const ok = await ensureMicrophonePermission();
    if (!ok) return false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    setIsTalking(true);
    // Ensure stream is active if not already
    try {
      await audioStream.start();
    } catch { }
    return true;
  };

  const stopAudioCapture = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    setIsTalking(false);
  };

  const handleStartTalking = async () => {
    if (isMicLocked) return;
    await startAudioCapture();
  };

  const handleStopTalking = () => {
    if (isMicLocked) return;
    stopAudioCapture();
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

  // Load robot & connect to LiveKit WebRTC Cloud stream
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const r = await robotService.getRobot(id as string);
        if (mounted) {
          setRobot(r);
          const robotIp = r?.localIp || (r as any)?.local_ip || (r as any)?.ip;
          if (robotIp) {
            setCameraStreamUrl(`http://${robotIp}:81`);
          }
        }

        await liveService.connect(id as string, {
          onConnectionStateChange: (state) => {
            if (mounted) {
              setConnectionState(state);
            }
          },
          onTelemetry: (telem) => {
            if (mounted) {
              setTelemetry(telem);
              if (telem.currentEmotion) {
                setActiveEmotion(telem.currentEmotion as Emotion);
              }
              const streamIp = (telem as any)?.localIp || (telem as any)?.local_ip || (telem as any)?.ip;
              if (streamIp) {
                setCameraStreamUrl(`http://${streamIp}:81`);
              }
            }
          },
          onError: (err) => {
            if (mounted) {
              console.warn('[DriveScreen] Live stream connection warning:', err);
            }
          },
        });
      } catch (err: any) {
        if (mounted) {
          console.warn('[DriveScreen] Init connection warning:', err);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      controlChannel.stopDriving();
      liveService.disconnect().catch((err) => {
        console.warn('[DriveScreen] Error disconnecting on unmount:', err);
      });
    };
  }, [id]);

  // Active speed multiplier ref to prevent stale closure in PanResponder
  const speedMultiplierRef = useRef(speedMultiplier);
  useEffect(() => {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  // Active driving coordinates and heartbeat interval
  const currentCoords = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const driveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDriveSendTimeRef = useRef<number>(0);

  const startDriveLoop = useCallback(() => {
    if (driveTimerRef.current) return;
    driveTimerRef.current = setInterval(() => {
      const { x, y } = currentCoords.current;
      if (Math.abs(x) > 0.01 || Math.abs(y) > 0.01) {
        lastDriveSendTimeRef.current = Date.now();
        controlChannel.startDriving(
          Number((x * speedMultiplierRef.current).toFixed(2)),
          Number((y * speedMultiplierRef.current).toFixed(2)),
        );
      }
    }, 28);
  }, []);

  const stopDriveLoop = useCallback(() => {
    if (driveTimerRef.current) {
      clearInterval(driveTimerRef.current);
      driveTimerRef.current = null;
    }
    currentCoords.current = { x: 0, y: 0 };
    controlChannel.stopDriving();
  }, []);

  useEffect(() => {
    return () => {
      if (driveTimerRef.current) {
        clearInterval(driveTimerRef.current);
        driveTimerRef.current = null;
      }
    };
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (_, gestureState) => {
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

        const normalizedX = Number((clampedX / MAX_DRAG).toFixed(2));
        const normalizedY = Number((-clampedY / MAX_DRAG).toFixed(2));
        currentCoords.current = { x: normalizedX, y: normalizedY };

        lastDriveSendTimeRef.current = Date.now();
        controlChannel.startDriving(
          Number((normalizedX * speedMultiplierRef.current).toFixed(2)),
          Number((normalizedY * speedMultiplierRef.current).toFixed(2)),
        );
        startDriveLoop();
      },
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

        const normalizedX = Number((clampedX / MAX_DRAG).toFixed(2));
        const normalizedY = Number((-clampedY / MAX_DRAG).toFixed(2));
        currentCoords.current = { x: normalizedX, y: normalizedY };

        startDriveLoop();

        // Throttle gesture move events to 25ms to achieve zero-lag snappy response (40Hz)
        const now = Date.now();
        if (now - lastDriveSendTimeRef.current >= 25) {
          lastDriveSendTimeRef.current = now;
          controlChannel.startDriving(
            Number((normalizedX * speedMultiplierRef.current).toFixed(2)),
            Number((normalizedY * speedMultiplierRef.current).toFixed(2)),
          );
        }
      },
      onPanResponderRelease: () => {
        puckX.value = withSpring(0, { damping: 15, stiffness: 200 });
        puckY.value = withSpring(0, { damping: 15, stiffness: 200 });
        stopDriveLoop();
      },
      onPanResponderTerminate: () => {
        puckX.value = withSpring(0, { damping: 15, stiffness: 200 });
        puckY.value = withSpring(0, { damping: 15, stiffness: 200 });
        stopDriveLoop();
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
    haptics.heavy();
    puckX.value = withSpring(0);
    puckY.value = withSpring(0);
    controlChannel.send({ t: 'stop' });
  };

  // End Session flow
  const handleConfirmEndSession = () => {
    haptics.warning();
    showAlert(
      t('live.endSessionConfirm', 'End this session?'),
      `Session duration: ${formatTimer(elapsedSeconds)}`,
      [
        { text: t('live.keepDriving', 'Keep driving'), style: 'cancel' },
        {
          text: t('live.end', 'End Session'),
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
      'warning'
    );
  };

  const handleSendEmotion = (emotion: Emotion) => {
    haptics.medium();
    setActiveEmotion(emotion);
    controlChannel.sendEmotion(emotion);
  };

  const handleSendGesture = (gestureName: string) => {
    haptics.medium();
    controlChannel.sendGesture(gestureName);
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <View style={styles.container}>
      {/* ── Top Header Bar ── */}
      <View style={[styles.topHud, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeftGroup}>
          {/* Back Circular Button */}
          <Pressable
            onPress={handleBackPress}
            hitSlop={8}
            style={styles.circleIconBtn}
          >
            <ChevronLeft size={22} color="#1E293B" />
          </Pressable>

          {/* Avatar with purple robot smile */}
          <View style={styles.avatarWrap}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <SvgCircle cx={7.5} cy={8.5} r={1.6} fill="#634AF6" />
              <SvgCircle cx={16.5} cy={8.5} r={1.6} fill="#634AF6" />
              <SvgPath
                d="M8 14.5 C9.5 17.5 14.5 17.5 16 14.5"
                stroke="#634AF6"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </View>

          {/* Robot Title & Live Indicator */}
          <View style={styles.titleColumn}>
            <Text style={styles.robotHudName}>{(robot?.name || 'LUMI').toUpperCase()}</Text>
            <View style={styles.liveBadgeRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live · {formatTimer(elapsedSeconds)}</Text>
            </View>
          </View>
        </View>

        {/* End Call Circular Button */}
        <Pressable
          onPress={handleConfirmEndSession}
          style={styles.endCallBtn}
          hitSlop={8}
        >
          <PhoneOff size={20} color="#DC2626" />
        </Pressable>
      </View>

      {/* ── Status Banner (if weak or reconnecting) ── */}
      {connectionState === 'weak' && (
        <View style={[styles.statusBanner, { backgroundColor: '#FEF08A' }]}>
          <Text style={[styles.statusBannerText, { color: '#854D0E' }]}>
            {t('live.weakConnection', 'Weak connection — video may lag')}
          </Text>
        </View>
      )}

      {connectionState === 'reconnecting' && (
        <View style={[styles.statusBanner, { backgroundColor: '#FED7AA' }]}>
          <RefreshCw size={14} color="#C2410C" style={{ marginRight: 6 }} />
          <Text style={[styles.statusBannerText, { color: '#C2410C' }]}>
            {t('live.reconnecting', 'Reconnecting to LUMI…')}
          </Text>
        </View>
      )}

      {/* ── Camera Viewport Card ── */}
      <View style={styles.cameraViewportCard}>
        {/* Badges on Top-Left */}
        <View style={styles.cameraBadgesRow}>
          <View style={styles.badgePill}>
            <Wifi size={14} color="#10B981" />
            <Text style={styles.badgeText}>{telemetry.latencyMs || 40} ms</Text>
          </View>
          <View style={styles.badgePill}>
            <BatteryMedium size={15} color="#0F172A" />
            <Text style={styles.badgeText}>{telemetry.batteryPercent || 90}%</Text>
          </View>
        </View>

        {/* Camera Feed or Placeholder */}
        {hasCloudFeed || videoTrack || cameraStreamUrl ? (
          <DoubleBufferedCameraFeed
            videoTrack={videoTrack}
            cameraStreamUrl={cameraStreamUrl}
            onHasCloudFrameChange={setHasCloudFeed}
            connectionState={connectionState}
          />
        ) : (
          <View style={styles.cameraPlaceholder}>
            <Video size={36} color="#64748B" />
            <Text style={styles.cameraPlaceholderText}>Live camera view</Text>
          </View>
        )}

        {/* Fullscreen Button on Bottom-Right */}
        <Pressable
          style={styles.fullscreenBtn}
          hitSlop={8}
          onPress={() => {
            haptics.selection();
          }}
        >
          <Maximize2 size={18} color="#1E293B" />
        </Pressable>
      </View>

      {/* ── Lower Control Sheet ── */}
      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        {/* Sheet Top Bar: Speed Selector & Emotes */}
        <View style={styles.sheetTopRow}>
          {/* Speed Selector Pill */}
          <View style={styles.speedSelectorPill}>
            {[
              { val: 0.5, label: '0.5×' },
              { val: 1.0, label: '1×' },
              { val: 1.5, label: '1.5×' },
            ].map(({ val, label }) => {
              const isActive = speedMultiplier === val;
              return (
                <Pressable
                  key={val}
                  onPress={() => {
                    haptics.selection();
                    setSpeedMultiplier(val);
                  }}
                  style={[styles.speedOption, isActive && styles.speedOptionActive]}
                >
                  <Text
                    style={[
                      styles.speedOptionText,
                      isActive && styles.speedOptionTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Emotes Trigger Pill */}
          <Pressable
            onPress={() => setShowDrawer(true)}
            style={styles.emotesPillBtn}
          >
            <Smile size={19} color="#634AF6" />
            <Text style={styles.emotesPillText}>Emotes</Text>
            <ChevronUp size={16} color="#475569" />
          </Pressable>
        </View>

        {/* Console Driving Controls: Left Joystick, Right Actions */}
        <View style={styles.consoleRow}>
          {/* Left Column: Virtual Joystick */}
          <View style={styles.joystickColumn}>
            <View style={styles.joystickBase} {...panResponder.panHandlers}>
              {/* Directional Chevrons */}
              <ChevronUp size={24} color="#94A3B8" style={styles.arrowTop} />
              <ChevronDown size={24} color="#94A3B8" style={styles.arrowBottom} />
              <ChevronLeft size={24} color="#94A3B8" style={styles.arrowLeft} />
              <ChevronRight size={24} color="#94A3B8" style={styles.arrowRight} />

              {/* Draggable Purple Puck */}
              <Animated.View style={[styles.joystickPuck, animatedPuckStyle]} />
            </View>
            <Text style={styles.columnLabel}>Drive</Text>
          </View>

          {/* Right Column: Stop & Hold to talk */}
          <View style={styles.actionsColumn}>
            {/* Red Stop Button */}
            <View style={styles.actionItem}>
              <Pressable
                onPress={handleEmergencyStop}
                style={styles.stopCircleBtn}
              >
                <View style={styles.stopInnerSquare} />
              </Pressable>
              <Text style={styles.stopLabel}>Stop</Text>
            </View>

            {/* Purple Mic Button with Lock Toggle */}
            <View style={styles.actionItem}>
              <View style={styles.micBtnWrapper}>
                <Animated.View
                  style={[
                    styles.pttWavePulse,
                    { backgroundColor: '#634AF6' },
                    animatedWaveStyle,
                  ]}
                />

                <Pressable
                  onPressIn={handleStartTalking}
                  onPressOut={handleStopTalking}
                  pressRetentionOffset={{ top: 30, bottom: 30, left: 30, right: 30 }}
                  hitSlop={10}
                  style={[
                    styles.micMainBtn,
                    (isTalking || isMicLocked) && styles.micMainBtnActive,
                  ]}
                >
                  <Mic size={38} color="#FFFFFF" />
                </Pressable>

                {/* Lock Toggle Badge */}
                <Pressable
                  onPress={async () => {
                    if (!isMicLocked) {
                      const ok = await startAudioCapture();
                      if (ok) {
                        setIsMicLocked(true);
                      }
                    } else {
                      setIsMicLocked(false);
                      stopAudioCapture();
                    }
                  }}
                  style={styles.micLockBadge}
                  hitSlop={6}
                >
                  <Lock
                    size={14}
                    color={isMicLocked ? '#634AF6' : '#64748B'}
                    strokeWidth={2.2}
                  />
                </Pressable>
              </View>

              <Text style={styles.columnLabel}>
                {isMicLocked
                  ? t('live.micLocked', 'MIC ON')
                  : isTalking
                    ? 'Talking…'
                    : t('live.pushToTalk', 'Hold to talk')}
              </Text>
            </View>
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
                <Sparkles size={20} color="#634AF6" />
                <Text style={styles.drawerTitle}>Emotions & Gestures</Text>
              </View>
              <Pressable
                onPress={() => setShowDrawer(false)}
                hitSlop={8}
                style={styles.closeDrawerBtn}
              >
                <X size={20} color="#64748B" />
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
                        color={isCurrent ? '#634AF6' : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.drawerEmoteText,
                          isCurrent && { color: '#634AF6', fontWeight: '700' },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Gestures & Tricks */}
              <Text style={styles.drawerSectionLabel}>GESTURES & TRICKS</Text>
              <View style={styles.drawerGesturesGrid}>
                {GESTURES_LIST.map(({ name, label }) => {
                  const isTrick = name === 'spin' || name === 'surveillance';
                  return (
                    <Pressable
                      key={name}
                      onPress={() => handleSendGesture(name)}
                      style={[
                        styles.drawerGestureBtn,
                        isTrick && styles.drawerTrickBtn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.drawerGestureText,
                          isTrick && styles.drawerTrickText,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
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
    backgroundColor: '#F3F4F9',
  },
  topHud: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  circleIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleColumn: {
    justifyContent: 'center',
  },
  robotHudName: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.2,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  liveText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  endCallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 12,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cameraViewportCard: {
    marginHorizontal: 20,
    flex: 1,
    maxHeight: 280,
    minHeight: 210,
    backgroundColor: '#E8EAF5',
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraImageFull: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cameraBadgesRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  badgeText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  cameraPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraPlaceholderText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  fullscreenBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingTop: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 4,
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  speedSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F9',
    borderRadius: 28,
    padding: 4,
  },
  speedOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
  },
  speedOptionActive: {
    backgroundColor: '#634AF6',
    paddingHorizontal: 18,
    shadowColor: '#634AF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  speedOptionText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
  speedOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  emotesPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  emotesPillText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '700',
  },
  consoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  joystickColumn: {
    alignItems: 'center',
  },
  joystickBase: {
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: '#F0F2FA',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  arrowTop: {
    position: 'absolute',
    top: 14,
    left: 86,
  },
  arrowBottom: {
    position: 'absolute',
    bottom: 14,
    left: 86,
  },
  arrowLeft: {
    position: 'absolute',
    left: 14,
    top: 86,
  },
  arrowRight: {
    position: 'absolute',
    right: 14,
    top: 86,
  },
  joystickPuck: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#634AF6',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#634AF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  columnLabel: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  actionsColumn: {
    alignItems: 'center',
    width: 100,
    gap: 16,
  },
  actionItem: {
    alignItems: 'center',
  },
  stopCircleBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#E11D48',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  stopInnerSquare: {
    width: 20,
    height: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
  },
  stopLabel: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
  },
  micBtnWrapper: {
    width: 92,
    height: 92,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pttWavePulse: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
  },
  micMainBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#634AF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#634AF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 8,
  },
  micMainBtnActive: {
    backgroundColor: '#4F46E5',
    transform: [{ scale: 0.96 }],
  },
  micLockBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  drawerCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: spacing.lg,
    maxHeight: '65%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
    gap: spacing.md,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: spacing.sm,
  },
  drawerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  drawerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  closeDrawerBtn: {
    padding: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
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
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  drawerEmoteChipActive: {
    borderColor: '#634AF6',
    backgroundColor: '#EDE9FE',
  },
  drawerEmoteText: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '600',
  },
  drawerGesturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  drawerGestureBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  drawerGestureText: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '700',
  },
  drawerTrickBtn: {
    borderColor: '#634AF6',
    backgroundColor: '#F5F3FF',
  },
  drawerTrickText: {
    color: '#634AF6',
  },
});
