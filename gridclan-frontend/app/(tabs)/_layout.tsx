import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Font, Glass } from '@theme/index';
import { useColors } from '@theme/theme';
import { FloatingControls } from '@components/ui/FloatingControls';
export default function TabsLayout() {
  const { t } = useTranslation();
  const Colors = useColors();
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      // Let the root SkyBackground show through tab scenes (the navigator
      // otherwise paints its own opaque default background).
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={{
        headerShown:          false,
        tabBarStyle:          { backgroundColor: Colors.surface, borderTopColor: Colors.border, height: 60, paddingBottom: 8, ...Glass },
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle:     { fontSize: Font.size.xs, fontFamily: Font.family.displaySemi },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.play'),
          tabBarIcon: ({ color, size }) => <Ionicons name="game-controller" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tournament"
        options={{
          title: t('tournament.tournaments'),
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: t('tabs.community'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gems"
        options={{
          title: t('tabs.gems'),
          tabBarIcon: ({ color, size }) => <Ionicons name="diamond" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: t('tabs.wallet', 'Wallet'),
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} />,
        }}
      />
      {/* Profile lives in the top-right corner button (FloatingControls), not
          the tab bar — href:null keeps the route (tab bar stays visible on it)
          without rendering a tab. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
    <FloatingControls />
    </View>
  );
}
