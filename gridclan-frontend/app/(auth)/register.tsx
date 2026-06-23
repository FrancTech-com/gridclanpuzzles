import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { registerThunk, clearError } from '@store/slices/authSlice';
import { Button, Input, Card } from '@components/ui/index';
import { Colors, Font, Radius, Spacing } from '@theme/index';

type CountryCode = 'UG' | 'KE' | 'TZ';

const COUNTRIES: { label: string; value: CountryCode; flag: string }[] = [
  { label: 'Uganda',   value: 'UG', flag: '🇺🇬' },
  { label: 'Kenya',    value: 'KE', flag: '🇰🇪' },
  { label: 'Tanzania', value: 'TZ', flag: '🇹🇿' },
];

/** YYYY-MM-DD, a real past date. Returns the age in whole years, or null. */
function ageFromDob(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const date = new Date(dob + 'T00:00:00Z');
  if (isNaN(date.getTime()) || dob !== date.toISOString().slice(0, 10)) return null;
  const now = new Date();
  if (date >= now) return null;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) age--;
  return age;
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((s: RootState) => s.auth);

  const [username,  setUsername]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [password,  setPassword]  = useState('');
  const [dob,       setDob]       = useState('');
  const [marketing, setMarketing] = useState(false);
  const [country,   setCountry]   = useState<CountryCode>('UG');
  const [dobError,  setDobError]  = useState<string | null>(null);

  async function handleRegister() {
    if (!email.trim() || !password) return;

    // COPPA pre-check — the server re-validates and is authoritative
    const age = ageFromDob(dob.trim());
    if (age === null) { setDobError(t('auth.dobInvalid')); return; }
    if (age < 13)     { setDobError(t('auth.ageRestricted')); return; }
    setDobError(null);

    const result = await dispatch(registerThunk({
      username:          username.trim() || undefined,
      email:             email.trim(),
      phoneNumber:       phone.trim() || undefined,
      password,
      countryCode:       country,
      dateOfBirth:       dob.trim(),
      marketingConsent:  marketing,
    }));
    if (registerThunk.fulfilled.match(result)) router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Text style={styles.logo}>⬡</Text>
          <Text style={styles.title}>{t('auth.joinTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.createSubtitle')}</Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Input label={t('auth.usernameOptional')} placeholder="puzzleplayer99"
          value={username} onChangeText={setUsername} autoCapitalize="none" />

        <Input label={`${t('auth.email')} *`} placeholder="you@example.com"
          value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" />

        <Input label={t('auth.phoneOptional')} placeholder="+256700000000"
          value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        <Input label={`${t('auth.password')} *`} placeholder={t('auth.passwordPlaceholder')}
          value={password} onChangeText={setPassword} secureTextEntry />

        {/* COPPA age gate — date is checked, sent once, never persisted */}
        <Input label={`${t('auth.dateOfBirth')} *`} placeholder="2000-01-31"
          value={dob} onChangeText={(v) => { setDob(v); setDobError(null); }}
          keyboardType="numbers-and-punctuation" autoCapitalize="none" />
        {dobError && <Text style={styles.dobError}>{dobError}</Text>}

        {/* GDPR marketing consent — explicit opt-in, off by default */}
        <View style={styles.consentRow}>
          <Switch value={marketing} onValueChange={setMarketing}
            trackColor={{ true: Colors.primary }} />
          <Text style={styles.consentText}>{t('auth.marketingOptIn')}</Text>
        </View>

        {/* Country selector */}
        <Text style={styles.sectionLabel}>{t('auth.yourCountry')}</Text>
        <View style={styles.currencyRow}>
          {COUNTRIES.map(c => (
            <TouchableOpacity
              key={c.value}
              style={[styles.currencyBtn, country === c.value && styles.currencyBtnActive]}
              onPress={() => setCountry(c.value)}
            >
              <Text style={styles.currencyFlag}>{c.flag}</Text>
              <Text style={[styles.currencyLabel, country === c.value && styles.currencyLabelActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Button
          title={t('auth.register')}
          onPress={handleRegister}
          loading={isLoading}
          disabled={!email || !password || !dob}
          style={styles.submitBtn}
        />

        <Text style={styles.legal}>{t('auth.legalNotice')}</Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.haveAccount')} </Text>
          <Link href="/(auth)/login" style={styles.footerLink}>{t('auth.login')}</Link>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, padding: Spacing.lg },

  header: { alignItems: 'center', marginBottom: Spacing.xl, marginTop: Spacing.xl },
  logo:   { fontSize: 48, color: Colors.primary, marginBottom: Spacing.sm },
  title:  { fontSize: Font.size.xxl, fontWeight: Font.weight.black, color: Colors.textPrimary },
  subtitle: { color: Colors.textMuted, fontSize: Font.size.md },

  errorBox: {
    backgroundColor: Colors.error + '20', borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.error + '40',
  },
  errorText: { color: Colors.error, fontSize: Font.size.sm },

  sectionLabel: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.medium, marginBottom: Spacing.sm },

  dobError: { color: Colors.error, fontSize: Font.size.xs, marginTop: -Spacing.sm, marginBottom: Spacing.md },

  consentRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  consentText: { color: Colors.textSecondary, fontSize: Font.size.sm, flex: 1 },

  currencyRow:       { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  currencyBtn:       { flex: 1, alignItems: 'center', padding: Spacing.md, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  currencyBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '20' },
  currencyFlag:      { fontSize: 24, marginBottom: 4 },
  currencyLabel:     { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  currencyLabelActive: { color: Colors.primary },

  submitBtn: { marginTop: Spacing.sm, marginBottom: Spacing.md },

  legal: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', lineHeight: 18 },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xl },
  footerText: { color: Colors.textMuted, fontSize: Font.size.sm },
  footerLink: { color: Colors.primary,   fontSize: Font.size.sm, fontWeight: Font.weight.semi },
});
