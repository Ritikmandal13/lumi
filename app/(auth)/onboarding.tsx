/**
 * S02 Onboarding Screen
 * Bespoke dark midnight experience (#12111C) matching robot hardware imagery:
 * - Full-bleed edge-to-edge hero image with 4-way LinearGradient fade into #12111C
 * - Fixed container height & scale (1.2x) eliminating swipe jumping & enlarging robot presence
 * - Zero dead space: text container overlaps the bottom glow seamlessly
 * - Balanced typography preventing orphan words ("home.", "are.")
 * - High-contrast lavender Skip button (#C9C3E6)
 * - Elevated inactive dot opacity for clear visibility
 * - Refined 56px white pill button with amber circular arrow badge
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  FlatList,
  Pressable,
  Image,
  type ViewToken,
  type ImageSourcePropType,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Slide {
  id: string;
  category: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
}

const slides: Slide[] = [
  {
    id: '1',
    category: 'WELCOME',
    title: 'Meet LUMI.',
    // Uses non-breaking space (\u00A0) to guarantee "home." never sits alone
    body: 'A little robot that is your eyes\nand voice at\u00A0home.',
    image: require('../../assets/slide1.png'),
  },
  {
    id: '2',
    category: 'SEE, HEAR AND TALK',
    title: 'Live, from\nanywhere.',
    // Uses non-breaking space (\u00A0) to guarantee "are." never sits alone
    body: 'Live video and two-way voice,\nwherever you\u00A0are.',
    image: require('../../assets/slide2.png'),
  },
  {
    id: '3',
    category: 'DRIVE AND PLAY',
    title: 'Take the wheel.',
    // Uses non-breaking space (\u00A0) to guarantee "phone." never sits alone
    body: 'Joystick, emotions and gestures,\nall from your\u00A0phone.',
    image: require('../../assets/sllide3.png'),
  },
];

const VIEWABILITY_CONFIG = { viewAreaCoveragePercentThreshold: 50 };

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  // Hero image takes ~54% of screen height to close dead zone completely
  const heroImageHeight = Math.round(height * 0.54);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const handleNext = () => {
    if (activeIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      router.push('/(auth)/signup' as any);
    }
  };

  const handleSkip = () => {
    router.push('/(auth)/signup' as any);
  };

  const renderSlide = ({ item }: { item: Slide }) => {
    return (
      <View style={[styles.slide, { width }]}>
        {/* Fixed Full-bleed Hero Image Container — Identical across all slides */}
        <View style={[styles.imageContainer, { height: heroImageHeight, width }]}>
          <Image
            source={item.image}
            style={styles.heroImage}
            resizeMode="cover"
          />

          {/* Top Vignette behind status bar & header */}
          <LinearGradient
            colors={['#12111C', 'rgba(18, 17, 28, 0.65)', 'rgba(18, 17, 28, 0.0)']}
            locations={[0, 0.45, 1]}
            style={styles.topVignette}
            pointerEvents="none"
          />

          {/* Bottom Deep Fade into #12111C (~42% of hero height) */}
          <LinearGradient
            colors={[
              'rgba(18, 17, 28, 0.0)',
              'rgba(18, 17, 28, 0.2)',
              'rgba(18, 17, 28, 0.75)',
              '#12111C',
            ]}
            locations={[0, 0.35, 0.75, 1]}
            style={[styles.bottomVignette, { height: Math.round(heroImageHeight * 0.42) }]}
            pointerEvents="none"
          />

          {/* Left edge fade */}
          <LinearGradient
            colors={['rgba(18, 17, 28, 0.95)', 'rgba(18, 17, 28, 0.0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.leftVignette}
            pointerEvents="none"
          />

          {/* Right edge fade */}
          <LinearGradient
            colors={['rgba(18, 17, 28, 0.0)', 'rgba(18, 17, 28, 0.95)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.rightVignette}
            pointerEvents="none"
          />
        </View>

        {/* Text Container — Sits on the soft purple glow */}
        <View style={styles.textContainer}>
          <Text style={styles.categoryText}>{item.category}</Text>
          <Text style={styles.titleText}>{item.title}</Text>
          <Text style={styles.bodyText}>{item.body}</Text>

          {/* Dots Indicator */}
          <View style={styles.dotsRow}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === activeIndex ? styles.activeDot : styles.inactiveDot,
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Light status bar icons */}
      <StatusBar style="light" />

      {/* Floating Header: LUMI Wordmark & High-contrast Lavender Skip Button */}
      <Animated.View
        entering={FadeIn.duration(400)}
        style={[
          styles.topBar,
          { paddingTop: Math.max(insets.top, 16) + 4 },
        ]}
      >
        <Text style={styles.logoText}>LUMI</Text>

        <Pressable
          onPress={handleSkip}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          hitSlop={12}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </Animated.View>

      {/* Swipeable Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        style={styles.flatList}
      />

      {/* Fixed Bottom Action Controls */}
      <Animated.View
        entering={FadeInDown.delay(200).duration(400)}
        style={[
          styles.bottomControls,
          { paddingBottom: Math.max(insets.bottom, 20) + 8 },
        ]}
      >
        {/* Main Action Button: Refined 56px White Pill with Amber Arrow Circle */}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.pressedBtn,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            activeIndex === slides.length - 1 ? 'Get started' : 'Next slide'
          }
        >
          <Text style={styles.actionBtnText}>
            {activeIndex === slides.length - 1 ? 'Get started' : 'Next'}
          </Text>
          <View style={styles.amberArrowCircle}>
            <ArrowRight size={17} color="#12111C" strokeWidth={2.5} />
          </View>
        </Pressable>

        {/* Existing Account Footer Link */}
        <Pressable
          onPress={() => router.push('/(auth)/login' as any)}
          style={styles.alreadyHaveAccountLink}
          accessibilityRole="link"
          accessibilityLabel="I already have an account"
          hitSlop={10}
        >
          <Text style={styles.alreadyHaveAccountText}>
            I already have an account
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12111C',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  logoText: {
    fontSize: 22,
    fontFamily: 'BricolageGrotesque_800ExtraBold',
    color: '#FFFFFF',
    letterSpacing: 2.5,
  },
  skipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
    color: '#C9C3E6',
  },
  flatList: {
    flex: 1,
  },
  slide: {
    flex: 1,
    backgroundColor: '#12111C',
  },
  imageContainer: {
    backgroundColor: '#12111C',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.2 }],
  },
  topVignette: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  bottomVignette: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  leftVignette: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
  },
  rightVignette: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 24,
  },
  textContainer: {
    paddingHorizontal: 24,
    marginTop: -32,
    zIndex: 10,
  },
  categoryText: {
    fontSize: 13,
    fontFamily: 'Figtree_700Bold',
    color: '#F59E0B',
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  titleText: {
    fontSize: 38,
    lineHeight: 44,
    fontFamily: 'BricolageGrotesque_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Figtree_400Regular',
    color: '#B4B2C8',
    maxWidth: 320,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  dot: {
    height: 7,
    borderRadius: 3.5,
  },
  activeDot: {
    width: 28,
    backgroundColor: '#F59E0B',
  },
  inactiveDot: {
    width: 7,
    backgroundColor: '#5A5576',
  },
  bottomControls: {
    paddingHorizontal: 24,
    backgroundColor: '#12111C',
  },
  actionBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 26,
    paddingRight: 8,
  },
  pressedBtn: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  actionBtnText: {
    fontSize: 17,
    fontFamily: 'BricolageGrotesque_700Bold',
    color: '#12111C',
    letterSpacing: 0.2,
  },
  amberArrowCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alreadyHaveAccountLink: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  alreadyHaveAccountText: {
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
    color: '#D8D6EA',
  },
});

