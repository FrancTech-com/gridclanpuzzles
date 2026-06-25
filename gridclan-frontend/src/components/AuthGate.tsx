import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@components/ui/index';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
/**
 * Full-screen prompt shown to guests on registration-gated tabs
 * (community, tournaments, gems, profile).
 */
export function RegisterGate({ icon, title, subtitle }: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.gate}>
      <Text style={styles.gateIcon}>{icon}</Text>
      <Text style={styles.gateTitle}>{title}</Text>
      <Text style={styles.gateSubtitle}>{subtitle}</Text>
      <Button
        title={t('auth.register')}
        onPress={() => router.push('/(auth)/register')}
        style={styles.gateBtn}
      />
      <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.gateLogin}>
          {t('auth.haveAccount')} <Text style={styles.gateLoginLink}>{t('auth.login')}</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Inline banner nudging a guest to register (e.g. after the solo trial limit). */
export function RegisterBanner({ message }: { message: string }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{message}</Text>
      <Button
        title={t('auth.register')}
        size="sm"
        onPress={() => router.push('/(auth)/register')}
      />
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  gate: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, backgroundColor: Colors.bg,
  },
  gateIcon:     { fontSize: 56, marginBottom: Spacing.md },
  gateTitle:    { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold, textAlign: 'center' },
  gateSubtitle: { color: Colors.textSecondary, fontSize: Font.size.md, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.lg, lineHeight: 22 },
  gateBtn:      { alignSelf: 'stretch' },
  gateLogin:    { color: Colors.textMuted, fontSize: Font.size.sm, marginTop: Spacing.lg },
  gateLoginLink:{ color: Colors.primary, fontWeight: Font.weight.semi },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.primary + '18',
    borderWidth: 1, borderColor: Colors.primary + '40',
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.lg,
  },
  bannerText: { flex: 1, color: Colors.textPrimary, fontSize: Font.size.sm, lineHeight: 18 },
});
