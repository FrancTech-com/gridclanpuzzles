import React, { useEffect, useState } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { tournamentApi } from '@api/index';
import { RootState } from '@store/index';
import { Badge, Card, EmptyState, LoadingSpinner } from '@components/ui/index';
import { RegisterGate } from '@components/AuthGate';
import { Font, Radius, Spacing, TournamentGameMeta } from '@theme/index';
import { useColors } from '@theme/theme';
import type { Tournament } from '@gridtypes/index';

export default function TournamentScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const userId = useSelector((s: RootState) => s.auth.userId);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [activeTab,   setActiveTab]   = useState<'ACTIVE' | 'UPCOMING' | 'COMPLETED'>('ACTIVE');

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await tournamentApi.list(activeTab);
      setTournaments(res.data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { if (userId) load(); }, [activeTab, userId]);

  if (!userId) return (
    <RegisterGate
      icon="🏆"
      title={t('guest.tournamentTitle', 'Compete in tournaments')}
      subtitle={t('guest.tournamentSubtitle', 'Create an account to enter tournaments and climb the leaderboards.')}
    />
  );

  if (loading) return <LoadingSpinner />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{t('tournament.tournaments')}</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/tournament/create')}>
          <Text style={styles.newBtnText}>+ {t('tournament.new', 'New')}</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['ACTIVE', 'UPCOMING', 'COMPLETED'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {t(`tournament.status${tab.charAt(0) + tab.slice(1).toLowerCase()}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tournaments.length === 0 ? (
        <EmptyState icon="🏆" title={t('tournament.noneInState')} subtitle={t('tournament.checkBack')} />
      ) : (
        <View style={styles.tournGrid}>
        {tournaments.map(t => (
          <TournamentCard key={t.id} tournament={t} />
        ))}
        </View>
      )}
    </ScrollView>
  );
}

function TournamentCard({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const meta = TournamentGameMeta[tournament.gameType] ?? TournamentGameMeta.SCRABBLE;

  const handleEnter = () => {
    router.push(`/tournament/${tournament.id}`);
  };

  const cta = tournament.status === 'ACTIVE'    ? t('tournament.goToMatch', 'Go to my match')
            : tournament.status === 'UPCOMING'  ? t('tournament.viewAndJoin', 'View & join')
            : t('tournament.viewResult', 'View result');

  return (
    <Card style={styles.card}>
      <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />

      <View style={styles.cardHeader}>
        <View style={styles.cardTitles}>
          <Text style={styles.cardName}>{tournament.name}</Text>
          <Text style={[styles.cardGame, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Badge label={tournament.status} color={statusColor(tournament.status, Colors)} />
      </View>

      <View style={styles.cardStats}>
        <Stat label={t('tournament.prizePool')} value={`💎 ${t('tournament.prizes')}`} />
        {/* Entry is always free — paid entry is permanently removed (blueprint § ECONOMY) */}
        <Stat label={t('tournament.entryFee')}  value={t('tournament.free')} />
        <Stat label={t('tournament.hints')}     value={t('tournament.hintsDisabled')} color={Colors.error} />
      </View>

      <View style={styles.cardTimes}>
        <Text style={styles.timeText}>
          {tournament.status === 'UPCOMING' ? t('tournament.starts') : tournament.status === 'ACTIVE' ? t('tournament.ends') : t('tournament.ended')}: {' '}
          {new Date(tournament.status === 'UPCOMING' ? tournament.startsAt : tournament.endsAt).toLocaleDateString(undefined, {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>

      <TouchableOpacity
        style={tournament.status === 'ACTIVE' ? [styles.enterBtn, { backgroundColor: meta.color }] : styles.viewBtn}
        onPress={handleEnter}
      >
        <Text style={tournament.status === 'ACTIVE' ? styles.enterBtnText : styles.viewBtnText}>{cta} →</Text>
      </TouchableOpacity>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function statusColor(status: string, Colors: ReturnType<typeof useColors>) {
  return { ACTIVE: Colors.accent, UPCOMING: Colors.primary, COMPLETED: Colors.textMuted }[status] ?? Colors.textMuted;
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl + Spacing.lg },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  pageTitle: { color: Colors.textPrimary, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  newBtn:     { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  newBtnText: { color: Colors.textOnBrand, fontSize: Font.size.sm, fontWeight: Font.weight.bold },

  tabs:        { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  tab:         { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  tabActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:     { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
  tabTextActive: { color: Colors.textPrimary },

  tournGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  card:       { flexGrow: 1, flexBasis: 340, minWidth: 300, overflow: 'hidden' },
  cardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: Spacing.xs, marginBottom: Spacing.md },
  cardTitles: { flex: 1 },
  cardName:   { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  cardGame:   { fontSize: Font.size.sm, marginTop: 2 },

  cardStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  stat:      { alignItems: 'center' },
  statLabel: { color: Colors.textMuted,    fontSize: Font.size.xs },
  statValue: { color: Colors.textPrimary,  fontSize: Font.size.md, fontWeight: Font.weight.semi },

  cardTimes: { marginBottom: Spacing.md },
  timeText:  { color: Colors.textMuted, fontSize: Font.size.xs },

  enterBtn:     { borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  enterBtnText: { color: Colors.textOnBrand, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  viewBtn:      { padding: Spacing.sm, alignItems: 'center' },
  viewBtnText:  { color: Colors.primary, fontSize: Font.size.sm },
});
