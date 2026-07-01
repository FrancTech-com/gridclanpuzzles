import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, SafeAreaView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { submitMoveThunk, requestHintThunk, reviveThunk, clearGame, clearError, type GameReject } from '@store/slices/gameSlice';
import { fetchBalanceThunk } from '@store/slices/pointsSlice';
import { fetchGemBalanceThunk } from '@store/slices/gemsSlice';

const HINT_COST_GEMS = 10;
const REVIVE_COST_GEMS = 20;
import { LoadingSpinner } from '@components/ui/index';
import { WordSearchBoard } from '@components/game/WordSearchBoard';
import { GameResultOverlay, type SoloTier } from '@components/GameResultOverlay';
import { PromptCard } from '@components/PromptCard';
import { Font, Spacing, GameMeta } from '@theme/index';
import { useColors } from '@theme/theme';
import type { WordSearchMove } from '@gridtypes/index';

export default function GameScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const dispatch      = useDispatch<AppDispatch>();

  const { session, boardState, score, moveCount, moveLimit, status, hintsAllowed, hintData, isMoveLoading, error } =
    useSelector((s: RootState) => s.game);

  const lastMoveTime = useRef(Date.now());
  const [showResult, setShowResult] = useState(false);
  // When set, a card offers to buy gems (out of gems for a hint or revive).
  const [buyPromptCost, setBuyPromptCost] = useState<number | null>(null);

  const movesLeft = moveLimit > 0 ? Math.max(0, moveLimit - moveCount) : null;
  const outOfMoves = status === 'OUT_OF_MOVES';

  // Game completed — show the graded result popup (with points earned).
  useEffect(() => {
    if (status === 'COMPLETED') {
      dispatch(fetchBalanceThunk());
      dispatch(fetchGemBalanceThunk());   // gems awarded for the solve
      setShowResult(true);
    }
    if (status === 'FLAGGED') {
      Alert.alert(
        t('game.flagged'),
        t('game.flaggedBody'),
        [{ text: t('common.ok'), onPress: () => { dispatch(clearGame()); router.back(); } }]
      );
    }
  }, [status]);

  const handleMove = useCallback((move: WordSearchMove) => {
    if (!sessionId || isMoveLoading) return;
    dispatch(submitMoveThunk({
      sessionId,
      move,
      clientTimestamp: Date.now(),
    }));
    lastMoveTime.current = Date.now();
  }, [sessionId, isMoveLoading]);

  const handleHint = useCallback(async () => {
    if (!sessionId || !hintsAllowed || isMoveLoading) return;
    const res = await dispatch(requestHintThunk(sessionId));
    dispatch(fetchGemBalanceThunk());   // reconcile after gems are spent
    if (requestHintThunk.rejected.match(res) && (res.payload as GameReject)?.insufficient) {
      dispatch(clearError());
      setBuyPromptCost(HINT_COST_GEMS);   // out of gems → offer to buy
    }
  }, [sessionId, hintsAllowed, isMoveLoading]);

  // Revive is offered only outside tournaments (competitive integrity).
  const canRevive = session?.tier !== 'COMMUNITY_TOURNAMENT';

  const doRevive = useCallback(async () => {
    if (!sessionId) return;
    const res = await dispatch(reviveThunk(sessionId));
    dispatch(fetchGemBalanceThunk());
    if (reviveThunk.rejected.match(res) && (res.payload as GameReject)?.insufficient) {
      dispatch(clearError());
      setBuyPromptCost(REVIVE_COST_GEMS);   // out of gems → offer to buy
    }
  }, [sessionId]);

  const handleQuit = () => {
    Alert.alert(t('game.quitTitle'), t('game.quitBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('game.quit'), style: 'destructive', onPress: () => { dispatch(clearGame()); router.back(); } },
    ]);
  };

  if (!session || !boardState) return <LoadingSpinner />;

  const meta = GameMeta[session.gameType];
  // Grade the solve by points earned (see ScoreEngine: base 1000, −10/move, +50 speed bonus).
  const tier: SoloTier = score >= 900 ? 'EXCEPTIONAL' : score >= 750 ? 'GOOD' : 'LOWER';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleQuit} style={styles.quitBtn}>
          <Text style={styles.quitText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.gameLabel, { color: meta.color }]}>{meta.label}</Text>
          <Text style={styles.tierLabel}>{session.tier.replace('_', ' ')}</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreValue}>{score.toLocaleString()}</Text>
          <Text style={styles.scoreLabel}>{t('common.pts')}</Text>
        </View>
      </View>

      {/* Move counter (+ moves left when there's a budget) */}
      <View style={styles.statsBar}>
        <Text style={styles.statText}>{t('game.moves', { count: moveCount })}</Text>
        {movesLeft !== null && (
          <Text style={[styles.statText, movesLeft <= 3 && styles.statLow]}>
            {t('game.movesLeft', { count: movesLeft, defaultValue: '{{count}} moves left' })}
          </Text>
        )}
        {isMoveLoading && <Text style={styles.syncText}>⟳ {t('game.syncing')}</Text>}
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Hint data */}
      {hintData && (hintData as any).message && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>💡 {(hintData as any).message}</Text>
        </View>
      )}

      {/* Game board — server-authoritative display only */}
      <View style={styles.boardContainer}>
        {session.gameType === 'WORD_SEARCH' && (
          <WordSearchBoard
            board={boardState as any}
            onMove={handleMove}
            disabled={isMoveLoading || status !== 'ACTIVE'}
            hint={hintData && (hintData as any).type === 'WORD_LOCATION' ? (hintData as any) : null}
          />
        )}
      </View>

      {/* Footer actions */}
      <View style={styles.footerRow}>
        {/* Hint button — visible only when server says hintsAllowed */}
        {hintsAllowed && (
          <TouchableOpacity style={styles.hintBtn} onPress={handleHint} disabled={isMoveLoading || status !== 'ACTIVE'}>
            <Text style={styles.hintBtnText}>💡 {t('game.hint')}  <Text style={styles.hintCost}>−{HINT_COST_GEMS} {t('common.gems')}</Text></Text>
          </TouchableOpacity>
        )}
      </View>

      <GameResultOverlay
        visible={showResult}
        solo={{ tier, score, moves: moveCount }}
        onClose={() => { setShowResult(false); dispatch(clearGame()); router.back(); }}
      />

      {/* Out of moves → revive prompt (non-tournament only) */}
      <PromptCard
        visible={outOfMoves && canRevive && buyPromptCost === null}
        emoji="⏳"
        title={t('game.outOfMoves', 'Out of moves!')}
        message={t('game.revivePrompt', { cost: REVIVE_COST_GEMS, defaultValue: 'Revive for {{cost}} gems to keep solving?' })}
        acceptLabel={t('game.revive', 'Revive') + `  💎 ${REVIVE_COST_GEMS}`}
        declineLabel={t('game.giveUp', 'Give up')}
        busy={isMoveLoading}
        onAccept={doRevive}
        onDecline={() => { dispatch(clearGame()); router.back(); }}
      />

      {/* Out of gems → buy prompt */}
      <PromptCard
        visible={buyPromptCost !== null}
        emoji="💎"
        title={t('game.needGems', 'Not enough gems')}
        message={t('game.needGemsBody', { cost: buyPromptCost ?? 0, defaultValue: 'You need {{cost}} gems for this. Buy more?' })}
        acceptLabel={t('gems.buy', 'Buy gems')}
        declineLabel={t('common.notNow', 'Not now')}
        onAccept={() => { setBuyPromptCost(null); router.push('/gems/buy' as never); }}
        onDecline={() => setBuyPromptCost(null)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md,
  },
  quitBtn:  { padding: Spacing.sm },
  quitText: { color: Colors.textMuted, fontSize: Font.size.xl },

  headerCenter: { alignItems: 'center' },
  gameLabel:    { fontSize: Font.size.md, fontWeight: Font.weight.bold },
  tierLabel:    { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },

  scoreBox:   { alignItems: 'flex-end' },
  scoreValue: { color: Colors.accent, fontSize: Font.size.xl, fontWeight: Font.weight.black },
  scoreLabel: { color: Colors.textMuted, fontSize: Font.size.xs },

  statsBar:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs },
  statText:  { color: Colors.textMuted, fontSize: Font.size.sm },
  statLow:   { color: Colors.error, fontWeight: Font.weight.bold },
  syncText:  { color: Colors.primary,   fontSize: Font.size.sm },

  errorBar: { backgroundColor: Colors.error + '20', padding: Spacing.sm, marginHorizontal: Spacing.md, borderRadius: 8 },
  errorText: { color: Colors.error, fontSize: Font.size.sm, textAlign: 'center' },

  hintBar:  { backgroundColor: Colors.primary + '15', padding: Spacing.sm, marginHorizontal: Spacing.md, borderRadius: 8 },
  hintText: { color: Colors.primary, fontSize: Font.size.sm },

  boardContainer: { flex: 1, padding: Spacing.md },

  footerRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  hintBtn: {
    flex: 1,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.surfaceHigh,
    borderRadius: 12, padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  hintBtnText: { color: Colors.primary, fontSize: Font.size.md, fontWeight: Font.weight.semi },
  hintCost:    { color: Colors.textMuted, fontSize: Font.size.sm },
});
