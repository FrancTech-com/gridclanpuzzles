import { apiClient } from './client';
import type {
  SessionStartRequest, SessionStartResponse,
  MoveRequest, MoveResponse,
  HintResponse,
  PointsBalance, LedgerEntry,
  GemBalance, GemTransaction, GiftGemsRequest,
  GameType, LadderProgress, Difficulty,
  GemQuote, PurchaseInit, PurchaseStatus,
  SupportedCurrencies, CardQuote, CardPurchaseInit,
  WalletBalance, WithdrawQuote, WithdrawInit, WithdrawStatus, WithdrawalRecord,
  AdsStatus, AdStart, AdComplete,
  UserProfile,
  Community, CommunityMemberInfo, ChatMessage,
  Tournament, TournamentGame, TournamentMe, LeaderboardEntry, PlayerRank,
  GlobalLeaderboardEntry, GameLeaderboardEntry, GameKey,
} from '@gridtypes/index';

// ── Game ───────────────────────────────────────────────────────────────────
export const gameApi = {
  startSession: (data: SessionStartRequest) =>
    apiClient.post<SessionStartResponse>('/game/session/start', data),

  submitMove: (data: MoveRequest) =>
    apiClient.post<MoveResponse>('/game/session/move', data),

  requestHint: (sessionId: string) =>
    apiClient.post<HintResponse>(`/game/session/hint?sessionId=${sessionId}`),

  /** Spend gems to revive a failed solo/casual session. */
  revive: (sessionId: string) =>
    apiClient.post<MoveResponse>('/game/session/revive', { sessionId }),

  /** Spend gems to replay a game with the same friend. */
  replay: (friendId: string, gameType: GameType) =>
    apiClient.post<SessionStartResponse>('/game/session/replay', { friendId, gameType }),
};

// ── Difficulty ladders (solo) ────────────────────────────────────────────────

/** Build the ?difficulty=&level= query for a solo start (empty when not a ladder game). */
function soloQuery(difficulty?: Difficulty, level?: number): string {
  if (!difficulty) return '';
  return `?difficulty=${difficulty}&level=${level ?? 1}`;
}

export const levelsApi = {
  /** Ladder progress (per difficulty) for the level-select screen. Accepts any of
   *  the four ladder games (WORD_SEARCH / GOMOKU / BATTLESHIP / SCRABBLE). */
  getProgress: (gameType: string) =>
    apiClient.get<LadderProgress[]>(`/levels/${gameType}`),
};

// ── Gem purchases (Relworx mobile money) ─────────────────────────────────────
export const paymentsApi = {
  /** Packs priced in the currency of the given mobile-money number. */
  quote:    (msisdn: string) =>
              apiClient.get<GemQuote>(`/payments/gems/quote?msisdn=${encodeURIComponent(msisdn)}`),
  /** Start a purchase; the player then approves the mobile-money prompt. */
  initiate: (packId: string, msisdn: string) =>
              apiClient.post<PurchaseInit>('/payments/gems/initiate', { packId, msisdn }),
  /** Poll a purchase's state (the webhook is the source of truth). */
  status:   (reference: string) =>
              apiClient.get<PurchaseStatus>(`/payments/gems/status?reference=${encodeURIComponent(reference)}`),

  // ── Card (Visa/Mastercard) ──
  /** Currencies offered for card payment. */
  currencies:   () => apiClient.get<SupportedCurrencies>('/payments/gems/currencies'),
  /** Packs priced in a chosen currency (card flow). */
  cardQuote:    (currency: string) =>
                  apiClient.get<CardQuote>(`/payments/gems/card-quote?currency=${encodeURIComponent(currency)}`),
  /** Open a hosted card-payment session; returns a paymentUrl to send the player to. */
  initiateCard: (packId: string, currency: string) =>
                  apiClient.post<CardPurchaseInit>('/payments/gems/initiate-card', { packId, currency }),
};

// ── Prize wallet + withdrawals (real cash OUT via Relworx send-payment) ──────
export const walletApi = {
  /** The player's prize balances, one per currency. */
  balances:  () => apiClient.get<WalletBalance[]>('/payments/wallet'),
  /** What withdrawing to this number looks like: currency, balance, limits, name. */
  quote:     (msisdn: string) =>
               apiClient.get<WithdrawQuote>(`/payments/withdraw/quote?msisdn=${encodeURIComponent(msisdn)}`),
  /** Hold the funds and send the payout to the number. */
  initiate:  (msisdn: string, amount: number) =>
               apiClient.post<WithdrawInit>('/payments/withdraw/initiate', { msisdn, amount }),
  /** Poll a withdrawal's state (the webhook is the source of truth). */
  status:    (reference: string) =>
               apiClient.get<WithdrawStatus>(`/payments/withdraw/status?reference=${encodeURIComponent(reference)}`),
  /** Recent withdrawals. */
  history:   (limit = 20) =>
               apiClient.get<WithdrawalRecord[]>(`/payments/withdraw/history?limit=${limit}`),
};

