import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Font, Radius, Spacing } from '@theme/index';
import type { LinkedRushBoard as Board, RushMove } from '@gridtypes/index';

interface Props { board: Board; onMove: (move: RushMove) => void; disabled: boolean; }

// Simple circular layout — position nodes around a circle
function nodePosition(index: number, total: number, radius: number, cx: number, cy: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export function LinkedRushBoard({ board, onMove, disabled }: Props) {
  const cx = 150, cy = 150, r = 110;
  const nodeSize = 40;

  const positions = Array.from({ length: board.nodeCount }, (_, i) =>
    nodePosition(i, board.nodeCount, r, cx, cy)
  );

  const handleNode = (nodeIdx: number) => {
    if (disabled) return;
    const neighbours = board.adjacency[String(board.currentNode)] ?? [];
    if (!neighbours.includes(nodeIdx)) return;
    if (board.visitedNodes.includes(nodeIdx)) return;
    onMove({ fromNode: board.currentNode, toNode: nodeIdx });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Visited {board.visitedNodes.length} / {board.targetScore} nodes
      </Text>

      {/* SVG-like view using absolute positioning */}
      <View style={styles.canvas}>
        {/* Edges — rendered as thin dividers (approximation) */}
        {Object.entries(board.adjacency).map(([fromStr, neighbours]) => {
          const from = parseInt(fromStr);
          return (neighbours as number[]).map(to => {
            if (to <= from) return null; // Draw each edge once
            const p1 = positions[from], p2 = positions[to];
            const len = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2);
            const angle = Math.atan2(p2.y-p1.y, p2.x-p1.x) * 180 / Math.PI;
            return (
              <View key={`${from}-${to}`} style={[styles.edge, {
                left:   p1.x + nodeSize/2,
                top:    p1.y + nodeSize/2,
                width:  len,
                transform: [{ rotate: `${angle}deg` }],
              }]} />
            );
          });
        })}

        {/* Nodes */}
        {positions.map((pos, idx) => {
          const isCurrent  = idx === board.currentNode;
          const isVisited  = board.visitedNodes.includes(idx);
          const neighbours = board.adjacency[String(board.currentNode)] ?? [];
          const isReachable = !isVisited && neighbours.includes(idx);

          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.node,
                { left: pos.x, top: pos.y },
                isCurrent   && styles.nodeCurrent,
                isVisited   && styles.nodeVisited,
                isReachable && styles.nodeReachable,
              ]}
              onPress={() => handleNode(idx)}
              activeOpacity={0.7}
            >
              <Text style={[styles.nodeText, isCurrent && { color: Colors.bg }]}>{idx}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.hint}>Tap a connected unvisited node to move</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.md },
  label:     { color: Colors.textSecondary, fontSize: Font.size.md, fontWeight: Font.weight.semi },

  canvas: {
    width: 300, height: 300,
    position: 'relative',
  },

  edge: {
    position:        'absolute',
    height:          1,
    backgroundColor: Colors.border,
    transformOrigin: 'left center',
  },

  node: {
    position:        'absolute',
    width:           40, height: 40,
    borderRadius:    20,
    backgroundColor: Colors.surfaceHigh,
    borderWidth:     2,
    borderColor:     Colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  nodeCurrent:   { backgroundColor: Colors.primary,   borderColor: Colors.primary },
  nodeVisited:   { backgroundColor: Colors.surfaceHigh, borderColor: Colors.accent, opacity: 0.6 },
  nodeReachable: { borderColor: Colors.linkedRush, borderWidth: 2 },
  nodeText:      { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.sm },

  hint: { color: Colors.textMuted, fontSize: Font.size.xs },
});
