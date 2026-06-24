import React, { useMemo, useState } from 'react';
import {
  FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { registerThunk, clearError } from '@store/slices/authSlice';
import { Button, Input, Card } from '@components/ui/index';
import { Colors, Font, Radius, Spacing } from '@theme/index';
import { COUNTRIES, flagOf } from '@data/countries';

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
  const [country,   setCountry]   = useState('');           // ISO code, none preselected
  const [dobError,  setDobError]  = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search,     setSearch]     = useState('');

  const selectedCountry = COUNTRIES.find(c => c.code === country);
  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

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
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
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

        {/* Country selector — searchable, any country */}
        <Text style={styles.sectionLabel}>{t('auth.yourCountry')}</Text>
        <TouchableOpacity
          style={styles.countrySelect}
          onPress={() => { setSearch(''); setPickerOpen(true); }}
        >
          {selectedCountry ? (
            <Text style={styles.countrySelectText}>
              {flagOf(selectedCountry.code)}  {selectedCountry.name}
            </Text>
          ) : (
            <Text style={styles.countryPlaceholder}>
              {t('auth.selectCountry', 'Select your country')}
            </Text>
          )}
          <Text style={styles.countryChevron}>▾</Text>
        </TouchableOpacity>

        <Button
          title={t('auth.register')}
          onPress={handleRegister}
          loading={isLoading}
          disabled={!email || !password || !dob || !country}
          style={styles.submitBtn}
        />

        <Text style={styles.legal}>{t('auth.legalNotice')}</Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.haveAccount')} </Text>
          <Link href="/(auth)/login" style={styles.footerLink}>{t('auth.login')}</Link>
        </View>

      </ScrollView>

      {/* Country picker modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('auth.selectCountry', 'Select your country')}</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              placeholder={t('auth.searchCountry', 'Search country')}
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              data={filteredCountries}
              keyExtractor={c => c.code}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryRow, country === item.code && styles.countryRowActive]}
                  onPress={() => { setCountry(item.code); setPickerOpen(false); }}
                >
                  <Text style={styles.countryRowFlag}>{flagOf(item.code)}</Text>
                  <Text style={styles.countryRowName}>{item.name}</Text>
                  {country === item.code && <Text style={styles.countryRowCheck}>✓</Text>}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.countryEmpty}>{t('auth.noCountryMatch', 'No match')}</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, padding: Spacing.lg },

  header: { alignItems: 'center', marginBottom: Spacing.xl, marginTop: Spacing.xl },
  logo:   { width: 84, height: 84, borderRadius: Radius.lg, marginBottom: Spacing.sm },
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

  countrySelect:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg },
  countrySelectText:  { color: Colors.textPrimary, fontSize: Font.size.md },
  countryPlaceholder: { color: Colors.textMuted, fontSize: Font.size.md },
  countryChevron:     { color: Colors.textMuted, fontSize: Font.size.md, marginLeft: Spacing.sm },

  modalBackdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, paddingTop: Spacing.md, maxHeight: '80%' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  modalTitle:    { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  modalClose:    { color: Colors.textMuted, fontSize: Font.size.lg },
  modalSearch:   { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, fontSize: Font.size.md },

  countryRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, gap: Spacing.md },
  countryRowActive: { backgroundColor: Colors.primary + '20' },
  countryRowFlag:   { fontSize: 22 },
  countryRowName:   { flex: 1, color: Colors.textPrimary, fontSize: Font.size.md },
  countryRowCheck:  { color: Colors.primary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  countryEmpty:     { color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg },

  submitBtn: { marginTop: Spacing.sm, marginBottom: Spacing.md },

  legal: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', lineHeight: 18 },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xl },
  footerText: { color: Colors.textMuted, fontSize: Font.size.sm },
  footerLink: { color: Colors.primary,   fontSize: Font.size.sm, fontWeight: Font.weight.semi },
});
