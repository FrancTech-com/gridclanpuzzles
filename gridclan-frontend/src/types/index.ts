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
  /** Recipient's username (or, for back-compat, a raw user-id). */
  recipient: string;
  amount:    number;
  note?:     string;
}

// ── Game ───────────────────────────────────────────────────────────────────
export type GameType = 'WORD_SEARCH';
export type GameTier = 'SOLO' | 'FRIEND' | 'COMMUNITY_TOURNAMENT';
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'FLAGGED' | 'ABANDONED';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
/** Levels per difficulty ladder — must match Difficulty.LEVELS on the backend. */
export const LEVELS_PER_DIFFICULTY = 20;

export interface SessionStartRequest {
  gameType:      GameType;
  tier:          GameTier;
  tournamentId?: string;
  /** Solo difficulty-ladder selection (omit for a quick/non-ladder solo game). */
  difficulty?:   Difficulty;
  level?:        number;
}

export interface SessionStartResponse {
  sessionId:    string;
  initialBoard: BoardState;
  hintsAllowed: boolean;
  gameType:     GameType;
  tier:         GameTier;
  status:       SessionStatus;
  difficulty?:  Difficulty | null;
  level?:       number;
}

// ── Gem purchases (Relworx mobile money) ─────────────────────────────────────
export interface GemPack {
  id:    string;
  label?: string;
  gems:  number;
  price: number;     // in the quote's currency
}

export interface GemQuote {
  configured:   boolean;
  currency:     string | null;   // null = country not supported
  numberValid?: boolean;
  customerName?: string | null;  // mobile-money account name, when validated
  packs:        GemPack[];
}

export interface PurchaseInit {
  reference: string;
  status:    'PENDING' | 'SUCCESSFUL' | 'FAILED';
  gems:      number;
  amount:    number;
  currency:  string;
  message:   string;
}

export interface PurchaseStatus {
  reference: string;
  status:    'PENDING' | 'SUCCESSFUL' | 'FAILED';
  gems:      number;
}

export interface SupportedCurrencies {
  configured: boolean;
  currencies: string[];
}

export interface CardQuote {
  configured: boolean;
  currency:   string | null;
  packs:      GemPack[];
}

export interface CardPurchaseInit {
  reference:  string;
  status:     'PENDING' | 'SUCCESSFUL' | 'FAILED';
  gems:       number;
  amount:     number;
  currency:   string;
  paymentUrl: string;
}

/** One difficulty's ladder progress, from GET /levels/{gameType}. */
export interface LadderProgress {
  difficulty:      Difficulty;
  levels:          number;            // total levels in the ladder (20)
  highestUnlocked: number;            // furthest startable level
  bestScores:      Record<string, number>; // level (as string) → best score
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
// Tournaments run on the three real-time 2-player games (not solo Word Search).
export type TournamentGame = 'SCRABBLE' | 'GOMOKU' | 'BATTLESHIP';

export interface Tournament {
  id:           string;
  name:         string;
  gameType:     TournamentGame;
  status:       'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  /** Always 0 — entry is free, enforced by a DB CHECK constraint. */
  entryFeePts:  number;
  hintsAllowed: false;          // Always false — enforced by server
  maxPlayers:   number | null;
  startsAt:     string;
  endsAt:       string;
  communityId:  string | null;
  currentRound?: number;
  winnerId?:    string | null;
  joinedCount?: number;
  joined?:      boolean;        // is the caller entered (only on GET /{id})
}

// Where the viewer stands in a tournament (drives the detail "hub").
export type TournamentState =
  | 'NOT_JOINED' | 'WAITING_START' | 'CANCELLED'
  | 'PLAYING' | 'WAITING_NEXT' | 'ELIMINATED' | 'CHAMPION' | 'DONE';

export interface TournamentMe {
  tournamentId:     string;
  tournamentStatus: Tournament['status'];
  gameType:         TournamentGame;
  currentRound:     number;
  joined:           boolean;
  state:            TournamentState;
  eliminatedRound?: number;
  currentMatch?: {
    matchId:      string;
    round:        number;
    gameType:     TournamentGame;
    gameId:       string | null;
    opponentName: string | null;
  };
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
