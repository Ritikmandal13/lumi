/**
 * Tabs Layout — 3 tabs: Robots (home), Activity, Settings
 * Safe area insets aware, hides rogue index route
 */

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bot, History, Settings } from 'lucide-react-native';
import { useColors, useTheme } from '../../src/theme';
import { typography } from '../../src/theme/tokens';

export default function TabsLayout() {
  const colors = useColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // On Android with gesture navigation, insets.bottom is often 0-16 in Expo,
  // but gesture line sits at ~16-20px from bottom. Add generous clearance.
  const bottomPadding = Platform.OS === 'android'
    ? Math.max(insets.bottom, 28) + 8
    : Math.max(insets.bottom, 16);

  useEffect(() => {
    RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
    if (Platform.OS === 'android') {
      RNStatusBar.setBackgroundColor('transparent');
      RNStatusBar.setTranslucent(true);
    }
  }, [isDark]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: 58 + bottomPadding,
          },
          tabBarLabelStyle: {
            ...typography.caption,
            marginTop: 2,
          },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="robots"
        options={{
          title: 'Robots',
          tabBarIcon: ({ color, size }) => <Bot size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
    </>
  );
}
