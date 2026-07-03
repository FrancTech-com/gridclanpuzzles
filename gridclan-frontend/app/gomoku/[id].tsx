import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gomokuApi, type GomokuView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { gameInviteLink, shareInvite } from '@utils/invite';
import { confirm } from '@utils/confirm';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { VoiceControl } from '@components/VoiceControl';
import { GameResultOverlay } from '@components/GameResultOverlay';
import { PromptCard } from '@components/PromptCard';
import { PostGameAd } from '@components/PostGameAd';
import { GameChat } from '@components/GameChat';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

const SIZE = 15;
const REVIVE_COST_GEMS = 20;

export default function GomokuGameScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const { width } = useWindowDimensions();
  const boardW = Math.min(width || 360, 460) - Spacing.lg * 2;
  const cell = Math.floor(boardW / SIZE);
  const styles = useMemo(() => makeStyles(Colors, cell, cell * SIZE), [Colors, cell]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [game, setGame] = useState<GomokuView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Solo hint: the square the AI suggests, highlighted until you move.
  const [hintCell, setHintCell] = useState<string | null>(null);
  const [hinting, setHinting] = useState(false);
  // Square of the most recent stone (yours or your friend's) → highlighted until
  // the next move, so the latest play is easy to spot.
  const [lastMove, setLastMove] = useState<Set<string>>(() => new Set());
  const prevBoardRef = useRef<string[] | null>(null);
  // Big win/lose popup — shown once when the game finishes.
  const [showResult, setShowResult] = useState(false);
  const announced = useRef(false);
  // Solo loss → offer to revive; out of gems → offer to buy.
  const [showRevive, setShowRevive] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [buyPrompt, setBuyPrompt] = useState(false);

  // Funnel new game state through here: diff the board to find the square(s) that
  // just got a stone, then store the state.
  const commitGame = useCallback((next: GomokuView) => {
    const prev = prevBoardRef.current;
    if (prev) {
      const changed = new Set<string>();
      for (let r = 0; r < next.board.length; r++) {
        for (let c = 0; c < next.board[r].length; c++) {
          const v = next.board[r][c];
          if (v !== '.' && prev[r]?.[c] !== v) changed.add(`${r},${c}`);
        }
      }
      if (changed.size) setLastMove(changed);   // keep prior highlight if nothing changed
    }
    prevBoardRef.current = next.board;
    setGame(next);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await gomokuApi.get(id).catch(() => null);
    if (res?.data) commitGame(res.data);
    setLoading(false);
  }, [id, commitGame]);

  // Load once, then live-update when the opponent plays/joins.
  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    subscribeGame('gomoku', id, () => { if (active) load(); })
      .then(unsub => { if (active) cleanup = unsub; else unsub(); });
    // Fallback poll so the board stays live even if the WebSocket can't connect.
    const poll = setInterval(() => { if (active) load(); }, 4000);
    return () => { active = false; cleanup?.(); clearInterval(poll); };
  }, [load, id]));

  useEffect(() => {
    if (game?.status === 'COMPLETE' && game.outcome && !announced.current) {
      announced.current = true;
      // Lost to the computer → offer a revive first; otherwise the result popup.
      if (game.outcome === 'LOST' && game.vsComputer) setShowRevive(true);
      else setShowResult(true);
    }
  }, [game?.status, game?.outcome]);

  async function doRevive() {
    if (!id || reviving) return;
    setReviving(true);
    const res = await gomokuApi.revive(id).catch((e: any) => {
      if (e?.response?.status === 422) { setShowRevive(false); setBuyPrompt(true); }   // out of gems
      else Alert.alert(t('game.reviveFailed', 'Could not revive. Please try again.'));
      return null;
    });
    setReviving(false);
    if (res?.data) {
      announced.current = false;   // a future loss can prompt again
      setShowRevive(false);
      playSfx('move');
      commitGame(res.data);
    }
  }

  async function tap(r: number, c: number) {
    if (!id || !game || busy) return;
    if (game.status === 'WAITING_FOR_OPPONENT') { Alert.alert(t('gomoku.waitingOpponent', 'Waiting for a friend to join')); return; }
    if (game.status === 'COMPLETE') return;
    if (!game.yourTurn) { Alert.alert(t('gomoku.notYourTurn', "Hold on — it's your opponent's turn.")); return; }
    if (game.board[r]?.[c] !== '.') return;
    setBusy(true);
    setHintCell(null);   // clear any hint highlight once you play
    const res = await gomokuApi.move(id, r, c).catch((e: any) => {
      Alert.alert(t('gomoku.invalidMove', 'Invalid move'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) {
      commitGame(res.data);
      if (res.data.outcome === 'WON')      playSfx('win');
      else if (res.data.outcome === 'LOST') playSfx('lose');
      else                                  playSfx('move');
    }
  }

  async function handleHint() {
    if (!id || hinting) return;
    setHinting(true);
    const res = await gomokuApi.hint(id).catch(() => null);
    setHinting(false);
    if (res?.data) {
      setHintCell(`${res.data.row},${res.data.col}`);
      setGame(g => g ? { ...g, hintsRemaining: res.data!.hintsRemaining } : g);
    }
  }

  async function doForfeit() {
    if (!id || busy) return;
    const ok = await confirm({
      title:        t('game.forfeitTitle', 'Forfeit this game?'),
      message:      t('game.forfeitMessage', 'Your opponent wins and is awarded the points. This cannot be undone.'),
      confirmLabel: t('game.forfeit', 'Forfeit'),
      cancelLabel:  t('common.cancel', 'Cancel'),
      destructive:  true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await gomokuApi.forfeit(id).catch(() => null);
    setBusy(false);
    if (res?.data) { commitGame(res.data); playSfx('lose'); }
  }

  async function shareInviteLink() {
    if (!game) return;
    const link = gameInviteLink('gomoku', game.inviteCode);
    const msg = t('gomoku.shareMessage', {
      code: game.inviteCode, link,
      defaultValue: `Play Grid Connect with me! Tap to join: {{link}}  (or enter code {{code}} in the app)`,
    });
    await shareInvite({ message: msg, link, onCopied: () => Alert.alert(t('gomoku.linkCopied', 'Invite link copied')) });
  }

  const header = {
    headerShown: true, title: t('gomoku.title', 'Grid Connect'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
    headerRight: () =>
      game && game.status === 'ACTIVE' && !game.vsComputer && id
        ? <VoiceControl kind="gomoku" gameId={id} />
        : null,
  };

  if (loading) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('gomoku.notFound', 'Game not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const waiting = game.status === 'WAITING_FOR_OPPONENT';
  const statusText = complete
    ? (game.outcome === 'WON' ? t('gomoku.youWon', 'You won!') : game.outcome === 'LOST' ? t('gomoku.youLost', 'You lost') : t('gomoku.tie', 'Draw'))
    : waiting ? t('gomoku.waitingOpponent', 'Waiting for a friend to join')
    : game.yourTurn ? `▶ ${t('gomoku.yourTurn', 'Your turn')}` : t('gomoku.theirTurn', 'Their turn');

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <View style={[styles.stoneDot, game.yourStone === 1 ? styles.stoneP1 : styles.stoneP2]} />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        {game.vsComputer && !complete && (
          <View style={styles.soloBar}>
            <Text style={styles.soloLabel}>🤖 {t('gomoku.vsComputer', 'vs Computer')}</Text>
            {game.yourTurn && (game.hintsRemaining ?? 0) > 0 ? (
              <TouchableOpacity style={styles.hintBtn} onPress={handleHint} disabled={hinting}>
                <Text style={styles.hintBtnText}>💡 {t('gomoku.hint', 'Hint')} ({game.hintsRemaining})</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.soloLabel}>{t('gomoku.hintsLeft', { count: game.hintsRemaining ?? 0, defaultValue: '💡 {{count}} hints' })}</Text>
            )}
          </View>
        )}

        {waiting && (
          <Card style={styles.shareCard}>
            <Text style={styles.muted}>{t('gomoku.sharePrompt', 'Send your friend the link — one tap drops them into this game:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Text selectable style={styles.link}>{gameInviteLink('gomoku', game.inviteCode)}</Text>
            <Button title={t('gomoku.shareCta', 'Share invite link')} onPress={shareInviteLink} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        <View style={styles.board}>
          {Array.from({ length: SIZE }).map((_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: SIZE }).map((__, c) => {
                const v = game.board[r]?.[c];
                const isLast = v !== '.' && lastMove.has(`${r},${c}`);
                const isHint = hintCell === `${r},${c}` && v === '.';
                return (
                  <TouchableOpacity key={c} activeOpacity={0.7} onPress={() => tap(r, c)} style={[styles.cell, isLast && styles.cellLastMove, isHint && styles.cellHint]}>
                    {v === '1' && <View style={[styles.stone, styles.stoneP1]} />}
                    {v === '2' && <View style={[styles.stone, styles.stoneP2]} />}
                    {isLast && <View style={styles.lastDot} />}
                    {isHint && <Text style={styles.hintMark}>💡</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {!complete && !waiting && !game.yourTurn && (
          <Text style={styles.muted}>{t('gomoku.notYourTurn', 'Wait for your friend to play.')}</Text>
        )}

        {!waiting && !game.vsComputer && id && (
          <View style={styles.chatWrap}><GameChat kind="gomoku" gameId={id} /></View>
        )}

        {!complete && !waiting && !game.vsComputer && (
          <Button title={t('game.forfeit', 'Forfeit')} onPress={doForfeit} variant="ghost" disabled={busy} style={{ marginTop: Spacing.md }} />
        )}
      </ScrollView>

      <GameResultOverlay
        visible={showResult}
        outcome={complete ? (game.outcome ?? 'TIE') : null}
        onClose={() => setShowResult(false)}
      />

      {/* Lost to the computer → revive to play on */}
      <PromptCard
        visible={showRevive && !buyPrompt}
        emoji="😮‍💨"
        title={t('game.youLost', 'You lost')}
        message={t('gomoku.revivePrompt', { cost: REVIVE_COST_GEMS, defaultValue: 'Revive for {{cost}} gems — we’ll undo the winning move so you can block it.' })}
        acceptLabel={t('game.revive', 'Revive') + `  💎 ${REVIVE_COST_GEMS}`}
        declineLabel={t('game.acceptDefeat', 'Accept defeat')}
        busy={reviving}
        onAccept={doRevive}
        onDecline={() => { setShowRevive(false); setShowResult(true); }}
      />

      {/* Out of gems → buy */}
      <PromptCard
        visible={buyPrompt}
        emoji="💎"
        title={t('game.needGems', 'Not enough gems')}
        message={t('game.needGemsBody', { cost: REVIVE_COST_GEMS, defaultValue: 'You need {{cost}} gems for this. Buy more?' })}
        acceptLabel={t('gems.buy', 'Buy gems')}
        declineLabel={t('common.notNow', 'Not now')}
        onAccept={() => { setBuyPrompt(false); router.push('/gems/buy' as never); }}
        onDecline={() => { setBuyPrompt(false); setShowResult(true); }}
      />

      {/* Popup ad once the game ends (skipped for ad-free players) */}
      <PostGameAd over={complete} />
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', marginTop: Spacing.sm },

  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  soloBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: BOARD_W, marginBottom: Spacing.md, gap: Spacing.sm },
  soloLabel:  { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  hintBtn:    { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderWidth: 1, borderColor: Colors.primary },
  hintBtnText:{ color: Colors.primary, fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  statusText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.semi },
  stoneDot:   { width: 14, height: 14, borderRadius: 7 },

  shareCard: { padding: Spacing.md, marginBottom: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },
  link:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginBottom: Spacing.xs },

  voiceFloat: { position: 'absolute', top: Spacing.sm, right: Spacing.md, alignItems: 'flex-end', zIndex: 20 },
  chatWrap: { width: BOARD_W, marginTop: Spacing.md },
  board:    { width: BOARD_W, borderWidth: 3, borderColor: Colors.blue, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#caa86a33', alignSelf: 'center', ...Shadow.md },
  boardRow: { flexDirection: 'row' },
  cell: {
    width: CELL, height: CELL,
    borderWidth: 1, borderColor: '#00000033',
    alignItems: 'center', justifyContent: 'center',
  },
  cellLastMove: { backgroundColor: Colors.accent + '33' },
  cellHint: { backgroundColor: Colors.primary + '55', borderColor: Colors.primary, borderWidth: 2 },
  hintMark: { position: 'absolute', fontSize: CELL * 0.55 },
  lastDot: { position: 'absolute', width: CELL * 0.22, height: CELL * 0.22, borderRadius: CELL, backgroundColor: Colors.accent },
  stone:   { width: CELL * 0.8, height: CELL * 0.8, borderRadius: CELL, ...Shadow.sm },
  stoneP1: { backgroundColor: '#15181c', borderWidth: 1, borderColor: '#000' },
  stoneP2: { backgroundColor: '#fbfbfb', borderWidth: 1, borderColor: '#9aa' },
});
