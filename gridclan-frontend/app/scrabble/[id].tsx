import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { scrabbleApi, type ScrabblePlacement, type ScrabbleView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { gameInviteLink, shareInvite } from '@utils/invite';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
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

  // ── Drag-and-drop (rack tile → board cell) ────────────────────────────────
  // A tile can be dragged onto the board; a quick tap with no drag still works
  // (selects the tile, then tap a cell to place it — the original flow).
  const [drag, setDrag] = useState<{ char: string; rackIdx: number; x: number; y: number; moved: boolean } | null>(null);
  const boardRef = useRef<View>(null);
  const boardRect = useRef<{ x: number; y: number } | null>(null);

  // Live values the (stable) gesture handlers read at fire time. The handlers
  // must NOT be recreated each render — doing so resets PanResponder's gesture
  // state mid-drag — so everything dynamic flows through refs.
  const pendingRef = useRef<ScrabblePlacement[]>([]);
  const gameRef = useRef(game);
  const cellRef = useRef(cell);
  const boardWRef = useRef(boardW);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { cellRef.current = cell; boardWRef.current = boardW; }, [cell, boardW]);

  const measureBoard = useCallback(() => {
    boardRef.current?.measureInWindow((x, y) => { boardRect.current = { x, y }; });
  }, []);

  // Drop a tile onto (r,c); reads board/pending via refs so it's always current.
  const placeRef = useRef<(r: number, c: number, char: string, rackIdx: number) => void>(() => {});
  placeRef.current = (r, c, char, rackIdx) => {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return;
    const occupied = pendingRef.current.some(p => p.row === r && p.col === c)
      || !!(gameRef.current?.board[r]?.[c] && gameRef.current!.board[r][c] !== '.');
    if (occupied) return;
    if (char === '_') { setBlankAt({ row: r, col: c, rackIdx }); return; }
    setPending([...pendingRef.current, { row: r, col: c, letter: char, blank: false }]);
    playSfx('move');
  };

  // One stable PanResponder per rack slot (0–6), built once. The dragged tile's
  // letter comes from the current rack via its slot index.
  const tilePansRef = useRef<ReturnType<typeof PanResponder.create>[] | null>(null);
  if (!tilePansRef.current) {
    tilePansRef.current = Array.from({ length: 7 }, (_u, rackIdx) =>
      PanResponder.create({
        // Don't claim the touch on a simple tap — let the tile's onPress handle
        // selection (reliable everywhere, incl. web/ScrollView). Only become the
        // responder once the finger actually drags.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          !!gameRef.current?.yourTurn && gameRef.current?.status !== 'COMPLETE' && Math.hypot(g.dx, g.dy) > 6,
        // Keep the drag even though the rack sits inside a ScrollView.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          measureBoard();
          setDrag({ char: gameRef.current?.yourRack[rackIdx] ?? '', rackIdx, x: 0, y: 0, moved: false });
        },
        onPanResponderMove: (_e, g) => {
          setDrag({ char: gameRef.current?.yourRack[rackIdx] ?? '', rackIdx, x: g.moveX, y: g.moveY, moved: Math.hypot(g.dx, g.dy) > 8 });
        },
        onPanResponderRelease: (_e, g) => {
          const char = gameRef.current?.yourRack[rackIdx] ?? '';
          if (Math.hypot(g.dx, g.dy) > 8 && boardRect.current) {
            const lx = g.moveX - boardRect.current.x;
            const ly = g.moveY - boardRect.current.y;
            if (lx >= 0 && ly >= 0 && lx < boardWRef.current && ly < boardWRef.current) {
              placeRef.current(Math.floor(ly / cellRef.current), Math.floor(lx / cellRef.current), char, rackIdx);
            }
          } else {
            // No real drag → toggle selection (original tap-to-place flow).
            setSelChar(prev => (prev?.rackIdx === rackIdx ? null : { char, rackIdx }));
          }
          setDrag(null);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    );
  }
  const tilePans = tilePansRef.current;

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
            <Text style={styles.muted}>{t('scrabble.sharePrompt', 'Send your friend the link — one tap drops them into this game:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Text selectable style={styles.link}>{gameInviteLink('scrabble', game.inviteCode)}</Text>
            <Button title={t('scrabble.shareCta', 'Share invite link')} onPress={shareInviteLink} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        {/* Board */}
        <View ref={boardRef} onLayout={measureBoard} style={styles.board}>
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
              {availableRack.map((tile, i) => {
                const isDragging = drag?.moved && drag.rackIdx === tile.idx;
                return (
                  <TouchableOpacity
                    key={`${tile.idx}-${i}`}
                    {...tilePans[tile.idx].panHandlers}
                    activeOpacity={0.8}
                    disabled={!game.yourTurn}
                    onPress={() => setSelChar(prev => (prev?.rackIdx === tile.idx ? null : { char: tile.char, rackIdx: tile.idx }))}
                    style={[
                      styles.rackTile,
                      selChar?.rackIdx === tile.idx && styles.rackTileSel,
                      isDragging && styles.rackTileGhostSlot,
                    ]}
                  >
                    <Text style={styles.rackTileText}>{tile.char === '_' ? '▢' : tile.char}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.dragHint}>{t('scrabble.dragHint', 'Drag a tile onto the board — or tap a tile then a square')}</Text>

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

      {/* Floating tile that follows the finger while dragging. */}
      {drag?.moved && (
        <View pointerEvents="none" style={[styles.dragGhost, { left: drag.x - cell * 0.6, top: drag.y - cell * 0.75 }]}>
          <Text style={styles.dragGhostText}>{drag.char === '_' ? '▢' : drag.char}</Text>
        </View>
      )}

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
  link:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginBottom: Spacing.xs },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold, textAlign: 'center' },

  board:     { width: BOARD_W, borderWidth: 3, borderColor: Colors.accent, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surface, alignSelf: 'center', ...Shadow.md },
  boardRow:  { flexDirection: 'row' },
  cell:      { width: CELL, height: CELL, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cellPending: { backgroundColor: Colors.accent, borderColor: Colors.accentDim },
  tileText:  { color: Colors.textPrimary, fontSize: CELL * 0.56, fontFamily: Font.family.displayBold },
  blankText: { color: Colors.primary },
  premText:  { color: Colors.textSecondary, fontSize: CELL * 0.3, fontFamily: Font.family.bodyBold },
  starText:  { color: Colors.accent, fontSize: CELL * 0.66 },

  rack:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center', marginTop: Spacing.lg },
  rackTile:  { width: 44, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.accent, borderWidth: 1, borderColor: Colors.accentDim, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'grab' } as any : null) },
  rackTileSel:{ borderColor: Colors.primary, borderWidth: 2, transform: [{ translateY: -4 }] },
  rackTileGhostSlot: { opacity: 0.25 },
  rackTileText:{ color: '#1a1206', fontSize: Font.size.lg, fontFamily: Font.family.displayBold },

  dragHint:  { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: Spacing.sm, textAlign: 'center' },
  dragGhost: { position: 'absolute', width: CELL * 1.2, height: CELL * 1.2, borderRadius: Radius.sm, backgroundColor: Colors.accent, borderWidth: 1, borderColor: Colors.accentDim, alignItems: 'center', justifyContent: 'center', ...Shadow.md },
  dragGhostText: { color: '#1a1206', fontSize: CELL * 0.6, fontFamily: Font.family.displayBold },

  actions:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, width: BOARD_W },
  actionBtn: { flex: 1 },

  blankOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  blankCard: { padding: Spacing.md, width: '100%', maxWidth: 360 },
  blankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center', marginTop: Spacing.md },
  blankKey:  { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  blankKeyText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
});
