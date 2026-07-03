import React, { useEffect, useState } from 'react';
import {
  Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { fetchBalanceThunk } from '@store/slices/pointsSlice';
import { Button, Card, PointsBadge, LoadingSpinner } from '@components/ui/index';
import { RegisterBanner } from '@components/AuthGate';
import { BouncingEmblem } from '@components/BouncingEmblem';
import { AdModal } from '@components/AdModal';
import { pointsApi, profileApi, type ActiveGameResume } from '@api/index';
import { playSfx } from '@services/sound';
import { Font, GameMeta, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type {
  GameTier, GameType, GameKey, GlobalLeaderboardEntry, GameLeaderboardEntry,
} from '@gridtypes/index';

// Games shown in the leaderboard filter (icon matches the home cards).
const LB_GAMES: { key: GameKey; icon: string; labelKey: string }[] = [
  { key: 'WORD_SEARCH', icon: '🔍', labelKey: 'home.lbWordSearch' },
  { key: 'SCRABBLE',    icon: '🔤', labelKey: 'home.lbScrabble' },
  { key: 'GOMOKU',      icon: '⚫', labelKey: 'home.lbGomoku' },
  { key: 'BATTLESHIP',  icon: '🚢', labelKey: 'home.lbBattleship' },
];

const TIERS: { labelKey: string; value: GameTier; icon: string; descKey: string }[] = [
  { labelKey: 'home.tierSolo',       value: 'SOLO',                 icon: '🎮', descKey: 'home.tierSoloDesc' },
  { labelKey: 'home.tierFriend',     value: 'FRIEND',               icon: '👥', descKey: 'home.tierFriendDesc' },
  { labelKey: 'home.tierTournament', value: 'COMMUNITY_TOURNAMENT', icon: '🏆', descKey: 'home.tierTournamentDesc' },
];

export default function HomeScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const userId         = useSelector((s: RootState) => s.auth.userId);
  const { balance }    = useSelector((s: RootState) => s.points);
  const { isLoading }  = useSelector((s: RootState) => s.game);
  const isGuest = !userId;

  const [selectedGame, setSelectedGame] = useState<GameType>('WORD_SEARCH');
  const [selectedTier, setSelectedTier] = useState<GameTier>('SOLO');
  const [showAd, setShowAd] = useState(false);   // "watch ad for rewards"

  // On a desktop-width web screen, lay the home out in two columns (play flow |
  // live games). Phones (and narrow web windows) keep the single stacked column.
  const { width } = useWindowDimensions();
  const isWide = Platform.OS === 'web' && width >= 900;

  // Leaderboard panel: 'ALL' ranks by total points (with per-game breakdown);
  // a GameKey ranks within that one game.
  const [lbFilter, setLbFilter] = useState<GameKey | 'ALL'>('ALL');
  const [lbRows, setLbRows] = useState<(GlobalLeaderboardEntry | GameLeaderboardEntry)[] | null>(null);
  // Clear rows synchronously when switching filters so a render never pairs the
  // new filter with the previous filter's (differently-shaped) rows.
  const selectLbFilter = (f: GameKey | 'ALL') => { setLbFilter(f); setLbRows(null); };

  useEffect(() => { if (userId) dispatch(fetchBalanceThunk()); }, [userId]);

  // Offer to jump back into an unfinished game after reopening / logging in.
  const [resumeGame, setResumeGame] = useState<ActiveGameResume | null>(null);
  useEffect(() => {
    if (!userId) { setResumeGame(null); return; }
    let active = true;
    profileApi.getActiveGame()
      .then(res => {
        const g = res.data as ActiveGameResume;
        if (active && g && g.gameId) setResumeGame(g);
      })
      .catch(() => { /* no resumable game / offline — just don't prompt */ });
    return () => { active = false; };
  }, [userId]);

  const gameName = (kind: ActiveGameResume['kind']) =>
    kind === 'gomoku'     ? t('gomoku.homeTitle', 'Grid Connect')
  : kind === 'battleship' ? t('battleship.homeTitle', 'Grid Battleships')
  :                         t('scrabble.homeTitle', 'Grid Scrabble');

  function resumeNow() {
    if (!resumeGame) return;
    const g = resumeGame;
    setResumeGame(null);
    playSfx('tap');
    router.push(`/${g.kind}/${g.gameId}`);
  }

  // Top-players leaderboard for the right-column panel (public endpoint, so
  // guests see it too). Refetches on filter change; failure leaves it empty.
  useEffect(() => {
    let active = true;
    setLbRows(null);
    const req = lbFilter === 'ALL'
      ? pointsApi.getGlobalLeaderboard(8)
      : pointsApi.getGameLeaderboard(lbFilter, 8);
    req.then(res => { if (active) setLbRows(res.data.leaderboard ?? []); })
       .catch(() => { if (active) setLbRows([]); });
    return () => { active = false; };
  }, [lbFilter]);

  async function handlePlay() {
    playSfx('tap');
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
    // Friend play is an async challenge — pick the game, create/share a code.
    if (selectedTier === 'FRIEND') {
      router.push(`/challenge/new?gameType=${selectedGame}`);
      return;
    }
    // Solo play → pick a difficulty + level first (the ladder screen starts the
    // session itself once a level is chosen).
    router.push(`/levels/${selectedGame}`);
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

      {/* Resume an unfinished game — pops up after reopening / logging back in */}
      <Modal
        visible={!!resumeGame}
        transparent
        animationType="fade"
        onRequestClose={() => setResumeGame(null)}
      >
        <View style={styles.resumeBackdrop}>
          <View style={styles.resumeModal}>
            <Text style={styles.resumeEmoji}>🎮</Text>
            <Text style={styles.resumeTitle}>{t('home.resumeTitle', 'Continue your game?')}</Text>
            {resumeGame && (
              <Text style={styles.resumeDesc}>
                {resumeGame.status === 'WAITING_FOR_OPPONENT'
                  ? t('home.resumeWaiting', '{{game}} — waiting for your friend to join', { game: gameName(resumeGame.kind) })
                  : t('home.resumeActive', '{{game}} — still in progress', { game: gameName(resumeGame.kind) })}
              </Text>
            )}
            <View style={styles.resumeActions}>
              <TouchableOpacity style={styles.resumeDismissBtn} onPress={() => setResumeGame(null)} activeOpacity={0.85}>
                <Text style={styles.resumeDismissText}>{t('home.resumeDismiss', 'Not now')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resumeBtn} onPress={resumeNow} activeOpacity={0.85}>
                <Text style={styles.resumeBtnText}>{t('home.resumeCta', 'Continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Desktop: two columns — the play flow on the left, live-with-a-friend
          games on the right. Phones / narrow windows: one stacked column. */}
      <View style={isWide && styles.columns}>
        {/* ── Left: choose a game + mode, then play ───────────────────────── */}
        <View style={isWide && styles.colMain}>
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

          {/* Watch an ad → real money into the wallet (the earning system) */}
          {!isGuest && (
            <TouchableOpacity
              style={styles.watchAdBtn}
              onPress={() => { playSfx('tap'); setShowAd(true); }}
              activeOpacity={0.85}
            >
              <Text style={styles.watchAdIcon}>🎬</Text>
              <View style={styles.watchAdText}>
                <Text style={styles.watchAdTitle}>{t('home.watchAd', 'Watch ad for rewards')}</Text>
                <Text style={styles.watchAdDesc}>{t('home.watchAdDesc', 'Every ad you watch adds money to your wallet.')}</Text>
              </View>
              <Text style={styles.watchAdArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Right: real-time 2-player games (their own turn-based flows) ─── */}
        <View style={isWide && styles.colSide}>
          <Text style={[styles.sectionLabel, !isWide && { marginTop: Spacing.lg }]}>{t('home.liveGames', 'Play live with a friend')}</Text>

          <View style={styles.liveGrid}>
            <TouchableOpacity
              style={styles.scrabbleCard}
              activeOpacity={0.85}
              onPress={() => router.push(isGuest ? '/(auth)/register' : '/scrabble/new')}
            >
              <Text style={styles.scrabbleIcon}>🔤</Text>
              <View style={styles.scrabbleText}>
                <Text style={styles.scrabbleTitle}>{t('scrabble.homeTitle', 'Grid Scrabble')}</Text>
                <Text style={styles.scrabbleDesc}>{t('scrabble.homeDesc', 'Build words with a friend on a shared board, turn by turn.')}</Text>
              </View>
              <Text style={styles.scrabbleArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scrabbleCard}
              activeOpacity={0.85}
              onPress={() => router.push(isGuest ? '/(auth)/register' : '/gomoku/new')}
            >
              <Text style={styles.scrabbleIcon}>⚫</Text>
              <View style={styles.scrabbleText}>
                <Text style={styles.scrabbleTitle}>{t('gomoku.homeTitle', 'Grid Connect')}</Text>
                <Text style={styles.scrabbleDesc}>{t('gomoku.homeDesc', 'Race a friend to line up five stones in a row.')}</Text>
              </View>
              <Text style={styles.scrabbleArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scrabbleCard}
              activeOpacity={0.85}
              onPress={() => router.push(isGuest ? '/(auth)/register' : '/battleship/new')}
            >
              <Text style={styles.scrabbleIcon}>🚢</Text>
              <View style={styles.scrabbleText}>
                <Text style={styles.scrabbleTitle}>{t('battleship.homeTitle', 'Grid Battleships')}</Text>
                <Text style={styles.scrabbleDesc}>{t('battleship.homeDesc', 'Hunt and sink your friend’s hidden fleet.')}</Text>
              </View>
              <Text style={styles.scrabbleArrow}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Top-players leaderboard — fills out the right column. */}
          <Text style={[styles.sectionLabel, styles.leaderHeading]}>🏅 {t('home.topPlayers', 'Top players')}</Text>

          {/* Game filter — All (total) or rank within one game. */}
          <View style={styles.lbFilters}>
            <TouchableOpacity
              style={[styles.lbChip, lbFilter === 'ALL' && styles.lbChipActive]}
              onPress={() => selectLbFilter('ALL')}
              activeOpacity={0.8}
            >
              <Text style={[styles.lbChipText, lbFilter === 'ALL' && styles.lbChipTextActive]}>{t('home.lbAll', 'All')}</Text>
            </TouchableOpacity>
            {LB_GAMES.map(g => (
              <TouchableOpacity
                key={g.key}
                style={[styles.lbChip, lbFilter === g.key && styles.lbChipActive]}
                onPress={() => selectLbFilter(g.key)}
                activeOpacity={0.8}
                accessibilityLabel={t(g.labelKey)}
              >
                <Text style={styles.lbChipText}>{g.icon}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.leaderPanel}>
            {lbRows === null ? (
              <LoadingSpinner />
            ) : lbRows.length === 0 ? (
              <Text style={styles.leaderEmpty}>{t('home.leaderboardEmpty', 'No ranked players yet — be the first!')}</Text>
            ) : (
              lbRows.map((entry, i) => {
                const isAll = lbFilter === 'ALL';
                const value = (isAll ? (entry as GlobalLeaderboardEntry).total : (entry as GameLeaderboardEntry).points) ?? 0;
                const games = isAll ? (entry as GlobalLeaderboardEntry).games : null;
                const breakdown = games
                  ? LB_GAMES.map(g => ({ g, v: games[g.key] ?? 0 })).filter(x => x.v > 0)
                  : [];
                return (
                  <View
                    key={`${entry.rank}-${entry.displayName}`}
                    style={[styles.leaderRow, i < lbRows.length - 1 && styles.leaderRowDivider]}
                  >
                    <Text style={[styles.leaderRank, entry.rank <= 3 && styles.leaderRankTop]}>{entry.rank}</Text>
                    <View style={styles.leaderNameWrap}>
                      <Text style={styles.leaderName} numberOfLines={1}>{entry.displayName}</Text>
                      {breakdown.length > 0 && (
                        <Text style={styles.leaderBreakdown} numberOfLines={1}>
                          {breakdown.map(x => `${x.g.icon} ${x.v.toLocaleString()}`).join('   ')}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.leaderPoints}>{t('home.leaderboardPoints', '{{points}} pts', { points: value.toLocaleString() })}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </View>

      {/* Rewarded ad in flight (opened by "Watch ad for rewards") */}
      <AdModal visible={showAd} placement="REWARDED" onClose={() => setShowAd(false)} />
    </ScrollView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl + Spacing.lg },

  // Desktop two-column split: play flow (wider) | live games. Aligned to the
  // top so the two columns start level regardless of their heights.
  columns: { flexDirection: 'row', gap: Spacing.xl, alignItems: 'flex-start' },
  colMain: { flex: 3 },
  colSide: { flex: 2 },

  heroEmblem: { alignSelf: 'center', marginBottom: Spacing.sm },

  howToLink: { alignSelf: 'center', marginBottom: Spacing.md },
  howToText: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  headerTitleWrap: { flex: 1 },
  greeting: { color: Colors.textMuted, fontSize: Font.size.md },
  title:    { color: Colors.textPrimary, fontSize: Font.size.xxl, fontFamily: Font.family.displayBold, marginTop: 2 },

  authBtns:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  signInText:     { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  registerBtn:    { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  registerBtnText:{ color: Colors.textOnBrand, fontSize: Font.size.sm, fontWeight: Font.weight.bold },

  sectionLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 },

  // "Continue your game?" pop-up
  resumeBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  resumeModal: {
    width: '100%', maxWidth: 360, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, alignItems: 'center', ...Shadow.md,
  },
  resumeEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  resumeTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontFamily: Font.family.displaySemi, textAlign: 'center' },
  resumeDesc:  { color: Colors.textSecondary, fontSize: Font.size.sm, marginTop: Spacing.xs, textAlign: 'center' },
  resumeActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, alignSelf: 'stretch' },
  resumeDismissBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  resumeDismissText: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  resumeBtn:   { flex: 1, backgroundColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: Radius.full, alignItems: 'center' },
  resumeBtnText: { color: Colors.textOnBrand, fontSize: Font.size.sm, fontWeight: Font.weight.bold },

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
  gameLabel:    { color: Colors.textPrimary, fontSize: Font.size.lg, fontFamily: Font.family.displaySemi, marginTop: Spacing.sm },
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

  watchAdBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  watchAdIcon:  { fontSize: 26 },
  watchAdText:  { flex: 1 },
  watchAdTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  watchAdDesc:  { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },
  watchAdArrow: { color: Colors.textMuted, fontSize: Font.size.xl },

  // Responsive grid: cards sit in a row that wraps — 1 column on phones,
  // 2–3 across on a desktop screen (each card has a min width).
  liveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.sm },
  scrabbleCard: {
    flexGrow: 1, flexBasis: 280, minWidth: 260,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  scrabbleIcon:  { fontSize: 28 },
  scrabbleText:  { flex: 1 },
  scrabbleTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontFamily: Font.family.displaySemi },
  scrabbleDesc:  { color: Colors.textMuted, fontSize: Font.size.sm, marginTop: 2 },
  scrabbleArrow: { color: Colors.textMuted, fontSize: Font.size.xl },

  // Leaderboard panel (right column on desktop, below live games on phones).
  leaderHeading: { marginTop: Spacing.lg },
  lbFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  lbChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  lbChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  lbChipText: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  lbChipTextActive: { color: Colors.primary },
  leaderPanel: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  leaderEmpty: { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', paddingVertical: Spacing.md },
  leaderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  leaderRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  leaderRank: { width: 28, color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.bold },
  leaderRankTop: { color: Colors.primary },
  leaderNameWrap: { flex: 1, marginRight: Spacing.sm },
  leaderName: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.medium },
  leaderBreakdown: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  leaderPoints: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
});
