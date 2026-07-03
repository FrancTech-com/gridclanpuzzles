import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '@store/index';
import { walletApi } from '@api/index';
import { Card, EmptyState, LoadingSpinner, Separator } from '@components/ui/index';
import { RegisterGate } from '@components/AuthGate';
import { AdModal } from '@components/AdModal';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { WalletBalance, WithdrawalRecord } from '@gridtypes/index';

/**
 * Wallet tab — the real-cash prize balance (separate from gems, which have no
 * cash value). Money lands here from ad rewards and the welcome bonus, and
 * leaves via mobile-money withdrawals. This tab is the money home screen:
 * balance, earn (watch an ad), withdraw, and recent payouts.
 */
export default function WalletScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const [balances, setBalances] = useState<WalletBalance[] | null>(null);
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAd, setShowAd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([walletApi.balances(), walletApi.history(10)]);
      setBalances(b.data);
      setHistory(h.data);
    } catch { setBalances((prev) => prev ?? []); }
  }, []);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!userId) return (
    <RegisterGate
      icon="💰"
      title={t('guest.walletTitle', 'Your prize wallet')}
      subtitle={t('guest.walletSubtitle', 'Create an account to earn real money by watching ads and withdraw it to mobile money.')}
    />
  );

  if (balances === null) return <LoadingSpinner />;

  const fmt = (n: number, cur: string) => `${cur} ${n.toLocaleString()}`;
  const hasMoney = balances.some((b) => b.balance > 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Balance hero */}
      <Card style={styles.hero}>
        <View style={styles.balanceRow}>
          <Ionicons name="wallet" size={28} color={Colors.primary} />
          {balances.length === 0
            ? <Text style={styles.balanceValue}>0</Text>
            : balances.map((b) => (
                <Text key={b.currency} style={styles.balanceValue}>{fmt(b.balance, b.currency)}</Text>
              ))}
        </View>
        <Text style={styles.balanceLabel}>{t('wallet.balance', 'Prize winnings')}</Text>
        <Text style={styles.explainer}>
          {t('wallet.explainer', 'Real money — earn it by watching ads, withdraw it to mobile money. Gems are separate and can’t be cashed out.')}
        </Text>
        {balances.map((b) => (
          <Text key={b.currency} style={styles.lifetime}>
            {t('wallet.lifetime', 'Earned {{earned}} · Withdrawn {{withdrawn}}', {
              earned: fmt(b.lifetimeEarned, b.currency),
              withdrawn: fmt(b.lifetimeWithdrawn, b.currency),
            })}
          </Text>
        ))}
      </Card>

      {/* Actions */}
      <TouchableOpacity style={styles.earnBtn} onPress={() => setShowAd(true)}>
        <Ionicons name="play-circle" size={20} color={Colors.textOnBrand} />
        <Text style={styles.earnBtnText}>{t('wallet.earn', 'Watch an ad · earn money')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.withdrawBtn, !hasMoney && styles.btnDisabled]}
        onPress={() => router.push('/wallet/withdraw' as never)}
      >
        <Ionicons name="cash-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.withdrawBtnText}>{t('wallet.withdraw', 'Withdraw to mobile money')}</Text>
      </TouchableOpacity>

      {/* Recent withdrawals */}
      <Text style={styles.sectionTitle}>{t('wallet.recent', 'Recent withdrawals')}</Text>
      {history.length === 0 ? (
        <EmptyState icon="cash-outline" title={t('wallet.noWithdrawals', 'No withdrawals yet — watch ads to grow your balance.')} />
      ) : (
        <Card style={styles.historyCard}>
          {history.map((w, i) => (
            <View key={w.reference}>
              {i > 0 && <Separator />}
              <View style={styles.txRow}>
                <View style={styles.txLeft}>
                  <Text style={styles.txAmount}>{fmt(w.amount, w.currency)}</Text>
                  <Text style={styles.txDate}>{w.msisdn} · {new Date(w.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={[styles.txStatus, {
                  color: w.status === 'SUCCESSFUL' ? Colors.success
                    : w.status === 'FAILED' ? Colors.error : Colors.textMuted,
                }]}>
                  {w.status === 'SUCCESSFUL' ? t('withdraw.sent', 'Sent')
                    : w.status === 'FAILED' ? t('withdraw.failedShort', 'Failed')
                    : t('withdraw.pending', 'Pending')}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Rewarded ad in flight — refresh the balance once it credits */}
      <AdModal
        visible={showAd}
        placement="REWARDED"
        onClose={(earned) => { setShowAd(false); if (earned) load(); }}
      />
    </ScrollView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  hero:        { alignItems: 'center', paddingVertical: Spacing.lg },
  balanceRow:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  balanceValue:{ fontSize: 34, fontWeight: Font.weight.black, color: Colors.textPrimary },
  balanceLabel:{ color: Colors.textMuted, fontSize: Font.size.sm, marginTop: 2 },
  explainer:   { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 16 },
  lifetime:    { color: Colors.textSecondary, fontSize: Font.size.xs, marginTop: Spacing.sm },

  earnBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  earnBtnText: { color: Colors.textOnBrand, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md, paddingVertical: Spacing.md,
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  withdrawBtnText: { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  btnDisabled: { opacity: 0.55 },

  sectionTitle: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  historyCard:  { padding: 0 },
  txRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  txLeft:       { flex: 1 },
  txAmount:     { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
  txDate:       { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },
  txStatus:     { fontSize: Font.size.sm, fontWeight: Font.weight.bold },
});
