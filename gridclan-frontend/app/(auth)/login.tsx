import React, { useState } from 'react';
import {
  Image, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { loginThunk, clearError } from '@store/slices/authSlice';
import { safeNextPath } from '@utils/invite';
import { Button, Input } from '@components/ui/index';
import { Font, Spacing, Radius } from '@theme/index';
import { useColors } from '@theme/theme';
export default function LoginScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((s: RootState) => s.auth);
  // Carried from an invite link so sign-in drops the user back into the game.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');

  async function handleLogin() {
    if (!identifier.trim() || !password) return;
    const result = await dispatch(loginThunk({ identifier: identifier.trim(), password }));
    if (loginThunk.fulfilled.match(result)) router.replace((safeNextPath(next) ?? '/(tabs)') as never);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>{t('common.appName')}</Text>
          <Text style={styles.subtitle}>{t('auth.signInSubtitle')}</Text>
        </View>

        <View style={styles.form}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => dispatch(clearError())}>
                <Text style={styles.errorDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          <Input
            label={t('auth.emailOrPhone')}
            placeholder="you@example.com"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />

          <Input
            label={t('auth.password')}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            {t('auth.forgotPassword')}
          </Link>

          <Button
            title={t('auth.login')}
            onPress={handleLogin}
            loading={isLoading}
            disabled={!identifier || !password}
            style={styles.submitBtn}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
          <Link href={{ pathname: '/(auth)/register', params: next ? { next } : {} }} style={styles.footerLink}>{t('auth.createOne')}</Link>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  flex:   { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, padding: Spacing.lg, justifyContent: 'center' },

  header: { alignItems: 'center', marginBottom: Spacing.xxl },
  logo:   { width: 96, height: 96, borderRadius: Radius.lg, marginBottom: Spacing.sm },
  title:  { fontSize: Font.size.xxl, fontWeight: Font.weight.black, color: Colors.textPrimary, letterSpacing: -1 },
  subtitle: { color: Colors.textMuted, fontSize: Font.size.md, marginTop: 4 },

  form: { gap: 0 },

  errorBox: {
    backgroundColor: Colors.error + '20',
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '40',
  },
  errorText:    { color: Colors.error, flex: 1, fontSize: Font.size.sm },
  errorDismiss: { color: Colors.error, fontSize: Font.size.md, paddingLeft: Spacing.sm },

  forgotLink: {
    color: Colors.primary,
    fontSize: Font.size.sm,
    textAlign: 'right',
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  submitBtn: { marginTop: Spacing.sm },

  footer:     { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.xl },
  footerText: { color: Colors.textMuted, fontSize: Font.size.sm },
  footerLink: { color: Colors.primary,   fontSize: Font.size.sm, fontWeight: Font.weight.semi },
});
