import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { voiceClient, type VoiceStatus } from '@webrtc/voiceClient';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * In-game voice control, pinned to the top-right of the game page.
 *
 * Idle: a round 🎙 button — tap it to ring your friend. The friend sees a small
 * "<name> wants to talk" card with Accept / Decline. While ringing / connecting /
 * on a call, the button expands into a compact card with the relevant controls.
 * Web-only for now (renders nothing on native until react-native-webrtc lands).
 */
export function VoiceControl({ kind, gameId }: { kind: string; gameId: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const [status, setStatus] = useState<VoiceStatus>({
    state: 'idle', peerName: null, muted: false, supported: true,
  });

  useEffect(() => {
    if (!userId || !gameId) return;
    voiceClient.start(kind, gameId, userId, setStatus);
    return () => voiceClient.stop();
  }, [kind, gameId, userId]);

  if (!status.supported) return null;  // web-only for now

  const peer = status.peerName ?? t('voice.friend', 'Your friend');

  // Idle → round mic button.
  if (status.state === 'idle') {
    return (
      <TouchableOpacity style={styles.fab} onPress={() => voiceClient.requestVoice()} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>🎙</Text>
      </TouchableOpacity>
    );
  }

  // Incoming ring → Accept / Decline card.
  if (status.state === 'incoming') {
    return (
      <View style={[styles.card, styles.cardHi]}>
        <Text style={styles.cardTitle}>🎙 {t('voice.requested', { name: peer, defaultValue: '{{name}} wants to talk' })}</Text>
        <View style={styles.cardBtns}>
          <TouchableOpacity style={[styles.smBtn, styles.accept]} onPress={() => voiceClient.accept()}>
            <Text style={styles.smBtnText}>{t('voice.accept', 'Accept')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smBtn, styles.decline]} onPress={() => voiceClient.decline()}>
            <Text style={styles.smBtnText}>{t('voice.decline', 'Decline')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status.state === 'requesting' || status.state === 'connecting') {
    const label = status.state === 'requesting'
      ? t('voice.ringing', 'Ringing your friend…')
      : t('voice.connecting', 'Connecting…');
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎙 {label}</Text>
        <TouchableOpacity style={[styles.smBtn, styles.neutral]} onPress={() => voiceClient.hangup()}>
          <Text style={[styles.smBtnText, styles.neutralText]}>{status.state === 'requesting' ? t('voice.cancel', 'Cancel') : t('voice.end', 'End')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // connected
  return (
    <View style={[styles.card, styles.cardLive]}>
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.cardTitle} numberOfLines={1}>{t('voice.onCall', { name: peer, defaultValue: 'On call · {{name}}' })}</Text>
      </View>
      <View style={styles.cardBtns}>
        <TouchableOpacity style={[styles.smBtn, styles.neutral]} onPress={() => voiceClient.toggleMute()}>
          <Text style={[styles.smBtnText, styles.neutralText]}>{status.muted ? t('voice.unmute', '🔇') : t('voice.mute', '🎙')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.smBtn, styles.decline]} onPress={() => voiceClient.hangup()}>
          <Text style={styles.smBtnText}>{t('voice.end', 'End')}</Text>
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
    minWidth: 150, maxWidth: 240,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, gap: Spacing.xs, ...Shadow.md,
  },
  cardHi:   { borderColor: Colors.primary },
  cardLive: { borderColor: '#2a9d4a' },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e34' },

  cardBtns: { flexDirection: 'row', gap: Spacing.xs, justifyContent: 'flex-end' },
  smBtn:    { borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, alignItems: 'center' },
  smBtnText:{ color: '#fff', fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  accept:   { backgroundColor: '#2a9d4a' },
  decline:  { backgroundColor: '#b3402f' },
  neutral:  { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border },
  neutralText: { color: Colors.textSecondary },
});
