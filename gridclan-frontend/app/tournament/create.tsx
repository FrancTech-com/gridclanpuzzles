import React, { useEffect, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tournamentApi, communityApi } from '@api/index';
import { Button, Card, Input } from '@components/ui/index';
import { Font, GameMeta, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { Community, GameType } from '@gridtypes/index';

const GAME_ORDER: GameType[] = ['GRID_LOCKDOWN', 'SUM_CIPHER', 'LINKED_RUSH'];

// Duration presets (hours) — avoids a native date-picker dependency and keeps
// the flow one-tap. The tournament starts now and ends now + duration.
const DURATIONS: { key: string; hours: number }[] = [
  { key: 'h1', hours: 1 },
  { key: 'd1', hours: 24 },
  { key: 'w1', hours: 24 * 7 },
];

export default function CreateTournamentScreen() {
  const Colors = useColors();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [name, setName]             = useState('');
  const [gameType, setGameType]     = useState<GameType>('GRID_LOCKDOWN');
  const [durationH, setDurationH]   = useState(24);
  const [maxPlayers, setMaxPlayers] = useState('');
  const [communityId, setCommunityId] = useState<string | undefined>(undefined);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Offer the user's own communities to attach the tournament to (optional).
  useEffect(() => {
    communityApi.list()
      .then(res => setCommunities(res.data.filter(c => c.isMember)))
      .catch(() => {});
  }, []);

  const valid = name.trim().length >= 3;

  async function handleCreate() {
    if (!valid || submitting) return;
    setSubmitting(true);
    const now = new Date();
    const ends = new Date(now.getTime() + durationH * 3600_000);
    const maxNum = parseInt(maxPlayers, 10);
    const result = await tournamentApi.create({
      name: name.trim(),
      gameType,
      communityId,
      maxPlayers: Number.isFinite(maxNum) && maxNum > 0 ? maxNum : undefined,
      startsAt: now.toISOString(),
      endsAt: ends.toISOString(),
    }).catch(() => null);
    setSubmitting(false);

    if (result?.data?.tournamentId) {
      router.replace(`/tournament/${result.data.tournamentId}`);
    } else {
      Alert.alert(t('tournament.createFailed', 'Could not create the tournament. Please try again.'));
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown:     true,
          title:           t('tournament.createTitle', 'New tournament'),
          headerStyle:     { backgroundColor: Colors.surface },
          headerTintColor: Colors.textPrimary,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Input
            label={t('tournament.fieldName', 'Tournament name')}
            value={name}
            onChangeText={setName}
            placeholder={t('tournament.namePlaceholder', 'e.g. Friday Night Grid')}
            maxLength={150}
          />

          {/* Game type */}
          <Text style={styles.label}>{t('home.gameType')}</Text>
          <View style={styles.chips}>
            {GAME_ORDER.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, gameType === type && { borderColor: GameMeta[type].color, backgroundColor: GameMeta[type].color + '22' }]}
                onPress={() => setGameType(type)}
              >
                <Text style={[styles.chipText, gameType === type && { color: GameMeta[type].color }]}>
                  {GameMeta[type].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Duration */}
          <Text style={styles.label}>{t('tournament.duration', 'Duration')}</Text>
          <View style={styles.chips}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d.key}
                style={[styles.chip, durationH === d.hours && styles.chipActive]}
                onPress={() => setDurationH(d.hours)}
              >
                <Text style={[styles.chipText, durationH === d.hours && { color: Colors.primary }]}>
                  {t(`tournament.dur_${d.key}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Community (optional) */}
          {communities.length > 0 && (
            <>
              <Text style={styles.label}>{t('tournament.community', 'Community (optional)')}</Text>
              <View style={styles.chips}>
                <TouchableOpacity
                  style={[styles.chip, communityId === undefined && styles.chipActive]}
                  onPress={() => setCommunityId(undefined)}
                >
                  <Text style={[styles.chipText, communityId === undefined && { color: Colors.primary }]}>
                    {t('tournament.communityNone', 'Open')}
                  </Text>
                </TouchableOpacity>
                {communities.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, communityId === c.id && styles.chipActive]}
                    onPress={() => setCommunityId(c.id)}
                  >
                    <Text style={[styles.chipText, communityId === c.id && { color: Colors.primary }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Input
            label={t('tournament.maxPlayers', 'Max players (optional)')}
            value={maxPlayers}
            onChangeText={setMaxPlayers}
            placeholder={t('tournament.unlimited', 'Unlimited')}
            keyboardType="number-pad"
          />

          <Text style={styles.note}>⚠ {t('home.noHintsTournament')}</Text>
        </Card>

        <Button
          title={t('tournament.createCta', 'Create tournament')}
          onPress={handleCreate}
          loading={submitting}
          disabled={!valid}
          size="lg"
          style={styles.cta}
        />
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  card:      { padding: Spacing.md },

  label: {
    color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi,
    marginTop: Spacing.md, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip:       { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, maxWidth: 180 },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '22' },
  chipText:   { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },

  note: { color: Colors.warning, fontSize: Font.size.sm, marginTop: Spacing.lg },
  cta:  { marginTop: Spacing.lg },
});
