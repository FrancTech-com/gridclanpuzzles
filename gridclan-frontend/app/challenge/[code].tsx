import React, { useCallback, useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { challengeApi, type ChallengeView } from '@api/index';
import { Button, Card, LoadingSpinner } from '@components/ui/index';
import { Font, GameMeta, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
/**
 * Challenge hub: shows status, lets the current user play their round, and
 * reveals both scores + the winner once everyone has finished. Re-fetches on
 * focus so returning from a finished game updates the result automatically.
 */
export default function ChallengeHubScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const { code } = useLocalSearchParams<{ code: string }>();

  const [data, setData]       = useState<ChallengeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!code) return;
    const res = await challengeApi.get(code).catch(() => null);
    if (res?.data) { setData(res.data); setNotFound(false); }
    else setNotFound(true);
    setLoading(false);
  }, [code]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAccept() {
    if (!code || busy) return;
    setBusy(true);
    const res = await challengeApi.accept(code).catch(() => null);
    setBusy(false);
    if (res?.data?.sessionId) router.push(`/game/${res.data.sessionId}`);
    else Alert.alert(t('challenge.joinFailed', 'Could not join this challenge.'));
  }

  async function shareCode() {
    if (!code) return;
    const message = t('challenge.shareMessage', { code, defaultValue: `Play my GridClan puzzle challenge! Code: {{code}}` });
    try {
      if (Platform.OS === 'web') {
        if ((navigator as any).share) await (navigator as any).share({ text: message });
        else if ((navigator as any).clipboard) {
          await (navigator as any).clipboard.writeText(code);
          Alert.alert(t('challenge.copied', 'Code copied to clipboard'));
        }
      } else {
        await Share.share({ message });
      }
    } catch { /* user cancelled */ }
  }

  const headerOptions = {
    headerShown:     true,
    title:           t('challenge.title', 'Friend challenge'),
    headerStyle:     { backgroundColor: Colors.surface },
    headerTintColor: Colors.textPrimary,
  };

  if (loading) return <LoadingSpinner />;

  if (notFound || !data) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={headerOptions} />
        <Text style={styles.bigEmoji}>🔍</Text>
        <Text style={styles.title}>{t('challenge.notFound', 'Challenge not found')}</Text>
        <Text style={styles.muted}>{t('challenge.notFoundBody', 'The code may be wrong or the challenge has expired.')}</Text>
        <Button title={t('common.back', 'Back')} onPress={() => router.back()} variant="secondary" style={styles.btn} />
      </View>
    );
  }

  const meta = GameMeta[data.gameType];
  const canPlay = !!data.yourSessionId;
  const isViewerInvite = data.role === 'VIEWER' && !data.hasOpponent;
  const isViewerFull   = data.role === 'VIEWER' && data.hasOpponent;
  const waiting = !canPlay && data.yourScore != null && data.theirScore == null;
  const complete = data.status === 'COMPLETE' && data.outcome;
  const showCode = data.role === 'CREATOR' && !data.hasOpponent;

  return (
    <View style={styles.container}>
      <Stack.Screen options={headerOptions} />
      <View style={styles.content}>
        <View style={[styles.accent, { backgroundColor: meta.color }]} />
        <Text style={[styles.gameTag, { color: meta.color }]}>{meta.label}</Text>

        {/* Result */}
        {complete && (
          <Card style={styles.card}>
            <Text style={styles.outcome}>
              {data.outcome === 'WON' ? `🏆 ${t('challenge.youWon', 'You won!')}`
                : data.outcome === 'LOST' ? `😅 ${t('challenge.youLost', 'You lost')}`
                : `🤝 ${t('challenge.tie', "It's a tie!")}`}
            </Text>
            <View style={styles.scoreRow}>
              <Score label={t('challenge.you', 'You')} value={data.yourScore} highlight={data.outcome === 'WON'} />
              <Text style={styles.vs}>{t('challenge.vs', 'vs')}</Text>
              <Score label={t('challenge.friend', 'Friend')} value={data.theirScore} highlight={data.outcome === 'LOST'} />
            </View>
          </Card>
        )}

        {/* Your turn to play */}
        {canPlay && (
          <Card style={styles.card}>
            <Text style={styles.title}>{isViewerInvite || data.role === 'OPPONENT'
              ? t('challenge.yourTurn', 'Your turn')
              : t('challenge.playRound', 'Play your round')}</Text>
            <Text style={styles.muted}>{t('challenge.playBody', 'Solve the puzzle — your score is locked in when you finish.')}</Text>
            <Button title={t('challenge.playCta', 'Play now')} onPress={() => router.push(`/game/${data.yourSessionId}`)} size="lg" style={styles.btn} />
          </Card>
        )}

        {/* Viewer who hasn't joined yet */}
        {isViewerInvite && !canPlay && (
          <Card style={styles.card}>
            <Text style={styles.title}>{t('challenge.invited', "You've been challenged!")}</Text>
            <Text style={styles.muted}>{t('challenge.invitedBody', 'Accept to play the same puzzle, then see who scored higher.')}</Text>
            <Button title={t('challenge.acceptCta', 'Accept & play')} onPress={handleAccept} loading={busy} size="lg" style={styles.btn} />
          </Card>
        )}

        {isViewerFull && (
          <Card style={styles.card}>
            <Text style={styles.muted}>{t('challenge.full', 'This challenge already has two players.')}</Text>
          </Card>
        )}

        {/* Waiting for the friend */}
        {waiting && (
          <Card style={styles.card}>
            <Text style={styles.title}>{t('challenge.scored', 'You scored {{score}}', { score: data.yourScore })}</Text>
            <Text style={styles.muted}>{t('challenge.waiting', 'Waiting for your friend to play their round…')}</Text>
          </Card>
        )}

        {/* Share code */}
        {showCode && (
          <Card style={styles.card}>
            <Text style={styles.muted}>{t('challenge.sharePrompt', 'Share this code so a friend can join:')}</Text>
            <Text selectable style={styles.code}>{data.code}</Text>
            <Button title={t('challenge.shareCta', 'Share code')} onPress={shareCode} variant="secondary" style={styles.btn} />
          </Card>
        )}
      </View>
    </View>
  );
}


function Score({ label, value, highlight }: { label: string; value: number | null; highlight?: boolean }) {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <View style={styles.score}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={[styles.scoreValue, highlight && { color: Colors.accent }]}>{value ?? '—'}</Text>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg },
  center:    { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  accent:  { height: 4, borderRadius: 2, width: 48, marginBottom: Spacing.sm },
  gameTag: { fontSize: Font.size.md, fontWeight: Font.weight.bold, marginBottom: Spacing.md },

  card:  { padding: Spacing.md, marginBottom: Spacing.md },
  title: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  muted: { color: Colors.textMuted, fontSize: Font.size.sm, lineHeight: 20, marginTop: Spacing.xs, textAlign: 'center' },

  bigEmoji: { fontSize: 48, marginBottom: Spacing.md },
  btn:      { marginTop: Spacing.md },

  outcome:  { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.black, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, marginTop: Spacing.md },
  score:      { alignItems: 'center' },
  scoreLabel: { color: Colors.textMuted, fontSize: Font.size.sm },
  scoreValue: { color: Colors.textPrimary, fontSize: Font.size.xxl, fontWeight: Font.weight.black },
  vs:         { color: Colors.textMuted, fontSize: Font.size.md },

  code: { color: Colors.accent, fontSize: Font.size.xxl, fontWeight: Font.weight.black, letterSpacing: 4, textAlign: 'center', marginVertical: Spacing.sm },
});
