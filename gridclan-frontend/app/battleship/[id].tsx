import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { battleshipApi, type BattleshipView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { LEVELS_PER_DIFFICULTY } from '@gridtypes/index';
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

const SIZE = 10;
const REVIVE_COST_GEMS = 20;

// Diff a board against its previous snapshot → set of "r,c" squares that changed.
function diffBoard(prev: string[] | null, next: string[]): Set<string> {
  const changed = new Set<string>();
  if (!prev) return changed;
  for (let r = 0; r < next.length; r++)
    for (let c = 0; c < next[r].length; c++)
      if (prev[r]?.[c] !== next[r][c]) changed.add(`${r},${c}`);
  return changed;
}

export default function BattleshipGameScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const { width } = useWindowDimensions();
  const boardW = Math.min(width || 360, 420) - Spacing.lg * 2;
  const cell = Math.floor(boardW / SIZE);
  const styles = useMemo(() => makeStyles(Colors, cell, cell * SIZE), [Colors, cell]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [game, setGame] = useState<BattleshipView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Last shot on each board → highlighted until the next move: your shot on the
  // enemy grid, your friend's shot on your fleet.
  const [lastEnemy, setLastEnemy] = useState<Set<string>>(() => new Set());
  const [lastOwn, setLastOwn] = useState<Set<string>>(() => new Set());
  // Big win/lose popup — shown once when the game finishes.
  const [showResult, setShowResult] = useState(false);
  const announced = useRef(false);
  // Solo loss → offer to revive; out of gems → offer to buy.
  const [showRevive, setShowRevive] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [buyPrompt, setBuyPrompt] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  // Solo hint: the enemy ship cell the AI reveals, highlighted until you fire.
  const [hintCell, setHintCell] = useState<string | null>(null);
  const [hinting, setHinting] = useState(false);
  useEffect(() => {
    if (game?.status === 'COMPLETE' && game.outcome && !announced.current) {
      announced.current = true;
      if (game.outcome === 'LOST' && game.vsComputer) setShowRevive(true);
      else setShowResult(true);
    }
  }, [game?.status, game?.outcome]);

  async function doRevive() {
    if (!id || reviving) return;
    setReviving(true);
    const res = await battleshipApi.revive(id).catch((e: any) => {
      if (e?.response?.status === 422) { setShowRevive(false); setBuyPrompt(true); }   // out of gems
      else Alert.alert(t('game.reviveFailed', 'Could not revive. Please try again.'));
      return null;
    });
    setReviving(false);
    if (res?.data) {
      announced.current = false;
      setShowRevive(false);
      playSfx('move');
      commitGame(res.data);
    }
  }
  const prevTrackingRef = useRef<string[] | null>(null);
  const prevOwnRef = useRef<string[] | null>(null);

  // Funnel new game state through here so both highlights stay in sync.
  const commitGame = useCallback((next: BattleshipView) => {
    const enemy = diffBoard(prevTrackingRef.current, next.trackingBoard);
    const own = diffBoard(prevOwnRef.current, next.yourBoard);
    if (enemy.size) setLastEnemy(enemy);   // keep prior highlight if nothing changed
    if (own.size) setLastOwn(own);
    prevTrackingRef.current = next.trackingBoard;
    prevOwnRef.current = next.yourBoard;
    setGame(next);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await battleshipApi.get(id).catch(() => null);
    if (res?.data) commitGame(res.data);
    setLoading(false);
  }, [id, commitGame]);

  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    subscribeGame('battleship', id, () => { if (active) load(); })
      .then(unsub => { if (active) cleanup = unsub; else unsub(); });
    // Fallback poll: keeps the board live even if the WebSocket can't connect,
    // so a player always sees the game become ACTIVE / their turn arrive.
    const poll = setInterval(() => { if (active) load(); }, 4000);
    return () => { active = false; cleanup?.(); clearInterval(poll); };
  }, [load, id]));

  async function fire(r: number, c: number) {
    if (!id || !game || busy) return;
    if (game.status === 'WAITING_FOR_OPPONENT') {
      Alert.alert(t('battleship.waitingOpponent', 'Waiting for a friend to join'));
      return;
    }
    if (game.status === 'COMPLETE') return;
    if (!game.yourTurn) {
      Alert.alert(t('battleship.notYourTurn', "Hold on — it's your opponent's turn."));
      return;
    }
    if (game.trackingBoard[r]?.[c] !== '.') return;   // already fired here
    setBusy(true);
    setHintCell(null);   // clear any hint highlight once you fire
    const res = await battleshipApi.move(id, r, c).catch((e: any) => {
      Alert.alert(t('battleship.invalidMove', 'Invalid move'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) {
      commitGame(res.data);
      const shot = res.data.lastShot;
      if (shot === 'WIN')        { playSfx('win');  Alert.alert(t('battleship.win', '🏆 You sank the whole fleet — you win!')); }
      else if (shot === 'SUNK')  { playSfx('hit');  Alert.alert(t('battleship.sunk', '💥 You sank a ship!')); }
      else if (shot === 'HIT')   playSfx('hit');
      else                       playSfx('move');
    }
  }

  async function handleHint() {
    if (!id || hinting) return;
    setHinting(true);
    const res = await battleshipApi.hint(id).catch(() => null);
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
    const res = await battleshipApi.forfeit(id).catch(() => null);
    setBusy(false);
    if (res?.data) { commitGame(res.data); playSfx('lose'); }
  }

  async function shareInviteLink() {
    if (!game) return;
    const link = gameInviteLink('battleship', game.inviteCode);
    const msg = t('battleship.shareMessage', {
      code: game.inviteCode, link,
      defaultValue: `Play Grid Battleships with me! Tap to join: {{link}}  (or enter code {{code}} in the app)`,
    });
    await shareInvite({ message: msg, link, onCopied: () => Alert.alert(t('battleship.linkCopied', 'Invite link copied')) });
  }

  const header = {
    headerShown: true, title: t('battleship.title', 'Grid Battleships'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
    headerRight: () =>
      game && game.status === 'ACTIVE' && !game.vsComputer && id
        ? <VoiceControl kind="battleship" gameId={id} />
        : null,
  };

  // Ladder win vs the computer → the next level is already unlocked
  // server-side; start it and stay on this screen (the id param flips).
  const startNextLevel = useCallback(async () => {
    const d = game?.difficulty, lvl = game?.level ?? 0;
    if (!d || lvl <= 0 || lvl >= LEVELS_PER_DIFFICULTY || nextBusy) return;
    playSfx('tap');
    setNextBusy(true);
    try {
      const res = await battleshipApi.solo(d, lvl + 1);
      const newId = res.data?.gameId;
      if (newId) {
        // Same screen instance, fresh game — reset the per-game bits.
        announced.current = false;
        prevTrackingRef.current = null;
        prevOwnRef.current = null;
        setLastEnemy(new Set());
        setLastOwn(new Set());
        setHintCell(null);
        setShowResult(false);
        setGame(null);
        setLoading(true);
        router.replace(`/battleship/${newId}`);
      }
    } catch { /* level gate or network hiccup — stay on the result */ }
    finally { setNextBusy(false); }
  }, [game, nextBusy]);

  if (loading) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('battleship.notFound', 'Game not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const canNextLevel = complete && game.outcome === 'WON' && !!game.vsComputer
    && !!game.difficulty && (game.level ?? 0) > 0 && (game.level ?? 0) < LEVELS_PER_DIFFICULTY;
  const waiting = game.status === 'WAITING_FOR_OPPONENT';
  const statusText = complete
    ? (game.outcome === 'WON' ? t('battleship.youWon', 'You won!') : game.outcome === 'LOST' ? t('battleship.youLost', 'You lost') : t('battleship.tie', 'Draw'))
    : waiting ? t('battleship.waitingOpponent', 'Waiting for a friend to join')
    : game.yourTurn ? `▶ ${t('battleship.yourTurn', 'Your turn — fire!')}` : t('battleship.theirTurn', 'Their turn');

  const enemyCell = (ch: string) => {
    if (ch === 'X') return styles.cellHit;
    if (ch === 'O') return styles.cellMiss;
    return styles.cellWater;
  };
  const ownCell = (ch: string) => {
    if (ch === 'X') return styles.cellHit;
    if (ch === 'O') return styles.cellMiss;
    if (ch === 'S') return styles.cellShip;
    return styles.cellWater;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.statusText}>{statusText}</Text>

        {waiting && (
          <Card style={styles.shareCard}>
            <Text style={styles.muted}>{t('battleship.sharePrompt', 'Send your friend the link — one tap drops them into this game:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Text selectable style={styles.link}>{gameInviteLink('battleship', game.inviteCode)}</Text>
            <Button title={t('battleship.shareCta', 'Share invite link')} onPress={shareInviteLink} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        {game.vsComputer && !complete && (
          <View style={styles.soloBar}>
            <Text style={styles.soloLabel}>🤖 {t('battleship.vsComputer', 'vs Computer')}</Text>
            {game.yourTurn && (game.hintsRemaining ?? 0) > 0 ? (
              <TouchableOpacity style={styles.hintBtn} onPress={handleHint} disabled={hinting}>
                <Text style={styles.hintBtnText}>💡 {t('battleship.hint', 'Hint')} ({game.hintsRemaining})</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.soloLabel}>{t('battleship.hintsLeft', { count: game.hintsRemaining ?? 0, defaultValue: '💡 {{count}} hints' })}</Text>
            )}
          </View>
        )}

        {/* Enemy waters — tap to fire */}
        <Text style={styles.boardLabel}>{t('battleship.enemyWaters', 'Enemy waters')}</Text>
        <View style={styles.board}>
          {game.trackingBoard.map((row, r) => (
            <View key={r} style={styles.boardRow}>
              {row.split('').map((ch, c) => {
                const isHint = hintCell === `${r},${c}`;
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.7}
                    onPress={() => fire(r, c)}
                    style={[styles.cell, enemyCell(ch), lastEnemy.has(`${r},${c}`) && styles.cellLastMove, isHint && styles.cellHintTarget]}
                  >
                    {ch === 'X' && <Text style={styles.mark}>✸</Text>}
                    {ch === 'O' && <View style={styles.missDot} />}
                    {isHint && ch === '.' && <Text style={styles.hintMark}>💡</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Chat sits between the two boards */}
        {!waiting && !game.vsComputer && id && (
          <View style={styles.chatWrap}><GameChat kind="battleship" gameId={id} /></View>
        )}

        {/* Your fleet */}
        <Text style={[styles.boardLabel, { marginTop: Spacing.lg }]}>{t('battleship.yourFleet', 'Your fleet')}</Text>
        <View style={[styles.board, styles.boardOwn]}>
          {game.yourBoard.map((row, r) => (
            <View key={r} style={styles.boardRow}>
              {row.split('').map((ch, c) => (
                <View key={c} style={[styles.cell, ownCell(ch), lastOwn.has(`${r},${c}`) && styles.cellLastMove]}>
                  {ch === 'X' && <Text style={styles.mark}>✸</Text>}
                  {ch === 'O' && <View style={styles.missDot} />}
                </View>
              ))}
            </View>
          ))}
        </View>

        {!complete && !waiting && !game.vsComputer && (
          <Button title={t('game.forfeit', 'Forfeit')} onPress={doForfeit} variant="ghost" disabled={busy} style={{ marginTop: Spacing.lg }} />
        )}
      </ScrollView>

      <GameResultOverlay
        visible={showResult}
        outcome={complete ? (game.outcome ?? 'TIE') : null}
        onNext={canNextLevel ? startNextLevel : null}
        nextBusy={nextBusy}
        onClose={() => setShowResult(false)}
      />

      {/* Fleet sunk → revive to keep firing */}
      <PromptCard
        visible={showRevive && !buyPrompt}
        emoji="🌊"
        title={t('game.youLost', 'You lost')}
        message={t('battleship.revivePrompt', { cost: REVIVE_COST_GEMS, defaultValue: 'Revive for {{cost}} gems — get part of your fleet back and keep firing.' })}
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
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center' },

  statusText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.semi, marginBottom: Spacing.md, textAlign: 'center' },
  soloBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: BOARD_W, marginBottom: Spacing.md, gap: Spacing.sm },
  soloLabel:  { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  hintBtn:    { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderWidth: 1, borderColor: Colors.primary },
  hintBtnText:{ color: Colors.primary, fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  boardLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, alignSelf: 'flex-start', marginBottom: Spacing.xs },

  shareCard: { padding: Spacing.md, marginBottom: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },
  link:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginBottom: Spacing.xs },

  voiceFloat: { position: 'absolute', top: Spacing.sm, right: Spacing.md, alignItems: 'flex-end', zIndex: 20 },
  chatWrap: { width: BOARD_W, marginTop: Spacing.lg },
  board:    { width: BOARD_W, borderWidth: 3, borderColor: Colors.red, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface, alignSelf: 'center', ...Shadow.md },
  boardOwn: { borderColor: Colors.blue },
  boardRow: { flexDirection: 'row' },
  cell: {
    width: CELL, height: CELL,
    borderWidth: 1, borderColor: '#2a4d7855',
    alignItems: 'center', justifyContent: 'center',
  },
  cellWater: { backgroundColor: '#1f6f9e33' },
  cellShip:  { backgroundColor: Colors.textSecondary },
  cellHit:   { backgroundColor: Colors.red },
  cellMiss:  { backgroundColor: Colors.surfaceHigh },
  cellLastMove: { borderColor: Colors.accent, borderWidth: 2 },
  cellHintTarget: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: Colors.primary + '55' },
  hintMark: { position: 'absolute', fontSize: CELL * 0.5 },
  mark:      { color: '#fff', fontSize: CELL * 0.62, fontFamily: Font.family.displayBold },
  missDot:   { width: CELL * 0.28, height: CELL * 0.28, borderRadius: CELL, backgroundColor: Colors.textMuted },
});
