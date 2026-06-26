// ── Auth ───────────────────────────────────────────────────────────────────
export interface AuthResponse {
  accessToken:  string;
  refreshToken: string;
  role:         string;
  userId:       string;
}

export interface RegisterRequest {
  username?:          string;
  email:              string;
  phoneNumber?:       string;
  password:           string;
  /** ISO 3166-1 alpha-2 country code; backend validates ^[A-Z]{2}$. */
  countryCode?:       string;
  /** YYYY-MM-DD — required by the backend COPPA age gate; never persisted. */
  dateOfBirth:        string;
}

export interface LoginRequest {
  identifier: string;  // email or phone
  password:   string;
}

// ── User / Profile ─────────────────────────────────────────────────────────
export interface UserProfile {
  userId:            string;
  username:          string | null;
  displayName:       string | null;
  avatarUrl:         string | null;
  countryCode:       string;
  emailVerified:     boolean;
  role:              'USER' | 'ADMIN' | 'SYSTEM';
  createdAt:         string;
  lastLoginAt:       string | null;
}

// ── Points (pure score / leaderboard metric — no value, no conversion) ──────
export interface PointsBalance {
  balance:        number;
  lifetimeEarned: number;
  lifetimeSpent:  number;
  updatedAt:      string;
}

export interface LedgerEntry {
  type:         string;
  pointsDelta:  number;
  balanceAfter: number;
  status:       string;
  createdAt:    string;
}

// ── Gems (closed-loop in-game currency — no real-world value, no cashout) ───
export interface GemBalance {
  balance:          number;
  lifetimeEarned:   number;
  lifetimeGifted:   number;
  lifetimeReceived: number;
  lifetimeSpent:    number;
}

export interface GemTransaction {
  type:           string;
  gemsDelta:      number;
  balanceAfter:   number;
  counterpartyId: string | null;
  note:           string | null;
  createdAt:      string;
}

export interface GiftGemsRequest {
  recipientId: string;
  amount:      number;
  note?:       string;
}

// ── Game ───────────────────────────────────────────────────────────────────
export type GameType = 'WORD_SEARCH';
export type GameTier = 'SOLO' | 'FRIEND' | 'COMMUNITY_TOURNAMENT';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'FLAGGED' | 'ABANDONED';

export interface SessionStartRequest {
  gameType:      GameType;
  tier:          GameTier;
  tournamentId?: string;
}

export interface SessionStartResponse {
  sessionId:    string;
  initialBoard: BoardState;
  hintsAllowed: boolean;
  gameType:     GameType;
  tier:         GameTier;
  status:       SessionStatus;
}

export interface MoveRequest {
  sessionId:       string;
  move:            WordSearchMove;
  clientTimestamp: number;
}

export interface MoveResponse {
  boardState:  BoardState;
  score:       number;
  moveCount:   number;
  status:      SessionStatus;
  flagReason?: string;
}

export interface HintResponse {
  boardState: BoardState;
  score:      number;
  hintData:   HintData;
}

// ── Board state types ──────────────────────────────────────────────────────
export type BoardState = WordSearchBoard;

export interface WordSearchBoard {
  type:   'WORD_SEARCH';
  rows:   number;
  cols:   number;
  grid:   string[];     // one uppercase-letter string per row
  words:  string[];     // words to find
  found:  string[];     // words found so far
  solved: boolean;
}

// ── Move types ─────────────────────────────────────────────────────────────
export interface WordSearchMove {
  fromRow: number; fromCol: number;
  toRow:   number; toCol:   number;
}

// ── Hint data ──────────────────────────────────────────────────────────────
export interface HintData {
  type:    'WORD_LOCATION' | 'NONE';
  message: string;
  [key: string]: unknown;
}

// ── Community ──────────────────────────────────────────────────────────────
export interface Community {
  id:           string;
  name:         string;
  description:  string | null;
  memberCount:  number;
  weeklyPoolPts: number;
  isActive:     boolean;
  isMember:     boolean;
  createdAt:    string;
}

// ── Tournament ─────────────────────────────────────────────────────────────
export interface Tournament {
  id:           string;
  name:         string;
  gameType:     GameType;
  status:       'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  /** Always 0 — entry is free, enforced by a DB CHECK constraint. */
  entryFeePts:  number;
  hintsAllowed: false;          // Always false — enforced by server
  maxPlayers:   number | null;
  startsAt:     string;
  endsAt:       string;
  communityId:  string | null;
}

export interface LeaderboardEntry {
  rank:        number;
  userId:      string;
  displayName: string;
  score:       number;
}

export interface PlayerRank {
  rank:  number;
  score: number;
  total: number;
}

// The four games whose points feed the leaderboard.
export type GameKey = 'WORD_SEARCH' | 'SCRABBLE' | 'GOMOKU' | 'BATTLESHIP';

// Combined leaderboard row — ranked by total points across all games, with a
// per-game breakdown. Display name + scores only (no PII).
export interface GlobalLeaderboardEntry {
  rank:        number;
  displayName: string;
  total:       number;
  games:       Partial<Record<GameKey, number>>;
}

// Single-game leaderboard row.
export interface GameLeaderboardEntry {
  rank:        number;
  displayName: string;
  points:      number;
}

// ── Chat ───────────────────────────────────────────────────────────────────
export type ChatMessageType = 'CHAT' | 'JOIN' | 'LEAVE' | 'SYSTEM';

export interface ChatMessage {
  type:         ChatMessageType;
  content:      string;
  senderId:     string;
  senderName:   string;
  communityId?: string;
  sentAt:       string;
}

export interface CommunityMemberInfo {
  userId:      string;
  displayName: string;
  role:        string;
}

// ── Misc ───────────────────────────────────────────────────────────────────
export interface ApiError {
  status:    number;
  error:     string;
  message:   string;
  timestamp: number;
}
