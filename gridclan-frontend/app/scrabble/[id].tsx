import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { scrabbleApi, type ScrabblePlacement, type ScrabbleView, type ScrabbleHint, type ScrabbleLogEntry } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { LEVELS_PER_DIFFICULTY } from '@gridtypes/index';
import { gameInviteLink, shareInvite } from '@utils/invite';
import { confirm } from '@utils/confirm';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { TurnCountdown } from '@components/TurnCountdown';
import { PauseBar } from '@components/PauseBar';
import { VoiceControl } from '@components/VoiceControl';
import { GameResultOverlay } from '@components/GameResultOverlay';
import { PostGameAd } from '@components/PostGameAd';
import { GameChat } from '@components/GameChat';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors, useTheme } from '@theme/theme';

// Standard 15×15 premium layout (mirrors backend Premiums): T/D/t/d.
const PREMIUMS = [
  'T..d...T...d..T', '.D...t...t...D.', '..D...d.d...D..', 'd..D...d...D..d',
  '....D.....D....', '.t...t...t...t.', '..d...d.d...d..', 'T..d...D...d..T',
  '..d...d.d...d..', '.t...t...t...t.', '....D.....D....', 'd..D...d...D..d',
  '..D...d.d...D..', '.D...t...t...D.', 'T..d...T...d..T',
];
const SIZE = 15;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Standard Scrabble letter values (mirrors backend Letters.java) — shown in the
// tile corner like the physical game. Blanks score 0 and show no number.
const LETTER_VALUE: Record<string, number> = {
  A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, S: 1, T: 1, R: 1,
  D: 2, G: 2,
  B: 3, C: 3, M: 3, P: 3,
  F: 4, H: 4, V: 4, W: 4, Y: 4,
  K: 5,
  J: 8, X: 8,
  Q: 10, Z: 10,
};

