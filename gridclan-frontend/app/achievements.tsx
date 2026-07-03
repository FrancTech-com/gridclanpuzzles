import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { profileApi } from '@api/index';
import { Card, LoadingSpinner } from '@components/ui/index';
import { RegisterGate } from '@components/AuthGate';
import { Font, Radius, Spacing, TournamentGameMeta } from '@theme/index';
import { useColors } from '@theme/theme';
import type { PlayerStats, TournamentGame, WinLossRecord } from '@gridtypes/index';

const GAME_ORDER: TournamentGame[] = ['SCRABBLE', 'GOMOKU', 'BATTLESHIP'];

/**
 * Achievements — the player's lifetime record across every game and mode:
 * solo (vs computer), friend games and tournament matches for the three
 * board games, plus Word Search puzzles and tournament titles.
 */
export default function AchievementsScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const [stats, setStats]     = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    profileApi.getStats()
      .then(res => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const header = (
    <Stack.Screen
      options={{
        headerShown:     true,
        title:           t('achievements.title', 'Achievements'),
        headerStyle:     { backgroundColor: Colors.surface },
        headerTintColor: Colors.textPrimary,
      }}
    />
  );

  if (!userId) return (
    <>
      {header}
      <RegisterGate
        icon="🏆"
        title={t('achievements.title', 'Achievements')}
        subtitle={t('achievements.guest', 'Create an account to track your wins and losses across all games.')}
      />
    </>
  );

  if (loading) return <>{header}<LoadingSpinner /></>;

  if (!stats) return (
    <View style={styles.container}>
      {header}
      <Text style={styles.errorText}>{t('achievements.loadFailed', 'Could not load your stats. Pull to retry later.')}</Text>
    </View>
  );

  const { overall, games, wordSearch, tournaments } = stats;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>

        {/* Overall record */}
        <Card style={styles.heroCard}>
          <Text style={styles.heroTitle}>🏆 {t('achievements.overall', 'Overall record')}</Text>
          <View style={styles.heroRow}>
            <BigStat label={t('achievements.wins', 'Wins')}   value={overall.wins}   color="#2a9d4a" />
            <BigStat label={t('achievements.losses', 'Losses')} value={overall.losses} color={Colors.error} />
            <BigStat label={t('achievements.draws', 'Draws')}  value={overall.draws}  color={Colors.textSecondary} />
          </View>
          {overall.games > 0 ? (
            <>
              <View style={styles.rateTrack}>
                <View style={[styles.rateFill, { width: `${overall.winRate}%` }]} />
              </View>
              <Text style={styles.rateText}>
                {t('achievements.winRate', { rate: overall.winRate, total: overall.games, defaultValue: '{{rate}}% win rate over {{total}} games' })}
              </Text>
            </>
          ) : (
            <Text style={styles.rateText}>{t('achievements.noGames', 'No finished games yet — go play one!')}</Text>
          )}
        </Card>

        {/* Tournament achievements */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🏅 {t('achievements.tournaments', 'Tournaments')}</Text>
          <View style={styles.heroRow}>
            <BigStat label={t('achievements.entered', 'Entered')} value={tournaments.joined} color={Colors.textPrimary} />
            <BigStat label={t('achievements.titles', 'Titles won')} value={tournaments.titles} color="#d4a017" />
          </View>
        </Card>

        {/* Per-game breakdown */}
        {GAME_ORDER.map(game => {
          const meta = TournamentGameMeta[game];
          const g = games[game];
          if (!g) return null;
          return (
            <Card key={game} style={styles.card}>
              <Text style={[styles.cardTitle, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
              <ModeRow label={`🤖 ${t('achievements.modeSolo', 'Vs computer')}`}   rec={g.solo}       styles={styles} />
              <ModeRow label={`👥 ${t('achievements.modeFriend', 'Friend games')}`} rec={g.friend}     styles={styles} />
              <ModeRow label={`🏅 ${t('achievements.modeTournament', 'Tournament')}`} rec={g.tournament} styles={styles} />
            </Card>
          );
        })}

        {/* Word Search (solo, score-based — no win/lose) */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🔎 {t('achievements.wordSearch', 'Word Search')}</Text>
          <View style={styles.heroRow}>
            <BigStat label={t('achievements.solved', 'Puzzles finished')} value={wordSearch.completed} color={Colors.textPrimary} />
            <BigStat label={t('achievements.bestScore', 'Best score')} value={wordSearch.bestScore} color={Colors.primary} />
          </View>
        </Card>

      </ScrollView>
    </View>
  );
}

function BigStat({ label, value, color }: { label: string; value: number; color: string }) {
  const Colors = useColors();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color, fontSize: Font.size.xl, fontWeight: Font.weight.bold }}>
        {value.toLocaleString()}
      </Text>
      <Text style={{ color: Colors.textSecondary, fontSize: Font.size.xs, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}

function ModeRow({ label, rec, styles }: {
  label: string;
  rec: WinLossRecord;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { t } = useTranslation();
  const total = rec.wins + rec.losses + rec.draws;
  return (
    <View style={styles.modeRow}>
      <Text style={styles.modeLabel}>{label}</Text>
      {total === 0 ? (
        <Text style={styles.modeEmpty}>{t('achievements.notPlayed', 'Not played yet')}</Text>
      ) : (
        <Text style={styles.modeRecord}>
          <Text style={styles.winText}>{rec.wins}{t('achievements.w', 'W')}</Text>
          {'  ·  '}
          <Text style={styles.lossText}>{rec.losses}{t('achievements.l', 'L')}</Text>
          {'  ·  '}
          <Text style={styles.drawText}>{rec.draws}{t('achievements.d', 'D')}</Text>
        </Text>
      )}
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  heroCard:  { padding: Spacing.lg, gap: Spacing.md },
  heroTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  heroRow:   { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },

  rateTrack: { height: 8, borderRadius: Radius.full, backgroundColor: Colors.surfaceHigh, overflow: 'hidden' },
  rateFill:  { height: 8, borderRadius: Radius.full, backgroundColor: '#2a9d4a' },
  rateText:  { color: Colors.textSecondary, fontSize: Font.size.sm },

  card:      { padding: Spacing.lg, gap: Spacing.sm },
  cardTitle: { fontSize: Font.size.md, fontWeight: Font.weight.bold, color: Colors.textPrimary, marginBottom: Spacing.xs },

  modeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  modeLabel:  { color: Colors.textSecondary, fontSize: Font.size.sm },
  modeEmpty:  { color: Colors.textMuted, fontSize: Font.size.sm, fontStyle: 'italic' },
  modeRecord: { fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  winText:    { color: '#2a9d4a' },
  lossText:   { color: Colors.error },
  drawText:   { color: Colors.textSecondary },

  errorText: { color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xxl, padding: Spacing.lg },
});
