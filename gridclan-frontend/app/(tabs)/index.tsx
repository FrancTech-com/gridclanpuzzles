import React, { useEffect, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { startSessionThunk } from '@store/slices/gameSlice';
import { fetchBalanceThunk } from '@store/slices/pointsSlice';
import { Button, Card, PointsBadge, LoadingSpinner } from '@components/ui/index';
import { RegisterBanner } from '@components/AuthGate';
import { BouncingEmblem } from '@components/BouncingEmblem';
import { Colors, Font, GameMeta, Radius, Shadow, Spacing } from '@theme/index';
import type { GameTier, GameType } from '@gridtypes/index';

const TIERS: { labelKey: string; value: GameTier; icon: string; descKey: string }[] = [
  { labelKey: 'home.tierSolo',       value: 'SOLO',                 icon: '🎮', descKey: 'home.tierSoloDesc' },
  { labelKey: 'home.tierFriend',     value: 'FRIEND',               icon: '👥', descKey: 'home.tierFriendDesc' },
  { labelKey: 'home.tierTournament', value: 'COMMUNITY_TOURNAMENT', icon: '🏆', descKey: 'home.tierTournamentDesc' },
];

export default function HomeScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const userId         = useSelector((s: RootState) => s.auth.userId);
  const { balance }    = useSelector((s: RootState) => s.points);
  const { isLoading }  = useSelector((s: RootState) => s.game);
  const isGuest = !userId;

  const [selectedGame, setSelectedGame] = useState<GameType>('GRID_LOCKDOWN');
  const [selectedTier, setSelectedTier] = useState<GameTier>('SOLO');

  useEffect(() => { if (userId) dispatch(fetchBalanceThunk()); }, [userId]);

  async function handlePlay() {
    // Guests must register to play: Friend/Tournament always; Solo until the
    // on-device trial demo lands (the guest trial counter is wired for that).
    if (isGuest) {
      router.push('/(auth)/register');
      return;
    }
    // Tournament play happens *inside* a specific tournament — send the player
    // to pick/join one instead of starting an unattached tournament session.
    if (selectedTier === 'COMMUNITY_TOURNAMENT') {
      router.push('/(tabs)/tournament');
      return;
    }
    const result = await dispatch(startSessionThunk({ gameType: selectedGame, tier: selectedTier }));
    if (startSessionThunk.fulfilled.match(result)) {
      router.push(`/game/${result.payload.sessionId}`);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Bouncing emblem hero */}
      <BouncingEmblem size={76} style={styles.heroEmblem} />

      <TouchableOpacity onPress={() => router.push('/how-to-play')} hitSlop={8} style={styles.howToLink}>
        <Text style={styles.howToText}>ⓘ {t('howToPlay.link', 'How to play')}</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.greeting}>{isGuest ? t('home.guestGreeting', 'Welcome to') : t('home.greeting')}</Text>
          <Text style={styles.title}>{isGuest ? t('common.appName') : t('home.choosePuzzle')}</Text>
        </View>
        {isGuest ? (
          <View style={styles.authBtns}>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')} hitSlop={8}>
              <Text style={styles.signInText}>{t('auth.login')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.registerBtn} onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.registerBtnText}>{t('auth.register')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          balance && <PointsBadge points={balance.balance} />
        )}
      </View>

      {/* Guest nudge — register to play & unlock everything */}
      {isGuest && (
        <RegisterBanner message={t('guest.homeBanner', 'Browse the games for free. Create an account to play, compete and join communities.')} />
      )}

      {/* Game type selector */}
      <Text style={styles.sectionLabel}>{t('home.gameType')}</Text>
      <View style={styles.gameGrid}>
        {(Object.entries(GameMeta) as [GameType, typeof GameMeta[GameType]][]).map(([type, meta]) => (
          <TouchableOpacity
            key={type}
            style={[styles.gameCard, selectedGame === type && { borderColor: meta.color }]}
            onPress={() => setSelectedGame(type)}
            activeOpacity={0.8}
          >
            <View style={[styles.gameAccent, { backgroundColor: meta.color }]} />
            <Text style={styles.gameLabel}>{meta.label}</Text>
            <Text style={styles.gameDesc}>{meta.description}</Text>
            {selectedGame === type && (
              <View style={[styles.selectedDot, { backgroundColor: meta.color }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Tier selector */}
      <Text style={styles.sectionLabel}>{t('home.mode')}</Text>
      <View style={styles.tierRow}>
        {TIERS.map(tier => (
          <TouchableOpacity
            key={tier.value}
            style={[styles.tierBtn, selectedTier === tier.value && styles.tierBtnActive]}
            onPress={() => setSelectedTier(tier.value)}
            activeOpacity={0.8}
          >
            <Text style={styles.tierIcon}>{tier.icon}</Text>
            <Text style={[styles.tierLabel, selectedTier === tier.value && { color: Colors.primary }]}>
              {t(tier.labelKey)}
            </Text>
            <Text style={styles.tierDesc}>{t(tier.descKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedTier === 'COMMUNITY_TOURNAMENT' && (
        <View style={styles.noHintsNotice}>
          <Text style={styles.noHintsText}>⚠ {t('home.noHintsTournament')}</Text>
        </View>
      )}

      <Button
        title={isGuest ? t('home.registerToPlay', 'Register to play') : t('game.start')}
        onPress={handlePlay}
        loading={isLoading}
        size="lg"
        style={styles.playBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl + Spacing.lg },

  heroEmblem: { alignSelf: 'center', marginBottom: Spacing.sm },

  howToLink: { alignSelf: 'center', marginBottom: Spacing.md },
  howToText: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  headerTitleWrap: { flex: 1 },
  greeting: { color: Colors.textMuted, fontSize: Font.size.md },
  title:    { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold, marginTop: 2 },

  authBtns:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  signInText:     { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  registerBtn:    { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  registerBtnText:{ color: Colors.bg, fontSize: Font.size.sm, fontWeight: Font.weight.bold },

  sectionLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 },

  gameGrid: { gap: Spacing.sm, marginBottom: Spacing.lg },

  gameCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.lg,
    padding:         Spacing.md,
    borderWidth:     2,
    borderColor:     Colors.border,
    overflow:        'hidden',
    ...Shadow.sm,
  },
  gameAccent:   { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg },
  gameLabel:    { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold, marginTop: Spacing.sm },
  gameDesc:     { color: Colors.textMuted,   fontSize: Font.size.sm, marginTop: 4 },
  selectedDot:  { position: 'absolute', top: Spacing.md, right: Spacing.md, width: 10, height: 10, borderRadius: 5 },

  tierRow:      { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  tierBtn:      { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  tierBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  tierIcon:     { fontSize: 24, marginBottom: 4 },
  tierLabel:    { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi },
  tierDesc:     { color: Colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 2 },

  noHintsNotice: { backgroundColor: Colors.warning + '15', borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '40' },
  noHintsText:   { color: Colors.warning, fontSize: Font.size.sm, textAlign: 'center' },

  playBtn: { marginTop: Spacing.md },
});
