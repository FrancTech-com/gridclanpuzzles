import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { scrabbleApi, type ScrabblePlacement, type ScrabbleView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

// Standard 15×15 premium layout (mirrors backend Premiums): T/D/t/d.
const PREMIUMS = [
  'T..d...T...d..T', '.D...t...t...D.', '..D...d.d...D..', 'd..D...d...D..d',
  '....D.....D....', '.t...t...t...t.', '..d...d.d...d..', 'T..d...D...d..T',
  '..d...d.d...d..', '.t...t...t...t.', '....D.....D....', 'd..D...d...D..d',
  '..D...d.d...D..', '.D...t...t...D.', 'T..d...T...d..T',
];
const SIZE = 15;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function ScrabbleGameScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const { width } = useWindowDimensions();
  const boardW = Math.min(width || 360, 480) - Spacing.lg * 2;
  const cell = Math.floor(boardW / SIZE);
  const styles = useMemo(() => makeStyles(Colors, cell, boardW), [Colors, cell, boardW]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [game, setGame] = useState<ScrabbleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ScrabblePlacement[]>([]);
  const [selChar, setSelChar] = useState<{ char: string; rackIdx: number } | null>(null);
  const [blankAt, setBlankAt] = useState<{ row: number; col: number; rackIdx: number } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await scrabbleApi.get(id).catch(() => null);
    if (res?.data) setGame(res.data);
    setLoading(false);
  }, [id]);

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
      return;
    }
    if (existing) return;                          // occupied by a committed tile
    if (!selChar) return;
    if (selChar.char === '_') { setBlankAt({ row: r, col: c, rackIdx: selChar.rackIdx }); setSelChar(null); return; }
    setPending([...pending, { row: r, col: c, letter: selChar.char, blank: false }]);
    setSelChar(null);
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
      setGame(res.data); setPending([]); setSelChar(null);
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
    if (res?.data) { setGame(res.data); setPending([]); setSelChar(null); }
  }

  async function shareCode() {
    if (!game) return;
    const msg = t('scrabble.shareMessage', { code: game.inviteCode, defaultValue: `Play Grid Scrabble with me! Code: {{code}}` });
    try {
      if (Platform.OS === 'web') {
        if ((navigator as any).share) await (navigator as any).share({ text: msg });
        else if ((navigator as any).clipboard) { await (navigator as any).clipboard.writeText(game.inviteCode); Alert.alert(t('scrabble.copied', 'Code copied')); }
      } else { await Share.share({ message: msg }); }
    } catch { /* cancelled */ }
  }

  const header = {
    headerShown: true, title: t('scrabble.title', 'Grid Scrabble'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
  };

  if (loading) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('scrabble.notFound', 'Game not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const waiting = game.status === 'WAITING_FOR_OPPONENT';

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Scoreboard */}
        <View style={styles.scoreRow}>
          <Score label={t('scrabble.you', 'You')} value={game.yourScore} hi={game.outcome === 'WON'} styles={styles} Colors={Colors} />
          <View style={styles.statusMid}>
            <Text style={styles.statusText}>
              {complete ? (game.outcome === 'WON' ? `🏆 ${t('scrabble.youWon', 'You won!')}` : game.outcome === 'LOST' ? `😅 ${t('scrabble.youLost', 'You lost')}` : `🤝 ${t('scrabble.tie', 'Tie')}`)
                : waiting ? t('scrabble.waitingOpponent', 'Waiting for a friend to join')
                : game.yourTurn ? `▶ ${t('scrabble.yourTurn', 'Your turn')}` : t('scrabble.theirTurn', 'Their turn')}
            </Text>
            <Text style={styles.bagText}>{t('scrabble.tilesLeft', 'Bag')}: {game.tilesInBag}</Text>
          </View>
          <Score label={t('scrabble.friend', 'Friend')} value={game.opponentScore} hi={game.outcome === 'LOST'} styles={styles} Colors={Colors} />
        </View>

        {/* Share code while waiting */}
        {waiting && (
          <Card style={styles.shareCard}>
            <Text style={styles.muted}>{t('scrabble.sharePrompt', 'Share this code so a friend can join:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Button title={t('scrabble.shareCta', 'Share code')} onPress={shareCode} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        {/* Board */}
        <View style={styles.board}>
          {Array.from({ length: SIZE }).map((_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: SIZE }).map((__, c) => {
                const cell = cellAt(r, c);
                const prem = PREMIUMS[r][c];
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.7}
                    onPress={() => tapCell(r, c)}
                    style={[styles.cell, { backgroundColor: premColor(prem, Colors) }, cell?.pending && styles.cellPending]}
                  >
                    {cell
                      ? <Text style={[styles.tileText, cell.blank && styles.blankText]}>{cell.letter}</Text>
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
        {!complete && (
          <>
            <View style={styles.rack}>
              {availableRack.map((tile, i) => (
                <TouchableOpacity
                  key={`${tile.idx}-${i}`}
                  onPress={() => setSelChar(selChar?.rackIdx === tile.idx ? null : { char: tile.char, rackIdx: tile.idx })}
                  style={[styles.rackTile, selChar?.rackIdx === tile.idx && styles.rackTileSel]}
                >
                  <Text style={styles.rackTileText}>{tile.char === '_' ? '▢' : tile.char}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Button title={t('scrabble.submit', 'Submit')} onPress={submit} loading={busy} disabled={!game.yourTurn || pending.length === 0} style={styles.actionBtn} />
              <Button title={t('scrabble.recall', 'Recall')} onPress={() => setPending([])} variant="secondary" disabled={pending.length === 0} style={styles.actionBtn} />
              <Button title={t('scrabble.pass', 'Pass')} onPress={doPass} variant="ghost" disabled={!game.yourTurn} style={styles.actionBtn} />
            </View>
            {!game.yourTurn && !waiting && <Text style={styles.muted}>{t('scrabble.notYourTurn', 'Wait for your friend to play.')}</Text>}
          </>
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

function premLabel(p: string) {
  return { T: 'TW', D: 'DW', t: 'TL', d: 'DL' }[p] ?? '';
}
function premColor(p: string, Colors: ReturnType<typeof useColors>) {
  switch (p) {
    case 'T': return '#c0392b55';
    case 'D': return '#e8745b55';
    case 't': return '#2e86c155';
    case 'd': return '#5dade255';
    default:  return Colors.surfaceHigh;
  }
}

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center' },

  scoreRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: BOARD_W, marginBottom: Spacing.md },
  score:     { alignItems: 'center', minWidth: 56 },
  scoreLabel:{ color: Colors.textMuted, fontSize: Font.size.xs },
  scoreValue:{ color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.black },
  statusMid: { flex: 1, alignItems: 'center' },
  statusText:{ color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center' },
  bagText:   { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },

  shareCard: { padding: Spacing.md, marginBottom: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold, textAlign: 'center' },

  board:     { width: BOARD_W, borderWidth: 1, borderColor: Colors.border, alignSelf: 'center' },
  boardRow:  { flexDirection: 'row' },
  cell:      { width: CELL, height: CELL, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cellPending: { backgroundColor: Colors.accent },
  tileText:  { color: Colors.textPrimary, fontSize: CELL * 0.5, fontWeight: Font.weight.bold },
  blankText: { color: Colors.primary },
  premText:  { color: Colors.textMuted, fontSize: CELL * 0.28 },
  starText:  { color: Colors.accent, fontSize: CELL * 0.6 },

  rack:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center', marginTop: Spacing.lg },
  rackTile:  { width: 40, height: 44, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  rackTileSel:{ borderColor: Colors.primary, backgroundColor: Colors.primary + '33' },
  rackTileText:{ color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },

  actions:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, width: BOARD_W },
  actionBtn: { flex: 1 },

  blankOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  blankCard: { padding: Spacing.md, width: '100%', maxWidth: 360 },
  blankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center', marginTop: Spacing.md },
  blankKey:  { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  blankKeyText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
});
