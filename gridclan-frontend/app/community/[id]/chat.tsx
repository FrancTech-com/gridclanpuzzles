import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, SafeAreaView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { chatClient } from '@websocket/chatClient';
import { Colors, Font, Radius, Spacing } from '@theme/index';
import type { ChatMessage } from '@gridtypes/index';

export default function ChatScreen() {
  const { t } = useTranslation();
  const { id: communityId } = useLocalSearchParams<{ id: string }>();
  const userId  = useSelector((s: RootState) => s.auth.userId);

  const [messages,   setMessages]   = useState<ChatMessage[]>([]);
  const [text,       setText]       = useState('');
  const [status,     setStatus]     = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('CONNECTING');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!communityId) return;
    chatClient.connect(
      communityId,
      msg => setMessages(prev => [...prev, msg]),
      s   => setStatus(s === 'CONNECTED' ? 'CONNECTED' : s === 'ERROR' ? 'ERROR' : 'DISCONNECTED')
    );
    return () => chatClient.disconnect();
  }, [communityId]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !communityId || !chatClient.isConnected) return;
    chatClient.send(communityId, trimmed);
    setText('');
  }

  const statusColor = { CONNECTING: Colors.warning, CONNECTED: Colors.accent, DISCONNECTED: Colors.textMuted, ERROR: Colors.error }[status];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('community.chatTitle')}</Text>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item: msg }) => {
            const isMe     = msg.senderId === userId;
            const isSystem = msg.type === 'SYSTEM' || msg.type === 'JOIN' || msg.type === 'LEAVE';

            if (isSystem) return (
              <View style={styles.systemMsg}>
                <Text style={styles.systemText}>{msg.content}</Text>
              </View>
            );

            return (
              <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                {!isMe && <Text style={styles.msgSender}>{msg.senderName}</Text>}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  <Text style={styles.bubbleText}>{msg.content}</Text>
                </View>
                <Text style={styles.msgTime}>
                  {new Date(msg.sentAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={t('community.messagePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || status !== 'CONNECTED') && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || status !== 'CONNECTED'}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  flex:      { flex: 1 },

  header:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { marginRight: Spacing.md },
  backText:  { color: Colors.primary, fontSize: Font.size.xl },
  title:     { flex: 1, color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.lg },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  messageList: { padding: Spacing.md, gap: Spacing.sm },

  systemMsg:  { alignItems: 'center', marginVertical: 4 },
  systemText: { color: Colors.textMuted, fontSize: Font.size.xs, backgroundColor: Colors.surfaceHigh, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },

  msgRow:    { gap: 4 },
  msgRowMe:  { alignItems: 'flex-end' },
  msgSender: { color: Colors.textMuted, fontSize: Font.size.xs, marginLeft: Spacing.sm },

  bubble:    { maxWidth: '80%', borderRadius: Radius.lg, padding: Spacing.sm, paddingHorizontal: Spacing.md },
  bubbleMe:  { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleThem:{ backgroundColor: Colors.surfaceHigh, borderBottomLeftRadius: 4 },
  bubbleText:{ color: Colors.textPrimary, fontSize: Font.size.md, lineHeight: 20 },
  msgTime:   { color: Colors.textMuted, fontSize: 10 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: Spacing.md, gap: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1, backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, color: Colors.textPrimary,
    fontSize: Font.size.md, maxHeight: 120,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.surfaceHigh },
  sendIcon:        { color: Colors.textPrimary, fontSize: Font.size.md },
});
