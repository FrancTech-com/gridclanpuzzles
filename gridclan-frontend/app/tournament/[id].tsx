import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tournamentApi } from '@api/index';
import { Badge, Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, Radius, Spacing, TournamentGameMeta } from '@theme/index';
import { useColors } from '@theme/theme';
import type { Tournament, TournamentMe } from '@gridtypes/index';

/**
 * Tournament hub. Shows where the viewer stands and takes them straight to
 * their current match (the pre-paired PvP game). Polls /me while the tournament
 * is live so a player advances as soon as their next opponent is ready.
 */
export default function TournamentHubScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [me, setMe] = useState<TournamentMe | null>(null);
  const [bracket, setBracket] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const [tRes, meRes, bRes] = await Promise.all([
        tournamentApi.get(id),
        tournamentApi.getMe(id).catch(() => null),
        tournamentApi.getBracket(id).catch(() => null),
      ]);
      setTournament(tRes.data);
      if (meRes) setMe(meRes.data);
      if (bRes) setBracket(bRes.data.rounds ?? {});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep the hub fresh while the tournament is live (advance when opponent ready).
  useEffect(() => {
    const live = tournament?.status === 'ACTIVE' || tournament?.status === 'UPCOMING';
    if (!live) return;
    const h = setInterval(refresh, 15_000);
    return () => clearInterval(h);
  }, [tournament?.status, refresh]);

  async function handleJoin() {
    if (!id) return;
    setBusy(true);
    try { await tournamentApi.join(id); await refresh(); }
    catch {} finally { setBusy(false); }
  }

  function playMatch() {
    const m = me?.currentMatch;
    if (!m?.gameId) return;
    router.push(`/${TournamentGameMeta[m.gameType].route}/${m.gameId}`);
  }

  if (loading || !tournament) return <LoadingSpinner />;

  const meta = TournamentGameMeta[tournament.gameType] ?? TournamentGameMeta.SCRABBLE;
  const statusColor =
    tournament.status === 'ACTIVE' ? Colors.accent
    : tournament.status === 'COMPLETED' ? Colors.textMuted
    : tournament.status === 'CANCELLED' ? Colors.error
    : Colors.primary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← {t('tournament.tournaments')}</Text>
      </TouchableOpacity>

      {/* Hero */}
      <View style={[styles.hero, { borderLeftColor: meta.color }]}>
        <Text style={styles.heroName}>{tournament.name}</Text>
        <Text style={[styles.heroGame, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
        <View style={styles.heroMeta}>
          <Badge label={t(`tournament.status${cap(tournament.status)}`, tournament.status)} color={statusColor} />
          {typeof tournament.joinedCount === 'number' && (
            <Text style={styles.heroCount}>{t('tournament.players', '{{n}} players', { n: tournament.joinedCount })}</Text>
          )}
        </View>
      </View>

      {/* Action area — driven by the viewer's state */}
      {renderAction()}

      {/* Bracket */}
      {Object.keys(bracket).length > 0 && (
        <>
          <Text style={styles.sectionLabel}>{t('tournament.bracket', 'Bracket')}</Text>
          {Object.entries(bracket).map(([round, matches]) => (
            <Card key={round} style={styles.roundCard}>
              <Text style={styles.roundTitle}>{t('tournament.round', 'Round {{n}}', { n: round })}</Text>
              {matches.map((m: any, i: number) => (
                <View key={i} style={styles.matchRow}>
                  <Text style={[styles.matchName, m.winner === m.player1 && styles.matchWinner]} numberOfLines={1}>{m.player1}</Text>
                  <Text style={styles.vs}>{m.status === 'BYE' ? t('tournament.bye', 'bye') : 'vs'}</Text>
                  <Text style={[styles.matchName, styles.matchRight, m.winner === m.player2 && styles.matchWinner]} numberOfLines={1}>{m.player2}</Text>
                </View>
              ))}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );

  function renderAction() {
    const state = me?.state;
    const startStr = new Date(tournament!.startsAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Not joined yet, joining still open
    if (state === 'NOT_JOINED' && tournament!.status === 'UPCOMING') {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionTitle}>{t('tournament.joinTitle', 'Join this tournament')}</Text>
          <Text style={styles.actionSub}>{t('tournament.startsAt', 'Starts {{when}}', { when: startStr })}</Text>
          <Button title={t('tournament.join', 'Join')} onPress={handleJoin} loading={busy} size="lg" style={styles.actionBtn} />
        </Card>
      );
    }
    if (state === 'WAITING_START') {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionEmoji}>⏳</Text>
          <Text style={styles.actionTitle}>{t('tournament.joinedWaiting', "You're in — bracket starts soon")}</Text>
          <Text style={styles.actionSub}>{t('tournament.startsAt', 'Starts {{when}}', { when: startStr })}</Text>
        </Card>
      );
    }
    if (state === 'PLAYING' && me?.currentMatch) {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionSub}>{t('tournament.round', 'Round {{n}}', { n: me.currentMatch.round })}</Text>
          <Text style={styles.actionTitle}>{t('tournament.vsOpponent', 'You vs {{name}}', { name: me.currentMatch.opponentName ?? '—' })}</Text>
          <Button title={`${meta.icon} ${t('tournament.playMatch', 'Play your match')}`} onPress={playMatch} size="lg" style={[styles.actionBtn, { backgroundColor: meta.color }]} />
        </Card>
      );
    }
    if (state === 'WAITING_NEXT') {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionEmoji}>✅</Text>
          <Text style={styles.actionTitle}>{t('tournament.wonMatch', 'You won your match!')}</Text>
          <Text style={styles.actionSub}>{t('tournament.waitingNext', 'Waiting for your next opponent…')}</Text>
        </Card>
      );
    }
    if (state === 'CHAMPION') {
      return (
        <Card style={StyleSheet.flatten([styles.actionCard, styles.championCard])}>
          <Text style={styles.actionEmoji}>🏆</Text>
          <Text style={styles.actionTitle}>{t('tournament.champion', 'You won the tournament!')}</Text>
        </Card>
      );
    }
    if (state === 'ELIMINATED') {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionEmoji}>🚪</Text>
          <Text style={styles.actionTitle}>{t('tournament.eliminated', 'Eliminated')}</Text>
          <Text style={styles.actionSub}>{t('tournament.eliminatedRound', 'You went out in round {{n}}', { n: me?.eliminatedRound ?? '—' })}</Text>
        </Card>
      );
    }
    if (tournament!.status === 'CANCELLED' || state === 'CANCELLED') {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionEmoji}>🚫</Text>
          <Text style={styles.actionTitle}>{t('tournament.cancelled', 'Tournament cancelled')}</Text>
          <Text style={styles.actionSub}>{t('tournament.cancelledSub', 'Not enough players joined.')}</Text>
        </Card>
      );
    }
    if (tournament!.status === 'COMPLETED') {
      return (
        <Card style={styles.actionCard}>
          <Text style={styles.actionEmoji}>🏁</Text>
          <Text style={styles.actionTitle}>{t('tournament.completed', 'Tournament complete')}</Text>
        </Card>
      );
    }
    return null;
  }
}

