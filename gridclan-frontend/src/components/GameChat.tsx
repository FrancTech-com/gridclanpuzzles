import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { gameChatApi, type GameChatMessageView } from '@api/index';
import { stompConnection } from '@websocket/stompClient';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * In-game chat for the 2-player games — now reliable and scrollable.
 *
 * Delivery is dual-path, deduped by message id:
 *   fast: the shared WebSocket topic (instant when the socket is up)
 *   safe: REST — history loads on entry, sending POSTs (never silently lost
 *         like a publish on a dead socket), and a 4s poll picks up anything
 *         the socket missed (same fallback pattern as game moves).
 *
 * The log shows the whole conversation (up to 200 messages) in a scrollable
 * strip pinned to the newest message.
 */
const POLL_MS   = 4000;
const MAX_KEPT  = 200;

export function GameChat({ kind, gameId }: { kind: string; gameId: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const [messages, setMessages] = useState<GameChatMessageView[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Merge by id — WS and REST can deliver the same message; order by sentAt.
  const merge = useCallback((incoming: GameChatMessageView[]) => {
    if (incoming.length === 0) return;
    setMessages(prev => {
      const byId = new Map(prev.map(m => [m.id, m]));
      let changed = false;
      for (const m of incoming) {
        if (m?.id && !byId.has(m.id)) { byId.set(m.id, m); changed = true; }
      }
      if (!changed) return prev;
      return [...byId.values()]
        .sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0))
        .slice(-MAX_KEPT);
    });
  }, []);

  // History on entry + 4s polling fallback.
  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const fetchAll = () =>
      gameChatApi.history(kind, gameId)
        .then(res => { if (active) merge(res.data); })
        .catch(() => { /* transient — the next poll retries */ });
    fetchAll();
    const poll = setInterval(fetchAll, POLL_MS);
    return () => { active = false; clearInterval(poll); };
  }, [kind, gameId, merge]);

  // WebSocket fast path.
  useEffect(() => {
    if (!gameId) return;
    let active = true;
    stompConnection
      .subscribe(`/topic/game/${kind}/${gameId}/chat`, frame => {
        try { merge([JSON.parse(frame.body) as GameChatMessageView]); }
        catch (e) { console.warn('Game chat parse error', e); }
      })
      .then(unsub => { if (active) unsubRef.current = unsub; else unsub(); });
    return () => { active = false; unsubRef.current?.(); unsubRef.current = null; };
  }, [kind, gameId, merge]);

  // Send over REST — reliable even when the WebSocket is down. The response is
  // merged immediately; the WS copy (if any) dedupes away.
  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true); setSendError(false);
    try {
      const res = await gameChatApi.send(kind, gameId, content);
      merge([res.data]);
      setText('');
    } catch {
      setSendError(true);   // keep the text so the player can retry
    }
    setSending(false);
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.log}
        contentContainerStyle={styles.logContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {messages.length === 0 ? (
          <Text style={styles.empty}>{t('gameChat.empty', 'Say hi 👋 — chat about the game here')}</Text>
        ) : (
          messages.map(m => {
            const mine = m.senderId === userId;
            return (
              <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && <Text style={styles.sender}>{m.senderName}</Text>}
                  <Text style={mine ? styles.textMine : styles.textTheirs}>{m.content}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {sendError && (
        <Text style={styles.error}>{t('gameChat.sendFailed', 'Message not sent — check your connection and tap Send again.')}</Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={v => { setText(v); if (sendError) setSendError(false); }}
          onSubmitEditing={send}
          returnKeyType="send"
          placeholder={t('gameChat.placeholder', 'Message your opponent…')}
          placeholderTextColor={Colors.textMuted}
          maxLength={300}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={!text.trim() || sending}>
          <Text style={[styles.sendText, (!text.trim() || sending) && styles.sendDisabled]}>
            {sending ? t('gameChat.sending', '…') : t('gameChat.send', 'Send')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  wrap:  { width: '100%', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, gap: Spacing.xs },

  log:        { maxHeight: 240, minHeight: 34 },
  logContent: { gap: 3, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', paddingVertical: Spacing.xs },

  bubbleRow:  { flexDirection: 'row' },
  rowMine:    { justifyContent: 'flex-end' },
  rowTheirs:  { justifyContent: 'flex-start' },
  bubble:     { maxWidth: '82%', borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  bubbleMine:   { backgroundColor: Colors.primary },
  bubbleTheirs: { backgroundColor: Colors.surfaceHigh, borderWidth: 1, borderColor: Colors.border },
  sender:     { color: Colors.textMuted, fontSize: 10, fontWeight: Font.weight.semi, marginBottom: 1 },
  textMine:   { color: Colors.textOnBrand, fontSize: Font.size.sm },
  textTheirs: { color: Colors.textSecondary, fontSize: Font.size.sm },

  error: { color: Colors.error, fontSize: Font.size.xs, textAlign: 'center' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  input: {
    flex: 1, color: Colors.textPrimary, fontSize: Font.size.sm,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  sendBtn:  { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, backgroundColor: Colors.primary },
  sendText: { color: Colors.textOnBrand, fontWeight: Font.weight.bold, fontSize: Font.size.sm },
  sendDisabled: { opacity: 0.5 },
});
