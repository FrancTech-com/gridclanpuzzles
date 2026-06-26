import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gomokuApi } from '@api/index';
import { Button, Card, Input } from '@components/ui/index';
import { Font, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';

/**
 * Gomoku entry: start a new real-time game (then share the code) or join a
 * friend's game by code. The game itself lives at /gomoku/[id].
 */
export default function NewGomokuScreen() {
  const { t } = useTranslation();
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const res = await gomokuApi.create().catch(() => null);
    setCreating(false);
    if (res?.data?.gameId) router.replace(`/gomoku/${res.data.gameId}`);
    else Alert.alert(t('gomoku.createFailed', 'Could not start a game. Please try again.'));
  }

  async function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4 || joining) return;
    setJoining(true);
    const res = await gomokuApi.join(c).catch(() => null);
    setJoining(false);
    if (res?.data?.gameId) router.replace(`/gomoku/${res.data.gameId}`);
    else Alert.alert(t('gomoku.joinFailed', 'Could not join that game. Check the code.'));
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        headerShown: true, title: t('gomoku.title', 'Grid Connect'),
        headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
      }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('gomoku.intro', 'Take turns placing stones. First to line up five in a row — across, down, or diagonally — wins. Your friend sees every move in real time.')}</Text>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('gomoku.startTitle', 'Start a game')}</Text>
          <Text style={styles.cardBody}>{t('gomoku.startBody', 'You play first. We’ll give you a code to share with a friend.')}</Text>
          <Button title={t('gomoku.createCta', 'Start & invite a friend')} onPress={handleCreate} loading={creating} size="lg" style={styles.btn} />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('gomoku.joinTitle', 'Have a code?')}</Text>
          <Input value={code} onChangeText={setCode} placeholder={t('gomoku.codePlaceholder', 'Enter game code')} autoCapitalize="characters" maxLength={12} />
          <Button title={t('gomoku.joinCta', 'Join game')} onPress={handleJoin} loading={joining} disabled={code.trim().length < 4} variant="secondary" style={styles.btn} />
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
