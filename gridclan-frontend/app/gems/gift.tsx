import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
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

  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const amountNum = parseInt(amount, 10);
  const valid = recipientId.trim().length > 0 && amountNum > 0 &&
    (balance ? amountNum <= balance.balance : true);

  async function handleSend() {
    if (!valid) return;
    setSubmitting(true);
    const result = await dispatch(giftGemsThunk({
      recipientId: recipientId.trim(),
      amount: amountNum,
      note: note.trim() || undefined,
    }));
    setSubmitting(false);
    if (giftGemsThunk.fulfilled.match(result)) {
      Alert.alert(t('gems.giftSent'));
      router.back();
    } else {
      Alert.alert(t('gems.giftFailed'), (result.payload as string) ?? '');
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
            placeholder="user-id"
            value={recipientId}
            onChangeText={setRecipientId}
            autoCapitalize="none"
          />
          <Input
            label={t('gems.amount')}
            placeholder="50"
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
          />
          <Input
            label={t('gems.messageOptional')}
            placeholder="🎁"
            value={note}
            onChangeText={setNote}
            maxLength={200}
          />

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
  btn:      { marginTop: Spacing.md },
});