function cap(s: string) { return s.charAt(0) + s.slice(1).toLowerCase(); }

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl },

  back:     { marginBottom: Spacing.lg },
  backText: { color: Colors.primary, fontSize: Font.size.sm },

  hero:     { borderLeftWidth: 4, paddingLeft: Spacing.md, marginBottom: Spacing.lg, gap: 6 },
  heroName: { color: Colors.textPrimary, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  heroGame: { fontSize: Font.size.md, fontWeight: Font.weight.semi },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heroCount:{ color: Colors.textMuted, fontSize: Font.size.sm },

  actionCard:  { alignItems: 'center', paddingVertical: Spacing.lg, marginBottom: Spacing.lg, gap: 6 },
  championCard:{ borderWidth: 1, borderColor: Colors.points },
  actionEmoji: { fontSize: 40 },
  actionTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold, textAlign: 'center' },
  actionSub:   { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center' },
  actionBtn:   { marginTop: Spacing.md, alignSelf: 'stretch' },

  sectionLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },
  roundCard:   { padding: Spacing.md, marginBottom: Spacing.sm },
  roundTitle:  { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.bold, marginBottom: Spacing.sm },
  matchRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: Spacing.sm },
  matchName:   { flex: 1, color: Colors.textPrimary, fontSize: Font.size.sm },
  matchRight:  { textAlign: 'right' },
  matchWinner: { color: Colors.primary, fontWeight: Font.weight.bold },
  vs:          { color: Colors.textMuted, fontSize: Font.size.xs },
});
