import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  monopolyApi, type MonopolyAction, type MonopolySquare, type MonopolyView,
  type MonopolyTradePayload,
} from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { confirm } from '@utils/confirm';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { TurnCountdown } from '@components/TurnCountdown';
import { VoiceControl } from '@components/VoiceControl';
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
  GO: '🏁', CHANCE: '❓', CHEST: '📦', TAX: '💸', JAIL: '🚔', GO_TO_JAIL: '👮', FREE: '🅿️', RAIL: '✈️', UTIL: '💡',
};

// Each city's airport-code initials + flag "picture", shown on its board tile.
const CITY_META: Record<string, { code: string; flag: string }> = {
  'Lagos':        { code: 'LAG', flag: '🇳🇬' },
  'Cairo':        { code: 'CAI', flag: '🇪🇬' },
  'Manila':       { code: 'MNL', flag: '🇵🇭' },
  'Jakarta':      { code: 'JKT', flag: '🇮🇩' },
  'Mumbai':       { code: 'BOM', flag: '🇮🇳' },
  'Cape Town':    { code: 'CPT', flag: '🇿🇦' },
  'Buenos Aires': { code: 'BUE', flag: '🇦🇷' },
  'São Paulo':    { code: 'SAO', flag: '🇧🇷' },
  'Bangkok':      { code: 'BKK', flag: '🇹🇭' },
  'Istanbul':     { code: 'IST', flag: '🇹🇷' },
  'Mexico City':  { code: 'MEX', flag: '🇲🇽' },
  'Berlin':       { code: 'BER', flag: '🇩🇪' },
  'Madrid':       { code: 'MAD', flag: '🇪🇸' },
  'Dubai':        { code: 'DXB', flag: '🇦🇪' },
  'Barcelona':    { code: 'BCN', flag: '🇪🇸' },
  'Amsterdam':    { code: 'AMS', flag: '🇳🇱' },
  'Singapore':    { code: 'SIN', flag: '🇸🇬' },
  'Sydney':       { code: 'SYD', flag: '🇦🇺' },
  'Tokyo':        { code: 'TYO', flag: '🇯🇵' },
  'London':       { code: 'LON', flag: '🇬🇧' },
  'Paris':        { code: 'PAR', flag: '🇫🇷' },
  'New York':     { code: 'NYC', flag: '🇺🇸' },
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

  // Auction bid entry (defaults to the minimum legal bid).
  const [bid, setBid] = useState<number | null>(null);
  // Trade builder state.
  const [tradeOpen, setTradeOpen] = useState(false);
  const [counterMode, setCounterMode] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<number | null>(null);
  const [giveProps, setGiveProps] = useState<number[]>([]);
  const [getProps, setGetProps] = useState<number[]>([]);
  const [giveCash, setGiveCash] = useState(0);
  const [getCash, setGetCash] = useState(0);
  // Player detail sheet (tap a player to see their holdings).
  const [playerDetail, setPlayerDetail] = useState<number | null>(null);

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

  function openTrade() {
    setCounterMode(false);
    setTradeTarget(null); setGiveProps([]); setGetProps([]); setGiveCash(0); setGetCash(0);
    setTradeOpen(true);
    playSfx('tap');
  }
  // Counter an incoming offer: open the builder pre-seeded with the deal mirrored,
  // ready to tweak. Submitting sends it back to the original proposer.
  function openCounter() {
    const inc = game?.trade;
    if (!inc) return;
    setCounterMode(true);
    setTradeTarget(inc.from);
    setGiveProps(inc.requestProps ?? []);   // I give what they wanted
    setGetProps(inc.offerProps ?? []);      // I want what they offered
    setGiveCash(inc.requestCash ?? 0);
    setGetCash(inc.offerCash ?? 0);
    setTradeOpen(true);
    playSfx('tap');
  }
  function submitTrade() {
    if (tradeTarget == null) return;
    act(counterMode ? 'COUNTER_TRADE' : 'PROPOSE_TRADE', { trade: {
      to: tradeTarget,
      offerProps: giveProps, requestProps: getProps,
      offerCash: giveCash || 0, requestCash: getCash || 0,
    } });
  }

  async function kick(seat: number) {
    const p = game?.players[seat];
    const ok = await confirm({
      title:        t('monopoly.disableTitle', 'Disable this player?'),
      message:      t('monopoly.disableMessage', '“{{name}}” has missed several turns. Their cash and property will be shared out among the remaining players.', { name: p?.name ?? '' }),
      confirmLabel: t('monopoly.disable', 'Disable'),
      cancelLabel:  t('common.cancel', 'Cancel'),
      destructive:  true,
    });
    if (!ok) return;
    setPlayerDetail(null);
    act('KICK', { target: seat });
  }

  async function act(action: MonopolyAction, opts?: { square?: number; amount?: number; trade?: MonopolyTradePayload; target?: number }) {
    if (!id || busy) return;
    setBusy(true);
    const res = await monopolyApi.act(id, action, opts).catch((e: any) => {
      Alert.alert(t('monopoly.cantDo', 'Not allowed'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) {
      setGame(res.data);
      playSfx(action === 'ROLL' ? 'move' : 'tap');
      const keepDetail = action === 'BUILD' || action === 'SELL_HOUSE' || action === 'MORTGAGE' || action === 'UNMORTGAGE';
      if (!keepDetail) setDetail(null);
      if (action === 'PROPOSE_TRADE' || action === 'COUNTER_TRADE') setTradeOpen(false);
    }
  }

  const header = {
    headerShown: true, title: t('monopoly.title', 'Grid Tycoon'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
    headerRight: () =>
      game && game.status === 'ACTIVE' && !game.spectator && id
        ? <VoiceControl kind="monopoly" gameId={id} />
        : null,
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

  // A property is tradable if it (and its whole colour group) is unbuilt.
  const groupBuilt = (sq: MonopolySquare) => sq.group != null &&
    board.some(o => o.group === sq.group && (props.get(o.index)?.houses ?? 0) > 0);
  const tradablesOf = (seat: number) => board.filter(sq =>
    (sq.type === 'PROP' || sq.type === 'RAIL' || sq.type === 'UTIL')
    && props.get(sq.index)?.owner === seat
    && (props.get(sq.index)?.houses ?? 0) === 0
    && !(props.get(sq.index)?.mortgaged && false)   // mortgaged still tradable
    && !groupBuilt(sq));

  const auction = game.auction;
  const trade = game.trade;
  const activeCount = game.players.filter(p => !p.bankrupt).length;
  const targetTradables = tradeTarget != null ? tradablesOf(tradeTarget) : [];
  const otherPlayers = game.players.filter(p => !p.bankrupt && p.seat !== game.yourSeat);

  return (
    <View style={styles.container}>
      <Stack.Screen options={header} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Players strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: boardW }}>
          <View style={styles.playersRow}>
            {game.players.map(p => (
              <TouchableOpacity
                key={p.seat}
                activeOpacity={0.8}
                onPress={() => setPlayerDetail(p.seat)}
                style={[styles.playerCard, p.current && styles.playerCardTurn, p.bankrupt && { opacity: 0.45 }]}
              >
                <View style={[styles.tokenDot, { backgroundColor: SEAT_COLORS[p.seat] }]} />
                <Text style={styles.playerName} numberOfLines={1}>
                  {p.seat === game.yourSeat ? t('monopoly.you', 'You') : p.name}
                  {p.inJail ? ' 🚔' : ''}{p.left ? ' 🚪' : p.timeouts >= 1 && !p.bankrupt ? ' ⏳' : ''}
                </Text>
                <Text style={[styles.playerCash, p.bankrupt && styles.strike]}>${p.cash}</Text>
              </TouchableOpacity>
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
                    {sq.type === 'PROP' && CITY_META[sq.name] ? (
                      // City tile: flag "picture" + airport-code initials, with any
                      // buildings overlaid on top.
                      <>
                        <Text style={styles.cityFlag}>{CITY_META[sq.name].flag}</Text>
                        <Text style={styles.cityCode} numberOfLines={1}>{CITY_META[sq.name].code}</Text>
                        {p && p.houses > 0 && (
                          <Text style={styles.cellBuild}>{p.houses === 5 ? '🏨' : '🏠'.repeat(Math.min(4, p.houses))}</Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.cellIcon}>{TYPE_ICON[sq.type] ?? ''}</Text>
                    )}
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
                {game.phase === 'MANAGE' && !trade && activeCount > 1 && (
                  <Button title={t('monopoly.proposeTrade', '🤝 Trade')} onPress={openTrade} size="sm" variant="ghost" style={styles.actBtn} disabled={busy} />
                )}
                {game.phase === 'MANAGE' && !game.extraRoll && (
                  <Button title={t('monopoly.endTurn', 'End turn')} onPress={() => act('END_TURN')} loading={busy} variant="secondary" style={styles.actBtn} />
                )}
                {game.phase === 'MANAGE' && (
                  <Text style={styles.hintText}>{t('monopoly.manageHint', 'Tap your properties to build or mortgage')}</Text>
                )}
              </View>
            )}
            {!complete && game.phase === 'AUCTION' && (
              <Text style={styles.jailText}>🔨 {t('monopoly.auctionOn', 'Auction in progress')}</Text>
            )}
            {!complete && !game.yourTurn && game.phase !== 'AUCTION' && (
              <Text style={styles.hintText}>{t('monopoly.waitingTurn', { name: current?.name ?? '…', defaultValue: 'Waiting for {{name}}…' })}</Text>
            )}
            {complete && (
              <Text style={styles.jailText}>🏆 {game.winnerName ?? ''}</Text>
            )}
          </View>
        </View>

        {/* Live auction — every player can bid in turn */}
        {!complete && auction && !spectator && (
          <Card style={styles.auctionCard}>
            <Text style={styles.auctionTitle}>🔨 {t('monopoly.auctionFor', { name: auction.squareName, defaultValue: 'Auction: {{name}}' })}</Text>
            <Text style={styles.auctionBid}>
              {auction.highBidder >= 0
                ? t('monopoly.highBid', { amount: auction.highBid, name: auction.highBidderName ?? '—', defaultValue: 'High bid ${{amount}} — {{name}}' })
                : t('monopoly.noBids', 'No bids yet')}
            </Text>
            {auction.yourBid ? (
              <>
                <View style={styles.bidRow}>
                  <Button title="–50" size="sm" variant="ghost" onPress={() => setBid(b => Math.max(auction.minBid, (b ?? auction.minBid) - 50))} style={styles.bidStep} disabled={busy} />
                  <Text style={styles.bidAmount}>${bid ?? auction.minBid}</Text>
                  <Button title="+50" size="sm" variant="ghost" onPress={() => setBid(b => Math.min(me?.cash ?? 0, (b ?? auction.minBid) + 50))} style={styles.bidStep} disabled={busy} />
                </View>
                <View style={styles.bidRow}>
                  <Button
                    title={t('monopoly.bid', 'Bid ${{amount}}', { amount: Math.max(auction.minBid, bid ?? auction.minBid) })}
                    onPress={() => { act('AUCTION_BID', { amount: Math.max(auction.minBid, bid ?? auction.minBid) }); setBid(null); }}
                    loading={busy} style={styles.actBtn}
                    disabled={(bid ?? auction.minBid) > (me?.cash ?? 0)}
                  />
                  <Button title={t('monopoly.auctionPass', 'Pass')} onPress={() => { act('AUCTION_PASS'); setBid(null); }} variant="secondary" size="sm" style={styles.actBtn} disabled={busy} />
                </View>
              </>
            ) : (
              <Text style={styles.auctionWait}>{t('monopoly.auctionWait', { name: auction.turnName ?? '…', defaultValue: 'Waiting for {{name}} to bid…' })}</Text>
            )}
          </Card>
        )}

        {/* Incoming trade offer — you can accept or decline */}
        {!complete && trade?.incoming && !spectator && (
          <Card style={styles.tradeBanner}>
            <Text style={styles.tradeTitle}>🤝 {t('monopoly.tradeFrom', { name: trade.fromName, defaultValue: '{{name}} offers a trade' })}</Text>
            <TradeSummary trade={trade} board={board} youAre="to" styles={styles} t={t} />
            <View style={styles.bidRow}>
              <Button title={t('monopoly.accept', 'Accept')} onPress={() => act('ACCEPT_TRADE')} loading={busy} style={styles.actBtn} />
              <Button title={t('monopoly.counter', 'Counter')} onPress={openCounter} variant="secondary" style={styles.actBtn} disabled={busy} />
              <Button title={t('monopoly.decline', 'Decline')} onPress={() => act('DECLINE_TRADE')} variant="ghost" style={styles.actBtn} disabled={busy} />
            </View>
          </Card>
        )}

        {/* Outgoing trade — waiting on the other player */}
        {!complete && trade?.outgoing && !spectator && (
          <Card style={styles.tradeBanner}>
            <Text style={styles.tradeTitle}>🤝 {t('monopoly.tradeSent', { name: trade.toName, defaultValue: 'Offer sent to {{name}}' })}</Text>
            <TradeSummary trade={trade} board={board} youAre="from" styles={styles} t={t} />
            <Button title={t('monopoly.cancelTrade', 'Cancel offer')} onPress={() => act('DECLINE_TRADE')} variant="secondary" size="sm" style={{ marginTop: Spacing.xs }} disabled={busy} />
          </Card>
        )}

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
                  <Button title={t('monopoly.build', 'Build (+${{cost}})', { cost: detailSq.houseCost })} onPress={() => act('BUILD', { square: detailSq.index })} size="sm" style={styles.actBtn} disabled={busy} />
                )}
                {detailSq.type === 'PROP' && detailProp.houses > 0 && (
                  <Button title={t('monopoly.sellHouse', 'Sell house')} onPress={() => act('SELL_HOUSE', { square: detailSq.index })} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                )}
                {!detailProp.mortgaged && detailProp.houses === 0 && (
                  <Button title={t('monopoly.mortgage', 'Mortgage (+${{v}})', { v: Math.floor(detailSq.price / 2) })} onPress={() => act('MORTGAGE', { square: detailSq.index })} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                )}
                {detailProp.mortgaged && (
                  <Button title={t('monopoly.unmortgage', 'Unmortgage (-${{v}})', { v: Math.floor(detailSq.price / 2) + Math.floor(detailSq.price / 20) })} onPress={() => act('UNMORTGAGE', { square: detailSq.index })} size="sm" variant="secondary" style={styles.actBtn} disabled={busy} />
                )}
              </View>
            )}
            <Button title={t('common.close', 'Close')} onPress={() => setDetail(null)} variant="ghost" style={{ marginTop: Spacing.sm }} />
          </Card>
        </View>
      )}

      {/* Trade builder */}
      {tradeOpen && !spectator && (
        <View style={styles.detailOverlay}>
          <Card style={styles.tradeCard}>
            <ScrollView>
              <Text style={styles.detailTitle}>🤝 {counterMode ? t('monopoly.counterTrade', 'Counter-offer') : t('monopoly.newTrade', 'Propose a trade')}</Text>

              <Text style={styles.tradeLabel}>
                {counterMode
                  ? t('monopoly.counterWith', 'Counter to {{name}}', { name: tradeTarget != null ? game.players[tradeTarget]?.name : '' })
                  : t('monopoly.tradeWith', 'Trade with')}
              </Text>
              {!counterMode && (
                <View style={styles.chipRow}>
                  {otherPlayers.map(p => (
                    <TouchableOpacity
                      key={p.seat}
                      style={[styles.pChip, tradeTarget === p.seat && styles.pChipSel]}
                      onPress={() => { setTradeTarget(p.seat); setGetProps([]); }}
                    >
                      <View style={[styles.tokenDot, { backgroundColor: SEAT_COLORS[p.seat] }]} />
                      <Text style={[styles.pChipText, tradeTarget === p.seat && { color: Colors.primary }]} numberOfLines={1}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {tradeTarget != null && (
                <>
                  <Text style={styles.tradeLabel}>{t('monopoly.youGive', 'You give')}</Text>
                  <PropPicker squares={tradablesOf(game.yourSeat)} selected={giveProps}
                    onToggle={sq => setGiveProps(g => g.includes(sq) ? g.filter(x => x !== sq) : [...g, sq])}
                    board={board} styles={styles} />
                  <CashStepper label={t('monopoly.plusCash', '+ your cash')} value={giveCash} max={me?.cash ?? 0}
                    onChange={setGiveCash} styles={styles} />

                  <Text style={styles.tradeLabel}>{t('monopoly.youGet', 'You get')}</Text>
                  <PropPicker squares={targetTradables} selected={getProps}
                    onToggle={sq => setGetProps(g => g.includes(sq) ? g.filter(x => x !== sq) : [...g, sq])}
                    board={board} styles={styles} />
                  <CashStepper label={t('monopoly.theirCash', '+ their cash')} value={getCash}
                    max={game.players[tradeTarget]?.cash ?? 0} onChange={setGetCash} styles={styles} />
                </>
              )}

              <View style={styles.bidRow}>
                <Button title={t('monopoly.sendOffer', 'Send offer')} onPress={submitTrade} loading={busy}
                  disabled={tradeTarget == null || (giveProps.length === 0 && getProps.length === 0 && !giveCash && !getCash)}
                  style={styles.actBtn} />
                <Button title={t('common.cancel', 'Cancel')} onPress={() => setTradeOpen(false)} variant="secondary" style={styles.actBtn} disabled={busy} />
              </View>
            </ScrollView>
          </Card>
        </View>
      )}

      {/* Player detail — their cash, net worth and properties */}
      {playerDetail != null && game.players[playerDetail] && (() => {
        const pl = game.players[playerDetail];
        const owned = game.properties.filter(pr => pr.owner === playerDetail);
        return (
          <View style={styles.detailOverlay}>
            <Card style={styles.detailCard}>
              <View style={styles.playerHeadRow}>
                <View style={[styles.tokenDot, { backgroundColor: SEAT_COLORS[pl.seat] }]} />
                <Text style={styles.detailTitle}>
                  {pl.seat === game.yourSeat ? t('monopoly.you', 'You') : pl.name}
                  {pl.left ? ` · ${t('monopoly.disabledTag', 'disabled')}` : pl.bankrupt ? ` · ${t('monopoly.bankruptTag', 'bankrupt')}` : ''}
                </Text>
              </View>
              <Text style={styles.detailLine}>💵 {t('monopoly.cash', 'Cash')}: ${pl.cash}   ·   📈 {t('monopoly.netWorth', 'Net worth')}: ${pl.netWorth}</Text>
              {pl.jailCards > 0 && <Text style={styles.detailLine}>🎟 {t('monopoly.jailCardsHeld', 'Jail cards')}: {pl.jailCards}</Text>}
              {pl.timeouts > 0 && !pl.bankrupt && (
                <Text style={[styles.detailLine, { color: Colors.error }]}>⏳ {t('monopoly.missedTurns', { count: pl.timeouts, defaultValue: 'Missed {{count}} turn(s) in a row' })}</Text>
              )}

              <Text style={styles.tradeLabel}>{t('monopoly.propertiesOwned', 'Properties')}</Text>
              {owned.length === 0 ? (
                <Text style={styles.tradeEmpty}>{t('monopoly.noProps', 'None yet')}</Text>
              ) : (
                <View style={styles.propOwnedWrap}>
                  {owned.map(pr => {
                    const sq = board[pr.square];
                    const g = sq.group ? GROUP_COLORS[sq.group] : Colors.border;
                    return (
                      <View key={pr.square} style={[styles.propOwnedChip, { borderLeftColor: g }]}>
                        <Text style={styles.propOwnedName} numberOfLines={1}>
                          {sq.name}{pr.houses === 5 ? ' 🏨' : pr.houses > 0 ? ` ${'🏠'.repeat(pr.houses)}` : ''}{pr.mortgaged ? ' ⛔' : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Disable a player who has stalled the table */}
              {pl.kickable && (
                <Button
                  title={t('monopoly.disable', 'Disable')}
                  onPress={() => kick(pl.seat)}
                  variant="secondary"
                  disabled={busy}
                  style={{ marginTop: Spacing.md }}
                />
              )}
              <Button title={t('common.close', 'Close')} onPress={() => setPlayerDetail(null)} variant="ghost" style={{ marginTop: Spacing.sm }} />
            </Card>
          </View>
        );
      })()}

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

// Read-only summary of a pending trade, from the viewer's perspective.
function TradeSummary({ trade, board, youAre, styles, t }: {
  trade: import('@api/index').MonopolyTradeView;
  board: MonopolySquare[];
  youAre: 'from' | 'to';
  styles: any;
  t: (k: string, d?: any) => string;
}) {
  // From the recipient's view, "you get" is what `from` offers.
  const youGetProps = youAre === 'to' ? trade.offerProps : trade.requestProps;
  const youGiveProps = youAre === 'to' ? trade.requestProps : trade.offerProps;
  const youGetCash = youAre === 'to' ? trade.offerCash : trade.requestCash;
  const youGiveCash = youAre === 'to' ? trade.requestCash : trade.offerCash;
  const names = (sqs?: number[]) => (sqs ?? []).map(s => board[s]?.name).filter(Boolean).join(', ') || '—';
  return (
    <View style={{ marginVertical: Spacing.xs }}>
      <Text style={styles.tradeLine}>⬅ {t('monopoly.youGet', 'You get')}: {names(youGetProps)}{youGetCash ? ` + $${youGetCash}` : ''}</Text>
      <Text style={styles.tradeLine}>➡ {t('monopoly.youGive', 'You give')}: {names(youGiveProps)}{youGiveCash ? ` + $${youGiveCash}` : ''}</Text>
    </View>
  );
}

// Toggle list of properties for the trade builder.
function PropPicker({ squares, selected, onToggle, board, styles }: {
  squares: MonopolySquare[];
  selected: number[];
  onToggle: (sq: number) => void;
  board: MonopolySquare[];
  styles: any;
}) {
  if (squares.length === 0) return <Text style={styles.tradeEmpty}>—</Text>;
  return (
    <View style={styles.chipRow}>
      {squares.map(sq => (
        <TouchableOpacity
          key={sq.index}
          style={[styles.propChip, selected.includes(sq.index) && styles.propChipSel]}
          onPress={() => onToggle(sq.index)}
        >
          <Text style={[styles.propChipText, selected.includes(sq.index) && { color: '#04120a' }]} numberOfLines={1}>{sq.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// $0-max cash stepper for the trade builder.
function CashStepper({ label, value, max, onChange, styles }: {
  label: string; value: number; max: number; onChange: (v: number) => void; styles: any;
}) {
  return (
    <View style={styles.cashRow}>
      <Text style={styles.cashLabel}>{label}</Text>
      <TouchableOpacity style={styles.cashBtn} onPress={() => onChange(Math.max(0, value - 50))}><Text style={styles.cashBtnText}>–</Text></TouchableOpacity>
      <Text style={styles.cashValue}>${value}</Text>
      <TouchableOpacity style={styles.cashBtn} onPress={() => onChange(Math.min(max, value + 50))}><Text style={styles.cashBtnText}>+</Text></TouchableOpacity>
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
  cityFlag:   { fontSize: Math.max(9, CELL * 0.38), lineHeight: Math.max(11, CELL * 0.46), marginTop: Math.max(3, CELL * 0.16) },
  cityCode:   { fontSize: Math.max(6, CELL * 0.22), lineHeight: Math.max(7, CELL * 0.26), fontWeight: '800', color: '#1b3a24' },
  cellBuild:  { position: 'absolute', bottom: Math.max(5, CELL * 0.2), fontSize: Math.max(5, CELL * 0.16) },
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

  // Auction
  auctionCard:  { width: BOARD_W, marginTop: Spacing.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.accent },
  auctionTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  auctionBid:   { color: Colors.accent, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: 2 },
  auctionWait:  { color: Colors.textMuted, fontSize: Font.size.sm, marginTop: Spacing.xs, textAlign: 'center' },
  bidRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  bidStep:      { minWidth: 54 },
  bidAmount:    { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.black },

  // Trade banners
  tradeBanner: { width: BOARD_W, marginTop: Spacing.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary },
  tradeTitle:  { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  tradeLine:   { color: Colors.textSecondary, fontSize: Font.size.sm, lineHeight: 20 },

  // Trade builder
  tradeCard:  { padding: Spacing.md, width: '100%', maxWidth: 400, maxHeight: '86%' },
  tradeLabel: { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: Spacing.md, marginBottom: Spacing.xs },
  tradeEmpty: { color: Colors.textMuted, fontSize: Font.size.sm },
  chipRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pChip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceHigh },
  pChipSel:   { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
  pChipText:  { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, maxWidth: 110 },
  propChip:   { paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceHigh },
  propChipSel:{ borderColor: Colors.primary, backgroundColor: Colors.primary },
  propChipText:{ color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi, maxWidth: 120 },
  cashRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  cashLabel:  { flex: 1, color: Colors.textSecondary, fontSize: Font.size.sm },
  cashBtn:    { width: 34, height: 34, borderRadius: Radius.sm, backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cashBtnText:{ color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  cashValue:  { minWidth: 60, textAlign: 'center', color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },

  // Player detail sheet
  playerHeadRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  propOwnedWrap:  { gap: Spacing.xs, marginTop: Spacing.xs },
  propOwnedChip:  { borderLeftWidth: 4, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.sm, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
  propOwnedName:  { color: Colors.textPrimary, fontSize: Font.size.sm },
});
