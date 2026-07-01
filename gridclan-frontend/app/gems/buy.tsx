import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch } from '@store/index';
import { fetchGemBalanceThunk, fetchGemHistoryThunk } from '@store/slices/gemsSlice';
import { Button, Input, Card } from '@components/ui/index';
import { paymentsApi } from '@api/index';
import { playSfx } from '@services/sound';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { GemPack } from '@gridtypes/index';

type Method = 'MOBILE' | 'CARD';

// Persist the in-flight card reference across the browser redirect to Relworx's
// hosted page and back. Web only (the card page opens in a browser); a no-op on
// native, where the in-memory state survives backgrounding.
const PENDING_KEY = 'pendingGemPurchase';
const webStore = (): Storage | null =>
  (Platform.OS === 'web' && typeof localStorage !== 'undefined') ? localStorage : null;
const savePending  = (ref: string) => webStore()?.setItem(PENDING_KEY, ref);
const loadPending  = (): string | null => webStore()?.getItem(PENDING_KEY) ?? null;
const clearPending = () => webStore()?.removeItem(PENDING_KEY);

/** A purchase in flight — common shape for both rails (paymentUrl only for card). */
interface ActivePurchase {
  reference: string; gems: number; amount: number; currency: string; paymentUrl?: string;
}

/**
 * Buy gems with mobile money or card (Visa/Mastercard) via Relworx. Mobile money
 * sets the currency from the player's number; card lets them pick a currency.
 * Gems are credited server-side only on confirmed payment (webhook / status poll)
 * — this screen initiates and reflects status.
 */
