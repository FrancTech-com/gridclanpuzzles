import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { battleshipApi, chessApi, communityApi, gomokuApi, scrabbleApi } from '@api/index';
import { Button, LoadingSpinner } from '@components/ui/index';
import { Font, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { RootState } from '@store/index';

/**
 * Auto-join-by-link landing screen.
 *
 * A friend taps an invite link like https://gridclanpuzzle.win/j/gomoku/ABC123
 * and lands here. We resolve the game, join by code, and replace straight into
 * the live game — no code typing, no menu hunting.
 *
 *   • challenge → handled by its own hub, so we just forward to /challenge/<code>
 *   • guests    → bounced to register, carrying `next` so they return here once
 *                 signed in (login/register honor the `next` param)
 *   • failures  → friendly message + a way back, never a blank screen
 */
const JOINERS = {
  scrabble:   (code: string) => scrabbleApi.join(code),
  gomoku:     (code: string) => gomokuApi.join(code),
  battleship: (code: string) => battleshipApi.join(code),
  chess:      (code: string) => chessApi.join(code),
} as const;
type JoinGame = keyof typeof JOINERS;

export default function JoinByLinkScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ game: string; code: string }>();
  const userId = useSelector((s: RootState) => s.auth.userId);

  const game = (params.game ?? '').toLowerCase();
  const code = (params.code ?? '').trim().toUpperCase();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // Async challenges have a dedicated hub that handles accept + results.
    if (game === 'challenge') { router.replace(`/challenge/${code}`); return; }

    // Community invites: /j/community/<communityId>. Join by id (case-sensitive
    // UUID — not the uppercased game code) and land in the community chat.
    // 409 = already a member, which for an invite link is success.
    if (game === 'community') {
      const communityId = (params.code ?? '').trim();
      if (communityId.length < 10) {
        setError(t('join.badLink', "This invite link doesn't look right. Ask your friend to resend it."));
        return;
      }
      if (!userId) {
        router.replace({ pathname: '/(auth)/register', params: { next: `/j/community/${communityId}` } });
        return;
      }
      if (attempted.current) return;
      attempted.current = true;
      const openChat = () =>
        router.replace({ pathname: '/community/[id]/chat', params: { id: communityId } });
      communityApi.join(communityId)
        .then(openChat)
        .catch((e: any) => {
          if (e?.response?.status === 409) { openChat(); return; }
          setError(t('join.communityFailed',
            'Could not join this community. The link may be wrong or the community no longer exists.'));
        });
      return;
    }

    if (!(game in JOINERS) || code.length < 4) {
      setError(t('join.badLink', "This invite link doesn't look right. Ask your friend to resend it."));
      return;
    }

    // Must be signed in to join. Send guests to register, carrying the invite so
    // they come straight back here (and auto-join) after creating an account.
    if (!userId) {
      router.replace({ pathname: '/(auth)/register', params: { next: `/j/${game}/${code}` } });
      return;
    }

    if (attempted.current) return;   // join exactly once per mount
    attempted.current = true;

    JOINERS[game as JoinGame](code)
      .then(res => {
        const id = res?.data?.gameId;
        if (id) router.replace(`/${game}/${id}` as never);
        else setError(t('join.failed', 'Could not join this game.'));
      })
      .catch(() => setError(t('join.failed',
        'Could not join this game. The code may be wrong, expired, or the game already has two players.')));
  }, [game, code, userId]);

  const header = {
    headerShown: true,
    title: game === 'community'
      ? t('join.communityTitle', 'Joining community…')
      : t('join.title', 'Joining game…'),
    headerStyle: { backgroundColor: Colors.surface },
    headerTintColor: Colors.textPrimary,
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={header} />
        <Text style={styles.emoji}>🔌</Text>
        <Text style={styles.msg}>{error}</Text>
        <Button
          title={t('common.back', 'Back to home')}
          onPress={() => router.replace('/(tabs)')}
          variant="secondary"
          style={{ marginTop: Spacing.lg }}
        />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Stack.Screen options={header} />
      <LoadingSpinner />
      <Text style={styles.msg}>{t('join.connecting', 'Connecting you to the game…')}</Text>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emoji:  { fontSize: 44, marginBottom: Spacing.md },
  msg:    { color: Colors.textMuted, fontSize: Font.size.md, textAlign: 'center', marginTop: Spacing.md, lineHeight: 22 },
});
