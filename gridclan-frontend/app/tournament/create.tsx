import React, { useEffect, useState } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tournamentApi, communityApi } from '@api/index';
import { Button, Card, Input } from '@components/ui/index';
import { Font, Radius, Spacing, TournamentGameMeta } from '@theme/index';
import { useColors, useTheme } from '@theme/theme';
import type { Community, TournamentGame } from '@gridtypes/index';

const GAME_ORDER: TournamentGame[] = ['SCRABBLE', 'GOMOKU', 'BATTLESHIP', 'CHESS', 'MONOPOLY'];

// A one-line description of how each game's bracket runs, shown under the picker.
const FORMAT_NOTE: Record<TournamentGame, string> = {
  SCRABBLE:   'Groups of four share one board; the top two advance. First-round losers get a second chance in the losers bracket.',
  GOMOKU:     'Classic knockout — win your match and advance.',
  BATTLESHIP: 'Classic knockout — win your match and advance.',
  CHESS:      'Classic knockout — win your match and advance.',
  MONOPOLY:   'Tables of up to 8 players; each table winner advances to the next round.',
};

// The creator picks WHEN the tournament starts (players join while it's
// UPCOMING; the scheduler seeds the bracket at start time). Quick presets keep
// it one-tap; "custom" opens a date+time entry — a native browser
// datetime-local input on web, plain date/time text fields on native (no
// date-picker dependency).
const START_PRESETS: { key: 'm30' | 'h1' | 'h3'; minutes: number }[] = [
  { key: 'm30', minutes: 30 },
  { key: 'h1',  minutes: 60 },
  { key: 'h3',  minutes: 180 },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toTimeStr = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export default function CreateTournamentScreen() {
  const Colors = useColors();
  const { scheme } = useTheme();
  const styles = React.useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();

  const [name, setName]             = useState('');
  const [gameType, setGameType]     = useState<TournamentGame>('SCRABBLE');
  const [startKey, setStartKey]     = useState<'m30' | 'h1' | 'h3' | 'custom'>('h1');
  // Custom start, prefilled with "tomorrow, same hour" as a sensible seed.
  const [customDate, setCustomDate] = useState(() => toDateStr(new Date(Date.now() + 24 * 3600_000)));
  const [customTime, setCustomTime] = useState(() => toTimeStr(new Date(Date.now() + 24 * 3600_000)));
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

  // The chosen start moment, or null while the custom entry is invalid / past.
  function computeStartsAt(): Date | null {
    if (startKey !== 'custom') {
      const preset = START_PRESETS.find(p => p.key === startKey)!;
      return new Date(Date.now() + preset.minutes * 60_000);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate.trim())) return null;
    if (!/^\d{1,2}:\d{2}$/.test(customTime.trim()))     return null;
    const d = new Date(`${customDate.trim()}T${customTime.trim().padStart(5, '0')}`);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) return null;
    return d;
  }

  const startsAtDate = computeStartsAt();
  const valid = name.trim().length >= 3 && startsAtDate !== null;

  async function handleCreate() {
    if (!valid || submitting) return;
    setSubmitting(true);
    const maxNum = parseInt(maxPlayers, 10);
    const result = await tournamentApi.create({
      name: name.trim(),
      gameType,
      communityId,
      maxPlayers: Number.isFinite(maxNum) && maxNum > 0 ? maxNum : undefined,
      startsAt: startsAtDate!.toISOString(),
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
                style={[styles.chip, gameType === type && { borderColor: TournamentGameMeta[type].color, backgroundColor: TournamentGameMeta[type].color + '22' }]}
                onPress={() => setGameType(type)}
              >
                <Text style={[styles.chipText, gameType === type && { color: TournamentGameMeta[type].color }]}>
                  {TournamentGameMeta[type].icon} {TournamentGameMeta[type].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.formatNote}>{t(`tournament.format_${gameType}`, FORMAT_NOTE[gameType])}</Text>

          {/* Start time */}
          <Text style={styles.label}>{t('tournament.startTime', 'Starts')}</Text>
          <View style={styles.chips}>
            {START_PRESETS.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chip, startKey === p.key && styles.chipActive]}
                onPress={() => setStartKey(p.key)}
              >
                <Text style={[styles.chipText, startKey === p.key && { color: Colors.primary }]}>
                  {t(`tournament.start_${p.key}`)}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.chip, startKey === 'custom' && styles.chipActive]}
              onPress={() => setStartKey('custom')}
            >
              <Text style={[styles.chipText, startKey === 'custom' && { color: Colors.primary }]}>
                {t('tournament.start_custom', 'Pick date & time')}
              </Text>
            </TouchableOpacity>
          </View>

          {startKey === 'custom' && (
            Platform.OS === 'web'
              ? (
                <View style={styles.customRow}>
                  {React.createElement('input', {
                    type: 'datetime-local',
                    value: `${customDate}T${customTime}`,
                    min: `${toDateStr(new Date())}T${toTimeStr(new Date())}`,
                    onChange: (e: any) => {
                      const [d, tm] = String(e.target.value).split('T');
                      if (d)  setCustomDate(d);
                      if (tm) setCustomTime(tm.slice(0, 5));
                    },
                    style: {
                      background: 'transparent', color: Colors.textPrimary,
                      border: `1px solid ${Colors.border}`, borderRadius: 10,
                      padding: '10px 12px', fontSize: 15, colorScheme: scheme,
                    },
                  })}
                </View>
              ) : (
                <View style={styles.customRow}>
                  <View style={styles.customField}>
                    <Input
                      label={t('tournament.startDate', 'Date')}
                      value={customDate}
                      onChangeText={setCustomDate}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                  <View style={styles.customField}>
                    <Input
                      label={t('tournament.startClock', 'Time (24h)')}
                      value={customTime}
                      onChangeText={setCustomTime}
                      placeholder="18:30"
                    />
                  </View>
                </View>
              )
          )}

          {startKey === 'custom' && !startsAtDate && (
            <Text style={styles.timeError}>
              {t('tournament.startInvalid', 'Enter a valid future date and time')}
            </Text>
          )}
          {startsAtDate && (
            <Text style={styles.startSummary}>
              🕒 {t('tournament.startsAt', 'Starts {{when}}', {
                when: startsAtDate.toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                }),
              })}
            </Text>
          )}

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

  formatNote:   { color: Colors.textMuted, fontSize: Font.size.xs, lineHeight: 17, marginTop: Spacing.sm },
  customRow:    { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, alignItems: 'flex-start' },
  customField:  { flex: 1 },
  timeError:    { color: Colors.error, fontSize: Font.size.sm, marginTop: Spacing.sm },
  startSummary: { color: Colors.textSecondary, fontSize: Font.size.sm, marginTop: Spacing.sm },

  note: { color: Colors.warning, fontSize: Font.size.sm, marginTop: Spacing.lg },
  cta:  { marginTop: Spacing.lg },
});
