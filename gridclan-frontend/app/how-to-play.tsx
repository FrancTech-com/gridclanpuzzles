import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { Button, Card } from '@components/ui/index';
import { Font, GameMeta, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { GameType } from '@gridtypes/index';

const GAME_ORDER: GameType[] = ['WORD_SEARCH'];

const MODES: { key: string; icon: string }[] = [
  { key: 'solo',       icon: '🎮' },
  { key: 'friend',     icon: '👥' },
  { key: 'tournament', icon: '🏆' },
];

// Real-time multiplayer board games (their own invite-and-play flows, live over WebSocket).
// Every turn-based game runs a 5-minute move clock; if it runs out the turn passes
// automatically (in Chess, that means losing on time).
const LIVE_GAMES: { key: string; icon: string; name: string; how: string }[] = [
  { key: 'scrabble',   icon: '🔤', name: 'Grid Scrabble', how: 'Build words on a shared board with standard Scrabble rules and scoring (premiums, +50 bingo, end-game rack adjustment). Play 2 to 4 players — every move appears instantly.' },
  { key: 'chess',      icon: '♞', name: 'Grid Chess',     how: 'Full chess rules — castling, en passant, promotion, check and checkmate. You play white and share a code; your friend joins as black.' },
  { key: 'gomoku',     icon: '⚫', name: 'Grid Connect',     how: 'Take turns placing stones; first to line up five in a row — across, down, or diagonally — wins.' },
  { key: 'battleship', icon: '🚢', name: 'Grid Battleships', how: 'Your fleet is hidden on a grid. Take turns firing at the enemy waters and sink every ship to win.' },
  { key: 'monopoly',   icon: '🎩', name: 'Grid Tycoon',      how: 'The classic property game for 6–8 players — buy, build, collect rent and bankrupt your rivals. Tournaments only, played at one shared table.' },
];

/**
 * Static "How to Play" guide — explains the three puzzles, the play modes,
 * how points/gems work, and fair play. Intentionally read-only and reachable
 * by guests (no auth) so newcomers can decide before registering.
 */
export default function HowToPlayScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
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

        {/* Live multiplayer games */}
        <Text style={styles.sectionLabel}>{t('howToPlay.liveTitle', 'Play live with friends')}</Text>
        {LIVE_GAMES.map(g => (
          <Card key={g.key} style={styles.modeCard}>
            <Text style={styles.modeIcon}>{g.icon}</Text>
            <View style={styles.modeText}>
              <Text style={styles.cardTitle}>{t(`howToPlay.live.${g.key}.name`, g.name)}</Text>
              <Text style={styles.cardBody}>{t(`howToPlay.live.${g.key}.how`, g.how)}</Text>
            </View>
          </Card>
        ))}

        {/* Tournaments */}
        <Text style={styles.sectionLabel}>{t('howToPlay.tournamentsTitle', 'Tournaments')}</Text>
        <Text style={styles.paragraph}>{t('howToPlay.tournaments', 'Join a bracket and play to be champion. Chess, Connect and Battleships run classic knockout — win your match and advance. Scrabble plays in groups of four on one board, where the top two scores advance and first-round losers get a second run in the losers bracket. Monopoly seats up to eight players at a table, and each table’s winner moves on. If you’re knocked out, you can still open any live match and watch it in real time.')}</Text>

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

        {/* Points, leaderboards, gems, fair play */}
        <Text style={styles.sectionLabel}>{t('howToPlay.scoringTitle', 'Points & scoring')}</Text>
        <Text style={styles.paragraph}>{t('howToPlay.scoring')}</Text>

        <Text style={styles.sectionLabel}>{t('howToPlay.leaderboardTitle', 'Leaderboards')}</Text>
        <Text style={styles.paragraph}>{t('howToPlay.leaderboard')}</Text>

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

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
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
