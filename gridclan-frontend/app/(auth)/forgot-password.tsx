import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi } from '@api/auth';
import { Button, Input } from '@components/ui/index';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
type Step = 'REQUEST' | 'VERIFY';

export default function ForgotPasswordScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const [step,        setStep]        = useState<Step>('REQUEST');
  const [identifier,  setIdentifier]  = useState('');
  const [otp,         setOtp]         = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);

  async function handleRequest() {
    if (!identifier.trim()) return;
    setLoading(true); setError('');
    try {
      await authApi.forgotPassword(identifier.trim());
      setStep('VERIFY');
    } catch {
      setError(t('errors.server'));
    }
    setLoading(false);
  }

  async function handleReset() {
    if (!otp || !newPassword) return;
    setLoading(true); setError('');
    try {
      await authApi.resetPassword(identifier.trim(), otp.trim(), newPassword);
      setSuccess(true);
      setTimeout(() => router.replace('/(auth)/login'), 2000);
    } catch (e: any) {
      setError(e.response?.data?.message ?? t('auth.otpInvalid'));
    }
    setLoading(false);
  }

  if (success) return (
    <View style={styles.centered}>
      <Text style={styles.successIcon}>✓</Text>
      <Text style={styles.successText}>{t('auth.passwordUpdated')}</Text>
      <Text style={styles.successSub}>{t('auth.redirecting')}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>{step === 'REQUEST' ? t('auth.resetPassword') : t('auth.enterCode')}</Text>
        <Text style={styles.subtitle}>
          {step === 'REQUEST'
            ? t('auth.resetSubtitle')
            : t('auth.verifySubtitle', { identifier })}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 'REQUEST' ? (
          <>
            <Input label={t('auth.emailOrPhone')} placeholder="you@example.com"
              value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
            <Button title={t('auth.sendCode')} onPress={handleRequest} loading={loading}
              disabled={!identifier.trim()} style={styles.btn} />
          </>
        ) : (
          <>
            <Input label={t('auth.sixDigitCode')} placeholder="000000" value={otp}
              onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
            <Input label={t('auth.newPassword')} placeholder={t('auth.passwordPlaceholder')}
              value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <Button title={t('auth.setNewPassword')} onPress={handleReset} loading={loading}
              disabled={otp.length !== 6 || newPassword.length < 8} style={styles.btn} />
          </>
        )}

        <Link href="/(auth)/login" style={styles.back}>← {t('auth.backToSignIn')}</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  flex:     { flex: 1, backgroundColor: Colors.bg },
  scroll:   { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },
  logo:     { width: 84, height: 84, borderRadius: Radius.lg, alignSelf: 'center', marginBottom: Spacing.md },
  title:    { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold, textAlign: 'center', marginBottom: 8 },
  subtitle: { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 20 },
  error:    { color: Colors.error, fontSize: Font.size.sm, textAlign: 'center', marginBottom: Spacing.md },
  btn:      { marginTop: Spacing.sm, marginBottom: Spacing.lg },
  back:     { color: Colors.primary, textAlign: 'center', fontSize: Font.size.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  successIcon: { fontSize: 64, color: Colors.accent, marginBottom: Spacing.md },
  successText: { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold },
  successSub:  { color: Colors.textMuted, marginTop: 8 },
});
