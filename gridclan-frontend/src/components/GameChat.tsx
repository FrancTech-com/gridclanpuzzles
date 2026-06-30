import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { stompConnection } from '@websocket/stompClient';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

interface GameChatMessage {
  senderId:   string;
  senderName: string;
  content:    string;
  sentAt?:    string;
}

const MAX_KEPT = 40;   // messages retained in memory
const SHOWN    = 6;    // most-recent messages rendered (keeps the strip narrow)

/**
 * A slim in-game chat strip for the 2-player games. Shows the last few messages
 * and a one-line input so players can talk about the game without leaving it.
 * Ephemeral — relayed over the shared WebSocket, never persisted.
 */
export function GameChat({ kind, gameId }: { kind: string; gameId: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const [text, setText] = useState('');
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    stompConnection
      .subscribe(`/topic/game/${kind}/${gameId}/chat`, frame => {
        try {
          const m = JSON.parse(frame.body) as GameChatMessage;
          setMessages(prev => [...prev, m].slice(-MAX_KEPT));
        } catch (e) { console.warn('Game chat parse error', e); }
      })
      .then(unsub => { if (active) unsubRef.current = unsub; else unsub(); });
    return () => { active = false; unsubRef.current?.(); unsubRef.current = null; };
  }, [kind, gameId]);

  function send() {
    const content = text.trim();
    if (!content) return;
    stompConnection.publish(`/app/game/${kind}/${gameId}/chat`, JSON.stringify({ content }));
    setText('');
  }

  const recent = messages.slice(-SHOWN);

  return (
    <View style={styles.wrap}>
      <View style={styles.log}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>{t('gameChat.empty', 'Say hi 👋 — chat about the game here')}</Text>
        ) : (
          recent.map((m, i) => {
            const mine = m.senderId === userId;
            return (
              <View key={i} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && <Text style={styles.sender}>{m.senderName}</Text>}
                  <Text style={mine ? styles.textMine : styles.textTheirs}>{m.content}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          returnKeyType="send"
          placeholder={t('gameChat.placeholder', 'Message your opponent…')}
          placeholderTextColor={Colors.textMuted}
          maxLength={300}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={!text.trim()}>
          <Text style={[styles.sendText, !text.trim() && styles.sendDisabled]}>{t('gameChat.send', 'Send')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  wrap:  { width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, gap: Spacing.xs },

  log:   { gap: 3, minHeight: 28, justifyContent: 'flex-end' },
  empty: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', paddingVertical: Spacing.xs },

  bubbleRow:  { flexDirection: 'row' },
  rowMine:    { justifyContent: 'flex-end' },
  rowTheirs:  { justifyContent: 'flex-start' },
  bubble:     { maxWidth: '82%', borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  bubbleMine:   { backgroundColor: Colors.primary },
  bubbleTheirs: { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border },
  sender:     { color: Colors.textMuted, fontSize: 10, fontWeight: Font.weight.semi, marginBottom: 1 },
  textMine:   { color: Colors.textPrimary, fontSize: Font.size.sm },
  textTheirs: { color: Colors.textSecondary, fontSize: Font.size.sm },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  input: {
    flex: 1, color: Colors.textPrimary, fontSize: Font.size.sm,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  sendBtn:  { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.primary },
  sendText: { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  sendDisabled: { opacity: 0.5 },
});
