import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch } from '@store/index';
import { startSessionThunk } from '@store/slices/gameSlice';
import { levelsApi, gomokuApi, battleshipApi, scrabbleApi } from '@api/index';
import { LoadingSpinner } from '@components/ui/index';
import { playSfx } from '@services/sound';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { Difficulty, GameKey, LadderProgress } from '@gridtypes/index';

const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

const DIFF_META: Record<Difficulty, { icon: string; label: string; blurb: string }> = {
  EASY:   { icon: '🟢', label: 'Easy',   blurb: 'Small grid, short words, straight lines only.' },
  MEDIUM: { icon: '🟡', label: 'Medium', blurb: 'Bigger grid, more words, diagonals included.' },
  HARD:   { icon: '🔴', label: 'Hard',   blurb: 'Large grid, many words, diagonals AND reversed. Pays the most.' },
};

const GAME_TITLE: Record<string, string> = {
  WORD_SEARCH: 'Word Search',
  GOMOKU:      'Grid Connect',
  BATTLESHIP:  'Grid Battleships',
  SCRABBLE:    'Grid Scrabble',
};

/**
 * Difficulty-ladder level select for solo play. Three difficulties, each a locked
 * ladder of 20 levels — finish a level to unlock the next. Tapping an unlocked
 * level starts a SOLO session sized + scored for that difficulty/level.
 */
export default function LevelSelectScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const params = useLocalSearchParams<{ gameType?: string }>();
  const gameType = ((params.gameType as string)?.toUpperCase() as GameKey) || 'WORD_SEARCH';

  const [ladders, setLadders] = useState<LadderProgress[] | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
  const [starting, setStarting] = useState<number | null>(null); // level being started
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    levelsApi.getProgress(gameType)
      .then(res => { if (active) setLadders(res.data ?? []); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [gameType]);

  const current = ladders?.find(l => l.difficulty === difficulty);

  async function startLevel(level: number) {
    if (starting != null) return;
    playSfx('tap');
    setStarting(level);
    try {
      if (gameType === 'WORD_SEARCH') {
        const result = await dispatch(
          startSessionThunk({ gameType: 'WORD_SEARCH', tier: 'SOLO', difficulty, level }));
        if (startSessionThunk.fulfilled.match(result)) {
          router.push(`/game/${result.payload.sessionId}`);
        }
        return;
      }
      // The three board games each have their own vs-computer endpoint + screen.
      const res =
          gameType === 'GOMOKU'     ? await gomokuApi.solo(difficulty, level)
        : gameType === 'BATTLESHIP' ? await battleshipApi.solo(difficulty, level)
        :                             await scrabbleApi.solo(difficulty, level);
      const id = res.data?.gameId;
      if (id) {
        const path = gameType === 'GOMOKU' ? 'gomoku'
                   : gameType === 'BATTLESHIP' ? 'battleship' : 'scrabble';
        router.replace(`/${path}/${id}`);
      }
    } catch { /* locked/invalid level — tiles already gate this; stay put */ }
    finally { setStarting(null); }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        headerShown: true,
        title: t('levels.title', 'Choose a level'),
        headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.textPrimary,
      }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{GAME_TITLE[gameType] ?? gameType}</Text>
        <Text style={styles.intro}>
          {t('levels.intro', 'Pick a difficulty, then a level. Finish a level to unlock the next. Harder levels and higher numbers are worth more points.')}
        </Text>

        {/* Difficulty selector */}
        <View style={styles.diffRow}>
          {DIFFICULTIES.map(d => {
            const selected = d === difficulty;
            return (
              <TouchableOpacity
                key={d}
                style={[styles.diffPill, selected && styles.diffPillActive]}
                onPress={() => { playSfx('tap'); setDifficulty(d); }}
                activeOpacity={0.8}
              >
                <Text style={styles.diffIcon}>{DIFF_META[d].icon}</Text>
                <Text style={[styles.diffLabel, selected && styles.diffLabelActive]}>
                  {t(`levels.diff.${d}`, DIFF_META[d].label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.blurb}>{DIFF_META[difficulty].blurb}</Text>

        {/* Level grid */}
        {error ? (
          <Text style={styles.error}>{t('levels.loadFailed', 'Could not load your levels. Pull back and try again.')}</Text>
        ) : !ladders || !current ? (
          <LoadingSpinner />
        ) : (
          <View style={styles.grid}>
            {Array.from({ length: current.levels }, (_, i) => i + 1).map(level => {
              const unlocked = level <= current.highestUnlocked;
              const best = current.bestScores?.[String(level)];
              const isStarting = starting === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[styles.tile, !unlocked && styles.tileLocked, best != null && styles.tileCleared]}
                  disabled={!unlocked || starting != null}
                  onPress={() => startLevel(level)}
                  activeOpacity={0.8}
                >
                  {isStarting ? (
                    <ActivityIndicator color={Colors.textPrimary} />
                  ) : unlocked ? (
                    <>
                      <Text style={styles.tileNum}>{level}</Text>
                      {best != null
                        ? <Text style={styles.tileBest}>⭐ {best}</Text>
                        : <Text style={styles.tilePlay}>▶</Text>}
                    </>
                  ) : (
                    <Text style={styles.tileLock}>🔒</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  heading:   { color: Colors.textPrimary, fontSize: Font.size.xl, fontWeight: Font.weight.bold },
  intro:     { color: Colors.textSecondary, fontSize: Font.size.sm, lineHeight: 20, marginTop: Spacing.xs, marginBottom: Spacing.lg },

  diffRow:   { flexDirection: 'row', gap: Spacing.sm },
  diffPill:  {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  diffPillActive: { borderColor: Colors.primary, backgroundColor: Colors.surface },
  diffIcon:  { fontSize: 18 },
  diffLabel: { color: Colors.textMuted, fontSize: Font.size.sm, fontWeight: Font.weight.bold, marginTop: 2 },
  diffLabelActive: { color: Colors.textPrimary },
  blurb:     { color: Colors.textMuted, fontSize: Font.size.sm, lineHeight: 18, marginTop: Spacing.sm, marginBottom: Spacing.lg },

  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile:      {
    width: 64, height: 64, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  tileCleared: { borderColor: Colors.accent },
  tileLocked:  { opacity: 0.45, backgroundColor: Colors.bg },
  tileNum:   { color: Colors.textPrimary, fontSize: Font.size.lg, fontWeight: Font.weight.bold },
  tileBest:  { color: Colors.accent, fontSize: Font.size.xs, marginTop: 2 },
  tilePlay:  { color: Colors.primary, fontSize: Font.size.xs, marginTop: 2 },
  tileLock:  { fontSize: 20 },
  error:     { color: Colors.textMuted, fontSize: Font.size.sm, marginTop: Spacing.lg },
});
