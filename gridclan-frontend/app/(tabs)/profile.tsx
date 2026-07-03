import React, { useEffect, useState } from 'react';
import {
  Alert, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { AppDispatch, RootState } from '@store/index';
import { logoutThunk } from '@store/slices/authSlice';
import { adsApi, profileApi, feedbackApi, type RankInfo } from '@api/index';
import { invalidateAdsStatus } from '@services/ads';
import { ConfirmAgeForm } from '@components/ConfirmAge';
import { confirm } from '@utils/confirm';
import { appInviteLink, shareInvite } from '@utils/invite';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@i18n/index';
import { Button, Card, Input, LoadingSpinner, Separator } from '@components/ui/index';
import { RegisterGate } from '@components/AuthGate';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { UserProfile } from '@gridtypes/index';

const API_BASE_URL: string =
  Constants.expoConfig?.extra?.API_BASE_URL ?? 'https://api.gridclanpuzzle.win';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const dispatch = useDispatch<AppDispatch>();
  const userId   = useSelector((s: RootState) => s.auth.userId);

  const [profile,    setProfile]    = useState<UserProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [rank,       setRank]       = useState<RankInfo | null>(null);
  const [feedback,   setFeedback]   = useState('');
  const [sendingFb,  setSendingFb]  = useState(false);
  const [fbSent,     setFbSent]     = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [personalizedAds, setPersonalizedAds] = useState(false);
  const [adsAgeKnown, setAdsAgeKnown] = useState(true);
  const [confirmingAge, setConfirmingAge] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    profileApi.getProfile().then(r => {
      setProfile(r.data);
      setDisplayName(r.data.displayName ?? '');
      setLoading(false);
    }).catch(() => setLoading(false));
    profileApi.getRank().then(r => setRank(r.data)).catch(() => {});
    adsApi.status().then(r => {
      setPersonalizedAds(r.data.personalizedConsent);
      setAdsAgeKnown(r.data.ageKnown !== false);
    }).catch(() => {});
  }, [userId]);

  async function handlePersonalizedAds(value: boolean) {
    // Turning personalised ads ON needs a known age first (one-time check for
    // accounts that predate the 18+ flag).
    if (value && !adsAgeKnown) { setConfirmingAge(true); return; }
    setPersonalizedAds(value);   // optimistic; server is the source of truth
    try {
      const r = await adsApi.consent(value);
      setPersonalizedAds(r.data.personalizedConsent);
      invalidateAdsStatus();     // next ad request picks up the new setting
    } catch {
      setPersonalizedAds(!value);
    }
  }

  async function handleSendFeedback() {
    if (!feedback.trim()) return;
    setSendingFb(true);
    try {
      await feedbackApi.send(feedback.trim());
      setFeedback('');
      setFbSent(true);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.error ?? t('feedback.error', 'Could not send. Please try again.'));
    }
    setSendingFb(false);
  }

  async function handleInviteFriends() {
    const link = appInviteLink(profile?.username ?? undefined);
    const name = profile?.displayName ?? profile?.username;
    await shareInvite({
      message: t('invite.message', {
        name: name ?? 'A friend',
        link,
        defaultValue: '{{name}} is challenging you on GridClan Puzzles! Play free, no install needed: {{link}}',
      }),
      link,
      onCopied: () => {
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2500);
      },
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await profileApi.updateProfile({ displayName });
      setProfile(p => p ? { ...p, displayName } : p);
      setEditing(false);
    } catch {}
    setSaving(false);
  }

  async function handleLogout() {
    const ok = await confirm({
      title:        t('profile.signOutConfirm'),
      confirmLabel: t('auth.logout'),
      cancelLabel:  t('common.cancel'),
      destructive:  true,
    });
    if (ok) dispatch(logoutThunk());
  }

  const [exporting, setExporting] = useState(false);

  /** GDPR / Uganda DPA right of access: download everything we hold as JSON.
   *  Web gets a file download; native opens the share sheet. */
  async function handleExportData() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await profileApi.exportData();
      const json = JSON.stringify(res.data, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gridclan-data-export.json';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: json, title: 'GridClan Puzzles data export' });
      }
    } catch {
      Alert.alert(t('common.error'), t('settings.exportFailed', 'Could not export your data. Please try again.'));
    }
    setExporting(false);
  }

  function handlePrivacyPolicy() {
    Linking.openURL(`${API_BASE_URL}/legal/privacy-policy.html`);
  }

  function handleTerms() {
    Linking.openURL(`${API_BASE_URL}/legal/terms-of-service.html`);
  }

  async function handleDeleteAccount() {
    const ok = await confirm({
      title:        t('settings.deleteAccount'),
      message:      t('profile.deleteWarning'),
      confirmLabel: t('profile.deleteConfirmBtn'),
      cancelLabel:  t('common.cancel'),
      destructive:  true,
    });
    if (!ok) return;
    try {
      await profileApi.deleteAccount();
      dispatch(logoutThunk());
    } catch (e: any) {
      Alert.alert(t('common.error'), e.response?.data?.message ?? t('errors.server'));
    }
  }

  if (!userId) return (
    <RegisterGate
      icon="👤"
      title={t('guest.profileTitle', 'Your profile')}
      subtitle={t('guest.profileSubtitle', 'Create an account to track your stats, points and settings.')}
    />
  );

  if (loading) return <LoadingSpinner />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.displayName ?? profile?.username ?? '?')[0].toUpperCase()}
          </Text>
        </View>
        {editing ? (
          <View style={styles.editRow}>
            <Input
              value={displayName}
              onChangeText={setDisplayName}
              style={styles.nameInput}
              autoFocus
            />
            <Button title={t('common.save')} onPress={handleSave} loading={saving} size="sm" style={styles.saveBtn} />
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.displayName}>{profile?.displayName ?? profile?.username ?? t('profile.player')}</Text>
            <Text style={styles.editHint}>{t('profile.tapToEdit')}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.username}>@{profile?.username ?? 'user'}</Text>
      </View>

      {/* Rank / progression */}
      {rank && (
        <Card style={styles.rankCard}>
          <View style={styles.rankHeader}>
            <Text style={styles.rankEmoji}>{rankEmoji(rank.rank)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rankName}>{t(`rank.${rank.rank.toLowerCase()}`, rank.rankLabel)}</Text>
              <Text style={styles.rankPts}>{rank.points.toLocaleString()} {t('common.pts', 'pts')}</Text>
            </View>
          </View>
          {rank.nextRank ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(rank.progress * 100)}%` }]} />
              </View>
              <Text style={styles.rankHint}>
                {t('rank.toNext', { points: rank.pointsToNext.toLocaleString(), next: rank.nextRankLabel, defaultValue: '{{points}} pts to {{next}}' })}
              </Text>
            </>
          ) : (
            <Text style={styles.rankHint}>{t('rank.maxed', 'Top rank reached 👑')}</Text>
          )}
          <Text style={styles.rankPerks}>
            {t('rank.perks', { gems: rank.gemsPerWin, hints: rank.soloHints, defaultValue: '⬡ {{gems}} gems / win · 💡 {{hints}} hints vs computer' })}
          </Text>
        </Card>
      )}

      {/* Achievements — lifetime wins/losses across all games */}
      <TouchableOpacity onPress={() => router.push('/achievements' as never)} activeOpacity={0.85}>
        <Card style={styles.achievementsCard}>
          <Text style={styles.achievementsIcon}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.achievementsTitle}>{t('achievements.title', 'Achievements')}</Text>
            <Text style={styles.achievementsSub}>{t('achievements.entryHint', 'Your wins & losses — solo, friends and tournaments')}</Text>
          </View>
          <Text style={styles.achievementsChevron}>›</Text>
        </Card>
      </TouchableOpacity>

      {/* Profile details */}
      <Card style={styles.detailsCard}>
        <DetailRow label={t('profile.country')}  value={profile?.countryCode ?? '—'} />
        <DetailRow label={t('profile.role')}     value={profile?.role ?? 'USER'} />
        <DetailRow label={t('profile.verified')} value={profile?.emailVerified ? t('profile.emailVerified') : t('profile.notVerified')} />
        <DetailRow label={t('profile.memberSince')} value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'} />
      </Card>

      {/* Theme & sound now live as floating toggles in the top corners (see
          FloatingControls), so they're one tap away on every tab page. */}

      {/* Language */}
      <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
      <View style={styles.languageRow}>
        {SUPPORTED_LANGUAGES.map(lang => (
          <TouchableOpacity
            key={lang.code}
            style={[styles.languageBtn, i18n.language === lang.code && styles.languageBtnActive]}
            onPress={() => changeLanguage(lang.code)}
          >
            <Text style={[styles.languageText, i18n.language === lang.code && styles.languageTextActive]}>
              {lang.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Invite friends */}
      <Text style={styles.sectionLabel}>{t('invite.title', 'Invite friends')}</Text>
      <Card style={styles.detailsCard}>
        <Text style={styles.fbHint}>
          {t('invite.hint', 'Share GridClan Puzzles with friends — they can play instantly in the browser, no install required.')}
        </Text>
        {inviteCopied && <Text style={styles.fbSent}>{t('invite.copied', 'Invite link copied to clipboard! 🔗')}</Text>}
        <Button title={t('invite.cta', 'Invite friends')} onPress={handleInviteFriends} size="sm" />
      </Card>

      {/* Feedback — goes straight to the admin team */}
      <Text style={styles.sectionLabel}>{t('feedback.title', 'Send feedback')}</Text>
      <Card style={styles.detailsCard}>
        <Text style={styles.fbHint}>{t('feedback.hint', 'Tell us what you think about the app and games. This goes straight to the team.')}</Text>
        <TextInput
          style={styles.fbInput}
          value={feedback}
          onChangeText={(v) => { setFeedback(v); setFbSent(false); }}
          placeholder={t('feedback.placeholder', 'Your comments…')}
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={2000}
        />
        {fbSent && <Text style={styles.fbSent}>{t('feedback.sent', 'Thanks! Your feedback was sent. 🙌')}</Text>}
        <Button title={t('feedback.send', 'Send feedback')} onPress={handleSendFeedback} loading={sendingFb} disabled={!feedback.trim()} size="sm" />
      </Card>

      {/* Privacy */}
      <Text style={styles.sectionLabel}>{t('settings.privacyAndData')}</Text>
      <Button title={t('settings.privacyPolicy')} variant="secondary"
        onPress={handlePrivacyPolicy} style={styles.actionBtn} />
      <Button title={t('settings.termsOfService', 'Terms of service')} variant="secondary"
        onPress={handleTerms} style={styles.actionBtn} />
      <Button title={t('settings.exportData', 'Export my data')} variant="secondary"
        onPress={handleExportData} loading={exporting} style={styles.actionBtn} />
      <View style={styles.settingRow}>
        <View style={styles.settingRowText}>
          <Text style={styles.settingRowTitle}>{t('settings.personalizedAds', 'Personalised ads')}</Text>
          <Text style={styles.settingRowHint}>
            {t('settings.personalizedAdsHint', 'Off = ads are non-personalised. Only applies to adult accounts.')}
          </Text>
        </View>
        <Switch
          value={personalizedAds}
          onValueChange={handlePersonalizedAds}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor="#ffffff"
        />
      </View>

      {/* One-time age confirmation (accounts that predate the 18+ flag) */}
      <Modal visible={confirmingAge} transparent animationType="fade"
             onRequestClose={() => setConfirmingAge(false)}>
        <View style={styles.ageBackdrop}>
          <View style={styles.ageCard}>
            <ConfirmAgeForm
              onDone={() => {
                setAdsAgeKnown(true);
                setConfirmingAge(false);
                handlePersonalizedAds(true);   // finish what the user started
              }}
              onCancel={() => setConfirmingAge(false)}
            />
          </View>
        </View>
      </Modal>

      <Separator />

      {/* Account actions */}
      <Button title={t('auth.logout')} variant="secondary" onPress={handleLogout} style={styles.actionBtn} />

      <Button
        title={t('settings.deleteAccount')}
        variant="danger"
        onPress={handleDeleteAccount}
        style={styles.actionBtn}
      />

      <Text style={styles.legalNote}>{t('profile.legalNote')}</Text>
    </ScrollView>
  );
}

function rankEmoji(rank: RankInfo['rank']): string {
  return rank === 'PROFESSIONAL' ? '👑' : rank === 'AMATEUR' ? '⭐' : '🌱';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const Colors = useColors();
  const detailStyles = React.useMemo(() => makeDetailStyles(Colors), [Colors]);
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const makeDetailStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { color: Colors.textMuted, fontSize: Font.size.sm },
  value: { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
});

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingTop: Spacing.xl + Spacing.lg },

  avatarSection: { alignItems: 'center', marginBottom: Spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText:  { color: Colors.textPrimary, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  displayName: { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold, textAlign: 'center' },
  editHint:    { color: Colors.textMuted,   fontSize: Font.size.xs, textAlign: 'center', marginTop: 2 },
  username:    { color: Colors.textMuted,   fontSize: Font.size.sm, marginTop: 4 },

  editRow:   { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginBottom: 4 },
  nameInput: { flex: 1, marginBottom: 0 },
  saveBtn:   { marginBottom: 0 },

  detailsCard: { marginBottom: Spacing.lg },

  achievementsCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, marginBottom: Spacing.lg,
  },
  achievementsIcon:    { fontSize: 28 },
  achievementsTitle:   { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  achievementsSub:     { color: Colors.textSecondary, fontSize: Font.size.xs, marginTop: 2 },
  achievementsChevron: { color: Colors.textSecondary, fontSize: 26, fontWeight: Font.weight.semi },

  rankCard:   { marginBottom: Spacing.lg },
  rankHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  rankEmoji:  { fontSize: 34 },
  rankName:   { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.black },
  rankPts:    { color: Colors.accent, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.surfaceHigh, overflow: 'hidden' },
  progressFill:  { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  rankHint:   { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 6 },
  rankPerks:  { color: Colors.textSecondary, fontSize: Font.size.xs, marginTop: Spacing.sm },

  fbHint:  { color: Colors.textMuted, fontSize: Font.size.sm, marginBottom: Spacing.sm },
  fbInput: {
    minHeight: 80, color: Colors.textPrimary, fontSize: Font.size.sm,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm,
    marginBottom: Spacing.sm, textAlignVertical: 'top',
  },
  fbSent:  { color: Colors.primary, fontSize: Font.size.sm, marginBottom: Spacing.sm },

  sectionLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 },

  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  languageBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  languageBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  languageText: { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
  languageTextActive: { color: Colors.primary },

  actionBtn: { marginBottom: Spacing.sm },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  settingRowText:  { flex: 1 },
  settingRowTitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.semi },
  settingRowHint:  { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },

  ageBackdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.overlay, padding: Spacing.xl,
  },
  ageCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg,
  },

  legalNote: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', lineHeight: 18, marginTop: Spacing.md },
});