// ── Ad rewards (watching ads earns the withdrawable money) ───────────────────
export const adsApi = {
  /** Provider chain, reward per ad, remaining today, ad-free state. */
  status:   () => apiClient.get<AdsStatus>('/ads/status'),
  /** Issue an ad session before the ad plays. deviceId ties the daily cap to
   *  the device too, so multi-account farming on one phone can't multiply it. */
  start:    (placement: 'REWARDED' | 'POST_GAME' = 'REWARDED', deviceId?: string) =>
              apiClient.post<AdStart>('/ads/start', { placement, deviceId }),
  /** The ad finished — credit the wallet (idempotent per session). */
  complete: (adSessionId: string, providerId?: string) =>
              apiClient.post<AdComplete>('/ads/complete', { adSessionId, providerId }),
  /** Opt in/out of personalised ads (server only honours it for adults). */
  consent:  (personalized: boolean) =>
              apiClient.post<{ personalizedConsent: boolean; personalizedAllowed: boolean }>(
                '/ads/consent', { personalized }),
  /** One-time age confirmation for pre-existing accounts. The date is checked
   *  server-side and discarded — only the 18+ yes/no is kept. */
  confirmAge: (dateOfBirth: string) =>
              apiClient.post<{ ageKnown: boolean; personalizedConsent: boolean; personalizedAllowed: boolean }>(
                '/ads/confirm-age', { dateOfBirth }),
};

// ── Points (pure score / leaderboard metric — no value, no conversion) ───────
export const pointsApi = {
  getBalance: () =>
    apiClient.get<PointsBalance>('/user/points/balance'),

  getHistory: (limit = 50) =>
    apiClient.get<LedgerEntry[]>(`/user/points/history?limit=${limit}`),

  /** Combined leaderboard — ranked by total points, with per-game breakdown. */
  getGlobalLeaderboard: (limit = 10) =>
    apiClient.get<{ leaderboard: GlobalLeaderboardEntry[] }>(
      `/leaderboard/global?limit=${limit}`),

  /** Single-game leaderboard — ranked by that game's points. */
  getGameLeaderboard: (game: GameKey, limit = 10) =>
    apiClient.get<{ leaderboard: GameLeaderboardEntry[]; game: string }>(
      `/leaderboard/global?limit=${limit}&game=${game}`),
};

// ── Gems (closed-loop in-game currency — no real-world value, no cashout) ────
export const gemsApi = {
  getBalance: () =>
    apiClient.get<GemBalance>('/user/gems/balance'),

  getHistory: (limit = 50) =>
    apiClient.get<GemTransaction[]>(`/user/gems/history?limit=${limit}`),

  gift: (data: GiftGemsRequest) =>
    apiClient.post<{ status: string; balance: number }>('/user/gems/gift', data),

  /** Claim gems from an optional rewarded ad (idempotent via adSessionId). */
  claimAdReward: (adSessionId: string) =>
    apiClient.post<{ status: string; awarded: number; balance: number }>(
      '/user/gems/ad-reward', { adSessionId }),
};

// ── Profile ────────────────────────────────────────────────────────────────
export interface ActiveGameResume {
  kind:        'gomoku' | 'battleship' | 'scrabble';
  gameId:      string;
  status:      'ACTIVE' | 'WAITING_FOR_OPPONENT';
  vsComputer:  boolean;
  lastMoveAt:  string | null;
}

export const profileApi = {
  getProfile: () =>
    apiClient.get<UserProfile>('/user/profile'),

  updateProfile: (data: Partial<UserProfile>) =>
    apiClient.put('/user/profile', data),

  updateDeviceToken: (deviceToken: string) =>
    apiClient.put('/user/device-token', { deviceToken }),

  getSessions: (limit = 20) =>
    apiClient.get(`/user/sessions?limit=${limit}`),

  // The caller's most-recent unfinished game to resume, or 204 (empty) if none.
  getActiveGame: () =>
    apiClient.get<ActiveGameResume | ''>('/user/active-game'),

  getRank: () =>
    apiClient.get<RankInfo>('/user/rank'),

  deleteAccount: () =>
    apiClient.post('/user/delete-account'),
};

// ── Feedback (goes only to the admin dashboard) ────────────────────────────
export const feedbackApi = {
  send: (content: string) =>
    apiClient.post('/feedback', { content }),
};

