import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { chessApi } from '@api/index';
import { Button, Card, Input } from '@components/ui/index';
import { Font, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * Chess entry: start a game as white (then share the code) or join a friend's
 * game as black. The live board lives at /chess/[id]. Chess also runs in
 * tournaments (classic knockout — the bracket creates the games).
 */
export default function NewChessScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const res = await chessApi.create().catch(() => null);
    setCreating(false);
    if (res?.data?.gameId) router.replace(`/chess/${res.data.gameId}`);
    else Alert.alert(t('chess.createFailed', 'Could not start a game. Please try again.'));
  }

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4 || joining) return;
    setJoining(true);
    const res = await chessApi.join(c).catch(() => null);
    setJoining(false);
    if (res?.data?.gameId) router.replace(`/chess/${res.data.gameId}`);
    else Alert.alert(t('chess.joinFailed', 'Could not join that game. Check the code.'));
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        headerShown: true, title: t('chess.title', 'Grid Chess'),
        headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('chess.intro', 'The classic game of kings — full rules, live moves, and a 5-minute clock per move. Win by checkmate… or on time.')}</Text>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>♞ {t('chess.startTitle', 'Start a game')}</Text>
          <Text style={styles.cardBody}>{t('chess.startBody', 'You play white. We’ll give you a code to share — your friend joins as black.')}</Text>
          <Button title={t('chess.createCta', 'Start & invite a friend')} onPress={handleCreate} loading={creating} size="lg" style={styles.btn} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('chess.joinTitle', 'Have a code?')}</Text>
          <Input value={code} onChangeText={setCode} placeholder={t('chess.codePlaceholder', 'Enter game code')} autoCapitalize="characters" maxLength={12} />
          <Button title={t('chess.joinCta', 'Join game')} onPress={handleJoin} loading={joining} disabled={code.trim().length < 4} variant="secondary" style={styles.btn} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🏆 {t('chess.tournamentTitle', 'Play a tournament')}</Text>
          <Text style={styles.cardBody}>{t('chess.tournamentBody', 'Chess tournaments are classic knockout brackets — win and advance until one champion remains.')}</Text>
          <Button title={t('chess.tournamentCta', 'Browse tournaments')} onPress={() => router.push('/(tabs)/tournament')} size="lg" variant="secondary" style={styles.btn} />
        </Card>
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  intro:     { color: Colors.textSecondary, fontSize: Font.size.md, lineHeight: 22, marginBottom: Spacing.lg },
  card:      { padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle: { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  cardBody:  { color: Colors.textMuted, fontSize: Font.size.sm, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  btn:       { marginTop: Spacing.sm },
});
