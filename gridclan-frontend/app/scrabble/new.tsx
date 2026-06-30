import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { scrabbleApi } from '@api/index';
import { Button, Card, Input } from '@components/ui/index';
import { Font, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * Grid Scrabble entry: start a new shared-board game (then share the code) or
 * join a friend's game by code. The game itself lives at /scrabble/[id].
 */
export default function NewScrabbleScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);

  const [creating, setCreating] = useState(false);
  const [soloLoading, setSoloLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const res = await scrabbleApi.create().catch(() => null);
    setCreating(false);
    if (res?.data?.gameId) router.replace(`/scrabble/${res.data.gameId}`);
    else Alert.alert(t('scrabble.createFailed', 'Could not start a game. Please try again.'));
  }

  async function handleSolo() {
    if (soloLoading) return;
    setSoloLoading(true);
    const res = await scrabbleApi.solo().catch(() => null);
    setSoloLoading(false);
    if (res?.data?.gameId) router.replace(`/scrabble/${res.data.gameId}`);
    else Alert.alert(t('scrabble.soloFailed', 'Could not start a solo game. Please try again.'));
  }

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4 || joining) return;
    setJoining(true);
    const res = await scrabbleApi.join(c).catch(() => null);
    setJoining(false);
    if (res?.data?.gameId) router.replace(`/scrabble/${res.data.gameId}`);
    else Alert.alert(t('scrabble.joinFailed', 'Could not join that game. Check the code.'));
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        headerShown: true, title: t('scrabble.title', 'Grid Scrabble'),
        headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('scrabble.intro', 'Build words on a shared board with a friend, taking turns. Play anytime — they get notified when it’s their move.')}</Text>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('scrabble.startTitle', 'Start a game')}</Text>
          <Text style={styles.cardBody}>{t('scrabble.startBody', 'We’ll deal your tiles and give you a code to share with a friend.')}</Text>
          <Button title={t('scrabble.createCta', 'Start & invite a friend')} onPress={handleCreate} loading={creating} size="lg" style={styles.btn} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>🤖 {t('scrabble.soloTitle', 'Play the computer')}</Text>
          <Text style={styles.cardBody}>{t('scrabble.soloBody', 'Take on the AI solo. Hints suggest your best word — free, based on your rank: Beginner 5, Amateur 3, Professional 0.')}</Text>
          <Button title={t('scrabble.soloCta', 'Play vs computer')} onPress={handleSolo} loading={soloLoading} size="lg" variant="secondary" style={styles.btn} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('scrabble.joinTitle', 'Have a code?')}</Text>
          <Input value={code} onChangeText={setCode} placeholder={t('scrabble.codePlaceholder', 'Enter game code')} autoCapitalize="characters" maxLength={12} />
          <Button title={t('scrabble.joinCta', 'Join game')} onPress={handleJoin} loading={joining} disabled={code.trim().length < 4} variant="secondary" style={styles.btn} />
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