export interface RankInfo {
  rank:          'BEGINNER' | 'AMATEUR' | 'PROFESSIONAL';
  rankLabel:     string;
  points:        number;
  gemsPerWin:    number;
  soloHints:     number;
  nextRank:      'AMATEUR' | 'PROFESSIONAL' | null;
  nextRankLabel?: string;
  pointsToNext:  number;
  progress:      number;   // 0..1 within the current tier
}

// ── Community ──────────────────────────────────────────────────────────────
export const communityApi = {
  list: (page = 0, size = 20) =>
    apiClient.get<Community[]>(`/community?page=${page}&size=${size}`),

  create: (name: string, description?: string) =>
    apiClient.post<{ communityId: string; name: string }>('/community', { name, description }),

  join: (communityId: string) =>
    apiClient.post(`/community/${communityId}/join`),

  leave: (communityId: string) =>
    apiClient.delete(`/community/${communityId}/leave`),

  members: (communityId: string) =>
    apiClient.get<CommunityMemberInfo[]>(`/community/${communityId}/members`),

  messages: (communityId: string) =>
    apiClient.get<ChatMessage[]>(`/community/${communityId}/messages`),
};

// ── Tournament ─────────────────────────────────────────────────────────────
export const tournamentApi = {
  list: (status?: string) =>
    apiClient.get<Tournament[]>(`/tournament${status ? `?status=${status}` : ''}`),

  byCommunity: (communityId: string) =>
    apiClient.get<Tournament[]>(`/tournament?communityId=${communityId}`),

  create: (payload: {
    name: string;
    gameType: TournamentGame;
    communityId?: string;
    maxPlayers?: number;
    startsAt: string;   // ISO-8601
    endsAt: string;     // ISO-8601
  }) =>
    apiClient.post<{ tournamentId: string; name: string; status: string }>(
      '/tournament', payload,
    ),

  get: (id: string) =>
    apiClient.get<Tournament>(`/tournament/${id}`),

  /** Enter a tournament while it's UPCOMING. */
  join: (id: string) =>
    apiClient.post<{ tournamentId: string; joined: boolean }>(`/tournament/${id}/join`),

  /** Viewer's state — drives "go straight to your match" / waiting / result. */
  getMe: (id: string) =>
    apiClient.get<TournamentMe>(`/tournament/${id}/me`),

  /** Bracket view: rounds → matches. */
  getBracket: (id: string) =>
    apiClient.get<{ tournamentId: string; rounds: Record<string, any[]> }>(
      `/tournament/${id}/bracket`),
};

// ── Grid Scrabble (async shared-board 2-player) ─────────────────────────────
export interface ScrabblePlacement { row: number; col: number; letter: string; blank: boolean; }

export interface ScrabbleView {
  gameId:        string;
  inviteCode:    string;
  status:        'WAITING_FOR_OPPONENT' | 'ACTIVE' | 'COMPLETE';
  board:         string[];   // 15 rows; '.'=empty, UPPER=tile, lower=blank
  yourRack:      string;     // up to 7 chars ('_' = blank)
  yourTurn:      boolean;
  yourScore:     number;
  opponentScore: number;
  hasOpponent:   boolean;
  tilesInBag:    number;
  vsComputer?:   boolean;
  hintsRemaining?: number;
  difficulty?:   Difficulty;   // present on solo ladder games
  level?:        number;
  outcome?:      'WON' | 'LOST' | 'TIE';
}

export interface ScrabbleHint {
  placements:     { row: number; col: number; letter: string; blank: boolean }[];
  word:           string;
  score:          number;
  hintsRemaining: number;
}

export const scrabbleApi = {
  create: () => apiClient.post<ScrabbleView>('/scrabble'),
  solo:   (difficulty?: Difficulty, level?: number) =>
            apiClient.post<ScrabbleView>(`/scrabble/solo${soloQuery(difficulty, level)}`),
  join:   (code: string) => apiClient.post<ScrabbleView>(`/scrabble/${code}/join`),
  get:    (id: string)   => apiClient.get<ScrabbleView>(`/scrabble/${id}`),
  move:   (id: string, placements: ScrabblePlacement[]) =>
            apiClient.post<ScrabbleView>(`/scrabble/${id}/move`, { placements }),
  pass:   (id: string)   => apiClient.post<ScrabbleView>(`/scrabble/${id}/pass`),
  exchange: (id: string, tiles: string) =>
            apiClient.post<ScrabbleView>(`/scrabble/${id}/exchange`, { tiles }),
  hint:   (id: string)   => apiClient.post<ScrabbleHint>(`/scrabble/${id}/hint`),
  forfeit: (id: string)  => apiClient.post<ScrabbleView>(`/scrabble/${id}/forfeit`),
};

