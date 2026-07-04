import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  monopolyApi, type MonopolyAction, type MonopolySquare, type MonopolyView,
} from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { TurnCountdown } from '@components/TurnCountdown';
import { GameResultOverlay } from '@components/GameResultOverlay';
import { PostGameAd } from '@components/PostGameAd';
import { GameChat } from '@components/GameChat';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * The Monopoly table (tournament matches; up to 8 players). The classic
 * 40-square ring drawn as an 11×11 grid; tap any square for details and
 * (on your turn) build / mortgage actions. The centre shows dice + actions.
 */

// One token colour per seat (up to 8 players).
const SEAT_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#6d4c41'];

const GROUP_COLORS: Record<string, string> = {
  BROWN: '#8b4513', LIGHT_BLUE: '#7ec8e3', PINK: '#ef5da8', ORANGE: '#f59e0b',
  RED: '#e53935', YELLOW: '#fdd835', GREEN: '#43a047', DARK_BLUE: '#1e40af',
  RAIL: '#374151', UTIL: '#64748b',
};

const TYPE_ICON: Record<string, string> = {
  GO: '🏁', CHANCE: '❓', CHEST: '📦', TAX: '💸', JAIL: '🚔', GO_TO_JAIL: '👮', FREE: '🅿️', RAIL: '🚂', UTIL: '💡',
};

/** Standard ring: 0 = GO bottom-right, anticlockwise → (row, col) in an 11×11 grid. */
function ringPos(i: number): [number, number] {
  if (i <= 10) return [10, 10 - i];
  if (i <= 20) return [20 - i, 0];
  if (i <= 30) return [0, i - 20];
  return [i - 30, 10];
}

