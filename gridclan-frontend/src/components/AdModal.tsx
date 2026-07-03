import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { adsApi } from '@api/index';
import { getAdDeviceId, getAdsStatus, playThroughChain } from '@services/ads';
import { ConfirmAgeForm } from '@components/ConfirmAge';
import { toPoints } from '@utils/rewardPoints';
import { playSfx } from '@services/sound';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

// Must exceed the server's minimum watch time (gridclan.ads.min-watch-seconds,
// 10s) or the test-mode placeholder would be rejected as "too fast".
const PLACEHOLDER_SECONDS = 12;

type Phase = 'loading' | 'confirmAge' | 'placeholder' | 'earned' | 'skipped' | 'unavailable' | 'error';

/**
 * Plays one ad end-to-end and credits the wallet: issue a server session →
 * run the provider failover chain (or the built-in placeholder in server test
 * mode) → report completion → show what was earned. The server fixes the
 * amount and enforces the daily cap; this component only reflects it.
 */
export function AdModal({
  visible, placement, onClose,
}: {
  visible: boolean;
  placement: 'REWARDED' | 'POST_GAME';
  /** earned = money credited (amount + currency provided). */
  onClose: (earned: boolean, amount?: number, currency?: string) => void;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [earnedAmount, setEarnedAmount] = useState(0);
  const [earnedCurrency, setEarnedCurrency] = useState('');
  const [countdown, setCountdown] = useState(PLACEHOLDER_SECONDS);
  const placeholderDone = useRef<((watched: boolean) => void) | null>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!visible || running.current) return;
    running.current = true;
    run().finally(() => { running.current = false; });
  }, [visible]);

  async function run(forceStatus = false) {
    setPhase('loading'); setMessage(null);
    try {
      const status = await getAdsStatus(forceStatus);
      if (!status?.configured) { setPhase('unavailable'); return; }
      // Pre-existing account with unknown age: one-time confirmation first,
      // so the ad request can carry the right personalisation flags.
      if (status.ageKnown === false) { setPhase('confirmAge'); return; }
      if (status.remainingToday <= 0) {
        setPhase('error');
        setMessage(t('ads.dailyLimit', 'You’ve reached today’s ad limit — come back tomorrow!'));
        return;
      }

      const session = await adsApi.start(placement, await getAdDeviceId());

      const result = await playThroughChain(status, placement, () =>
        new Promise<boolean>((resolve) => {
          placeholderDone.current = resolve;
          setCountdown(PLACEHOLDER_SECONDS);
          setPhase('placeholder');
        }));

      if (result.unavailable) { setPhase('unavailable'); return; }
      if (!result.watched) { setPhase('skipped'); return; }

      const done = await adsApi.complete(session.data.adSessionId, result.providerId);
      setEarnedAmount(done.data.rewardAmount);
      setEarnedCurrency(done.data.rewardCurrency);
      playSfx('win');
      setPhase('earned');
    } catch (e: any) {
      setPhase('error');
      setMessage(e?.response?.data?.message
        || t('ads.failed', 'The ad couldn’t be loaded. Please try again.'));
    }
  }

  // Placeholder ad: a simple non-skippable countdown (server test mode only).
  useEffect(() => {
    if (phase !== 'placeholder') return;
    if (countdown <= 0) { placeholderDone.current?.(true); placeholderDone.current = null; return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  function close() {
    const earned = phase === 'earned';
    onClose(earned, earned ? earnedAmount : undefined, earned ? earnedCurrency : undefined);
  }

  if (!visible) return null;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade"
           onRequestClose={phase === 'placeholder' ? () => {} : close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>

          {phase === 'loading' && (
            <>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.title}>{t('ads.loading', 'Loading ad…')}</Text>
            </>
          )}

          {phase === 'confirmAge' && (
            <ConfirmAgeForm
              onDone={() => { run(true); }}
              onCancel={close}
            />
          )}

          {phase === 'placeholder' && (
            <>
              <View style={styles.adBadge}><Text style={styles.adBadgeText}>{t('ads.badge', 'Ad')}</Text></View>
              <Text style={styles.placeholderEmoji}>📺</Text>
              <Text style={styles.title}>{t('ads.testAd', 'Test ad playing…')}</Text>
              <Text style={styles.body}>{t('ads.testAdBody', 'A real ad from our ad partners will play here.')}</Text>
              <Text style={styles.countdown}>{countdown}</Text>
            </>
          )}

          {phase === 'earned' && (
            <>
              <Text style={styles.placeholderEmoji}>💰</Text>
              <Text style={styles.title}>{t('ads.earnedTitle', 'You earned {{amount}} points!', {
                amount: toPoints(earnedAmount).toLocaleString() })}</Text>
              <Text style={styles.body}>{t('ads.earnedBody', 'They’re in your wallet — redeem them any time once you reach the minimum.')}</Text>
              <TouchableOpacity style={styles.btn} onPress={close} activeOpacity={0.85}>
                <Text style={styles.btnText}>{t('ads.nice', 'Nice!')}</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'skipped' && (
            <>
              <Text style={styles.placeholderEmoji}>⏭️</Text>
              <Text style={styles.title}>{t('ads.skippedTitle', 'Ad not finished')}</Text>
              <Text style={styles.body}>{t('ads.skippedBody', 'Watch an ad to the end to earn your points.')}</Text>
              <TouchableOpacity style={styles.btn} onPress={close} activeOpacity={0.85}>
                <Text style={styles.btnText}>{t('common.ok', 'OK')}</Text>
              </TouchableOpacity>
            </>
          )}

          {(phase === 'unavailable' || phase === 'error') && (
            <>
              <Text style={styles.placeholderEmoji}>😴</Text>
              <Text style={styles.title}>{t('ads.unavailableTitle', 'No ads right now')}</Text>
              <Text style={styles.body}>{message
                || t('ads.unavailableBody', 'There’s no ad to show at the moment. Please try again later.')}</Text>
              <TouchableOpacity style={styles.btn} onPress={close} activeOpacity={0.85}>
                <Text style={styles.btnText}>{t('common.ok', 'OK')}</Text>
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000cc', padding: Spacing.xl },
  card: {
    width: '100%', maxWidth: 340, alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.md, gap: Spacing.sm,
  },
  adBadge: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: Colors.border, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  adBadgeText: { color: Colors.textMuted, fontSize: Font.size.xs, fontWeight: Font.weight.bold },
  placeholderEmoji: { fontSize: 48 },
  title: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold, textAlign: 'center' },
  body:  { color: Colors.textMuted, fontSize: Font.size.sm, textAlign: 'center', lineHeight: 20 },
  countdown: { color: Colors.primary, fontSize: 34, fontWeight: Font.weight.black, marginTop: Spacing.xs },
  btn: { backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, minWidth: 180, alignItems: 'center', marginTop: Spacing.sm },
  btnText: { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.md },
});
