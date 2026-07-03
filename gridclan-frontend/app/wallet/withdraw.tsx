import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Card, Separator } from '@components/ui/index';
import { AdModal } from '@components/AdModal';
import { walletApi } from '@api/index';
import { playSfx } from '@services/sound';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import { fmtPoints, toAmount, toPoints, POINTS_PER_CURRENCY_UNIT } from '@utils/rewardPoints';
import type { WalletBalance, WithdrawQuote, WithdrawalRecord } from '@gridtypes/index';

/** A redemption in flight. */
interface ActiveWithdrawal {
  reference: string; amount: number; currency: string;
}

/**
 * Redeem reward points to mobile money via Relworx send-payment. The UI speaks
 * in points (1 point = 1 unit of the wallet currency); the actual cash value
 * being sent is disclosed at the confirmation step. The payout currency comes
 * from the destination number's country and must match a wallet balance. Funds
 * are held server-side the moment the redemption starts and are refunded
 * automatically if the payout fails — this screen initiates and reflects
 * status.
 */
export default function WithdrawScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [balances, setBalances] = useState<WalletBalance[] | null>(null);
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);

  const [msisdn, setMsisdn] = useState('');
  const [quote, setQuote] = useState<WithdrawQuote | null>(null);
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const [showAd, setShowAd] = useState(false);   // earn more from right here
  const [withdrawal, setWithdrawal] = useState<ActiveWithdrawal | null>(null);
  const [done, setDone] = useState<'SUCCESSFUL' | 'FAILED' | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numberLooksValid = msisdn.replace(/[^0-9]/g, '').length >= 9;
  // The input is in POINTS; the server API stays in currency.
  const pointsNum = Number(amount.replace(/[^0-9]/g, ''));
  const amountCur = toAmount(pointsNum);

  async function loadWallet() {
    try {
      const [b, h] = await Promise.all([walletApi.balances(), walletApi.history(10)]);
      setBalances(b.data);
      setHistory(h.data);
    } catch { /* non-blocking — the quote still shows the balance */ }
  }
  useEffect(() => { loadWallet(); }, []);

  // Number → payout currency, balance in it, limits, account name.
  async function loadQuote() {
    if (!numberLooksValid || loading) return;
    setQuote(null); setNotice(null); setError(null); setLoading(true);
    try {
      const res = await walletApi.quote(msisdn.trim());
      if (!res.data.configured) setNotice(t('withdraw.unavailable', 'Redemptions aren’t available right now. Please try again later.'));
      else if (!res.data.currency) setNotice(t('withdraw.countryUnsupported', 'We don’t support redemptions to that number’s country yet.'));
      else setQuote(res.data);
    } catch { setError(t('withdraw.quoteFailed', 'Could not check that number. Please try again.')); }
    finally { setLoading(false); }
  }

  // Whole currency units only (mobile money can't pay fractions), so points
  // must be a multiple of POINTS_PER_CURRENCY_UNIT.
  const amountValid = quote?.currency != null && pointsNum > 0
    && Number.isInteger(amountCur)
    && amountCur <= quote.balance
    && (quote.minAmount == null || amountCur >= quote.minAmount)
    && (quote.maxAmount == null || amountCur <= quote.maxAmount);

  async function start() {
    if (!amountValid || starting || withdrawal) return;
    playSfx('tap'); setError(null); setStarting(true);
    try {
      const res = await walletApi.initiate(msisdn.trim(), amountCur);
      setWithdrawal(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('withdraw.startFailed', 'Could not start the redemption. Please try again.'));
    } finally { setStarting(false); }
  }

  // Poll status until it settles (server confirms via webhook / status poll).
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!withdrawal || done) return;
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 4;
      try {
        const res = await walletApi.status(withdrawal.reference);
        if (res.data.status === 'SUCCESSFUL') {
          setDone('SUCCESSFUL');
          loadWallet();
        } else if (res.data.status === 'FAILED') {
          setFailReason(res.data.reason ?? null);
          setDone('FAILED');
          loadWallet();   // the hold was refunded — show it back in the balance
        }
      } catch { /* transient — keep polling */ }
      if (elapsed >= 180 && pollRef.current) clearInterval(pollRef.current);
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [withdrawal?.reference, done]);

  // The UI speaks in points (rate in @utils/rewardPoints); the real cash
  // value sent to mobile money is disclosed before confirming.
  const fmtCash = (n: number, cur: string) => `${cur} ${n.toLocaleString()}`;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{
        headerShown: true, title: t('withdraw.title', 'Redeem points'),
        headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Balances */}
        {balances && balances.length > 0 && (
          <Card style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t('withdraw.yourWinnings', 'Your reward points')}</Text>
            {balances.map((b) => (
              <Text key={b.currency} style={styles.balanceValue}>{fmtPoints(b.balance)}</Text>
            ))}
            {!withdrawal && (
              <Button
                title={t('withdraw.earnMore', '🎬 Watch an ad to earn more')}
                variant="secondary"
                onPress={() => setShowAd(true)}
                style={styles.btn}
              />
            )}
          </Card>
        )}
        {balances && balances.length === 0 && !withdrawal && (
          <Text style={styles.notice}>{t('withdraw.noWinnings', 'No points to redeem yet. Watch ads to earn points — then redeem them to mobile money once you reach the minimum.')}</Text>
        )}

        {/* ── Number entry ── */}
        {!withdrawal && (
          <Card style={styles.card}>
            <Text style={styles.label}>{t('withdraw.numberLabel', 'Mobile money number to receive your reward')}</Text>
            <Input
              value={msisdn}
              onChangeText={(v) => { setMsisdn(v); setQuote(null); setNotice(null); setError(null); }}
              placeholder="+256700000000"
              keyboardType="phone-pad"
            />
            {!quote && (
              <Button
                title={t('withdraw.check', 'Continue')}
                onPress={loadQuote}
                loading={loading}
                disabled={!numberLooksValid}
                style={styles.btn}
              />
            )}
          </Card>
        )}

        {loading && <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        {/* ── Amount ── */}
        {quote?.currency && !withdrawal && (
          <Card style={styles.card}>
            {!!quote.customerName && (
              <Text style={styles.sendingTo}>{t('withdraw.sendingTo', 'Sending to {{name}}', { name: quote.customerName })}</Text>
            )}
            <Text style={styles.label}>{t('withdraw.amountLabel', 'Points to redeem')}</Text>
            <Input
              value={amount}
              onChangeText={setAmount}
              placeholder={quote.minAmount != null ? String(toPoints(quote.minAmount)) : '0'}
              keyboardType="numeric"
            />
            <Text style={styles.limits}>
              {t('withdraw.available', 'Available: {{amount}}', { amount: fmtPoints(quote.balance) })}
              {quote.minAmount != null ? ` · ${t('withdraw.min', 'Min')} ${fmtPoints(quote.minAmount)}` : ''}
              {` · ${t('withdraw.steps', 'In steps of {{step}}', { step: POINTS_PER_CURRENCY_UNIT })}`}
            </Text>
            {amountValid && (
              <Text style={styles.youReceive}>
                {t('withdraw.youReceive', 'You’ll receive {{cash}} on your mobile money.', { cash: fmtCash(amountCur, quote.currency) })}
              </Text>
            )}
            <Button
              title={starting ? t('withdraw.starting', 'Sending…') : t('withdraw.confirm', 'Redeem')}
              onPress={start}
              loading={starting}
              disabled={!amountValid}
              style={styles.btn}
            />
          </Card>
        )}

        {/* ── In-flight redemption ── */}
        {withdrawal && !done && (
          <Card style={styles.statusCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.statusTitle}>{t('withdraw.sendingTitle', 'Sending your reward…')}</Text>
            <Text style={styles.statusBody}>
              {t('withdraw.sendingBody', 'We’re redeeming {{points}} and sending {{cash}} to {{number}}. This usually takes under a minute — you can leave this screen; the reward arrives either way.', { points: fmtPoints(withdrawal.amount), cash: fmtCash(withdrawal.amount, withdrawal.currency), number: msisdn.trim() })}
            </Text>
          </Card>
        )}
        {done === 'SUCCESSFUL' && (
          <Card style={styles.statusCard}>
            <Text style={styles.successEmoji}>🎁</Text>
            <Text style={styles.statusTitle}>{t('withdraw.successTitle', 'Points redeemed!')}</Text>
            <Text style={styles.statusBody}>{t('withdraw.successBody', 'Your reward of {{cash}} is on its way to your mobile money.', { cash: withdrawal ? fmtCash(withdrawal.amount, withdrawal.currency) : '' })}</Text>
          </Card>
        )}
        {done === 'FAILED' && (
          <Text style={styles.notice}>
            {failReason
              ? `${failReason} ${t('withdraw.refunded', 'Your balance was not touched — the points are back in your wallet.')}`
              : t('withdraw.failed', 'That redemption didn’t go through. The points are back in your wallet — you can try again.')}
          </Text>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* ── Recent redemptions ── */}
        {history.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>{t('withdraw.recent', 'Recent redemptions')}</Text>
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
          </View>
        )}

        <Text style={styles.footnote}>{t('withdraw.footnote', 'You earn points by watching ads. Redeeming sends the equivalent reward to the mobile-money account of the number you enter once your points reach the minimum; failed redemptions are refunded automatically.')}</Text>
      </ScrollView>

      {/* Rewarded ad in flight — refresh the balance once it credits */}
      <AdModal
        visible={showAd}
        placement="REWARDED"
        onClose={(earned) => { setShowAd(false); if (earned) loadWallet(); }}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  flex:    { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  balanceCard: { alignItems: 'center', padding: Spacing.md, marginBottom: Spacing.md },
  balanceLabel:{ color: Colors.textMuted, fontSize: Font.size.sm },
  balanceValue:{ color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.black, marginTop: 2 },

  card:    { padding: Spacing.md, marginBottom: Spacing.md },
  label:   { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.xs },
  btn:     { marginTop: Spacing.sm },
  limits:  { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: Spacing.xs },
  youReceive: { color: Colors.success, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: Spacing.sm },
  sendingTo: { color: Colors.success, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm },

  statusCard:  { alignItems: 'center', padding: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  statusTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  statusBody:  { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', lineHeight: 20 },
  successEmoji:{ fontSize: 36 },

  sectionTitle: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  historyCard:  { padding: 0 },
  txRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  txLeft:       { flex: 1 },
  txAmount:     { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
  txDate:       { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },
  txStatus:     { fontSize: Font.size.sm, fontWeight: Font.weight.bold },

  notice:   { color: Colors.textSecondary, fontSize: Font.size.sm, textAlign: 'center', marginVertical: Spacing.md, lineHeight: 20 },
  error:    { color: Colors.error, fontSize: Font.size.sm, textAlign: 'center', marginTop: Spacing.sm },
  footnote: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginTop: Spacing.xl, lineHeight: 16 },
});
