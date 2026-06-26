package com.gridclan.entity.enums;

/**
 * Single-player (solo, scored) game types handled by the GameSession engine.
 *
 * The real-time 2-player games (Grid Scrabble, Battleship, Gomoku) are NOT here —
 * they have their own entities/services and live-sync over WebSocket.
 */
public enum GameType {
    WORD_SEARCH
}
