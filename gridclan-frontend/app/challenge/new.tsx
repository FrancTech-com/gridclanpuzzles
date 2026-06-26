import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { challengeApi } from '@api/index';
import { Button, Card, Input } from '@components/ui/index';
import { Font, GameMeta, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { GameType } from '@gridtypes/index';

/**
 * Friend mode = async challenge. Create one (server makes a board, you play
 * your round, then share the code), or enter a friend's code to join theirs.
 */
export default function NewChallengeScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ gameType?: string }>();
  const gameType = (params.gameType as GameType) || 'WORD_SEARCH';

  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const res = await challengeApi.create(gameType).catch(() => null);
    setCreating(false);
    if (res?.data?.code) router.replace(`/challenge/${res.data.code}`);
    else Alert.alert(t('challenge.createFailed', 'Could not start a challenge. Please try again.'));
  }

  function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    router.push(`/challenge/${c}`);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown:     true,
          title:           t('challenge.title', 'Friend challenge'),
          headerStyle:     { backgroundColor: Colors.surface },
          headerTintColor: Colors.textPrimary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('challenge.intro', 'Challenge a friend: you both solve the same puzzle, then your scores are compared. No need to be online at the same time.')}</Text>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('challenge.startTitle', 'Start a challenge')}</Text>
          <Text style={[styles.gameTag, { color: GameMeta[gameType].color }]}>{GameMeta[gameType].label}</Text>
          <Text style={styles.cardBody}>{t('challenge.startBody', 'We’ll create a puzzle and start your round. Afterwards you’ll get a code to share.')}</Text>
          <Button
            title={t('challenge.createCta', 'Create & play my round')}
            onPress={handleCreate}
            loading={creating}
            size="lg"
            style={styles.btn}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('challenge.joinTitle', 'Have a code?')}</Text>
          <Input
            value={code}
            onChangeText={setCode}
            placeholder={t('challenge.codePlaceholder', 'Enter code e.g. K7P2Q9')}
            autoCapitalize="characters"
            maxLength={12}
          />
          <Button
            title={t('challenge.joinCta', 'Join challenge')}
            onPress={handleJoin}
            disabled={code.trim().length < 4}
            variant="secondary"
            style={styles.btn}
          />
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
  gameTag:   { fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: 2 },
  cardBody:  { color: Colors.textMuted, fontSize: Font.size.sm, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  btn:       { marginTop: Spacing.sm },
});
