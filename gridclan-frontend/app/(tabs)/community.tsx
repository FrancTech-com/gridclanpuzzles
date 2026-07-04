import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { communityApi } from '@api/index';
import { communityInviteLink, shareInvite } from '@utils/invite';
import { confirm } from '@utils/confirm';
import { chatClient } from '@websocket/chatClient';
import { RootState } from '@store/index';
import { Button, Card, EmptyState, Input, LoadingSpinner } from '@components/ui/index';
import { RegisterGate } from '@components/AuthGate';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { ChatMessage, Community } from '@gridtypes/index';

// ── Community list tab ─────────────────────────────────────────────────────
export default function CommunityScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [name,        setName]        = useState('');
  const [desc,        setDesc]        = useState('');
  const [creating,    setCreating]    = useState(false);
  const [joiningId,   setJoiningId]   = useState<string | null>(null);
  const [copiedId,    setCopiedId]    = useState<string | null>(null);

  async function load() {
    try {
      const res = await communityApi.list();
      setCommunities(res.data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { if (userId) load(); }, [userId]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await communityApi.create(name.trim(), desc.trim() || undefined);
      setShowCreate(false);
      setName(''); setDesc('');
      await load();
    } catch {}
    setCreating(false);
  }

  async function handleJoin(communityId: string) {
    setJoiningId(communityId);
    try {
      await communityApi.join(communityId);
      await load();
    } catch {}
    setJoiningId(null);
  }

  async function handleDelete(c: Community) {
    const ok = await confirm({
      title:        t('community.deleteTitle', 'Delete this community?'),
      message:      t('community.deleteMessage', 'This permanently removes “{{name}}”, its members and chat history. This cannot be undone.', { name: c.name }),
      confirmLabel: t('common.delete', 'Delete'),
      cancelLabel:  t('common.cancel', 'Cancel'),
      destructive:  true,
    });
    if (!ok) return;
    try {
      await communityApi.remove(c.id);
      await load();
    } catch {}
  }

  // Share a tappable link that joins this community directly (see /j route).
  async function handleInvite(c: Community) {
    const link = communityInviteLink(c.id);
    await shareInvite({
      message: t('community.inviteMessage', {
        name: c.name, link,
        defaultValue: 'Join my community “{{name}}” on GridClan Puzzles! Tap to join: {{link}}',
      }),
      link,
      onCopied: () => {
        setCopiedId(c.id);
        setTimeout(() => setCopiedId(null), 2500);
      },
    });
  }

  if (!userId) return (
    <RegisterGate
      icon="👥"
      title={t('guest.communityTitle', 'Join the community')}
      subtitle={t('guest.communitySubtitle', 'Create an account to join communities, chat, and play with friends.')}
    />
  );

  if (loading) return <LoadingSpinner />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{t('tabs.community')}</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(!showCreate)}>
          <Text style={styles.createBtnText}>+ {t('community.new')}</Text>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <Card style={styles.createCard}>
          <Text style={styles.createTitle}>{t('community.createTitle')}</Text>
          <Input label={t('community.name')} placeholder="East Africa Puzzlers" value={name} onChangeText={setName} />
          <Input label={t('community.descriptionOptional')} placeholder="For puzzle fans across EA" value={desc} onChangeText={setDesc} />
          <Button title={t('community.create')} onPress={handleCreate} loading={creating} disabled={!name.trim()} />
        </Card>
      )}

      {communities.length === 0 ? (
        <EmptyState
          icon="👥"
          title={t('community.noneYet')}
          subtitle={t('community.noneYetSubtitle')}
        />
      ) : (
        <View style={styles.communityGrid}>
        {communities.map(c => (
          <Card key={c.id} style={styles.communityCard}>
            <Text style={styles.communityName}>{c.name}</Text>
            {c.description && <Text style={styles.communityDesc}>{c.description}</Text>}
            <View style={styles.communityStats}>
              <Text style={styles.communityStatText}>{t('community.members', { count: c.memberCount })}</Text>
              <Text style={styles.communityStatText}>⬡ {t('community.pool', { points: c.weeklyPoolPts.toLocaleString() })}</Text>
            </View>
            {c.isMember ? (
              <>
                <View style={styles.memberRow}>
                  <TouchableOpacity
                    style={[styles.chatBtn, styles.memberRowMain]}
                    onPress={() => router.push({ pathname: '/community/[id]/chat', params: { id: c.id, name: c.name } })}
                  >
                    <Text style={styles.chatBtnText}>💬 {t('community.openChat')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.inviteBtn} onPress={() => handleInvite(c)}>
                    <Text style={styles.chatBtnText}>🔗 {t('community.invite', 'Invite')}</Text>
                  </TouchableOpacity>
                </View>
                {copiedId === c.id && (
                  <Text style={styles.copiedText}>{t('community.inviteCopied', 'Invite link copied! Send it to a friend.')}</Text>
                )}
              </>
            ) : (
              <Button
                title={t('community.join')}
                onPress={() => handleJoin(c.id)}
                loading={joiningId === c.id}
                size="sm"
              />
            )}
            {c.canDelete && (
              <TouchableOpacity onPress={() => handleDelete(c)} style={styles.deleteLink}>
                <Text style={styles.deleteLinkText}>🗑 {t('community.delete', 'Delete community')}</Text>
              </TouchableOpacity>
            )}
          </Card>
        ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl + Spacing.lg },

  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  pageTitle:    { color: Colors.textPrimary, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  createBtn:    { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  createBtnText: { color: Colors.textPrimary, fontWeight: Font.weight.semi, fontSize: Font.size.sm },

  createCard:  { marginBottom: Spacing.lg },
  createTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold, marginBottom: Spacing.md },

  communityGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  communityCard:   { flexGrow: 1, flexBasis: 320, minWidth: 280, marginBottom: 0 },
  communityName:   { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  communityDesc:   { color: Colors.textMuted,   fontSize: Font.size.sm, marginTop: 4 },
  communityStats:  { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  communityStatText: { color: Colors.textSecondary, fontSize: Font.size.sm },
  chatBtn:         { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  chatBtnText:     { color: Colors.primary, fontWeight: Font.weight.semi },
  memberRow:       { flexDirection: 'row', gap: Spacing.sm },
  memberRowMain:   { flex: 1 },
  inviteBtn:       { backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  copiedText:      { color: Colors.primary, fontSize: Font.size.xs, marginTop: Spacing.xs, textAlign: 'center' },
  deleteLink:      { marginTop: Spacing.sm, alignSelf: 'center' },
  deleteLinkText:  { color: Colors.error, fontSize: Font.size.xs, fontWeight: Font.weight.semi },
});
