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
import { fmtPoints, toPoints } from '@utils/rewardPoints';
import type { WalletBalance, WithdrawalRecord } from '@gridtypes/index';

/**
 * Wallet tab — the player's REWARD POINTS balance. The UI speaks in points
 * ("earn points", "redeem your points"); under the hood the balance is the
 * same server-side prize wallet (rate in @utils/rewardPoints: 1 pt = UGX 0.2)
 * and redeeming still pays real value to mobile money via Relworx. Points land
 * here from ad rewards and the welcome bonus. Distinct from game/score points
 * (pure skill metric) and gems (closed-loop) — neither of those is redeemable.
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
      title={t('guest.walletTitle', 'Your reward points')}
      subtitle={t('guest.walletSubtitle', 'Create an account to earn reward points by watching ads and redeem them to mobile money.')}
    />
  );

  if (balances === null) return <LoadingSpinner />;

  const hasPoints = balances.some((b) => b.balance > 0);

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
                <Text key={b.currency} style={styles.balanceValue}>{toPoints(b.balance).toLocaleString()}</Text>
              ))}
        </View>
        <Text style={styles.balanceLabel}>{t('wallet.balance', 'Reward points')}</Text>
        <Text style={styles.explainer}>
          {t('wallet.explainer', 'Earn points by watching ads, then redeem them to mobile money. Game score and gems are separate and can’t be redeemed.')}
        </Text>
        {balances.map((b) => (
          <Text key={b.currency} style={styles.lifetime}>
            {t('wallet.lifetime', 'Earned {{earned}} · Redeemed {{redeemed}}', {
              earned: fmtPoints(b.lifetimeEarned),
              redeemed: fmtPoints(b.lifetimeWithdrawn),
            })}
          </Text>
        ))}
      </Card>

      {/* Actions */}
      <TouchableOpacity style={styles.earnBtn} onPress={() => setShowAd(true)}>
        <Ionicons name="play-circle" size={20} color={Colors.textOnBrand} />
        <Text style={styles.earnBtnText}>{t('wallet.earn', 'Watch an ad · earn points')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.withdrawBtn, !hasPoints && styles.btnDisabled]}
        onPress={() => router.push('/wallet/withdraw' as never)}
      >
        <Ionicons name="gift-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.withdrawBtnText}>{t('wallet.withdraw', 'Redeem your points')}</Text>
      </TouchableOpacity>

      {/* Recent redemptions */}
      <Text style={styles.sectionTitle}>{t('wallet.recent', 'Recent redemptions')}</Text>
      {history.length === 0 ? (
        <EmptyState icon="gift-outline" title={t('wallet.noWithdrawals', 'No redemptions yet — watch ads to grow your points.')} />
      ) : (
        <Card style={styles.historyCard}>
          {history.map((w, i) => (
            <View key={w.reference}>
              {i > 0 && <Separator />}
              <View style={styles.txRow}>
                <View style={styles.txLeft}>
                  <Text style={styles.txAmount}>{fmtPoints(w.amount)}</Text>
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
