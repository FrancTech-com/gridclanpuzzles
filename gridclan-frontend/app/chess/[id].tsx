import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { chessApi, type ChessView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { gameInviteLink, shareInvite } from '@utils/invite';
import { confirm } from '@utils/confirm';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { TurnCountdown } from '@components/TurnCountdown';
import { VoiceControl } from '@components/VoiceControl';
import { GameResultOverlay } from '@components/GameResultOverlay';
import { PostGameAd } from '@components/PostGameAd';
import { GameChat } from '@components/GameChat';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

// Unicode chessmen, keyed by the FEN letter (uppercase = white). Both sides
// use the FILLED glyphs — they render solid — and are told apart by colour.
const GLYPH: Record<string, string> = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// Classic board colours — fixed, so the board reads instantly in both themes.
const LIGHT_SQ = '#f0d9b5';
const DARK_SQ  = '#b58863';

const FILES = 'abcdefgh';

/** Board coords ↔ square names; rows come rank 8 → rank 1 from the server. */
const squareName = (row: number, col: number) => `${FILES[col]}${8 - row}`;

export default function ChessGameScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const { width } = useWindowDimensions();
  const maxW = Math.min(width || 360, 480) - Spacing.lg * 2;
  const cell = Math.floor(maxW / 8);
  const boardW = cell * 8;
  const styles = useMemo(() => makeStyles(Colors, cell, boardW), [Colors, cell, boardW]);
  const { id, watch } = useLocalSearchParams<{ id: string; watch?: string }>();

  const [game, setGame] = useState<ChessView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);   // "e2"
  const [promo, setPromo] = useState<string | null>(null);          // pending "e7e8" base
  const [showResult, setShowResult] = useState(false);
  const announced = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await chessApi.get(id).catch(() => null);
    if (res?.data) setGame(res.data);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    subscribeGame('chess', id, () => { if (active) load(); })
      .then(unsub => { if (active) cleanup = unsub; else unsub(); });
    const poll = setInterval(() => { if (active) load(); }, 4000);
    return () => { active = false; cleanup?.(); clearInterval(poll); };
  }, [load, id]));

  React.useEffect(() => {
    if (game?.status === 'COMPLETE' && game.outcome && game.outcome !== 'SPECTATOR' && !announced.current) {
      announced.current = true;
      setShowResult(true);
      playSfx(game.outcome === 'WON' ? 'win' : game.outcome === 'LOST' ? 'lose' : 'move');
    }
  }, [game?.status, game?.outcome]);

  const spectator = !!game?.spectator || watch === '1';
  const flipped = game?.yourColor === 'BLACK';

  // Legal destinations for the currently selected piece.
  const targets = useMemo(() => {
    if (!selected || !game) return new Set<string>();
    const out = new Set<string>();
    for (const mv of game.legalMoves) {
      if (mv.startsWith(selected)) out.add(mv.slice(2, 4));
    }
    return out;
  }, [selected, game]);

  const lastFrom = game?.lastMove?.slice(0, 2);
  const lastTo   = game?.lastMove?.slice(2, 4);

  async function playMove(uci: string) {
    if (!id || busy) return;
    setBusy(true);
    const res = await chessApi.move(id, uci).catch((e: any) => {
      Alert.alert(t('chess.illegalMove', 'Illegal move'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    setSelected(null);
    setPromo(null);
    if (res?.data) {
      setGame(res.data);
      playSfx('move');
    }
  }

  function tapSquare(row: number, col: number) {
    if (!game || !game.yourTurn || spectator || busy) return;
    const sq = squareName(row, col);
    const piece = game.board[row]?.[col];
    const mine = piece && piece !== '.'
      && (game.yourColor === 'WHITE' ? piece === piece.toUpperCase() : piece === piece.toLowerCase());

    if (selected && targets.has(sq)) {
      const base = selected + sq;
      const needsPromo = game.legalMoves.some(m => m.length === 5 && m.startsWith(base));
      if (needsPromo) setPromo(base);
      else playMove(base);
      return;
    }
    if (mine) {
      setSelected(prev => (prev === sq ? null : sq));
      playSfx('tap');
    } else {
      setSelected(null);
    }
  }

  async function doForfeit() {
    if (!id || busy) return;
    const ok = await confirm({
      title:        t('game.forfeitTitle', 'Forfeit this game?'),
      message:      t('chess.forfeitMessage', 'You resign and your opponent wins. This cannot be undone.'),
      confirmLabel: t('game.forfeit', 'Forfeit'),
      cancelLabel:  t('common.cancel', 'Cancel'),
      destructive:  true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await chessApi.forfeit(id).catch(() => null);
    setBusy(false);
    if (res?.data) { setGame(res.data); playSfx('lose'); }
  }

  async function shareInviteLink() {
    if (!game) return;
    const link = gameInviteLink('chess', game.inviteCode);
    const msg = t('chess.shareMessage', {
      code: game.inviteCode, link,
      defaultValue: `Play chess with me on GridClan! Tap to join: {{link}}  (or enter code {{code}} in the app)`,
    });
    await shareInvite({ message: msg, link, onCopied: () => Alert.alert(t('chess.linkCopied', 'Invite link copied')) });
  }

  const header = {
    headerShown: true, title: t('chess.title', 'Grid Chess'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
    headerRight: () =>
      game && game.status === 'ACTIVE' && !spectator && id
        ? <VoiceControl kind="chess" gameId={id} />
        : null,
  };

  if (loading) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('chess.notFound', 'Game not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const waiting  = game.status === 'WAITING_FOR_OPPONENT';
  const white = game.players.find(p => p.color === 'WHITE');
  const black = game.players.find(p => p.color === 'BLACK');

  const endReasonText = game.endReason ? {
    CHECKMATE:     t('chess.byCheckmate', 'by checkmate'),
    STALEMATE:     t('chess.byStalemate', 'stalemate'),
    DRAW_50:       t('chess.byFiftyMoves', '50-move rule'),
    DRAW_MATERIAL: t('chess.byMaterial', 'insufficient material'),
    RESIGN:        t('chess.byResign', 'by resignation'),
    TIMEOUT:       t('chess.byTimeout', 'on time'),
  }[game.endReason] : '';

  const statusText = complete
    ? (game.outcome === 'SPECTATOR'
        ? t('chess.wonBy', { name: game.winnerName ?? t('chess.draw', 'Draw'), defaultValue: '{{name}} won' }) + ` ${endReasonText}`
        : game.outcome === 'WON' ? `${t('chess.youWon', 'You won!')} ${endReasonText}`
        : game.outcome === 'LOST' ? `${t('chess.youLost', 'You lost')} ${endReasonText}`
        : `${t('chess.draw', 'Draw')} — ${endReasonText}`)
    : waiting ? t('chess.waitingOpponent', 'Waiting for a friend to join as black')
    : game.yourTurn
      ? `▶ ${t('chess.yourTurn', 'Your move')}${game.inCheck ? ` — ${t('chess.check', 'CHECK!')}` : ''}`
      : `${t('chess.theirTurn', { name: (game.currentColor === 'WHITE' ? white?.name : black?.name) ?? '…', defaultValue: "{{name}}'s move" })}${game.inCheck ? ` — ${t('chess.check', 'CHECK!')}` : ''}`;

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Players */}
        <View style={styles.playerRow}>
          <PlayerChip name={white?.name ?? '…'} colorLabel="♔" active={!!white?.current} styles={styles} Colors={Colors} />
          <Text style={styles.vs}>vs</Text>
          <PlayerChip name={black?.name ?? '…'} colorLabel="♚" active={!!black?.current} styles={styles} Colors={Colors} />
        </View>

        <Text style={[styles.statusText, game.inCheck && !complete && { color: Colors.error }]}>{statusText}</Text>

        {spectator && !complete && (
          <Text style={styles.watchBanner}>👁 {t('chess.watching', "You're watching this game live")}</Text>
        )}

        {/* 5-minute move clock — in chess, running out means losing on time */}
        {game.status === 'ACTIVE' && <TurnCountdown deadline={game.turnDeadline} />}

        {waiting && (
          <Card style={styles.shareCard}>
            <Text style={styles.muted}>{t('chess.sharePrompt', 'Send your friend the link — one tap seats them as black:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Text selectable style={styles.link}>{gameInviteLink('chess', game.inviteCode)}</Text>
            <Button title={t('chess.shareCta', 'Share invite link')} onPress={shareInviteLink} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        {/* Board (flipped when you play black) */}
        <View style={styles.board}>
          {Array.from({ length: 8 }).map((_, dr) => {
            const row = flipped ? 7 - dr : dr;
            return (
              <View key={dr} style={styles.boardRow}>
                {Array.from({ length: 8 }).map((__, dc) => {
                  const col = flipped ? 7 - dc : dc;
                  const sq = squareName(row, col);
                  const piece = game.board[row]?.[col];
                  const dark = (row + col) % 2 === 1;
                  const isSel = selected === sq;
                  const isTarget = targets.has(sq);
                  const isLast = sq === lastFrom || sq === lastTo;
                  return (
                    <TouchableOpacity
                      key={dc}
                      activeOpacity={0.7}
                      onPress={() => tapSquare(row, col)}
                      style={[
                        styles.cell,
                        { backgroundColor: dark ? DARK_SQ : LIGHT_SQ },
                        isLast && styles.cellLast,
                        isSel && styles.cellSel,
                      ]}
                    >
                      {piece && piece !== '.' ? (
                        <Text style={[styles.piece, { color: piece === piece.toUpperCase() ? '#ffffff' : '#1a1a1a' }]}>
                          {GLYPH[piece]}
                        </Text>
                      ) : null}
                      {isTarget && <View style={[styles.targetDot, piece !== '.' && styles.targetRing]} />}
                      {dc === 0 && <Text style={styles.coordRank}>{8 - row}</Text>}
                      {dr === 7 && <Text style={styles.coordFile}>{FILES[col]}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>

        {!game.yourTurn && !waiting && !complete && !spectator && (
          <Text style={styles.muted}>{t('chess.notYourTurn', 'Wait for your opponent to move.')}</Text>
        )}

        {/* Move list */}
        {game.moveLog.length > 0 && (
          <Card style={styles.logCard}>
            <Text style={styles.logTitle}>📜 {t('chess.moves', 'Moves')}</Text>
            <Text style={styles.logLine}>
              {game.moveLog.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m}` : m)).join('  ')}
            </Text>
          </Card>
        )}

        {!waiting && !spectator && id && (
          <View style={styles.chatWrap}><GameChat kind="chess" gameId={id} /></View>
        )}

        {!complete && !waiting && !spectator && (
          <Button title={t('chess.resign', 'Resign')} onPress={doForfeit} variant="ghost" disabled={busy} style={{ marginTop: Spacing.md }} />
        )}
      </ScrollView>

      {/* Promotion picker */}
      {promo && (
        <View style={styles.promoOverlay}>
          <Card style={styles.promoCard}>
            <Text style={styles.promoTitle}>{t('chess.pickPromotion', 'Promote your pawn')}</Text>
            <View style={styles.promoRow}>
              {(['q', 'r', 'b', 'n'] as const).map(p => (
                <TouchableOpacity key={p} style={styles.promoKey} onPress={() => playMove(promo + p)}>
                  <Text style={styles.promoGlyph}>
                    {GLYPH[game.yourColor === 'WHITE' ? p.toUpperCase() : p]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Button title={t('common.cancel', 'Cancel')} onPress={() => setPromo(null)} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        </View>
      )}

      <GameResultOverlay
        visible={showResult}
        outcome={complete && game.outcome !== 'SPECTATOR' ? (game.outcome ?? 'TIE') : null}
        onNext={null}
        nextBusy={false}
        onClose={() => setShowResult(false)}
      />
      <PostGameAd over={complete && !spectator} />
    </View>
  );
}

function PlayerChip({ name, colorLabel, active, styles, Colors }: {
  name: string; colorLabel: string; active: boolean; styles: any; Colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.playerChip, active && { borderColor: Colors.accent, borderWidth: 2 }]}>
      <Text style={styles.playerChipText} numberOfLines={1}>
        {colorLabel} {name}{active ? ' ▶' : ''}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', marginTop: Spacing.sm },

  playerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm, width: BOARD_W, justifyContent: 'center' },
  playerChip: { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, maxWidth: BOARD_W * 0.42 },
  playerChipText: { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  vs:         { color: Colors.textMuted, fontSize: Font.size.xs },

  statusText: { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center', marginBottom: Spacing.xs },
  watchBanner: { color: Colors.accent, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center', marginBottom: Spacing.xs },

  shareCard: { padding: Spacing.md, marginVertical: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },
  link:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginBottom: Spacing.xs },

  board:     { width: BOARD_W, borderWidth: 3, borderColor: '#7a5a3a', borderRadius: Radius.md, overflow: 'hidden', alignSelf: 'center', marginTop: Spacing.sm, ...Shadow.md },
  boardRow:  { flexDirection: 'row' },
  cell:      { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  cellSel:   { backgroundColor: '#f7ec6e' },
  cellLast:  { backgroundColor: '#e8d44d88' },
  piece:     {
    fontSize: CELL * 0.72, lineHeight: CELL * 0.95,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  targetDot: { position: 'absolute', width: CELL * 0.28, height: CELL * 0.28, borderRadius: CELL * 0.14, backgroundColor: 'rgba(34,90,34,0.55)' },
  targetRing:{ width: CELL * 0.92, height: CELL * 0.92, borderRadius: CELL * 0.46, backgroundColor: 'transparent', borderWidth: 3, borderColor: 'rgba(34,90,34,0.6)' },
  coordRank: { position: 'absolute', top: 1, left: 2, fontSize: Math.max(7, CELL * 0.2), color: 'rgba(0,0,0,0.45)', fontWeight: '700' },
  coordFile: { position: 'absolute', bottom: 0, right: 2, fontSize: Math.max(7, CELL * 0.2), color: 'rgba(0,0,0,0.45)', fontWeight: '700' },

  logCard:   { width: BOARD_W, marginTop: Spacing.lg, padding: Spacing.md },
  logTitle:  { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold, marginBottom: Spacing.xs },
  logLine:   { color: Colors.textSecondary, fontSize: Font.size.sm, lineHeight: 20 },
  chatWrap:  { width: BOARD_W, marginTop: Spacing.lg },

  promoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  promoCard: { padding: Spacing.md, width: '100%', maxWidth: 320, alignItems: 'center' },
  promoTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  promoRow:  { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  promoKey:  { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: LIGHT_SQ, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: DARK_SQ },
  promoGlyph: { fontSize: 34, color: '#1a1a1a' },
});
