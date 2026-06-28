import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { battleshipApi, type BattleshipView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { playSfx } from '@services/sound';
import { gameInviteLink, shareInvite } from '@utils/invite';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

const SIZE = 10;

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

  const load = useCallback(async () => {
    if (!id) return;
    const res = await battleshipApi.get(id).catch(() => null);
    if (res?.data) setGame(res.data);
    setLoading(false);
  }, [id]);

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
    const res = await battleshipApi.move(id, r, c).catch((e: any) => {
      Alert.alert(t('battleship.invalidMove', 'Invalid move'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) {
      setGame(res.data);
      const shot = res.data.lastShot;
      if (shot === 'WIN')        { playSfx('win');  Alert.alert(t('battleship.win', '🏆 You sank the whole fleet — you win!')); }
      else if (shot === 'SUNK')  { playSfx('hit');  Alert.alert(t('battleship.sunk', '💥 You sank a ship!')); }
      else if (shot === 'HIT')   playSfx('hit');
      else                       playSfx('move');
    }
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
  };

  if (loading) return <LoadingSpinner />;
  if (!game) return (
    <View style={styles.center}><Stack.Screen options={header} />
      <Text style={styles.muted}>{t('battleship.notFound', 'Game not found.')}</Text>
      <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={{ marginTop: Spacing.md }} />
    </View>
  );

  const complete = game.status === 'COMPLETE';
  const waiting = game.status === 'WAITING_FOR_OPPONENT';
  const statusText = complete
    ? (game.outcome === 'WON' ? `🏆 ${t('battleship.youWon', 'You won!')}` : game.outcome === 'LOST' ? `😅 ${t('battleship.youLost', 'You lost')}` : `🤝 ${t('battleship.tie', 'Draw')}`)
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

        {/* Enemy waters — tap to fire */}
        <Text style={styles.boardLabel}>{t('battleship.enemyWaters', 'Enemy waters')}</Text>
        <View style={styles.board}>
          {game.trackingBoard.map((row, r) => (
            <View key={r} style={styles.boardRow}>
              {row.split('').map((ch, c) => (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.7}
                  onPress={() => fire(r, c)}
                  style={[styles.cell, enemyCell(ch)]}
                >
                  {ch === 'X' && <Text style={styles.mark}>✸</Text>}
                  {ch === 'O' && <View style={styles.missDot} />}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Your fleet */}
        <Text style={[styles.boardLabel, { marginTop: Spacing.lg }]}>{t('battleship.yourFleet', 'Your fleet')}</Text>
        <View style={[styles.board, styles.boardOwn]}>
          {game.yourBoard.map((row, r) => (
            <View key={r} style={styles.boardRow}>
              {row.split('').map((ch, c) => (
                <View key={c} style={[styles.cell, ownCell(ch)]}>
                  {ch === 'X' && <Text style={styles.mark}>✸</Text>}
                  {ch === 'O' && <View style={styles.missDot} />}
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center' },

  statusText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.semi, marginBottom: Spacing.md, textAlign: 'center' },
  boardLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, alignSelf: 'flex-start', marginBottom: Spacing.xs },

  shareCard: { padding: Spacing.md, marginBottom: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },
  link:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginBottom: Spacing.xs },

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
  mark:      { color: '#fff', fontSize: CELL * 0.62, fontFamily: Font.family.displayBold },
  missDot:   { width: CELL * 0.28, height: CELL * 0.28, borderRadius: CELL, backgroundColor: Colors.textMuted },
});
