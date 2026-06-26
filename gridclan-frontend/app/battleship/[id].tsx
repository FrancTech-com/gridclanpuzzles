import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { battleshipApi, type BattleshipView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, Radius, Spacing } from '@theme/index';
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
    return () => { active = false; cleanup?.(); };
  }, [load, id]));

  async function fire(r: number, c: number) {
    if (!id || !game || busy || !game.yourTurn) return;
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
      if (shot === 'SUNK') Alert.alert(t('battleship.sunk', '💥 You sank a ship!'));
      else if (shot === 'WIN') Alert.alert(t('battleship.win', '🏆 You sank the whole fleet — you win!'));
    }
  }

  async function shareCode() {
    if (!game) return;
    const msg = t('battleship.shareMessage', { code: game.inviteCode, defaultValue: `Play Grid Battleships with me! Code: {{code}}` });
    try {
      if (Platform.OS === 'web') {
        if ((navigator as any).share) await (navigator as any).share({ text: msg });
        else if ((navigator as any).clipboard) { await (navigator as any).clipboard.writeText(game.inviteCode); Alert.alert(t('battleship.copied', 'Code copied')); }
      } else { await Share.share({ message: msg }); }
    } catch { /* cancelled */ }
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
            <Text style={styles.muted}>{t('battleship.sharePrompt', 'Share this code so a friend can join:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Button title={t('battleship.shareCta', 'Share code')} onPress={shareCode} variant="secondary" style={{ marginTop: Spacing.sm }} />
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
        <View style={styles.board}>
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

  board:    { width: BOARD_W, borderWidth: 1, borderColor: Colors.border, alignSelf: 'center' },
  boardRow: { flexDirection: 'row' },
  cell: {
    width: CELL, height: CELL,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cellWater: { backgroundColor: '#1f6f9e22' },
  cellShip:  { backgroundColor: Colors.textMuted },
  cellHit:   { backgroundColor: '#d6453f' },
  cellMiss:  { backgroundColor: Colors.surfaceHigh },
  mark:      { color: '#fff', fontSize: CELL * 0.6, fontWeight: Font.weight.bold },
  missDot:   { width: CELL * 0.28, height: CELL * 0.28, borderRadius: CELL, backgroundColor: Colors.textMuted },
});