export default function MonopolyGameScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const { width } = useWindowDimensions();
  const maxW = Math.min(width || 360, 520) - Spacing.md * 2;
  const cell = Math.floor(maxW / 11);
  const boardW = cell * 11;
  const styles = useMemo(() => makeStyles(Colors, cell, boardW), [Colors, cell, boardW]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [board, setBoard] = useState<MonopolySquare[] | null>(null);
  const [game, setGame] = useState<MonopolyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);   // square index
  const [showResult, setShowResult] = useState(false);
  const announced = useRef(false);

  useEffect(() => {
    monopolyApi.board().then(res => setBoard(res.data)).catch(() => null);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await monopolyApi.get(id).catch(() => null);
    if (res?.data) setGame(res.data);
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    subscribeGame('monopoly', id, () => { if (active) load(); })
      .then(unsub => { if (active) cleanup = unsub; else unsub(); });
    const poll = setInterval(() => { if (active) load(); }, 4000);
    return () => { active = false; cleanup?.(); clearInterval(poll); };
  }, [load, id]));

  useEffect(() => {
    if (game?.status === 'COMPLETE' && game.outcome && game.outcome !== 'SPECTATOR' && !announced.current) {
      announced.current = true;
      setShowResult(true);
      playSfx(game.outcome === 'WON' ? 'win' : 'lose');
    }
  }, [game?.status, game?.outcome]);

  const props = useMemo(() => {
    const map = new Map<number, { owner: number; houses: number; mortgaged: boolean }>();
    for (const p of game?.properties ?? []) map.set(p.square, p);
    return map;
  }, [game?.properties]);

  async function act(action: MonopolyAction, square?: number) {
    if (!id || busy) return;
    setBusy(true);
    const res = await monopolyApi.act(id, action, square).catch((e: any) => {
      Alert.alert(t('monopoly.cantDo', 'Not allowed'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) {
      setGame(res.data);
      playSfx(action === 'ROLL' ? 'move' : 'tap');
      if (action !== 'BUILD' && action !== 'SELL_HOUSE' && action !== 'MORTGAGE' && action !== 'UNMORTGAGE') {
        setDetail(null);
      }
    }
  }

  const header = {
    headerShown: true, title: t('monopoly.title', 'Grid Tycoon'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
  };

  if (loading || !board) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('monopoly.notFound', 'Table not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const spectator = game.spectator;
  const me = game.players[game.yourSeat];
  const current = game.players[game.current];
  const pendingSq = game.pendingSquare >= 0 ? board[game.pendingSquare] : null;

  // Tokens per square for rendering.
  const tokens = new Map<number, number[]>();
  game.players.forEach(p => {
    if (p.bankrupt) return;
    const list = tokens.get(p.pos) ?? [];
    list.push(p.seat);
    tokens.set(p.pos, list);
  });

  const detailSq = detail != null ? board[detail] : null;
  const detailProp = detail != null ? props.get(detail) : undefined;
  const myGroupComplete = detailSq?.group
    ? board.filter(s => s.group === detailSq.group && s.type === 'PROP')
        .every(s => props.get(s.index)?.owner === game.yourSeat)
    : false;

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Players strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: boardW }}>
          <View style={styles.playersRow}>
            {game.players.map(p => (
              <View key={p.seat} style={[styles.playerCard, p.current && styles.playerCardTurn, p.bankrupt && { opacity: 0.45 }]}>
                <View style={[styles.tokenDot, { backgroundColor: SEAT_COLORS[p.seat] }]} />
                <Text style={styles.playerName} numberOfLines={1}>
                  {p.seat === game.yourSeat ? t('monopoly.you', 'You') : p.name}
                  {p.inJail ? ' 🚔' : ''}
                </Text>
                <Text style={[styles.playerCash, p.bankrupt && styles.strike]}>${p.cash}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <Text style={styles.roundText}>
          {t('monopoly.round', { round: game.round, max: game.maxRounds, defaultValue: 'Round {{round}}/{{max}}' })}
          {complete
            ? ` · ${t('monopoly.wonBy', { name: game.winnerName ?? '—', defaultValue: '{{name}} wins!' })}`
            : ` · ${game.yourTurn ? t('monopoly.yourTurn', 'Your turn') : t('monopoly.turnOf', { name: current?.name ?? '…', defaultValue: "{{name}}'s turn" })}`}
        </Text>

        {spectator && !complete && (
          <Text style={styles.watchBanner}>👁 {t('monopoly.watching', "You're watching this table live")}</Text>
        )}

        {!complete && <TurnCountdown deadline={game.turnDeadline} />}

        {/* Board ring */}
        <View style={styles.board}>
          {Array.from({ length: 11 }).map((_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: 11 }).map((__, c) => {
                const idx = board.findIndex(sq => {
                  const [rr, cc] = ringPos(sq.index);
                  return rr === r && cc === c;
                });
                if (idx < 0) {
                  return <View key={c} style={[styles.cell, styles.cellInner]} />;
                }
                const sq = board[idx];
                const p = props.get(sq.index);
                const toks = tokens.get(sq.index) ?? [];
                const groupColor = sq.group ? GROUP_COLORS[sq.group] : undefined;
                return (
                  <TouchableOpacity
                    key={c}
                    activeOpacity={0.7}
                    onPress={() => setDetail(sq.index)}
                    style={[
                      styles.cell,
                      styles.cellSquare,
                      p && { borderColor: SEAT_COLORS[p.owner], borderWidth: 2 },
                      game.pendingSquare === sq.index && styles.cellPending,
                    ]}
                  >
                    {groupColor && <View style={[styles.groupBand, { backgroundColor: groupColor }]} />}
                    <Text style={styles.cellIcon}>
                      {sq.type === 'PROP'
                        ? (p && p.houses > 0 ? (p.houses === 5 ? '🏨' : '🏠'.repeat(Math.min(2, p.houses))) : '')
                        : TYPE_ICON[sq.type] ?? ''}
                    </Text>
                    {p?.mortgaged ? <Text style={styles.mortgaged}>⛔</Text> : null}
                    {toks.length > 0 && (
                      <View style={styles.tokenRow}>
                        {toks.slice(0, 4).map(seat => (
                          <View key={seat} style={[styles.tokenMini, { backgroundColor: SEAT_COLORS[seat] }]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Centre panel — dice + actions */}
          <View style={[styles.centerPanel, { width: cell * 9 - 8, height: cell * 9 - 8, left: cell + 4, top: cell + 4 }]}>
            <Text style={styles.dice}>
              {game.lastRoll[0] > 0 ? `🎲 ${game.lastRoll[0]} + ${game.lastRoll[1]} = ${game.lastRoll[0] + game.lastRoll[1]}` : '🎲'}
            </Text>

            {!complete && game.yourTurn && !spectator && (
              <View style={styles.actionsWrap}>
                {game.phase === 'ROLL' && me?.inJail && (
                  <>
                    <Text style={styles.jailText}>🚔 {t('monopoly.inJail', "You're in jail")}</Text>
                    <Button title={t('monopoly.payFine', 'Pay $50 fine')} onPress={() => act('PAY_JAIL')} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                    {(me?.jailCards ?? 0) > 0 && (
                      <Button title={t('monopoly.useCard', 'Use jail card')} onPress={() => act('USE_JAIL_CARD')} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                    )}
                  </>
                )}
                {(game.phase === 'ROLL' || (game.phase === 'MANAGE' && game.extraRoll)) && (
                  <Button title={game.extraRoll ? t('monopoly.rollAgain', 'Roll again (doubles!)') : t('monopoly.roll', 'Roll dice')} onPress={() => act('ROLL')} loading={busy} style={styles.actBtn} />
                )}
                {game.phase === 'BUY' && pendingSq && (
                  <>
                    <Button title={t('monopoly.buyFor', { name: pendingSq.name, price: pendingSq.price, defaultValue: 'Buy {{name}} — ${{price}}' })} onPress={() => act('BUY')} loading={busy} style={styles.actBtn} />
                    <Button title={t('monopoly.skipBuy', 'Pass')} onPress={() => act('SKIP_BUY')} variant="secondary" size="sm" style={styles.actBtn} disabled={busy} />
                  </>
                )}
                {game.phase === 'MANAGE' && !game.extraRoll && (
                  <Button title={t('monopoly.endTurn', 'End turn')} onPress={() => act('END_TURN')} loading={busy} variant="secondary" style={styles.actBtn} />
                )}
                {game.phase === 'MANAGE' && (
                  <Text style={styles.hintText}>{t('monopoly.manageHint', 'Tap your properties to build or mortgage')}</Text>
                )}
              </View>
            )}
            {!complete && !game.yourTurn && (
              <Text style={styles.hintText}>{t('monopoly.waitingTurn', { name: current?.name ?? '…', defaultValue: 'Waiting for {{name}}…' })}</Text>
            )}
            {complete && (
              <Text style={styles.jailText}>🏆 {game.winnerName ?? ''}</Text>
            )}
          </View>
        </View>

        {/* Event log */}
        <Card style={styles.logCard}>
          <Text style={styles.logTitle}>📜 {t('monopoly.events', 'Table events')}</Text>
          {game.log.slice(-12).reverse().map((line, i) => (
            <Text key={i} style={styles.logLine}>{line}</Text>
          ))}
        </Card>

        {!spectator && id && (
          <View style={styles.chatWrap}><GameChat kind="monopoly" gameId={id} /></View>
        )}
      </ScrollView>

      {/* Square detail sheet */}
      {detailSq && (
        <View style={styles.detailOverlay}>
          <Card style={styles.detailCard}>
            {detailSq.group && <View style={[styles.detailBand, { backgroundColor: GROUP_COLORS[detailSq.group] }]} />}
            <Text style={styles.detailTitle}>{detailSq.name}</Text>
            {detailProp && (
              <Text style={styles.detailOwner}>
                {t('monopoly.ownedBy', { name: game.players[detailProp.owner]?.name ?? '?', defaultValue: 'Owned by {{name}}' })}
                {detailProp.mortgaged ? ` · ${t('monopoly.mortgagedLabel', 'mortgaged')}` : ''}
                {detailProp.houses > 0 ? ` · ${detailProp.houses === 5 ? t('monopoly.hotel', 'hotel') : t('monopoly.houses', { count: detailProp.houses, defaultValue: '{{count}} houses' })}` : ''}
              </Text>
            )}
            {detailSq.price > 0 && <Text style={styles.detailLine}>{t('monopoly.price', 'Price')}: ${detailSq.price}</Text>}
            {detailSq.type === 'PROP' && (
              <>
                <Text style={styles.detailLine}>
                  {t('monopoly.rentTable', 'Rent')}: ${detailSq.rent[0]} · 🏠 ${detailSq.rent[1]}/${detailSq.rent[2]}/${detailSq.rent[3]}/${detailSq.rent[4]} · 🏨 ${detailSq.rent[5]}
                </Text>
                <Text style={styles.detailLine}>{t('monopoly.houseCost', 'House cost')}: ${detailSq.houseCost}</Text>
              </>
            )}

            {/* Manage actions on my own property, on my turn */}
            {game.yourTurn && !spectator && detailProp?.owner === game.yourSeat && game.phase !== 'BUY' && (
              <View style={styles.detailActions}>
                {detailSq.type === 'PROP' && !detailProp.mortgaged && detailProp.houses < 5 && myGroupComplete && (
                  <Button title={t('monopoly.build', 'Build (+${{cost}})', { cost: detailSq.houseCost })} onPress={() => act('BUILD', detailSq.index)} size="sm" style={styles.actBtn} disabled={busy} />
                )}
                {detailSq.type === 'PROP' && detailProp.houses > 0 && (
                  <Button title={t('monopoly.sellHouse', 'Sell house')} onPress={() => act('SELL_HOUSE', detailSq.index)} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                )}
                {!detailProp.mortgaged && detailProp.houses === 0 && (
                  <Button title={t('monopoly.mortgage', 'Mortgage (+${{v}})', { v: Math.floor(detailSq.price / 2) })} onPress={() => act('MORTGAGE', detailSq.index)} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                )}
                {detailProp.mortgaged && (
                  <Button title={t('monopoly.unmortgage', 'Unmortgage (-${{v}})', { v: Math.floor(detailSq.price / 2) + Math.floor(detailSq.price / 20) })} onPress={() => act('UNMORTGAGE', detailSq.index)} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                )}
              </View>
            )}
            <Button title={t('common.close', 'Close')} onPress={() => setDetail(null)} variant="ghost" style={{ marginTop: Spacing.sm }} />
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

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.md, alignItems: 'center', paddingBottom: Spacing.xxl },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center' },

  playersRow: { flexDirection: 'row', gap: Spacing.xs, paddingVertical: Spacing.xs },
  playerCard: { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, alignItems: 'center', minWidth: 74 },
  playerCardTurn: { borderColor: Colors.accent, borderWidth: 2 },
  tokenDot:   { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  playerName: { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi, maxWidth: 84 },
  playerCash: { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.black },
  strike:     { textDecorationLine: 'line-through', color: Colors.textMuted },

  roundText:  { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginVertical: Spacing.xs, textAlign: 'center' },
  watchBanner: { color: Colors.accent, fontSize: Font.size.sm, fontWeight: Font.weight.semi, textAlign: 'center', marginBottom: Spacing.xs },

  board:      { width: BOARD_W, height: BOARD_W, backgroundColor: '#0f2f1d', borderRadius: Radius.md, overflow: 'hidden', ...Shadow.md },
  boardRow:   { flexDirection: 'row' },
  cell:       { width: CELL, height: CELL },
  cellInner:  { backgroundColor: 'transparent' },
  cellSquare: { backgroundColor: '#e8f0dc', borderWidth: StyleSheet.hairlineWidth, borderColor: '#9aa88a', alignItems: 'center', justifyContent: 'center' },
  cellPending:{ borderColor: '#facc15', borderWidth: 3 },
  groupBand:  { position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(4, CELL * 0.2) },
  cellIcon:   { fontSize: Math.max(8, CELL * 0.34), lineHeight: Math.max(10, CELL * 0.42) },
  mortgaged:  { position: 'absolute', top: 0, right: 0, fontSize: Math.max(7, CELL * 0.25) },
  tokenRow:   { position: 'absolute', bottom: 1, flexDirection: 'row', gap: 1 },
  tokenMini:  { width: Math.max(5, CELL * 0.18), height: Math.max(5, CELL * 0.18), borderRadius: 99, borderWidth: 0.5, borderColor: '#00000055' },

  centerPanel: { position: 'absolute', backgroundColor: '#123a24', borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', padding: Spacing.sm },
  dice:        { color: '#ffffff', fontSize: Font.size.lg, fontWeight: Font.weight.black, marginBottom: Spacing.sm },
  actionsWrap: { alignItems: 'stretch', width: '86%', gap: Spacing.xs },
  actBtn:      { marginTop: Spacing.xs },
  jailText:    { color: '#facc15', fontSize: Font.size.sm, fontWeight: Font.weight.bold, textAlign: 'center' },
  hintText:    { color: '#cde3d2', fontSize: Font.size.xs, textAlign: 'center', marginTop: Spacing.xs },

  logCard:   { width: BOARD_W, marginTop: Spacing.md, padding: Spacing.md },
  logTitle:  { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold, marginBottom: Spacing.xs },
  logLine:   { color: Colors.textSecondary, fontSize: Font.size.xs, lineHeight: 18 },
  chatWrap:  { width: BOARD_W, marginTop: Spacing.md },

  detailOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  detailCard:  { padding: Spacing.md, width: '100%', maxWidth: 360 },
  detailBand:  { height: 10, borderRadius: Radius.sm, marginBottom: Spacing.sm },
  detailTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  detailOwner: { color: Colors.accent, fontSize: Font.size.sm, marginTop: 2 },
  detailLine:  { color: Colors.textSecondary, fontSize: Font.size.sm, marginTop: Spacing.xs },
  detailActions: { marginTop: Spacing.sm },
});
