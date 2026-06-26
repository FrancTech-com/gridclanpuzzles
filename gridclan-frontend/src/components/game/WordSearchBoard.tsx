import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Font, Radius, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { WordSearchBoard as Board, WordSearchMove } from '@gridtypes/index';

// On web, show a pointer cursor on interactive cells (no-op type on native).
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;

interface Props { board: Board; onMove: (move: WordSearchMove) => void; disabled: boolean; }

const DIRS = [
  [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1],
];

// Locate an already-found word in the grid so we can highlight its cells. The
// grid is fully visible to the player, so this reveals nothing secret.
function locate(grid: string[], word: string): Array<[number, number]> | null {
  const rows = grid.length, cols = grid[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of DIRS) {
        const er = r + (word.length - 1) * dr;
        const ec = c + (word.length - 1) * dc;
        if (er < 0 || er >= rows || ec < 0 || ec >= cols) continue;
        let hit = true;
        for (let i = 0; i < word.length; i++) {
          if (grid[r + i * dr][c + i * dc] !== word[i]) { hit = false; break; }
        }
        if (hit) {
          const cells: Array<[number, number]> = [];
          for (let i = 0; i < word.length; i++) cells.push([r + i * dr, c + i * dc]);
          return cells;
        }
      }
    }
  }
  return null;
}

export function WordSearchBoard({ board, onMove, disabled }: Props) {
  const Colors = useColors();
  const { width } = useWindowDimensions();
  const size = board.grid.length;
  const boardW = Math.min(width || 360, 420) - Spacing.md * 2;
  const cell = Math.floor(boardW / size);
  const styles = useMemo(() => makeStyles(Colors, cell, boardW), [Colors, cell, boardW]);

  const [start, setStart] = useState<{ row: number; col: number } | null>(null);

  // Cells belonging to found words → highlighted permanently.
  const foundCells = useMemo(() => {
    const set = new Set<string>();
    for (const w of board.found) {
      const at = locate(board.grid, w);
      if (at) at.forEach(([r, c]) => set.add(`${r},${c}`));
    }
    return set;
  }, [board.grid, board.found]);

  function tap(row: number, col: number) {
    if (disabled) return;
    if (!start) { setStart({ row, col }); return; }
    if (start.row === row && start.col === col) { setStart(null); return; }  // tap start again to cancel
    onMove({ fromRow: start.row, fromCol: start.col, toRow: row, toCol: col });
    setStart(null);
  }

  return (
    <View style={styles.container}>
      {/* Letter grid */}
      <View style={styles.board}>
        {board.grid.map((rowStr, r) => (
          <View key={r} style={styles.row}>
            {rowStr.split('').map((ch, c) => {
              const isStart = start?.row === r && start?.col === c;
              const isFound = foundCells.has(`${r},${c}`);
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.7}
                  onPress={() => tap(r, c)}
                  style={[
                    styles.cell,
                    isFound && styles.cellFound,
                    isStart && styles.cellStart,
                    !disabled && webCursor,
                  ]}
                >
                  <Text style={[styles.cellText, isFound && styles.cellFoundText]}>{ch}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        {start ? 'Tap the last letter of the word' : 'Tap the first letter of a word'}
      </Text>

      {/* Word list */}
      <View style={styles.words}>
        {board.words.map(w => {
          const done = board.found.includes(w);
          return (
            <View key={w} style={[styles.wordChip, done && styles.wordChipDone]}>
              <Text style={[styles.wordText, done && styles.wordTextDone]}>{w}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.progress}>{board.found.length}/{board.words.length} found</Text>
    </View>
  );
}

const makeStyles = (Colors: ReturnType<typeof useColors>, CELL: number, BOARD_W: number) =>
  StyleSheet.create({
    container: { alignItems: 'center', gap: Spacing.md },
    board:     { width: BOARD_W, alignSelf: 'center' },
    row:       { flexDirection: 'row' },
    cell: {
      width: CELL, height: CELL,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    cellStart:     { backgroundColor: Colors.primary },
    cellFound:     { backgroundColor: Colors.wordSearch + '55' },
    cellText:      { color: Colors.textPrimary, fontSize: CELL * 0.46, fontWeight: Font.weight.bold },
    cellFoundText: { color: Colors.textPrimary },

    hint:     { color: Colors.textMuted, fontSize: Font.size.sm },

    words:    { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, justifyContent: 'center' },
    wordChip: {
      paddingHorizontal: Spacing.sm, paddingVertical: 4,
      borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
      backgroundColor: Colors.surfaceHigh,
    },
    wordChipDone: { backgroundColor: Colors.wordSearch + '33', borderColor: Colors.wordSearch },
    wordText:     { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.semi },
    wordTextDone: { color: Colors.wordSearch, textDecorationLine: 'line-through' },

    progress: { color: Colors.textMuted, fontSize: Font.size.sm },
  });
