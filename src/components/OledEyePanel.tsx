/**
 * OledEyePanel Component
 * LUMI's hardware OLED screen hero panel.
 * Displays luminous electric cyan/ice-blue eyes with realistic OLED scanlines.
 * Supports:
 * - 'open': Vertical glowing capsules (Log in screen)
 * - 'happy': Cute arched smiling curves (Sign up screen)
 * - Interactive: Blinks naturally & reacts with a curious pulse when fields are tapped.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';

export type EyeMode = 'open' | 'happy';

export interface OledEyePanelProps {
  mode?: EyeMode;
  isFieldFocused?: boolean;
  width?: number;
  height?: number;
}

export function OledEyePanel({
  mode = 'open',
  isFieldFocused = false,
  width = 220,
  height = 110,
}: OledEyePanelProps) {
  // Shared values for natural blinking and reactions
  const scaleY = useSharedValue(1);
  const translateY = useSharedValue(0);
  const scaleX = useSharedValue(1);

  // Natural idle blinking loop
  useEffect(() => {
    scaleY.value = withRepeat(
      withDelay(
        3200,
        withSequence(
          withTiming(0.08, { duration: 75, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 110, easing: Easing.inOut(Easing.ease) }),
          // Occasional double-blink
          withDelay(
            150,
            withSequence(
              withTiming(0.08, { duration: 60, easing: Easing.inOut(Easing.ease) }),
              withTiming(1, { duration: 90, easing: Easing.inOut(Easing.ease) })
            )
          )
        )
      ),
      -1,
      false
    );
  }, [scaleY]);

  // Field focus reaction: curious perk / gentle bounce
  useEffect(() => {
    if (isFieldFocused) {
      translateY.value = withSequence(
        withSpring(-5, { damping: 10, stiffness: 200 }),
        withSpring(0, { damping: 12, stiffness: 180 })
      );
      scaleX.value = withSequence(
        withTiming(1.12, { duration: 120 }),
        withTiming(1, { duration: 160 })
      );
    }
  }, [isFieldFocused, translateY, scaleX]);

  const animatedEyeContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: scaleY.value },
      { scaleX: scaleX.value },
      { translateY: translateY.value },
    ],
  }));

  // Render scanlines for authentic OLED panel look
  const scanlinesCount = Math.floor(height / 4);
  const scanlineYCoordinates = Array.from({ length: scanlinesCount }, (_, i) => i * 4);

  return (
    <View style={[styles.panel, { width, height }]}>
      {/* Scanline texture */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={height}>
          {scanlineYCoordinates.map((y) => (
            <Line
              key={y}
              x1="0"
              y1={y}
              x2={width}
              y2={y}
              stroke="rgba(255, 255, 255, 0.035)"
              strokeWidth="1"
            />
          ))}
        </Svg>
      </View>

      {/* Screen inner ambient glow */}
      <View style={styles.ambientGlow} />

      {/* Eyes Container */}
      <Animated.View style={[styles.eyesRow, animatedEyeContainerStyle]}>
        {mode === 'open' ? (
          <>
            {/* Left Eye */}
            <View style={styles.openEyeGlow}>
              <View style={styles.openEyePill}>
                <View style={styles.eyeInnerHighlight} />
              </View>
            </View>

            {/* Right Eye */}
            <View style={styles.openEyeGlow}>
              <View style={styles.openEyePill}>
                <View style={styles.eyeInnerHighlight} />
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Happy Eyes (Upward Arcs ^ ^) */}
            <View style={styles.happyEyeContainer}>
              <Svg width={42} height={28} viewBox="0 0 42 28">
                {/* Outer soft glow stroke */}
                <Path
                  d="M 5 24 Q 21 2 37 24"
                  fill="none"
                  stroke="rgba(165, 225, 255, 0.4)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                {/* Main sharp eye arc */}
                <Path
                  d="M 5 24 Q 21 2 37 24"
                  fill="none"
                  stroke="#D2EFFF"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </Svg>
            </View>

            <View style={styles.happyEyeContainer}>
              <Svg width={42} height={28} viewBox="0 0 42 28">
                {/* Outer soft glow stroke */}
                <Path
                  d="M 5 24 Q 21 2 37 24"
                  fill="none"
                  stroke="rgba(165, 225, 255, 0.4)"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                {/* Main sharp eye arc */}
                <Path
                  d="M 5 24 Q 21 2 37 24"
                  fill="none"
                  stroke="#D2EFFF"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </Svg>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#090A13',
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#1D2136',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#00D4FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  ambientGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(80, 180, 255, 0.03)',
  },
  eyesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  openEyeGlow: {
    width: 38,
    height: 58,
    borderRadius: 19,
    backgroundColor: 'rgba(160, 220, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#6BD0FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  openEyePill: {
    width: 32,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#D0EFFF',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeInnerHighlight: {
    width: 14,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    opacity: 0.55,
  },
  happyEyeContainer: {
    width: 44,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#6BD0FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});
