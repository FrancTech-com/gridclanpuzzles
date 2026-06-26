import React, { useEffect, useState } from 'react';
import {
  Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { AppDispatch, RootState } from '@store/index';
import { logoutThunk } from '@store/slices/authSlice';
import { profileApi } from '@api/index';
import { confirm } from '@utils/confirm';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@i18n/index';
import { Button, Card, Input, LoadingSpinner, Separator } from '@components/ui/index';
import { RegisterGate } from '@components/AuthGate';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors, useTheme, type ThemePref } from '@theme/theme';
import type { UserProfile } from '@gridtypes/index';

const API_BASE_URL: string =
  Constants.expoConfig?.extra?.API_BASE_URL ?? 'https://api.gridclanpuzzle.win';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { pref, setPref } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const userId   = useSelector((s: RootState) => s.auth.userId);

  const [profile,    setProfile]    = useState<UserProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    profileApi.getProfile().then(r => {
      setProfile(r.data);
      setDisplayName(r.data.displayName ?? '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

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

  function handlePrivacyPolicy() {
    Linking.openURL(`${API_BASE_URL}/legal/privacy-policy.html`);
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

      {/* Profile details */}
      <Card style={styles.detailsCard}>
        <DetailRow label={t('profile.country')}  value={profile?.countryCode ?? '—'} />
        <DetailRow label={t('profile.role')}     value={profile?.role ?? 'USER'} />
        <DetailRow label={t('profile.verified')} value={profile?.emailVerified ? t('profile.emailVerified') : t('profile.notVerified')} />
        <DetailRow label={t('profile.memberSince')} value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—'} />
      </Card>

      {/* Theme */}
      <Text style={styles.sectionLabel}>{t('settings.theme', 'Theme')}</Text>
      <View style={styles.languageRow}>
        {(['system', 'light', 'dark'] as ThemePref[]).map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.languageBtn, pref === opt && styles.languageBtnActive]}
            onPress={() => setPref(opt)}
          >
            <Text style={[styles.languageText, pref === opt && styles.languageTextActive]}>
              {t(`settings.theme_${opt}`, opt)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

      {/* Privacy */}
      <Text style={styles.sectionLabel}>{t('settings.privacyAndData')}</Text>
      <Button title={t('settings.privacyPolicy')} variant="secondary"
        onPress={handlePrivacyPolicy} style={styles.actionBtn} />

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

  sectionLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.8 },

  languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  languageBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  languageBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  languageText: { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
  languageTextActive: { color: Colors.primary },

  actionBtn: { marginBottom: Spacing.sm },

  legalNote: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', lineHeight: 18, marginTop: Spacing.md },
});
