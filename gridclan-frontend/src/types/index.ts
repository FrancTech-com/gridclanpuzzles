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
  /** GDPR Art. 6(1)(a) explicit opt-in; defaults to false server-side. */
  marketingConsent?:  boolean;
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
export type GameType = 'GRID_LOCKDOWN' | 'SUM_CIPHER' | 'LINKED_RUSH';
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
  move:            GridMove | SumMove | RushMove;
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
export type BoardState = GridLockdownBoard | SumCipherBoard | LinkedRushBoard;

export interface GridLockdownBoard {
  type:          'GRID_LOCKDOWN';
  rows:          number;
  cols:          number;
  grid:          number[][];
  targetPattern: number[][];
  solved:        boolean;
}

export interface SumCipherBoard {
  type:       'SUM_CIPHER';
  cells:      number[];
  groups:     number[][];
  targetSums: number[];
  solved:     boolean;
}

export interface LinkedRushBoard {
  type:         'LINKED_RUSH';
  nodeCount:    number;
  adjacency:    Record<string, number[]>;
  currentNode:  number;
  visitedNodes: number[];
  targetScore:  number;
  solved:       boolean;
}

// ── Move types ─────────────────────────────────────────────────────────────
export interface GridMove {
  fromX: number; fromY: number;
  toX:   number; toY:   number;
}

export interface SumMove {
  cellIndex: number;
  digit:     number;
}

export interface RushMove {
  fromNode: number;
  toNode:   number;
}

// ── Hint data ──────────────────────────────────────────────────────────────
export interface HintData {
  type:    'MOVE_SUGGESTION' | 'DIGIT_SUGGESTION' | 'NODE_SUGGESTION' | 'STUCK' | 'NONE';
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

// ── Chat ───────────────────────────────────────────────────────────────────
export type ChatMessageType = 'CHAT' | 'JOIN' | 'LEAVE' | 'SYSTEM';

export interface ChatMessage {
  type:         ChatMessageType;
  content:      string;
  senderId:     string;
  senderName:   string;
  communityId:  string;
  sentAt:       string;
}

// ── Misc ───────────────────────────────────────────────────────────────────
export interface ApiError {
  status:    number;
  error:     string;
  message:   string;
  timestamp: number;
}
