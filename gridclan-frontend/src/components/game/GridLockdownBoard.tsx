import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '@theme/index';
import type { GridLockdownBoard as Board, GridMove } from '@gridtypes/index';

const TILE_COLORS = ['transparent', '#ff6b6b', '#7c6dff', '#4cff91', '#ffcc44'];

interface Props {
  board:    Board;
  onMove:   (move: GridMove) => void;
  disabled: boolean;
}

export function GridLockdownBoard({ board, onMove, disabled }: Props) {
  const [selected, setSelected] = React.useState<{ x: number; y: number } | null>(null);

  const handleTap = useCallback((x: number, y: number) => {
    if (disabled) return;
    if (!selected) {
      if (board.grid[y][x] !== 0) setSelected({ x, y });
      return;
    }
    // Second tap — attempt move to adjacent empty cell
    const dx = Math.abs(x - selected.x);
    const dy = Math.abs(y - selected.y);
    const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (isAdjacent && board.grid[y][x] === 0) {
      onMove({ fromX: selected.x, fromY: selected.y, toX: x, toY: y });
    }
    setSelected(null);
  }, [selected, board, onMove, disabled]);

  return (
    <View style={styles.container}>
      {/* Target pattern preview */}
      <View style={styles.targetSection}>
        <Text style={styles.label}>Target</Text>
        <View style={styles.miniGrid}>
          {board.targetPattern.map((row, r) =>
            row.map((cell, c) => (
              <View
                key={`t-${r}-${c}`}
                style={[styles.miniCell, { backgroundColor: TILE_COLORS[cell] ?? Colors.surfaceHigh }]}
              />
            ))
          )}
        </View>
      </View>

      {/* Live board */}
      <View style={styles.grid}>
        {board.grid.map((row, r) =>
          row.map((cell, c) => {
            const isSelected  = selected?.x === c && selected?.y === r;
            const isHighlight = selected && board.grid[r][c] === 0 && (
              (Math.abs(c - selected.x) === 1 && r === selected.y) ||
              (Math.abs(r - selected.y) === 1 && c === selected.x)
            );
            return (
              <TouchableOpacity
                key={`${r}-${c}`}
                style={[
                  styles.cell,
                  { backgroundColor: cell === 0 ? Colors.surfaceHigh : TILE_COLORS[cell] },
                  isSelected  && styles.cellSelected,
                  isHighlight && styles.cellHighlight,
                ]}
                onPress={() => handleTap(c, r)}
                activeOpacity={0.7}
              >
                {cell !== 0 && <Text style={styles.cellText}>{cell}</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.lg },

  targetSection: { alignItems: 'center', gap: Spacing.xs },
  label: { color: Colors.textMuted, fontSize: 12 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 90 },
  miniCell: { width: 14, height: 14, margin: 1, borderRadius: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 300 },
  cell: {
    width: 46, height: 46, margin: 3,
    borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  cellSelected:  { borderColor: Colors.primary, borderWidth: 2 },
  cellHighlight: { borderColor: Colors.accent,  borderWidth: 2, opacity: 0.7 },
  cellText: { color: Colors.bg, fontWeight: '700', fontSize: 16 },
});