export default function BuyGemsScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const [method, setMethod] = useState<Method>('MOBILE');

  // Mobile money
  const [msisdn, setMsisdn] = useState('');
  const [customerName, setCustomerName] = useState<string | null>(null);

  // Card
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [currency, setCurrency] = useState<string | null>(null);

  // Shared: the packs currently on offer + their currency
  const [packs, setPacks] = useState<GemPack[] | null>(null);
  const [packCurrency, setPackCurrency] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [purchase, setPurchase] = useState<ActivePurchase | null>(null);
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [done, setDone] = useState<'SUCCESSFUL' | 'FAILED' | null>(null);
  const [confirming, setConfirming] = useState(false);   // resumed from a card return
  const [resultGems, setResultGems] = useState(0);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Card return: after paying, Relworx sends the browser back to this page. We
  // resume from the reference we stashed before redirecting (robust whether or
  // not Relworx echoes it in the URL), then poll to confirm + show the result.
  const params = useLocalSearchParams<{ customer_reference?: string; reference?: string }>();
  useEffect(() => {
    const ref = (params.customer_reference || params.reference || loadPending()) as string | undefined;
    if (ref && !purchase) {
      setPurchase({ reference: ref, gems: 0, amount: 0, currency: '' });
      setConfirming(true);
    }
  }, [params.customer_reference, params.reference]);

  // Clear the stashed reference once the purchase settles.
  useEffect(() => { if (done) clearPending(); }, [done]);

  const numberLooksValid = msisdn.replace(/[^0-9]/g, '').length >= 9;

  function reset() {
    setPacks(null); setPackCurrency(null); setNotice(null);
    setCustomerName(null); setError(null);
  }

  function switchMethod(m: Method) {
    if (m === method || purchase) return;
    playSfx('tap');
    setMethod(m); reset(); setCurrency(null);
    if (m === 'CARD' && currencies.length === 0) loadCurrencies();
  }

  async function loadCurrencies() {
    try {
      const res = await paymentsApi.currencies();
      if (!res.data.configured) { setNotice(t('buy.unavailable', 'The gem store isn’t available right now. Please try again later.')); return; }
      setCurrencies(res.data.currencies);
    } catch { setError(t('buy.quoteFailed', 'Could not load gem packs. Please try again.')); }
  }

  // Mobile-money: number → packs (with the account name).
  async function loadMobileQuote() {
    if (!numberLooksValid || loading) return;
    reset(); setLoading(true);
    try {
      const res = await paymentsApi.quote(msisdn.trim());
      if (!res.data.configured) setNotice(t('buy.unavailable', 'The gem store isn’t available right now. Please try again later.'));
      else if (!res.data.currency) setNotice(t('buy.countryUnsupported', 'We don’t support mobile-money payments from that number’s country yet.'));
      else { setPacks(res.data.packs); setPackCurrency(res.data.currency); setCustomerName(res.data.customerName ?? null); }
    } catch { setError(t('buy.quoteFailed', 'Could not load gem packs. Check your number and try again.')); }
    finally { setLoading(false); }
  }

  // Card: chosen currency → packs.
  async function selectCurrency(cur: string) {
    playSfx('tap'); setCurrency(cur); reset(); setLoading(true);
    try {
      const res = await paymentsApi.cardQuote(cur);
      setPacks(res.data.packs); setPackCurrency(cur);
    } catch { setError(t('buy.quoteFailed', 'Could not load gem packs. Please try again.')); }
    finally { setLoading(false); }
  }

  async function buy(pack: GemPack) {
    if (busyPack || purchase) return;
    playSfx('tap'); setError(null); setBusyPack(pack.id);
    try {
      if (method === 'MOBILE') {
        const res = await paymentsApi.initiate(pack.id, msisdn.trim());
        setPurchase(res.data);
      } else {
        const res = await paymentsApi.initiateCard(pack.id, currency!);
        setPurchase(res.data);
        savePending(res.data.reference);   // survive the full-page redirect
        if (res.data.paymentUrl) Linking.openURL(res.data.paymentUrl);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || t('buy.startFailed', 'Could not start the payment. Please try again.'));
    } finally { setBusyPack(null); }
  }

  // Poll status until it settles (server confirms via webhook / status poll).
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!purchase || done) return;
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 4;
      try {
        const res = await paymentsApi.status(purchase.reference);
        if (res.data.status === 'SUCCESSFUL') {
          setResultGems(res.data.gems);
          setDone('SUCCESSFUL');
          dispatch(fetchGemBalanceThunk());
          dispatch(fetchGemHistoryThunk(50));
        } else if (res.data.status === 'FAILED') {
          setFailReason(res.data.reason ?? null);
          setDone('FAILED');
        }
      } catch { /* transient — keep polling */ }
      if (elapsed >= 180 && pollRef.current) clearInterval(pollRef.current);
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [purchase?.reference, done]);

  // Turn the provider's raw reason into a clear, friendly message.
  function friendlyFailure(): string {
    const raw = (failReason || '').toLowerCase();
    if (/insufficient|balance|no money|not enough|low funds|funds/.test(raw)) {
      return t('buy.insufficient', 'Insufficient balance — top up your mobile money and try again. No gems were charged.');
    }
    if (failReason) return `${failReason} ${t('buy.noCharge', 'No gems were charged.')}`;
    return t('buy.failed', 'That payment didn’t go through. No gems were charged. You can try again.');
  }

  const fmt = (n: number, cur: string) => `${cur} ${n.toLocaleString()}`;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{
        headerShown: true, title: t('buy.title', 'Buy gems'),
        headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Method toggle */}
        {!purchase && (
          <View style={styles.methodRow}>
            {(['MOBILE', 'CARD'] as Method[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.methodPill, method === m && styles.methodPillActive]}
                onPress={() => switchMethod(m)}
                activeOpacity={0.85}
              >
                <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
                  {m === 'MOBILE' ? t('buy.mobileMoney', '📱 Mobile money') : t('buy.card', '💳 Card')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Mobile money: number entry ── */}
        {method === 'MOBILE' && !purchase && (
          <Card style={styles.card}>
            <Text style={styles.label}>{t('buy.numberLabel', 'Mobile money number')}</Text>
            <Input
              value={msisdn}
              onChangeText={(v) => { setMsisdn(v); reset(); }}
              placeholder="+256700000000"
              keyboardType="phone-pad"
            />
            <Button
              title={t('buy.continue', 'Show gem packs')}
              onPress={loadMobileQuote}
              loading={loading}
              disabled={!numberLooksValid}
              style={styles.btn}
            />
          </Card>
        )}

        {/* ── Card: currency picker ── */}
        {method === 'CARD' && !purchase && currencies.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.label}>{t('buy.currencyLabel', 'Pay in')}</Text>
            <View style={styles.curRow}>
              {currencies.map((cur) => (
                <TouchableOpacity
                  key={cur}
                  style={[styles.curPill, currency === cur && styles.curPillActive]}
                  onPress={() => selectCurrency(cur)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.curText, currency === cur && styles.curTextActive]}>{cur}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {loading && <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.md }} />}
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        {/* ── Packs ── */}
        {packs && packs.length > 0 && packCurrency && !purchase && (
          <View>
            {!!customerName && (
              <Text style={styles.payingAs}>{t('buy.payingAs', 'Paying as {{name}}', { name: customerName })}</Text>
            )}
            <Text style={styles.sectionTitle}>{t('buy.choosePack', 'Choose a pack')}</Text>
            {packs.map((pack) => (
              <TouchableOpacity key={pack.id} style={styles.pack} onPress={() => buy(pack)} disabled={!!busyPack} activeOpacity={0.85}>
                <View style={styles.packLeft}>
                  <Text style={styles.packGems}>💎 {pack.gems.toLocaleString()} {t('buy.gems', 'gems')}</Text>
                  {!!pack.label && <Text style={styles.packLabel}>{pack.label}</Text>}
                </View>
                {busyPack === pack.id
                  ? <ActivityIndicator color={Colors.primary} />
                  : <Text style={styles.packPrice}>{fmt(pack.price, packCurrency)}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── In-flight purchase ── */}
        {purchase && !done && confirming && (
          <Card style={styles.statusCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.statusTitle}>{t('buy.confirmingTitle', 'Confirming your payment…')}</Text>
            <Text style={styles.statusBody}>{t('buy.confirmingBody', 'Hang on a moment while we confirm your card payment. Your gems land here automatically.')}</Text>
          </Card>
        )}
        {purchase && !done && !confirming && (
          <Card style={styles.statusCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.statusTitle}>
              {purchase.paymentUrl ? t('buy.cardTitle', 'Complete your card payment') : t('buy.approveTitle', 'Approve on your phone')}
            </Text>
            <Text style={styles.statusBody}>
              {purchase.paymentUrl
                ? t('buy.cardBody', 'Finish paying {{amount}} on the secure page. Your gems land here automatically once it’s confirmed.', { amount: fmt(purchase.amount, purchase.currency) })
                : t('buy.approveBody', 'We’ve sent a request for {{amount}}. Enter your mobile-money PIN when prompted — your gems land here automatically.', { amount: fmt(purchase.amount, purchase.currency) })}
            </Text>
            {!!purchase.paymentUrl && (
              <Button title={t('buy.reopen', 'Reopen payment page')} variant="secondary" onPress={() => Linking.openURL(purchase.paymentUrl!)} style={styles.btn} />
            )}
          </Card>
        )}
        {done === 'SUCCESSFUL' && (
          <Card style={styles.statusCard}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.statusTitle}>{t('buy.successTitle', 'Gems added!')}</Text>
            <Text style={styles.statusBody}>{t('buy.successBody', 'Your {{gems}} gems are now in your balance.', { gems: purchase?.gems || resultGems })}</Text>
          </Card>
        )}
        {done === 'FAILED' && (
          <Text style={styles.notice}>{friendlyFailure()}</Text>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.footnote}>{t('buy.footnote', 'Gems are an in-app item with no cash value and cannot be withdrawn.')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  flex:    { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  methodRow:   { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  methodPill:  { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  methodPillActive: { borderColor: Colors.primary },
  methodText:  { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.bold },
  methodTextActive: { color: Colors.textPrimary },

  card:    { padding: Spacing.md, marginBottom: Spacing.md },
  label:   { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.xs },
  btn:     { marginTop: Spacing.sm },

  curRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  curPill:     { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  curPillActive: { borderColor: Colors.primary, backgroundColor: Colors.surface },
  curText:     { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.bold },
  curTextActive: { color: Colors.textPrimary },

  payingAs:     { color: Colors.success, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm },
  sectionTitle: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginBottom: Spacing.sm },
  pack:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  packLeft:  { flex: 1 },
  packGems:  { color: Colors.textPrimary, fontSize: Font.size.md, fontWeight: Font.weight.bold },
  packLabel: { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },
  packPrice: { color: Colors.primary, fontSize: Font.size.md, fontWeight: Font.weight.bold },

  statusCard:  { alignItems: 'center', padding: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  statusTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  statusBody:  { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', lineHeight: 20 },
  successEmoji:{ fontSize: 36 },

  notice:   { color: Colors.textSecondary, fontSize: Font.size.sm, textAlign: 'center', marginVertical: Spacing.md, lineHeight: 20 },
  error:    { color: Colors.error, fontSize: Font.size.sm, textAlign: 'center', marginTop: Spacing.sm },
  footnote: { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginTop: Spacing.xl, lineHeight: 16 },
});
