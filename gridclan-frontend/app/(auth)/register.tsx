import React, { useMemo, useState } from 'react';
import {
  FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { registerThunk, clearError } from '@store/slices/authSlice';
import { Button, Input, Card } from '@components/ui/index';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import { COUNTRIES, flagOf } from '@data/countries';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Selectable birth years: 13 (min age) to 100 years ago, most recent first.
const NOW_YEAR = new Date().getUTCFullYear();
const YEARS = Array.from({ length: 88 }, (_, i) => NOW_YEAR - 13 - i);

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
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((s: RootState) => s.auth);

  const [username,  setUsername]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [password,  setPassword]  = useState('');
  const [dobMonth,  setDobMonth]  = useState(0);            // 1-12, 0 = unset
  const [dobYear,   setDobYear]   = useState(0);            // full year, 0 = unset
  const [country,   setCountry]   = useState('');           // ISO code, none preselected
  const [dobError,  setDobError]  = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<'country' | 'month' | 'year' | null>(null);
  const [search,     setSearch]     = useState('');

  const selectedCountry = COUNTRIES.find(c => c.code === country);
  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

  // Day defaults to the 1st; the server re-validates the COPPA age gate.
  const dob = dobMonth && dobYear ? `${dobYear}-${String(dobMonth).padStart(2, '0')}-01` : '';

  async function handleRegister() {
    if (!email.trim() || !password) return;

    // COPPA pre-check — the server re-validates and is authoritative
    const age = ageFromDob(dob);
    if (age === null) { setDobError(t('auth.dobInvalid')); return; }
    if (age < 13)     { setDobError(t('auth.ageRestricted')); return; }
    setDobError(null);

    const result = await dispatch(registerThunk({
      username:          username.trim() || undefined,
      email:             email.trim(),
      phoneNumber:       phone.trim() || undefined,
      password,
      countryCode:       country,
      dateOfBirth:       dob,
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

        {/* COPPA age gate — month + year only (day defaults to the 1st);
            checked client-side, re-validated and never persisted by the server */}
        <Text style={styles.sectionLabel}>{`${t('auth.dateOfBirth')} *`}</Text>
        <View style={styles.dobRow}>
          <TouchableOpacity
            style={[styles.dobSelect, { flex: 1.4 }]}
            onPress={() => { setDobError(null); setActivePicker('month'); }}
          >
            <Text style={dobMonth ? styles.countrySelectText : styles.countryPlaceholder}>
              {dobMonth ? MONTHS[dobMonth - 1] : t('auth.month', 'Month')}
            </Text>
            <Text style={styles.countryChevron}>▾</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dobSelect, { flex: 1 }]}
            onPress={() => { setDobError(null); setActivePicker('year'); }}
          >
            <Text style={dobYear ? styles.countrySelectText : styles.countryPlaceholder}>
              {dobYear ? String(dobYear) : t('auth.year', 'Year')}
            </Text>
            <Text style={styles.countryChevron}>▾</Text>
          </TouchableOpacity>
        </View>
        {dobError && <Text style={styles.dobError}>{dobError}</Text>}

        {/* Country selector — searchable, any country */}
        <Text style={styles.sectionLabel}>{t('auth.yourCountry')}</Text>
        <TouchableOpacity
          style={styles.countrySelect}
          onPress={() => { setSearch(''); setActivePicker('country'); }}
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

      {/* Picker modal — country (searchable) / birth month / birth year */}
      <Modal
        visible={activePicker !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activePicker === 'country' ? t('auth.selectCountry', 'Select your country')
                  : activePicker === 'month' ? t('auth.month', 'Month')
                  : t('auth.year', 'Year')}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)} hitSlop={12}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {activePicker === 'country' && (
              <TextInput
                style={styles.modalSearch}
                placeholder={t('auth.searchCountry', 'Search country')}
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            {activePicker === 'country' && (
              <FlatList
                data={filteredCountries}
                keyExtractor={c => c.code}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.countryRow, country === item.code && styles.countryRowActive]}
                    onPress={() => { setCountry(item.code); setActivePicker(null); }}
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
            )}

            {activePicker === 'month' && (
              <FlatList
                data={MONTHS}
                keyExtractor={(m, i) => String(i)}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[styles.countryRow, dobMonth === index + 1 && styles.countryRowActive]}
                    onPress={() => { setDobMonth(index + 1); setActivePicker(null); }}
                  >
                    <Text style={styles.countryRowName}>{item}</Text>
                    {dobMonth === index + 1 && <Text style={styles.countryRowCheck}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            )}

            {activePicker === 'year' && (
              <FlatList
                data={YEARS}
                keyExtractor={y => String(y)}
                initialNumToRender={20}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.countryRow, dobYear === item && styles.countryRowActive]}
                    onPress={() => { setDobYear(item); setActivePicker(null); }}
                  >
                    <Text style={styles.countryRowName}>{item}</Text>
                    {dobYear === item && <Text style={styles.countryRowCheck}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
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

  dobRow:    { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  dobSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },

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
