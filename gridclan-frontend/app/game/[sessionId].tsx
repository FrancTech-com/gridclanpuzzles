import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, SafeAreaView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { submitMoveThunk, requestHintThunk, reviveThunk, clearGame } from '@store/slices/gameSlice';
import { fetchBalanceThunk } from '@store/slices/pointsSlice';
import { fetchGemBalanceThunk } from '@store/slices/gemsSlice';

const HINT_COST_GEMS = 10;
const REVIVE_COST_GEMS = 20;
import { Button, LoadingSpinner } from '@components/ui/index';
import { WordSearchBoard } from '@components/game/WordSearchBoard';
import { GameResultOverlay, type SoloTier } from '@components/GameResultOverlay';
import { Font, Spacing, GameMeta } from '@theme/index';
import { useColors } from '@theme/theme';
import type { WordSearchMove } from '@gridtypes/index';

export default function GameScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const dispatch      = useDispatch<AppDispatch>();

  const { session, boardState, score, moveCount, status, hintsAllowed, hintData, isMoveLoading, error } =
    useSelector((s: RootState) => s.game);

  const lastMoveTime = useRef(Date.now());
  const [showResult, setShowResult] = useState(false);

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

  const handleHint = useCallback(() => {
    if (!sessionId || !hintsAllowed) return;
    dispatch(requestHintThunk(sessionId));
    dispatch(fetchGemBalanceThunk());   // reconcile after gems are spent
  }, [sessionId, hintsAllowed]);

  // Revive is offered only outside tournaments (competitive integrity).
  const canRevive = session?.tier !== 'COMMUNITY_TOURNAMENT';

  const handleRevive = useCallback(() => {
    if (!sessionId) return;
    Alert.alert(
      t('game.outOfMoves'),
      t('game.revivePrompt', { cost: REVIVE_COST_GEMS }),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('game.revive'),
          onPress: () => {
            dispatch(reviveThunk(sessionId));
            dispatch(fetchGemBalanceThunk());
          },
        },
      ]
    );
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

      {/* Move counter */}
      <View style={styles.statsBar}>
        <Text style={styles.statText}>{t('game.moves', { count: moveCount })}</Text>
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
            disabled={isMoveLoading}
            hint={hintData && (hintData as any).type === 'WORD_LOCATION' ? (hintData as any) : null}
          />
        )}
      </View>

      {/* Footer actions */}
      <View style={styles.footerRow}>
        {/* Hint button — visible only when server says hintsAllowed */}
        {hintsAllowed && (
          <TouchableOpacity style={styles.hintBtn} onPress={handleHint} disabled={isMoveLoading}>
            <Text style={styles.hintBtnText}>💡 {t('game.hint')}  <Text style={styles.hintCost}>−{HINT_COST_GEMS} {t('common.gems')}</Text></Text>
          </TouchableOpacity>
        )}
        {/* Revive — spend gems to continue (non-tournament only) */}
        {canRevive && (
          <TouchableOpacity style={styles.hintBtn} onPress={handleRevive} disabled={isMoveLoading}>
            <Text style={styles.hintBtnText}>💎 {t('game.revive')}  <Text style={styles.hintCost}>−{REVIVE_COST_GEMS} {t('common.gems')}</Text></Text>
          </TouchableOpacity>
        )}
      </View>

      <GameResultOverlay
        visible={showResult}
        solo={{ tier, score, moves: moveCount }}
        onClose={() => { setShowResult(false); dispatch(clearGame()); router.back(); }}
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
