import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { adsApi } from '@api/index';
import { invalidateAdsStatus } from '@services/ads';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOW_YEAR = new Date().getUTCFullYear();

/**
 * One-time "confirm your age" step for accounts created before registration
 * recorded the 18+ flag. Asks month + year (same as registration), sends the
 * date once, and the server keeps only the 18-or-older yes/no — the birthday
 * itself is never stored. Minors simply keep non-personalised ads; nothing
 * else about their account changes.
 */
export function ConfirmAgeForm({ onDone, onCancel }: {
  onDone: () => void;
  onCancel?: () => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [month, setMonth]   = useState(0);       // 1–12, 0 = unset
  const [year, setYear]     = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const y = parseInt(year, 10);
    if (!month || !y || y < NOW_YEAR - 100 || y > NOW_YEAR - 13) {
      setError(t('ads.ageInvalid', 'Please pick your birth month and a valid year.'));
      return;
    }
    setSaving(true); setError(null);
    try {
      await adsApi.confirmAge(`${y}-${String(month).padStart(2, '0')}-01`);
      invalidateAdsStatus();   // next status fetch sees ageKnown=true
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.message
        || t('ads.ageFailed', 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('ads.confirmAgeTitle', 'Confirm your age')}</Text>
      <Text style={styles.body}>
        {t('ads.confirmAgeBody',
          'One quick question so we show you the right kind of ads. We only save whether you are 18 or older — never your birthday.')}
      </Text>

      <Text style={styles.label}>{t('auth.month', 'Month')}</Text>
      <View style={styles.monthGrid}>
        {MONTHS_SHORT.map((m, i) => (
          <TouchableOpacity
            key={m}
            style={[styles.monthChip, month === i + 1 && styles.monthChipActive]}
            onPress={() => setMonth(i + 1)}
          >
            <Text style={[styles.monthText, month === i + 1 && styles.monthTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('auth.year', 'Year')}</Text>
      <TextInput
        style={styles.yearInput}
        value={year}
        onChangeText={(v) => setYear(v.replace(/[^0-9]/g, '').slice(0, 4))}
        placeholder={String(NOW_YEAR - 25)}
        placeholderTextColor={Colors.textMuted}
        keyboardType="number-pad"
        maxLength={4}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.btn} onPress={submit} disabled={saving} activeOpacity={0.85}>
        <Text style={styles.btnText}>
          {saving ? t('common.saving', 'Saving…') : t('common.confirm', 'Confirm')}
        </Text>
      </TouchableOpacity>
      {onCancel && (
        <TouchableOpacity onPress={onCancel} disabled={saving}>
          <Text style={styles.cancel}>{t('common.cancel', 'Cancel')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  wrap:  { alignItems: 'center', gap: Spacing.sm, alignSelf: 'stretch' },
  title: { color: Colors.textPrimary, fontSize: Font.size.lg, fontFamily: Font.family.displaySemi, textAlign: 'center' },
  body:  { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', lineHeight: 20 },
  label: { color: Colors.textSecondary, fontSize: Font.size.xs, fontWeight: Font.weight.semi,
           textTransform: 'uppercase', letterSpacing: 0.8, alignSelf: 'flex-start', marginTop: Spacing.xs },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center' },
  monthChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceHigh, minWidth: 52, alignItems: 'center',
  },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthText:       { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
  monthTextActive: { color: Colors.textOnBrand },
  yearInput: {
    alignSelf: 'stretch', textAlign: 'center',
    backgroundColor: Colors.surfaceHigh, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.sm, color: Colors.textPrimary, fontSize: Font.size.lg,
  },
  error: { color: Colors.error, fontSize: Font.size.sm, textAlign: 'center' },
  btn: {
    backgroundColor: Colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    minWidth: 180, alignItems: 'center', marginTop: Spacing.xs,
  },
  btnText: { color: Colors.textOnBrand, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  cancel:  { color: Colors.textMuted, fontSize: Font.size.sm, padding: Spacing.xs },
});

export default ConfirmAgeForm;
