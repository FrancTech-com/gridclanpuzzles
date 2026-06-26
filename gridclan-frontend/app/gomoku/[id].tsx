import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gomokuApi, type GomokuView } from '@api/index';
import { subscribeGame } from '@websocket/gameSocket';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

const SIZE = 15;

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

  const load = useCallback(async () => {
    if (!id) return;
    const res = await gomokuApi.get(id).catch(() => null);
    if (res?.data) setGame(res.data);
    setLoading(false);
  }, [id]);

  // Load once, then live-update when the opponent plays/joins.
  useFocusEffect(useCallback(() => {
    load();
    if (!id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    subscribeGame('gomoku', id, () => { if (active) load(); })
      .then(unsub => { if (active) cleanup = unsub; else unsub(); });
    return () => { active = false; cleanup?.(); };
  }, [load, id]));

  async function tap(r: number, c: number) {
    if (!id || !game || busy || !game.yourTurn) return;
    if (game.board[r]?.[c] !== '.') return;
    setBusy(true);
    const res = await gomokuApi.move(id, r, c).catch((e: any) => {
      Alert.alert(t('gomoku.invalidMove', 'Invalid move'), e?.response?.data?.message ?? '');
      return null;
    });
    setBusy(false);
    if (res?.data) setGame(res.data);
  }

  async function shareCode() {
    if (!game) return;
    const msg = t('gomoku.shareMessage', { code: game.inviteCode, defaultValue: `Play Grid Connect with me! Code: {{code}}` });
    try {
      if (Platform.OS === 'web') {
        if ((navigator as any).share) await (navigator as any).share({ text: msg });
        else if ((navigator as any).clipboard) { await (navigator as any).clipboard.writeText(game.inviteCode); Alert.alert(t('gomoku.copied', 'Code copied')); }
      } else { await Share.share({ message: msg }); }
    } catch { /* cancelled */ }
  }

  const header = {
    headerShown: true, title: t('gomoku.title', 'Grid Connect'),
    headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
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
    ? (game.outcome === 'WON' ? `🏆 ${t('gomoku.youWon', 'You won!')}` : game.outcome === 'LOST' ? `😅 ${t('gomoku.youLost', 'You lost')}` : `🤝 ${t('gomoku.tie', 'Draw')}`)
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

        {waiting && (
          <Card style={styles.shareCard}>
            <Text style={styles.muted}>{t('gomoku.sharePrompt', 'Share this code so a friend can join:')}</Text>
            <Text selectable style={styles.code}>{game.inviteCode}</Text>
            <Button title={t('gomoku.shareCta', 'Share code')} onPress={shareCode} variant="secondary" style={{ marginTop: Spacing.sm }} />
          </Card>
        )}

        <View style={styles.board}>
          {Array.from({ length: SIZE }).map((_, r) => (
            <View key={r} style={styles.boardRow}>
              {Array.from({ length: SIZE }).map((__, c) => {
                const v = game.board[r]?.[c];
                return (
                  <TouchableOpacity key={c} activeOpacity={0.7} onPress={() => tap(r, c)} style={styles.cell}>
                    {v === '1' && <View style={[styles.stone, styles.stoneP1]} />}
                    {v === '2' && <View style={[styles.stone, styles.stoneP2]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {!complete && !waiting && !game.yourTurn && (
          <Text style={styles.muted}>{t('gomoku.notYourTurn', 'Wait for your friend to play.')}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, alignItems: 'center' },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  muted:     { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', marginTop: Spacing.sm },

  statusRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  statusText: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.semi },
  stoneDot:   { width: 14, height: 14, borderRadius: 7 },

  shareCard: { padding: Spacing.md, marginBottom: Spacing.md, width: BOARD_W, alignItems: 'center' },
  code:      { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, marginVertical: Spacing.xs },

  board:    { width: BOARD_W, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#c9a86a22', alignSelf: 'center' },
  boardRow: { flexDirection: 'row' },
  cell: {
    width: CELL, height: CELL,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stone:   { width: CELL * 0.78, height: CELL * 0.78, borderRadius: CELL },
  stoneP1: { backgroundColor: '#1b1b1b' },
  stoneP2: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#888' },
});
