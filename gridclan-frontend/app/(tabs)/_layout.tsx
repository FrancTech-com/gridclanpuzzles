import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Font } from '@theme/index';
import { useColors } from '@theme/theme';
export default function TabsLayout() {
  const { t } = useTranslation();
  const Colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown:          false,
        tabBarStyle:          { backgroundColor: Colors.surface, borderTopColor: Colors.border, height: 60, paddingBottom: 8 },
        tabBarActiveTintColor:   Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle:     { fontSize: Font.size.xs, fontWeight: Font.weight.medium },
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
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
