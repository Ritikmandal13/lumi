/**
 * RobotFace component
 * SVG face with emotion states. Used in splash, loading, empty states and previews.
 * Emotions: happy, excited, love, surprised, sleepy, sad, neutral, blink, curious, wink
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useColors } from '../theme';
import { robotColors, type RobotColorKey } from '../theme/tokens';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export type Emotion =
  | 'happy'
  | 'excited'
  | 'love'
  | 'surprised'
  | 'sleepy'
  | 'sad'
  | 'neutral'
  | 'blink'
  | 'curious'
  | 'wink';

export interface RobotFaceProps {
  size?: number;
  emotion?: Emotion;
  color?: RobotColorKey | string;
  animate?: boolean;
}

export function RobotFace({
  size = 120,
  emotion = 'happy',
  color = 'violet',
  animate = true,
}: RobotFaceProps) {
  const colors = useColors();
  const faceColor = (robotColors as Record<string, string>)[color] || color;

  // Blink animation
  const blinkScale = useSharedValue(1);

  useEffect(() => {
    if (animate) {
      blinkScale.value = withRepeat(
        withDelay(
          3000,
          withSequence(
            withTiming(0.1, { duration: 80, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 120, easing: Easing.inOut(Easing.ease) }),
          ),
        ),
        -1,
        false,
      );
    }
  }, [animate, blinkScale]);

  const animatedEyeProps = useAnimatedProps(() => ({
    ry: emotion === 'blink' ? 1 : (size * 0.08) * blinkScale.value,
  }));

  const renderEyes = () => {
    const eyeY = size * 0.38;
    const leftEyeX = size * 0.35;
    const rightEyeX = size * 0.65;
    const eyeRx = size * 0.07;
    const eyeRy = size * 0.08;

    switch (emotion) {
      case 'wink':
        return (
          <>
            <AnimatedEllipse
              cx={leftEyeX}
              cy={eyeY}
              rx={eyeRx}
              animatedProps={animatedEyeProps}
              fill={colors.textPrimary}
            />
            {/* Winking right eye */}
            <Path
              d={`M${rightEyeX - eyeRx} ${eyeY + 2} Q${rightEyeX} ${eyeY - 4} ${rightEyeX + eyeRx} ${eyeY + 2}`}
              stroke={colors.textPrimary}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </>
        );
      case 'curious':
        return (
          <>
            <Circle cx={leftEyeX} cy={eyeY - 2} r={eyeRx * 1.2} fill={colors.textPrimary} />
            <Circle cx={rightEyeX} cy={eyeY + 2} r={eyeRx * 0.9} fill={colors.textPrimary} />
          </>
        );
      case 'happy':
      case 'excited':
        return (
          <>
            <AnimatedEllipse
              cx={leftEyeX}
              cy={eyeY}
              rx={eyeRx}
              animatedProps={animatedEyeProps}
              fill={colors.textPrimary}
            />
            <AnimatedEllipse
              cx={rightEyeX}
              cy={eyeY}
              rx={eyeRx}
              animatedProps={animatedEyeProps}
              fill={colors.textPrimary}
            />
          </>
        );
      case 'love':
        return (
          <>
            <Path
              d={`M${leftEyeX - 8} ${eyeY - 2} 
                  C${leftEyeX - 8} ${eyeY - 8} ${leftEyeX - 2} ${eyeY - 10} ${leftEyeX} ${eyeY - 4}
                  C${leftEyeX + 2} ${eyeY - 10} ${leftEyeX + 8} ${eyeY - 8} ${leftEyeX + 8} ${eyeY - 2}
                  C${leftEyeX + 8} ${eyeY + 4} ${leftEyeX} ${eyeY + 10} ${leftEyeX} ${eyeY + 10}
                  C${leftEyeX} ${eyeY + 10} ${leftEyeX - 8} ${eyeY + 4} ${leftEyeX - 8} ${eyeY - 2}Z`}
              fill="#FF4D6D"
            />
            <Path
              d={`M${rightEyeX - 8} ${eyeY - 2}
                  C${rightEyeX - 8} ${eyeY - 8} ${rightEyeX - 2} ${eyeY - 10} ${rightEyeX} ${eyeY - 4}
                  C${rightEyeX + 2} ${eyeY - 10} ${rightEyeX + 8} ${eyeY - 8} ${rightEyeX + 8} ${eyeY - 2}
                  C${rightEyeX + 8} ${eyeY + 4} ${rightEyeX} ${eyeY + 10} ${rightEyeX} ${eyeY + 10}
                  C${rightEyeX} ${eyeY + 10} ${rightEyeX - 8} ${eyeY + 4} ${rightEyeX - 8} ${eyeY - 2}Z`}
              fill="#FF4D6D"
            />
          </>
        );
      case 'surprised':
        return (
          <>
            <Circle cx={leftEyeX} cy={eyeY} r={eyeRx * 1.3} fill={colors.textPrimary} />
            <Circle cx={rightEyeX} cy={eyeY} r={eyeRx * 1.3} fill={colors.textPrimary} />
          </>
        );
      case 'sleepy':
        return (
          <>
            <Ellipse cx={leftEyeX} cy={eyeY} rx={eyeRx} ry={2} fill={colors.textPrimary} />
            <Ellipse cx={rightEyeX} cy={eyeY} rx={eyeRx} ry={2} fill={colors.textPrimary} />
          </>
        );
      case 'sad':
        return (
          <>
            <Ellipse cx={leftEyeX} cy={eyeY + 2} rx={eyeRx * 0.9} ry={eyeRy * 0.8} fill={colors.textPrimary} />
            <Ellipse cx={rightEyeX} cy={eyeY + 2} rx={eyeRx * 0.9} ry={eyeRy * 0.8} fill={colors.textPrimary} />
          </>
        );
      default:
        return (
          <>
            <AnimatedEllipse
              cx={leftEyeX}
              cy={eyeY}
              rx={eyeRx}
              animatedProps={animatedEyeProps}
              fill={colors.textPrimary}
            />
            <AnimatedEllipse
              cx={rightEyeX}
              cy={eyeY}
              rx={eyeRx}
              animatedProps={animatedEyeProps}
              fill={colors.textPrimary}
            />
          </>
        );
    }
  };

  const renderMouth = () => {
    const mouthY = size * 0.58;
    const cx = size * 0.5;

    switch (emotion) {
      case 'curious':
        return (
          <Path
            d={`M${cx - size * 0.06} ${mouthY + 2} Q${cx} ${mouthY + size * 0.08} ${cx + size * 0.09} ${mouthY - 1}`}
            stroke={colors.textPrimary}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        );
      case 'wink':
      case 'happy':
      case 'excited':
        return (
          <Path
            d={`M${cx - size * 0.12} ${mouthY} Q${cx} ${mouthY + size * 0.12} ${cx + size * 0.12} ${mouthY}`}
            stroke={colors.textPrimary}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        );
      case 'love':
        return (
          <Path
            d={`M${cx - size * 0.1} ${mouthY} Q${cx} ${mouthY + size * 0.14} ${cx + size * 0.1} ${mouthY}`}
            stroke="#FF4D6D"
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        );
      case 'surprised':
        return (
          <Ellipse cx={cx} cy={mouthY + 4} rx={size * 0.06} ry={size * 0.08} fill={colors.textPrimary} />
        );
      case 'sleepy':
        return (
          <Path
            d={`M${cx - size * 0.06} ${mouthY + 2} Q${cx} ${mouthY + size * 0.05} ${cx + size * 0.06} ${mouthY + 2}`}
            stroke={colors.textPrimary}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        );
      case 'sad':
        return (
          <Path
            d={`M${cx - size * 0.1} ${mouthY + size * 0.06} Q${cx} ${mouthY - size * 0.04} ${cx + size * 0.1} ${mouthY + size * 0.06}`}
            stroke={colors.textPrimary}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        );
      default:
        return (
          <Path
            d={`M${cx - size * 0.08} ${mouthY + 2} L${cx + size * 0.08} ${mouthY + 2}`}
            stroke={colors.textPrimary}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
    }
  };

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityLabel={`LUMI face showing ${emotion} emotion`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Face background */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.42}
          fill={faceColor}
          opacity={0.15}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.42}
          stroke={faceColor}
          strokeWidth={2.5}
          fill="none"
          opacity={0.5}
        />

        {/* Inner glow */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.35}
          fill={faceColor}
          opacity={0.08}
        />

        {/* Eyes */}
        <G>{renderEyes()}</G>

        {/* Cheeks (blush) */}
        {(emotion === 'happy' || emotion === 'excited' || emotion === 'love' || emotion === 'wink') && (
          <>
            <Circle
              cx={size * 0.24}
              cy={size * 0.5}
              r={size * 0.04}
              fill="#FFB4C2"
              opacity={0.5}
            />
            <Circle
              cx={size * 0.76}
              cy={size * 0.5}
              r={size * 0.04}
              fill="#FFB4C2"
              opacity={0.5}
            />
          </>
        )}

        {/* Mouth */}
        {renderMouth()}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
