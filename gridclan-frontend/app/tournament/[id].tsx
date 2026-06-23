import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch } from '@store/index';
import { startSessionThunk } from '@store/slices/gameSlice';
import { tournamentApi } from '@api/index';
import { Badge, Card, LoadingSpinner } from '@components/ui/index';
import { Colors, Font, GameMeta, Radius, Spacing } from '@theme/index';
import type { LeaderboardEntry, Tournament } from '@gridtypes/index';

export default function TournamentDetailScreen() {
  const { t } = useTranslation();
  const { id }    = useLocalSearchParams<{ id: string }>();
  const dispatch  = useDispatch<AppDispatch>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank,  setMyRank]  = useState<{ rank: number; score: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      tournamentApi.get(id),
      tournamentApi.getLeaderboard(id),
      tournamentApi.getMyRank(id).catch(() => null),
    ]).then(([t, lb, rank]) => {
      setTournament(t.data);
      setLeaderboard(lb.data.leaderboard ?? []);
      setMyRank(rank?.data ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  // Entry is ALWAYS free — entry fees are permanently removed (blueprint
  // § ECONOMY / Uganda Lotteries and Gaming Act 2016). No fee path exists.
  async function handleEnter() {
    doEnter();
  }

  async function doEnter() {
    if (!tournament) return;
    setEntering(true);
    const result = await dispatch(startSessionThunk({
      gameType: tournament.gameType,
      tier:     'COMMUNITY_TOURNAMENT',
      tournamentId: tournament.id,
    }));
    setEntering(false);
    if (startSessionThunk.fulfilled.match(result)) {
      router.push(`/game/${result.payload.sessionId}`);
    }
  }

  if (loading || !tournament) return <LoadingSpinner />;

  const meta = GameMeta[tournament.gameType];
  const now  = new Date();
  const isActive = tournament.status === 'ACTIVE';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← {t('tournament.tournaments')}</Text>
      </TouchableOpacity>

      {/* Hero */}
      <View style={[styles.hero, { borderLeftColor: meta.color }]}>
        <Text style={styles.heroName}>{tournament.name}</Text>
        <Text style={[styles.heroGame, { color: meta.color }]}>{meta.label}</Text>
        <Badge label={tournament.status} color={isActive ? Colors.accent : Colors.textMuted} />
      </View>

      {/* Stats */}
      <Card style={styles.statsCard}>
        <View style={styles.statsRow}>
          <StatBlock label={t('tournament.prizePool')} value={`💎 ${t('tournament.prizes')}`} highlight />
          <StatBlock label={t('tournament.entryFee')}  value={t('tournament.free')} />
          <StatBlock label={t('tournament.hints')}     value={`❌ ${t('tournament.hintsNone')}`} />
        </View>
        <View style={styles.statsRow}>
          <StatBlock label={t('tournament.starts')} value={new Date(tournament.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          <StatBlock label={t('tournament.ends')}   value={new Date(tournament.endsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
        </View>
      </Card>

      {/* My rank */}
      {myRank && (
        <Card style={styles.myRankCard}>
          <Text style={styles.myRankLabel}>{t('tournament.yourRank')}</Text>
          <Text style={styles.myRankValue}>#{myRank.rank}</Text>
          <Text style={styles.myRankScore}>{myRank.score.toLocaleString()} {t('common.pts')}</Text>
        </Card>
      )}

      {/* Enter button */}
      {isActive && (
        <TouchableOpacity
          style={[styles.enterBtn, { backgroundColor: meta.color }, entering && styles.enterBtnDisabled]}
          onPress={handleEnter}
          disabled={entering}
        >
          <Text style={styles.enterBtnText}>{entering ? t('tournament.starting') : t('tournament.enter')}</Text>
        </TouchableOpacity>
      )}

      {/* Leaderboard */}
      <Text style={styles.sectionLabel}>{t('tournament.leaderboard')}</Text>
      {leaderboard.length === 0 ? (
        <Text style={styles.emptyLeaderboard}>{t('tournament.noScores')}</Text>
      ) : (
        leaderboard.slice(0, 20).map(entry => (
          <View key={entry.userId} style={styles.leaderRow}>
            <Text style={[styles.leaderRank, entry.rank <= 3 && { color: Colors.points }]}>
              {entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank - 1] : `#${entry.rank}`}
            </Text>
            <Text style={styles.leaderName}>{entry.displayName}</Text>
            <Text style={styles.leaderScore}>{entry.score.toLocaleString()} {t('common.pts')}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function StatBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={statStyles.block}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, highlight && { color: Colors.accent }]}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  block: { flex: 1, alignItems: 'center', gap: 2 },
  label: { color: Colors.textMuted,    fontSize: Font.size.xs },
  value: { color: Colors.textPrimary,  fontSize: Font.size.md, fontWeight: Font.weight.semi, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl },

  back:     { marginBottom: Spacing.lg },
  backText: { color: Colors.primary, fontSize: Font.size.sm },

  hero:         { borderLeftWidth: 4, paddingLeft: Spacing.md, marginBottom: Spacing.lg, gap: 4 },
  heroName:     { color: Colors.textPrimary, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  heroGame:     { fontSize: Font.size.md, fontWeight: Font.weight.semi },

  statsCard:  { marginBottom: Spacing.md, gap: Spacing.md },
  statsRow:   { flexDirection: 'row', justifyContent: 'space-around' },

  myRankCard:   { marginBottom: Spacing.md, alignItems: 'center', paddingVertical: Spacing.lg },
  myRankLabel:  { color: Colors.textMuted, fontSize: Font.size.sm },
  myRankValue:  { color: Colors.primary, fontSize: Font.size.hero, fontWeight: Font.weight.black },
  myRankScore:  { color: Colors.textSecondary, fontSize: Font.size.lg },

  enterBtn:         { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.lg },
  enterBtnDisabled: { opacity: 0.6 },
  enterBtnText:     { color: Colors.bg, fontSize: Font.size.lg, fontWeight: Font.weight.black },

  sectionLabel:      { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  emptyLeaderboard:  { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg },

  leaderRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  leaderRank: { width: 48, color: Colors.textMuted, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  leaderName: { flex: 1, color: Colors.textPrimary, fontSize: Font.size.md },
  leaderScore:{ color: Colors.accent, fontWeight: Font.weight.bold, fontSize: Font.size.md },
});
