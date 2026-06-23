import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Font, Radius, Spacing } from '@theme/index';
import type { SumCipherBoard as Board, SumMove } from '@gridtypes/index';

// ── SumCipherBoard ─────────────────────────────────────────────────────────

interface SumProps { board: Board; onMove: (move: SumMove) => void; disabled: boolean; }

export function SumCipherBoard({ board, onMove, disabled }: SumProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const handleCell = (idx: number) => {
    if (disabled || board.cells[idx] !== 0) return;
    setSelected(selected === idx ? null : idx);
  };

  const handleDigit = (digit: number) => {
    if (selected === null) return;
    onMove({ cellIndex: selected, digit });
    setSelected(null);
  };

  // Group colours
  const groupColors = ['#ff6b6b40', '#7c6dff40', '#4cff9140', '#ffcc4440', '#44ccff40', '#ff944440'];

  return (
    <View style={sumStyles.container}>
      {/* 3×3 cipher grid */}
      <View style={sumStyles.grid}>
        {board.cells.map((cell, idx) => {
          const row = Math.floor(idx / 3);
          const col = idx % 3;
          // Find which group this cell belongs to (take first group for colour)
          const groupIdx = board.groups.findIndex(g => g.includes(idx));
          const groupColor = groupColors[groupIdx % groupColors.length];
          return (
            <TouchableOpacity
              key={idx}
              style={[
                sumStyles.cell,
                { backgroundColor: groupColor },
                selected === idx && sumStyles.cellSelected,
              ]}
              onPress={() => handleCell(idx)}
              activeOpacity={0.7}
            >
              <Text style={[sumStyles.cellText, cell === 0 && { color: Colors.textMuted }]}>
                {cell === 0 ? (selected === idx ? '?' : '·') : cell}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Group targets */}
      <View style={sumStyles.targets}>
        {board.groups.slice(0, 3).map((group, gi) => {
          const partial = group.reduce((s, i) => s + board.cells[i], 0);
          return (
            <View key={gi} style={[sumStyles.targetChip, { backgroundColor: groupColors[gi] }]}>
              <Text style={sumStyles.targetText}>{partial}/{board.targetSums[gi]}</Text>
            </View>
          );
        })}
      </View>

      {/* Digit pad */}
      {selected !== null && (
        <View style={sumStyles.digitPad}>
          <Text style={sumStyles.padLabel}>Select digit</Text>
          <View style={sumStyles.digits}>
            {[1,2,3,4,5,6,7,8,9].map(d => (
              <TouchableOpacity key={d} style={sumStyles.digit} onPress={() => handleDigit(d)}>
                <Text style={sumStyles.digitText}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const sumStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.lg },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 4 },
  cell: {
    width: 72, height: 72, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  cellSelected: { borderColor: Colors.primary, borderWidth: 2 },
  cellText: { fontSize: Font.size.xl, fontWeight: Font.weight.bold, color: Colors.textPrimary },
  targets: { flexDirection: 'row', gap: Spacing.sm },
  targetChip: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  targetText: { fontSize: Font.size.sm, fontWeight: Font.weight.semi, color: Colors.textPrimary },
  digitPad:  { alignItems: 'center', gap: Spacing.sm },
  padLabel:  { color: Colors.textMuted, fontSize: Font.size.sm },
  digits:    { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 8 },
  digit: {
    width: 68, height: 52, backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  digitText: { fontSize: Font.size.xl, color: Colors.primary, fontWeight: Font.weight.bold },
});
