import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { giftGemsThunk } from '@store/slices/gemsSlice';
import { Button, Input, Card } from '@components/ui/index';
import { Font, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
/**
 * Gift gems to a friend. A gift is NOT a sale — no money is involved, and
 * gems can never be converted to cash. Server enforces a daily gift cap,
 * blocks self-gifting, and validates the recipient.
 */
export default function GiftGemsScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const balance = useSelector((s: RootState) => s.gems.balance);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Inline feedback — Alert.alert is invisible on RN-Web, so we render it.
  const [error, setError] = useState<string | null>(null);

  const amountNum = parseInt(amount, 10);
  const valid = recipient.trim().length > 0 && amountNum > 0 &&
    (balance ? amountNum <= balance.balance : true);

  async function handleSend() {
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    const result = await dispatch(giftGemsThunk({
      recipient: recipient.trim(),
      amount: amountNum,
      note: note.trim() || undefined,
    }));
    setSubmitting(false);
    if (giftGemsThunk.fulfilled.match(result)) {
      router.back();
    } else {
      setError((result.payload as string) || t('gems.giftFailed'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('gems.gift') }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.subtitle}>{t('gems.giftTo')}</Text>
          <Text style={styles.balance}>{t('gems.balance')}: {balance?.balance ?? 0}</Text>

          <Input
            label={t('gems.recipient')}
            placeholder={t('gems.recipientPlaceholder')}
            value={recipient}
            onChangeText={(v) => { setRecipient(v); if (error) setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Input
            label={t('gems.amount')}
            placeholder="50"
            value={amount}
            onChangeText={(v) => { setAmount(v); if (error) setError(null); }}
            keyboardType="number-pad"
          />
          <Input
            label={t('gems.messageOptional')}
            placeholder="🎁"
            value={note}
            onChangeText={setNote}
            maxLength={200}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={t('gems.send')}
            onPress={handleSend}
            loading={submitting}
            disabled={!valid}
            style={styles.btn}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  flex:     { flex: 1, backgroundColor: Colors.bg },
  scroll:   { padding: Spacing.lg },
  card:     { padding: Spacing.lg },
  subtitle: { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.semi, marginBottom: 4 },
  balance:  { color: Colors.textMuted, fontSize: Font.size.sm, marginBottom: Spacing.lg },
  error:    { color: Colors.error, fontSize: Font.size.sm, marginTop: Spacing.sm },
  btn:      { marginTop: Spacing.md },
});
