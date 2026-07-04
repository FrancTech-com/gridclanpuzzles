import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { voiceClient, type VoiceStatus } from '@webrtc/voiceClient';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * In-game GROUP voice control, pinned to the top-right of the game page.
 *
 * It's a voice room (any table size, 2-8): tap 🎙 to join, and you hear / are
 * heard by everyone else who joined. Idle shows a round mic button; in the room
 * it expands to a card with who's talking, plus Mute and Leave.
 * Web-only for now (renders nothing on native until react-native-webrtc lands).
 */
export function VoiceControl({ kind, gameId }: { kind: string; gameId: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const [status, setStatus] = useState<VoiceStatus>({
    state: 'idle', participants: [], muted: false, supported: true, error: null,
  });

  useEffect(() => {
    if (!userId || !gameId) return;
    voiceClient.start(kind, gameId, userId, setStatus);
    return () => voiceClient.stop();
  }, [kind, gameId, userId]);

  if (!status.supported) return null;  // web-only for now

  // Idle → round mic button to join. Surface a transient mic/socket error.
  if (status.state === 'idle') {
    if (status.error === 'signal-down' || status.error === 'mic-denied') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎙 {status.error === 'mic-denied'
            ? t('voice.micDenied', 'Allow microphone access to join')
            : t('voice.reconnecting', 'Reconnecting… try again in a moment')}</Text>
        </View>
      );
    }
    return (
      <TouchableOpacity style={styles.fab} onPress={() => voiceClient.joinRoom()} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>🎙</Text>
      </TouchableOpacity>
    );
  }

  if (status.state === 'connecting') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎙 {t('voice.joining', 'Joining voice…')}</Text>
        <TouchableOpacity style={[styles.smBtn, styles.neutral]} onPress={() => voiceClient.leaveRoom()}>
          <Text style={[styles.smBtnText, styles.neutralText]}>{t('voice.cancel', 'Cancel')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // connected — in the room
  const n = status.participants.length;
  const who = n === 0
    ? t('voice.aloneInRoom', 'Waiting for others to join…')
    : n <= 2
      ? status.participants.join(', ')
      : t('voice.nInRoom', { count: n, defaultValue: '{{count}} others in voice' });
  return (
    <View style={[styles.card, styles.cardLive]}>
      <View style={styles.liveRow}>
        <View style={[styles.liveDot, n > 0 && styles.liveDotOn]} />
        <Text style={styles.cardTitle} numberOfLines={1}>🔊 {who}</Text>
      </View>
      <View style={styles.cardBtns}>
        <TouchableOpacity style={[styles.smBtn, styles.neutral]} onPress={() => voiceClient.toggleMute()}>
          <Text style={[styles.smBtnText, styles.neutralText]}>{status.muted ? t('voice.muted', '🔇 Muted') : t('voice.mute', '🎙 Mute')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.smBtn, styles.decline]} onPress={() => voiceClient.leaveRoom()}>
          <Text style={styles.smBtnText}>{t('voice.leave', 'Leave')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  fab: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.primary,
    ...Shadow.md,
  },
  fabIcon: { fontSize: 20 },

  card: {
    minWidth: 150, maxWidth: 260,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, gap: Spacing.xs, ...Shadow.md,
  },
  cardLive: { borderColor: '#2a9d4a' },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, flexShrink: 1 },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textMuted },
  liveDotOn: { backgroundColor: '#e34' },

  cardBtns: { flexDirection: 'row', gap: Spacing.xs, justifyContent: 'flex-end' },
  smBtn:    { borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, alignItems: 'center' },
  smBtnText:{ color: '#fff', fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  decline:  { backgroundColor: '#b3402f' },
  neutral:  { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border },
  neutralText: { color: Colors.textSecondary },
});
