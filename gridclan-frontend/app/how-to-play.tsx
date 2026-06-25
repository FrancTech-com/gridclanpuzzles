import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { Button, Card } from '@components/ui/index';
import { Colors, Font, GameMeta, Radius, Spacing } from '@theme/index';
import type { GameType } from '@gridtypes/index';

const GAME_ORDER: GameType[] = ['GRID_LOCKDOWN', 'SUM_CIPHER', 'LINKED_RUSH'];

const MODES: { key: string; icon: string }[] = [
  { key: 'solo',       icon: '🎮' },
  { key: 'friend',     icon: '👥' },
  { key: 'tournament', icon: '🏆' },
];

/**
 * Static "How to Play" guide — explains the three puzzles, the play modes,
 * how points/gems work, and fair play. Intentionally read-only and reachable
 * by guests (no auth) so newcomers can decide before registering.
 */
export default function HowToPlayScreen() {
  const { t } = useTranslation();
  const isGuest = !useSelector((s: RootState) => s.auth.userId);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown:     true,
          title:           t('howToPlay.title', 'How to Play'),
          headerStyle:     { backgroundColor: Colors.surface },
          headerTintColor: Colors.textPrimary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('howToPlay.intro')}</Text>

        {/* The puzzles */}
        <Text style={styles.sectionLabel}>{t('howToPlay.gamesTitle', 'The puzzles')}</Text>
        {GAME_ORDER.map(type => (
          <Card key={type} style={styles.card}>
            <View style={[styles.accent, { backgroundColor: GameMeta[type].color }]} />
            <Text style={[styles.cardTitle, { color: GameMeta[type].color }]}>
              {t(`howToPlay.games.${type}.name`, GameMeta[type].label)}
            </Text>
            <Text style={styles.cardBody}>{t(`howToPlay.games.${type}.how`, GameMeta[type].description)}</Text>
          </Card>
        ))}

        {/* Ways to play */}
        <Text style={styles.sectionLabel}>{t('howToPlay.modesTitle', 'Ways to play')}</Text>
        {MODES.map(m => (
          <Card key={m.key} style={styles.modeCard}>
            <Text style={styles.modeIcon}>{m.icon}</Text>
            <View style={styles.modeText}>
              <Text style={styles.cardTitle}>{t(`howToPlay.modes.${m.key}.name`)}</Text>
              <Text style={styles.cardBody}>{t(`howToPlay.modes.${m.key}.desc`)}</Text>
            </View>
          </Card>
        ))}

        {/* Points, gems, fair play */}
        <Text style={styles.sectionLabel}>{t('howToPlay.scoringTitle', 'Points & scoring')}</Text>
        <Text style={styles.paragraph}>{t('howToPlay.scoring')}</Text>

        <Text style={styles.sectionLabel}>{t('howToPlay.gemsTitle', 'Gems')}</Text>
        <Text style={styles.paragraph}>{t('howToPlay.gems')}</Text>

        <Text style={styles.sectionLabel}>{t('howToPlay.fairTitle', 'Fair play')}</Text>
        <Text style={styles.paragraph}>{t('howToPlay.fair')}</Text>

        <Button
          title={isGuest ? t('howToPlay.ctaGuest', 'Create an account to play') : t('howToPlay.ctaUser', 'Start playing')}
          onPress={() => (isGuest ? router.push('/(auth)/register') : router.back())}
          size="lg"
          style={styles.cta}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  intro: { color: Colors.textSecondary, fontSize: Font.size.md, lineHeight: 22, marginBottom: Spacing.lg },

  sectionLabel: {
    color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi,
    marginTop: Spacing.lg, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8,
  },

  card:      { padding: Spacing.md, marginBottom: Spacing.sm, overflow: 'hidden' },
  accent:    { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4 },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  cardBody:  { color: Colors.textMuted, fontSize: Font.size.sm, lineHeight: 20, marginTop: 4 },

  modeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: Spacing.sm },
  modeIcon: { fontSize: 28 },
  modeText: { flex: 1 },

  paragraph: { color: Colors.textMuted, fontSize: Font.size.sm, lineHeight: 20 },

  cta: { marginTop: Spacing.xl },
});