export default function ScrabbleGameScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const isLight = useTheme().scheme === 'light';
  const { width } = useWindowDimensions();
  const maxW = Math.min(width || 360, 480) - Spacing.lg * 2;
  const cell = Math.floor(maxW / SIZE);
  const boardW = cell * SIZE;                       // exact, so drop coords map to cells
  const styles = useMemo(() => makeStyles(Colors, cell, boardW), [Colors, cell, boardW]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [game, setGame] = useState<ScrabbleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ScrabblePlacement[]>([]);
  const [selChar, setSelChar] = useState<{ char: string; rackIdx: number } | null>(null);
  const [blankAt, setBlankAt] = useState<{ row: number; col: number; rackIdx: number } | null>(null);
  // Cells filled by the most recent move (yours or your friend's) → highlighted
  // until the next move, so you can see what just changed on the board.
  const [lastMove, setLastMove] = useState<Set<string>>(() => new Set());
  const prevBoardRef = useRef<string[] | null>(null);
  // Big win/lose popup — shown once when the game finishes.
  const [showResult, setShowResult] = useState(false);
  const [nextBusy, setNextBusy] = useState(false);
  const announced = useRef(false);
  // Solo hint: the AI's suggested word, ghosted on the board until you move.
  const [hint, setHint] = useState<ScrabbleHint | null>(null);
  const [hinting, setHinting] = useState(false);
  // Swap mode: pick rack tiles to exchange for fresh ones (uses your turn).
  const [swapMode, setSwapMode] = useState(false);
  const [swapSel, setSwapSel] = useState<number[]>([]);
  useEffect(() => {
    if (game?.status === 'COMPLETE' && game.outcome && game.outcome !== 'SPECTATOR' && !announced.current) {
      announced.current = true;
      setShowResult(true);
    }
  }, [game?.status, game?.outcome]);

  // Single funnel for new game state: diff the board against the previous one and
  // remember which squares just got a tile, then store the state. Always route
  // server responses through here so the highlight stays in sync.
  const commitGame = useCallback((next: ScrabbleView) => {
    const prev = prevBoardRef.current;
    if (prev) {
      const changed = new Set<string>();
      for (let r = 0; r < next.board.length; r++) {
        for (let c = 0; c < next.board[r].length; c++) {
          const ch = next.board[r][c];
          if (ch !== '.' && prev[r]?.[c] !== ch) changed.add(`${r},${c}`);
        }
      }
      if (changed.size) { setLastMove(changed); setHint(null); }   // a move landed → drop the hint
    }
    prevBoardRef.current = next.board;
    setGame(next);
  }, []);

  // Tap a rack tile to pick it up (a second tap drops it back), then tap a
  // board square to place it. No dragging — taps feel instant and never lag.
  function tapTile(char: string, rackIdx: number) {
    if (!game?.yourTurn || game.status === 'COMPLETE') return;
    setSelChar(prev => (prev?.rackIdx === rackIdx ? null : { char, rackIdx }));
    playSfx('tap');
  }

  const load = useCallback(async () => {
    if (!id) return;
    const res = await scrabbleApi.get(id).catch(() => null);
    if (res?.data) commitGame(res.data);
    setLoading(false);
  }, [id, commitGame]);

  // Load once, then live-update: the server pings this game's topic whenever the
  // opponent plays, joins, or the game ends — we just re-fetch our own view.
  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    subscribeGame('scrabble', id, () => { if (active) load(); })
      .then(unsub => { if (active) cleanup = unsub; else unsub(); });
    // Fallback poll so the board stays live even if the WebSocket can't connect.
    const poll = setInterval(() => { if (active) load(); }, 4000);
    return () => { active = false; cleanup?.(); clearInterval(poll); };
  }, [load, id]));

  // Rack tiles still available (original rack minus tiles used by pending moves).
  const availableRack = useMemo(() => {
    if (!game) return [] as { char: string; idx: number }[];
    const used = pending.map(p => (p.blank ? '_' : p.letter));
    const out: { char: string; idx: number }[] = [];
    const rack = game.yourRack.split('');
    for (let i = 0; i < rack.length; i++) {
      const u = used.indexOf(rack[i]);
      if (u >= 0) { used.splice(u, 1); continue; }   // consumed by a pending tile
      out.push({ char: rack[i], idx: i });
    }
    return out;
  }, [game, pending]);

  // Local display order for the rack — a Shuffle button rearranges the tiles
  // without touching game state (placement still keys off each tile's rack idx).
  const [rackOrder, setRackOrder] = useState<number[]>([]);
  useEffect(() => { setRackOrder([]); }, [game?.yourRack]);   // reset when tiles change
  const displayedRack = useMemo(() => {
    if (rackOrder.length === 0) return availableRack;
    const pos = new Map(rackOrder.map((idx, i) => [idx, i]));
    return [...availableRack].sort((a, b) => (pos.get(a.idx) ?? 0) - (pos.get(b.idx) ?? 0));
  }, [availableRack, rackOrder]);

  function shuffleRack() {
    if (!game) return;
    const idxs = game.yourRack.split('').map((_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    setRackOrder(idxs);
    playSfx('tap');
  }

  function cellAt(r: number, c: number): { letter: string; blank: boolean; pending: boolean } | null {
    const p = pending.find(x => x.row === r && x.col === c);
    if (p) return { letter: p.letter, blank: p.blank, pending: true };
    const ch = game?.board[r]?.[c];
    if (ch && ch !== '.') return { letter: ch.toUpperCase(), blank: ch === ch.toLowerCase(), pending: false };
    return null;
  }

  function tapCell(r: number, c: number) {
    const existing = cellAt(r, c);
    if (existing?.pending) {                       // recall a pending tile
      setPending(pending.filter(x => !(x.row === r && x.col === c)));
      playSfx('tap');
      return;
    }
    if (existing) return;                          // occupied by a committed tile
    if (!selChar) return;
    if (selChar.char === '_') { setBlankAt({ row: r, col: c, rackIdx: selChar.rackIdx }); setSelChar(null); return; }
    setPending([...pending, { row: r, col: c, letter: selChar.char, blank: false }]);
    setSelChar(null);
    playSfx('move');
  }

  function chooseBlankLetter(letter: string) {
    if (!blankAt) return;
    setPending([...pending, { row: blankAt.row, col: blankAt.col, letter, blank: true }]);
    setBlankAt(null);
  }

  async function submit() {
    if (!id || pending.length === 0 || busy) return;
    setBusy(true);
    const res = await scrabbleApi.move(id, pending).catch((e: any) => {
      Alert.alert(t('scrabble.invalidMove', 'Invalid move'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) {
      commitGame(res.data); setPending([]); setSelChar(null);
      if (res.data.outcome === 'WON')      playSfx('win');
      else if (res.data.outcome === 'LOST') playSfx('lose');
      else                                  playSfx('move');
    }
  }

  async function doPass() {
    if (!id || busy) return;
    setBusy(true);
    const res = await scrabbleApi.pass(id).catch(() => null);
    setBusy(false);
    if (res?.data) { commitGame(res.data); setPending([]); setSelChar(null); }
  }

  async function doPauseToggle() {
    if (!id || busy) return;
    setBusy(true);
    const res = await (game?.paused ? scrabbleApi.resume(id) : scrabbleApi.pause(id)).catch(() => null);
    setBusy(false);
    if (res?.data) commitGame(res.data);
  }

  // ── Swap (exchange) ── pick tiles, confirm, server deals replacements and
  // the turn passes — standard Scrabble exchange.
  function enterSwapMode() {
    setPending([]); setSelChar(null); setSwapSel([]); setSwapMode(true);
    playSfx('tap');
  }
  function exitSwapMode() { setSwapMode(false); setSwapSel([]); }
  function toggleSwapTile(rackIdx: number) {
    playSfx('tap');
    setSwapSel(sel => sel.includes(rackIdx) ? sel.filter(i => i !== rackIdx) : [...sel, rackIdx]);
  }
  async function doExchange() {
    if (!id || !game || swapSel.length === 0 || busy) return;
    setBusy(true);
    const tiles = swapSel.map(i => game.yourRack[i]).join('');
    const res = await scrabbleApi.exchange(id, tiles).catch((e: any) => {
      Alert.alert(t('scrabble.swapFailed', 'Swap failed'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) { commitGame(res.data); exitSwapMode(); playSfx('move'); }
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
    const res = await scrabbleApi.forfeit(id).catch(() => null);
    setBusy(false);
    if (res?.data) { commitGame(res.data); setPending([]); setSelChar(null); playSfx('lose'); }
  }

  async function handleHint() {
    if (!id || hinting) return;
    setHinting(true);
    try {
      const res = await scrabbleApi.hint(id);
      setHint(res.data);
      setGame(g => g ? { ...g, hintsRemaining: res.data.hintsRemaining } : g);
    } catch (e: any) {
      Alert.alert(t('scrabble.hintTitle', 'Hint'), e?.response?.data?.error ?? t('scrabble.noHint', 'No strong word found — try exchanging tiles.'));
    }
    setHinting(false);
  }

  async function shareInviteLink() {
    if (!game) return;
    const link = gameInviteLink('scrabble', game.inviteCode);
    const msg = t('scrabble.shareMessage', {
      code: game.inviteCode, link,
      defaultValue: `Play Grid Scrabble with me! Tap to join: {{link}}  (or enter code {{code}} in the app)`,
    });
    await shareInvite({ message: msg, link, onCopied: () => Alert.alert(t('scrabble.linkCopied', 'Invite link copied')) });
  }

  const header = {
    headerShown: true, title: t('scrabble.title', 'Grid Scrabble'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
    headerRight: () =>
      game && game.status === 'ACTIVE' && !game.vsComputer && !game.spectator && id
        ? <VoiceControl kind="scrabble" gameId={id} />
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
      const res = await scrabbleApi.solo(d, lvl + 1);
      const newId = res.data?.gameId;
      if (newId) {
        // Same screen instance, fresh game — reset the per-game bits.
        announced.current = false;
        prevBoardRef.current = null;
        setLastMove(new Set());
        setPending([]);
        setSelChar(null);
        setBlankAt(null);
        setHint(null);
        setShowResult(false);
        setGame(null);
        setLoading(true);
        router.replace(`/scrabble/${newId}`);
      }
    } catch { /* level gate or network hiccup — stay on the result */ }
    finally { setNextBusy(false); }
  }, [game, nextBusy]);

  if (loading) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('scrabble.notFound', 'Game not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const canNextLevel = complete && game.outcome === 'WON' && !!game.vsComputer
    && !!game.difficulty && (game.level ?? 0) > 0 && (game.level ?? 0) < LEVELS_PER_DIFFICULTY;
  const waiting = game.status === 'WAITING_FOR_OPPONENT';
  const spectator  = !!game.spectator;
  const multiSeat  = (game.maxPlayers ?? 2) > 2;
  const lastWord   = [...(game.moveLog ?? [])].reverse().find(e => e.type === 'WORD');

  // Suggested-cell lookup for the ghosted hint letters.
  const hintMap = new Map<string, string>();
  if (hint) for (const p of hint.placements) hintMap.set(`${p.row},${p.col}`, p.letter);

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Scoreboard — classic two seats, or the full table for 3-4 player boards */}
        {multiSeat || spectator ? (
          <View style={styles.seatBoard}>
            {(game.players ?? []).filter(p => p.name).map(p => (
              <View key={p.seat} style={[styles.seatCell, p.current && styles.seatCellTurn]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.seatName,
                    p.seat === game.yourSeat && { color: Colors.primary },
                    p.resigned && styles.seatResigned,
                  ]}
                >
                  {p.current ? '▶ ' : ''}{p.seat === game.yourSeat ? t('scrabble.you', 'You') : p.name}
                </Text>
                <Text style={styles.seatScore}>{p.score}</Text>
                <Text style={styles.seatTiles}>{'▮'.repeat(Math.min(7, p.tiles))}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.scoreRow}>
            <Score label={t('scrabble.you', 'You')} value={game.yourScore} hi={game.outcome === 'WON'} styles={styles} Colors={Colors} />
            <View style={styles.statusMid}>
              <Text style={styles.statusText}>
                {complete ? (game.outcome === 'WON' ? t('scrabble.youWon', 'You won!') : game.outcome === 'LOST' ? t('scrabble.youLost', 'You lost') : t('scrabble.tie', 'Tie'))
                  : waiting ? t('scrabble.waitingOpponent', 'Waiting for a friend to join')
                  : game.yourTurn ? `▶ ${t('scrabble.yourTurn', 'Your turn')}` : t('scrabble.theirTurn', 'Their turn')}
              </Text>
              <Text style={styles.bagText}>{t('scrabble.tilesLeft', 'Bag')}: {game.tilesInBag}</Text>
            </View>
            <Score label={t('scrabble.friend', 'Friend')} value={game.opponentScore} hi={game.outcome === 'LOST'} styles={styles} Colors={Colors} />
          </View>
        )}

        {(multiSeat || spectator) && (
          <Text style={styles.bagText}>
            {complete
              ? (spectator
                  ? t('scrabble.gameOverWinner', { name: game.winnerName ?? '—', defaultValue: 'Game over — {{name}} won' })
                  : game.outcome === 'WON' ? t('scrabble.youWon', 'You won!')
                  : game.outcome === 'LOST' ? t('scrabble.wonBy', { name: game.winnerName ?? '—', defaultValue: '{{name}} won' })
                  : t('scrabble.tie', 'Tie'))
              : waiting
                ? t('scrabble.waitingPlayers', { seated: game.seatedCount, total: game.maxPlayers, defaultValue: 'Waiting for players ({{seated}}/{{total}})' })
                : game.yourTurn ? `▶ ${t('scrabble.yourTurn', 'Your turn')}` : ''}
            {'  ·  '}{t('scrabble.tilesLeft', 'Bag')}: {game.tilesInBag}
          </Text>
        )}

        {spectator && !complete && (
          <Text style={styles.watchBanner}>👁 {t('scrabble.watching', "You're watching this game live")}</Text>
        )}

        {/* 5-minute turn clock (PvP only — the server auto-passes at zero) */}
        {game.status === 'ACTIVE' && !game.vsComputer && (
          <TurnCountdown deadline={game.turnDeadline} />
        )}
        {game.status === 'ACTIVE' && !game.vsComputer && !spectator && (
          <PauseBar paused={!!game.paused} onPause={doPauseToggle} onResume={doPauseToggle} busy={busy} />
        )}

        {lastWord && !waiting && (
          <Text style={styles.lastWordBanner}>
            {lastWord.player ? `${lastWord.player}: ` : ''}
            {(lastWord.words ?? []).join(', ')} +{lastWord.score}
            {lastWord.bingo ? ` 🎉 ${t('scrabble.bingo', 'BINGO +50')}` : ''}
          </Text>
        )}

        {game.vsComputer && !complete && (
          <View style={styles.soloBar}>
            <Text style={styles.soloLabel}>🤖 {t('scrabble.vsComputer', 'vs Computer')}</Text>
            {game.yourTurn && (game.hintsRemaining ?? 0) > 0 ? (
              <TouchableOpacity style={styles.hintBtn} onPress={handleHint} disabled={hinting}>
                <Text style={styles.hintBtnText}>💡 {t('scrabble.hint', 'Hint')} ({game.hintsRemaining})</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.soloLabel}>{t('scrabble.hintsLeft', { count: game.hintsRemaining ?? 0, defaultValue: '💡 {{count}} hints' })}</Text>
            )}
          </View>
        )}

        {hint && (
          <Text style={styles.hintBanner}>
            💡 {t('scrabble.hintTry', { word: hint.word, score: hint.score, defaultValue: 'Try {{word}} for {{score}} pts — tap the glowing squares' })}
          </Text>
        )}

        {/* Share code while waiting */}
        {waiting && (
          <Card style={styles.shareCard}>
            <Text style={styles.muted}>{t('scrabble.sharePrompt', 'Send your friend the link — one tap drops them into this game:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Text selectable style={styles.link}>{gameInviteLink('scrabble', game.inviteCode)}</Text>
            <Button title={t('scrabble.shareCta', 'Share invite link')} onPress={shareInviteLink} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        {/* Board */}
        <View style={styles.board}>
          {Array.from({ length: SIZE }).map((_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: SIZE }).map((__, c) => {
                const cell = cellAt(r, c);
                const prem = PREMIUMS[r][c];
                const hintLetter = !cell ? hintMap.get(`${r},${c}`) : undefined;
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.7}
                    onPress={() => tapCell(r, c)}
                    style={[
                      styles.cell,
                      { backgroundColor: premColor(prem, Colors, isLight) },
                      cell && styles.cellTile,   // any tile → classic cream chip
                      cell && !cell.pending && lastMove.has(`${r},${c}`) && styles.cellLastMove,
                      cell?.pending && styles.cellPending,
                      !!hintLetter && styles.cellHint,
                    ]}
                  >
                    {cell
                      ? <>
                          <Text style={[styles.tileText, cell.blank && styles.blankText]}>{cell.letter}</Text>
                          {!cell.blank && (
                            <Text style={styles.tileValue}>{LETTER_VALUE[cell.letter] ?? 0}</Text>
                          )}
                        </>
                      : hintLetter
                        ? <Text style={styles.hintGhost}>{hintLetter}</Text>
                        : r === 7 && c === 7
                          ? <Text style={styles.starText}>★</Text>
                          : <Text style={styles.premText}>{premLabel(prem)}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Rack */}
        {!complete && !spectator && (
          <>
            <View style={styles.rack}>
              {displayedRack.map((tile, i) => (
                <TouchableOpacity
                  key={`${tile.idx}-${i}`}
                  activeOpacity={0.7}
                  onPress={() => swapMode ? toggleSwapTile(tile.idx) : tapTile(tile.char, tile.idx)}
                  style={[
                    styles.rackTile,
                    !swapMode && selChar?.rackIdx === tile.idx && styles.rackTileSel,
                    swapMode && swapSel.includes(tile.idx) && styles.rackTileSwapSel,
                  ]}
                >
                  <Text style={styles.rackTileText}>{tile.char === '_' ? '▢' : tile.char}</Text>
                  {tile.char !== '_' && (
                    <Text style={styles.rackTileValue}>{LETTER_VALUE[tile.char] ?? 0}</Text>
                  )}
                </TouchableOpacity>
              ))}
              {!swapMode && displayedRack.length > 1 && (
                <TouchableOpacity activeOpacity={0.7} onPress={shuffleRack} style={styles.shuffleTile}>
                  <Text style={styles.shuffleIcon}>🔀</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.dragHint}>
              {swapMode
                ? t('scrabble.swapHint', 'Tap the tiles you want to swap, then confirm — new tiles are dealt and your turn ends.')
                : t('scrabble.tapHint', 'Tap a tile, then tap a square to place it')}
            </Text>

            {/* Actions */}
            {swapMode ? (
              <View style={styles.actions}>
                <Button
                  title={swapSel.length > 0
                    ? t('scrabble.swapConfirm', 'Swap {{count}} tiles', { count: swapSel.length })
                    : t('scrabble.swapPick', 'Pick tiles to swap')}
                  onPress={doExchange} loading={busy} disabled={swapSel.length === 0} style={styles.actionBtn}
                />
                <Button title={t('common.cancel', 'Cancel')} onPress={exitSwapMode} variant="secondary" disabled={busy} style={styles.actionBtn} />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button title={t('scrabble.submit', 'Submit')} onPress={submit} loading={busy} disabled={!game.yourTurn || pending.length === 0} style={styles.actionBtn} />
                <Button title={t('scrabble.recall', 'Recall')} onPress={() => setPending([])} variant="secondary" disabled={pending.length === 0} style={styles.actionBtn} />
                <Button title={t('scrabble.swap', 'Swap')} onPress={enterSwapMode} variant="ghost" disabled={!game.yourTurn || game.tilesInBag < 7} style={styles.actionBtn} />
                <Button title={t('scrabble.pass', 'Pass')} onPress={doPass} variant="ghost" disabled={!game.yourTurn} style={styles.actionBtn} />
              </View>
            )}
            {!swapMode && game.yourTurn && game.tilesInBag < 7 && (
              <Text style={styles.dragHint}>{t('scrabble.swapUnavailable', 'Swapping needs at least 7 tiles left in the bag.')}</Text>
            )}
            {!game.yourTurn && !waiting && <Text style={styles.muted}>{t('scrabble.notYourTurn', 'Wait for your friend to play.')}</Text>}
          </>
        )}

        {/* Word history — every move, for players and spectators alike */}
        {(game.moveLog?.length ?? 0) > 0 && (
          <Card style={styles.logCard}>
            <Text style={styles.logTitle}>📜 {t('scrabble.moveLog', 'Words played')}</Text>
            {game.moveLog.slice(-10).reverse().map((e, i) => (
              <Text key={`${e.at}-${i}`} style={styles.logLine}>{formatLogEntry(e, t)}</Text>
            ))}
          </Card>
        )}

        {!waiting && !game.vsComputer && !spectator && id && (
          <View style={styles.chatWrap}><GameChat kind="scrabble" gameId={id} /></View>
        )}

        {!complete && !waiting && !game.vsComputer && !spectator && (
          <Button title={t('game.forfeit', 'Forfeit')} onPress={doForfeit} variant="ghost" disabled={busy} style={{ marginTop: Spacing.md }} />
        )}
      </ScrollView>

      {/* Blank letter picker */}
      {blankAt && (
        <View style={styles.blankOverlay}>
          <Card style={styles.blankCard}>
            <Text style={styles.cardTitle}>{t('scrabble.pickBlank', 'Choose a letter for the blank')}</Text>
            <View style={styles.blankGrid}>
              {ALPHABET.map(l => (
                <TouchableOpacity key={l} style={styles.blankKey} onPress={() => chooseBlankLetter(l)}>
                  <Text style={styles.blankKeyText}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title={t('common.cancel', 'Cancel')} onPress={() => setBlankAt(null)} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        </View>
      )}

      <GameResultOverlay
        visible={showResult}
        outcome={complete && game.outcome !== 'SPECTATOR' ? (game.outcome ?? 'TIE') : null}
        onNext={canNextLevel ? startNextLevel : null}
        nextBusy={nextBusy}
        onClose={() => setShowResult(false)}
      />

      {/* Popup ad once the game ends (skipped for ad-free players) */}
      <PostGameAd over={complete} />
    </View>
  );
}

function Score({ label, value, hi, styles, Colors }: { label: string; value: number; hi?: boolean; styles: any; Colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.score}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={[styles.scoreValue, hi && { color: Colors.accent }]}>{value}</Text>
    </View>
  );
}

function formatLogEntry(e: ScrabbleLogEntry, t: (k: string, d?: any) => string): string {
  const who = e.player ?? `P${e.seat}`;
  switch (e.type) {
    case 'WORD':
      return `${who}: ${(e.words ?? []).join(', ')} +${e.score}${e.bingo ? ' 🎉' : ''}`;
    case 'PASS':    return t('scrabble.logPass',    { who, defaultValue: '{{who}} passed' });
    case 'SWAP':    return t('scrabble.logSwap',    { who, count: e.count ?? 0, defaultValue: '{{who}} swapped {{count}} tiles' });
    case 'TIMEOUT': return t('scrabble.logTimeout', { who, defaultValue: '{{who}} ran out of time' });
    case 'RESIGN':  return t('scrabble.logResign',  { who, defaultValue: '{{who}} resigned' });
    case 'GAME_END': return t('scrabble.logEnd',    'Game over');
    default: return who;
  }
}

function premLabel(p: string) {
  return { T: 'TW', D: 'DW', t: 'TL', d: 'DL' }[p] ?? '';
}
// Premium squares need much stronger fills in light mode — the translucent
// dark-mode tints all but vanish over the light glass background.
function premColor(p: string, Colors: ReturnType<typeof useColors>, isLight: boolean) {
  const a = isLight ? 'aa' : '55';
  switch (p) {
    case 'T': return '#c0392b' + a;
    case 'D': return '#e8745b' + a;
    case 't': return '#2e86c1' + a;
    case 'd': return '#5dade2' + a;
    default:  return isLight ? '#efe7d8' : Colors.surfaceHigh;   // warm parchment / navy
  }
}

// Classic cream Scrabble-tile colours — fixed, so tiles read instantly on the
// board in BOTH themes instead of blending into the background.
const TILE_BG     = '#f6e7c5';
const TILE_BORDER = '#c9a96a';
const TILE_TEXT   = '#2b1d07';

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center' },

  scoreRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: BOARD_W, marginBottom: Spacing.md },
  // 3-4 player table: one cell per seat, the current player's cell glows.
  seatBoard: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, width: BOARD_W, marginBottom: Spacing.sm },
  seatCell:  { flexGrow: 1, flexBasis: '23%', backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm, alignItems: 'center' },
  seatCellTurn: { borderColor: Colors.accent, borderWidth: 2 },
  seatName:  { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi, maxWidth: 90 },
  seatResigned: { textDecorationLine: 'line-through', color: Colors.textMuted },
  seatScore: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.black },
  seatTiles: { color: Colors.textMuted, fontSize: 8, letterSpacing: 1 },
  watchBanner: { color: Colors.accent, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center', marginBottom: Spacing.xs },
  lastWordBanner: { color: Colors.textSecondary, fontSize: Font.size.sm, textAlign: 'center', marginBottom: Spacing.sm },
  logCard:   { width: BOARD_W, marginTop: Spacing.lg, padding: Spacing.md },
  logTitle:  { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold, marginBottom: Spacing.xs },
  logLine:   { color: Colors.textSecondary, fontSize: Font.size.sm, lineHeight: 20 },
  score:     { alignItems: 'center', minWidth: 56 },
  scoreLabel:{ color: Colors.textMuted, fontSize: Font.size.xs },
  scoreValue:{ color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.black },
  statusMid: { flex: 1, alignItems: 'center' },
  statusText:{ color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center' },
  bagText:   { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },

  shareCard: { padding: Spacing.md, marginBottom: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },
  link:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginBottom: Spacing.xs },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold, textAlign: 'center' },

  voiceFloat: { position: 'absolute', top: 64, right: Spacing.md, alignItems: 'flex-end', zIndex: 20 },
  chatWrap:  { width: BOARD_W, marginTop: Spacing.lg },

  soloBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: BOARD_W, marginBottom: Spacing.md, gap: Spacing.sm },
  soloLabel:  { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  hintBtn:    { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderWidth: 1, borderColor: Colors.primary },
  hintBtnText:{ color: Colors.primary, fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  hintBanner: { color: Colors.primary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center', marginBottom: Spacing.sm, width: BOARD_W },
  cellHint:   { borderColor: Colors.primary, borderWidth: 2 },
  hintGhost:  { color: Colors.primary, fontWeight: Font.weight.bold, fontSize: CELL * 0.5, opacity: 0.7 },
  board:     { width: BOARD_W, borderWidth: 3, borderColor: Colors.accent, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface, alignSelf: 'center', ...Shadow.md },
  boardRow:  { flexDirection: 'row' },
  cell:      { width: CELL, height: CELL, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  // A placed tile — committed or pending — is a cream chip, like the rack.
  cellTile:  { backgroundColor: TILE_BG, borderColor: TILE_BORDER, borderRadius: 3 },
  // Your uncommitted tiles: green border (matches the brand "your action").
  cellPending: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: '#fdf3d7' },
  // What the last move placed: amber ring, distinct from pending's green.
  cellLastMove: { borderColor: Colors.accentDim, borderWidth: 2 },
  tileText:  { color: TILE_TEXT, fontSize: CELL * 0.56, fontFamily: Font.family.displayBold },
  // Corner value, like a physical tile. Hidden on blanks (they score 0).
  // Keep a legible floor and paint above the letter so it can't be clipped or
  // covered on small / high-density screens (was shrinking to ~6px and vanishing).
  tileValue: {
    position: 'absolute', bottom: 0, right: 1.5,
    color: TILE_TEXT, fontSize: Math.max(9, Math.round(CELL * 0.3)),
    fontWeight: Font.weight.bold, lineHeight: Math.max(10, Math.round(CELL * 0.34)),
    ...(Platform.OS === 'web' ? { zIndex: 1 } as any : { elevation: 1 }),
  },
  blankText: { color: '#15803d' },
  premText:  { color: Colors.textSecondary, fontSize: CELL * 0.3, fontFamily: Font.family.bodyBold },
  starText:  { color: Colors.accent, fontSize: CELL * 0.66 },

  rack:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center', marginTop: Spacing.lg },
  rackTile:  { width: 44, height: 48, borderRadius: Radius.sm, backgroundColor: TILE_BG, borderWidth: 1, borderColor: TILE_BORDER, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null) },
  shuffleTile: { width: 44, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null) },
  shuffleIcon: { fontSize: Font.size.lg },
  rackTileSel:{ borderColor: Colors.primary, borderWidth: 2, transform: [{ translateY: -4 }] },
  rackTileSwapSel: { borderColor: Colors.error, borderWidth: 2, transform: [{ translateY: -4 }], opacity: 0.9 },
  rackTileText:{ color: TILE_TEXT, fontSize: Font.size.lg, fontFamily: Font.family.displayBold },
  rackTileValue: {
    position: 'absolute', bottom: 2, right: 4,
    color: TILE_TEXT, fontSize: 10, fontWeight: Font.weight.bold,
  },

  dragHint:  { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: Spacing.sm, textAlign: 'center' },

  actions:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, width: BOARD_W },
  actionBtn: { flex: 1 },

  blankOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  blankCard: { padding: Spacing.md, width: '100%', maxWidth: 360 },
  blankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center', marginTop: Spacing.md },
  blankKey:  { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  blankKeyText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
});