// ── Gomoku (real-time five-in-a-row) ────────────────────────────────────────
export interface GomokuView {
  gameId:      string;
  inviteCode:  string;
  status:      'WAITING_FOR_OPPONENT' | 'ACTIVE' | 'COMPLETE';
  board:       string[];   // 15 rows; '.'=empty, '1'/'2'=stones
  yourStone:   number;     // 1 or 2 (0 = spectator)
  yourTurn:    boolean;
  hasOpponent: boolean;
  vsComputer?: boolean;
  hintsRemaining?: number;
  difficulty?: Difficulty;     // present on solo ladder games
  level?:      number;
  outcome?:    'WON' | 'LOST' | 'TIE';
}

export interface HintCell { row: number; col: number; hintsRemaining: number }

export const gomokuApi = {
  create: () => apiClient.post<GomokuView>('/gomoku'),
  solo:   (difficulty?: Difficulty, level?: number) =>
            apiClient.post<GomokuView>(`/gomoku/solo${soloQuery(difficulty, level)}`),
  join:   (code: string) => apiClient.post<GomokuView>(`/gomoku/${code}/join`),
  get:    (id: string)   => apiClient.get<GomokuView>(`/gomoku/${id}`),
  move:   (id: string, row: number, col: number) =>
            apiClient.post<GomokuView>(`/gomoku/${id}/move`, { row, col }),
  hint:   (id: string)   => apiClient.post<HintCell>(`/gomoku/${id}/hint`),
  revive: (id: string)   => apiClient.post<GomokuView>(`/gomoku/${id}/revive`),
  forfeit: (id: string)  => apiClient.post<GomokuView>(`/gomoku/${id}/forfeit`),
};

// ── Battleship (real-time) ──────────────────────────────────────────────────
export interface BattleshipView {
  gameId:        string;
  inviteCode:    string;
  status:        'WAITING_FOR_OPPONENT' | 'ACTIVE' | 'COMPLETE';
  yourBoard:     string[];   // your waters: '.'=water 'S'=ship 'O'=miss 'X'=hit
  trackingBoard: string[];   // your shots on the enemy: '.'=unknown 'O'=miss 'X'=hit
  yourTurn:      boolean;
  hasOpponent:   boolean;
  vsComputer?:   boolean;
  hintsRemaining?: number;
  lastShot?:     'HIT' | 'MISS' | 'SUNK' | 'WIN';
  difficulty?:   Difficulty;   // present on solo ladder games
  level?:        number;
  outcome?:      'WON' | 'LOST' | 'TIE';
}

export const battleshipApi = {
  create: () => apiClient.post<BattleshipView>('/battleship'),
  solo:   (difficulty?: Difficulty, level?: number) =>
            apiClient.post<BattleshipView>(`/battleship/solo${soloQuery(difficulty, level)}`),
  join:   (code: string) => apiClient.post<BattleshipView>(`/battleship/${code}/join`),
  get:    (id: string)   => apiClient.get<BattleshipView>(`/battleship/${id}`),
  move:   (id: string, row: number, col: number) =>
            apiClient.post<BattleshipView>(`/battleship/${id}/move`, { row, col }),
  hint:   (id: string)   => apiClient.post<HintCell>(`/battleship/${id}/hint`),
  revive: (id: string)   => apiClient.post<BattleshipView>(`/battleship/${id}/revive`),
  forfeit: (id: string)  => apiClient.post<BattleshipView>(`/battleship/${id}/forfeit`),
};

// ── Challenges (async friend matches) ───────────────────────────────────────
export interface ChallengeView {
  code:          string;
  gameType:      GameType;
  status:        'PENDING' | 'COMPLETE';
  role:          'CREATOR' | 'OPPONENT' | 'VIEWER';
  hasOpponent:   boolean;
  yourScore:     number | null;
  theirScore:    number | null;
  yourSessionId: string | null;
  expiresAt:     string;
  outcome?:      'WON' | 'LOST' | 'TIE';
}

export const challengeApi = {
  create: (gameType: GameType) =>
    apiClient.post<{ code: string; sessionId: string; gameType: GameType }>('/challenge', { gameType }),

  get: (code: string) =>
    apiClient.get<ChallengeView>(`/challenge/${code}`),

  accept: (code: string) =>
    apiClient.post<{ sessionId: string; gameType: GameType }>(`/challenge/${code}/accept`),
};

// ── Presence / activity ────────────────────────────────────────────────────
export const presenceApi = {
  heartbeat: () =>
    apiClient.post<{ status: string }>('/user/heartbeat'),
};
