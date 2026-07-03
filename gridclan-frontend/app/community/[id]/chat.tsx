import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { chatClient } from '@websocket/chatClient';
import { communityApi, tournamentApi } from '@api/index';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { ChatMessage, CommunityMemberInfo, Tournament } from '@gridtypes/index';

export default function ChatScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { id: communityId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const userId  = useSelector((s: RootState) => s.auth.userId);

  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [members,     setMembers]     = useState<CommunityMemberInfo[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [text,        setText]        = useState('');
  const [status,      setStatus]      = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('CONNECTING');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!communityId) return;

    // Roster + community tournaments (independent of the chat socket).
    communityApi.members(communityId).then(r => setMembers(r.data)).catch(() => {});
    tournamentApi.byCommunity(communityId).then(r => setTournaments(r.data)).catch(() => {});

    let cleanup = () => {};
    let cancelled = false;
    (async () => {
      // Seed the saved history FIRST, then start streaming live messages on top.
      try {
        const r = await communityApi.messages(communityId);
        if (!cancelled) setMessages(r.data);
      } catch {}
      if (cancelled) return;
      chatClient.connect(
        communityId,
        msg => setMessages(prev => [...prev, msg]),
        s   => setStatus(s === 'CONNECTED' ? 'CONNECTED' : s === 'ERROR' ? 'ERROR' : 'DISCONNECTED')
      );
      cleanup = () => chatClient.disconnect();
    })();

    return () => { cancelled = true; cleanup(); };
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
        <Text style={styles.title} numberOfLines={1}>{name || t('community.chatTitle')}</Text>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      </View>

      {/* Member roster */}
      {members.length > 0 && (
        <View style={styles.membersWrap}>
          <Text style={styles.membersCount}>👥 {t('community.members', { count: members.length })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.membersRow}>
            {members.map(m => (
              <View key={m.userId} style={styles.memberChip}>
                <Text style={styles.memberName}>{m.displayName}</Text>
                {m.role === 'OWNER' && <Text style={styles.memberOwner}>★</Text>}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Community tournaments — join from here */}
      {tournaments.length > 0 && (
        <View style={styles.tournWrap}>
          <Text style={styles.tournLabel}>🏆 {t('community.tournaments', 'Tournaments')}</Text>
          {tournaments.map(tn => (
            <View key={tn.id} style={styles.tournRow}>
              <View style={styles.flex}>
                <Text style={styles.tournName} numberOfLines={1}>{tn.name}</Text>
                <Text style={styles.tournMeta}>{tn.status}</Text>
              </View>
              <TouchableOpacity style={styles.joinBtn} onPress={() => router.push(`/tournament/${tn.id}`)}>
                <Text style={styles.joinBtnText}>{t('community.joinTournament', 'Join')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

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

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  flex:      { flex: 1 },

  header:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { marginRight: Spacing.md },
  backText:  { color: Colors.primary, fontSize: Font.size.xl },
  title:     { flex: 1, color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.lg },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  membersWrap:  { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: Spacing.sm },
  membersCount: { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi, marginBottom: 6 },
  membersRow:   { gap: Spacing.xs, paddingRight: Spacing.md },
  memberChip:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  memberName:   { color: Colors.textPrimary, fontSize: Font.size.xs, fontWeight: Font.weight.medium },
  memberOwner:  { color: Colors.accent, fontSize: Font.size.xs },

  tournWrap:  { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.xs },
  tournLabel: { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi },
  tournRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  tournName:  { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  tournMeta:  { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },
  joinBtn:    { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  joinBtnText:{ color: Colors.textOnBrand, fontSize: Font.size.sm, fontWeight: Font.weight.bold },

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
