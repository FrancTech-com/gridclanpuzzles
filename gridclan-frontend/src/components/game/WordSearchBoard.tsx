import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Font, Radius, Shadow, Spacing } from '@theme/index';
import { useColors } from '@theme/theme';
import type { WordSearchBoard as Board, WordSearchMove } from '@gridtypes/index';

// On web, show a pointer cursor on the grid (no-op type on native).
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;

interface Props { board: Board; onMove: (move: WordSearchMove) => void; disabled: boolean; }
type Cell = { row: number; col: number };

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
  const maxW = Math.min(width || 360, 420) - Spacing.md * 2;
  const cell = Math.floor(maxW / size);
  const boardW = cell * size;                       // exact, so touch→cell maths line up
  const styles = useMemo(() => makeStyles(Colors, cell, boardW), [Colors, cell, boardW]);

  // The straight/diagonal run currently being swiped (or the two-tap selection).
  const [preview, setPreview] = useState<Cell[]>([]);
  // Refs mirror the live drag so the PanResponder (created once) reads fresh values.
  const previewRef = useRef<Cell[]>([]);
  const setRun = (cells: Cell[]) => { previewRef.current = cells; setPreview(cells); };
  const origin = useRef({ x: 0, y: 0 });            // board's top-left in page coords
  const startCell = useRef<Cell | null>(null);
  const moved = useRef(false);
  const tapStart = useRef<Cell | null>(null);       // first cell of a tap-tap selection

  function toCell(x: number, y: number): Cell | null {
    if (x < 0 || y < 0 || x >= boardW || y >= boardW) return null;
    return { row: Math.min(size - 1, Math.floor(y / cell)), col: Math.min(size - 1, Math.floor(x / cell)) };
  }

  // Snap any drag to the nearest of the 8 straight/diagonal lines from `a`.
  function lineCells(a: Cell, b: Cell): Cell[] {
    const dr = b.row - a.row, dc = b.col - a.col;
    if (dr === 0 && dc === 0) return [a];
    const adr = Math.abs(dr), adc = Math.abs(dc);
    let sr = 0, sc = 0, len = 0;
    if (adr <= adc * 0.4)      { sr = 0; sc = Math.sign(dc); len = adc; }            // horizontal
    else if (adc <= adr * 0.4) { sr = Math.sign(dr); sc = 0; len = adr; }            // vertical
    else                       { sr = Math.sign(dr); sc = Math.sign(dc); len = Math.min(adr, adc); } // diagonal
    const out: Cell[] = [];
    for (let i = 0; i <= len; i++) {
      const r = a.row + sr * i, c = a.col + sc * i;
      if (r < 0 || r >= size || c < 0 || c >= size) break;
      out.push({ row: r, col: c });
    }
    return out;
  }

  function commit(from: Cell, to: Cell) {
    onMove({ fromRow: from.row, fromCol: from.col, toRow: to.row, toCol: to.col });
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      // Don't let an enclosing ScrollView hijack the swipe mid-word.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { locationX, locationY, pageX, pageY } = e.nativeEvent;
        origin.current = { x: pageX - locationX, y: pageY - locationY };
        const c = toCell(locationX, locationY);
        startCell.current = c;
        moved.current = false;
        if (c) setRun([c]);
      },
      onPanResponderMove: (_e, g) => {
        if (!startCell.current) return;
        const c = toCell(g.moveX - origin.current.x, g.moveY - origin.current.y);
        if (!c) return;
        if (c.row !== startCell.current.row || c.col !== startCell.current.col) moved.current = true;
        setRun(lineCells(startCell.current, c));
      },
      onPanResponderRelease: () => {
        const run = previewRef.current;
        const start = startCell.current;
        if (moved.current && start && run.length > 1) {
          // Swipe: first → last cell of the snapped run.
          commit(start, run[run.length - 1]);
          tapStart.current = null;
          setRun([]);
          return;
        }
        // No real movement → behave like the old two-tap selection.
        if (start) {
          if (!tapStart.current) { tapStart.current = start; setRun([start]); }
          else if (tapStart.current.row === start.row && tapStart.current.col === start.col) {
            tapStart.current = null; setRun([]);           // tapped the same cell → cancel
          } else {
            commit(tapStart.current, start); tapStart.current = null; setRun([]);
          }
        } else { setRun([]); }
      },
      onPanResponderTerminate: () => { setRun(tapStart.current ? [tapStart.current] : []); },
    }),
  ).current;

  // Cells belonging to found words → highlighted permanently.
  const foundCells = useMemo(() => {
    const set = new Set<string>();
    for (const w of board.found) {
      const at = locate(board.grid, w);
      if (at) at.forEach(([r, c]) => set.add(`${r},${c}`));
    }
    return set;
  }, [board.grid, board.found]);

  const previewSet = useMemo(() => new Set(preview.map(p => `${p.row},${p.col}`)), [preview]);

  return (
    <View style={styles.container}>
      {/* Letter grid — drag across a word to highlight it (tap-tap still works). */}
      <View style={[styles.board, !disabled && webCursor]} {...pan.panHandlers}>
        {board.grid.map((rowStr, r) => (
          <View key={r} style={styles.row}>
            {rowStr.split('').map((ch, c) => {
              const isPreview = previewSet.has(`${r},${c}`);
              const isFound = foundCells.has(`${r},${c}`);
              return (
                <View
                  key={c}
                  style={[
                    styles.cell,
                    isFound && styles.cellFound,
                    isPreview && styles.cellPreview,
                  ]}
                >
                  <Text style={[styles.cellText, isFound && styles.cellFoundText]}>{ch}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        {preview.length > 1 || tapStart.current ? 'Release on the last letter' : 'Swipe across a word to highlight it'}
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
    board: {
      width: BOARD_W, alignSelf: 'center',
      borderWidth: 3, borderColor: Colors.wordSearch, borderRadius: Radius.md,
      overflow: 'hidden', backgroundColor: Colors.surface, ...Shadow.md,
    },
    row:       { flexDirection: 'row' },
    cell: {
      width: CELL, height: CELL,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    cellPreview:   { backgroundColor: Colors.primary, borderColor: Colors.primaryDim },
    cellFound:     { backgroundColor: Colors.wordSearch + '66', borderColor: Colors.wordSearch },
    cellText:      { color: Colors.textPrimary, fontSize: CELL * 0.52, fontFamily: Font.family.displayBold },
    cellFoundText: { color: '#1a1206' },

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
