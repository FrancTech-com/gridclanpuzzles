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
  PlayerStats,
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

// ── In-game chat (REST side: history + reliable send; WS topic = fast path) ─
export interface GameChatMessageView {
  id:         string;
  senderId:   string;
  senderName: string;
  content:    string;
  sentAt:     string;
}

export const gameChatApi = {
  history: (kind: string, gameId: string) =>
    apiClient.get<GameChatMessageView[]>(`/game-chat/${kind}/${gameId}`),
  send: (kind: string, gameId: string, content: string) =>
    apiClient.post<GameChatMessageView>(`/game-chat/${kind}/${gameId}`, { content }),
};

// ── In-game voice (WebRTC ICE servers, incl. TURN for mobile NATs) ──────────
export const voiceApi = {
  iceServers: () =>
    apiClient.get<{ urls: string; username?: string; credential?: string }[]>('/voice/ice-servers'),
};

// ── Profile ────────────────────────────────────────────────────────────────
export interface ActiveGameResume {
  kind:        'gomoku' | 'battleship' | 'scrabble' | 'chess';
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

  /** Lifetime wins/losses across all games — the achievements screen. */
  getStats: () =>
    apiClient.get<PlayerStats>('/user/stats'),

  // The caller's most-recent unfinished game to resume, or 204 (empty) if none.
  getActiveGame: () =>
    apiClient.get<ActiveGameResume | ''>('/user/active-game'),

  getRank: () =>
    apiClient.get<RankInfo>('/user/rank'),

  deleteAccount: () =>
    apiClient.post('/user/delete-account'),

  /** Everything we hold about the caller, as JSON (GDPR / Uganda DPA export). */
  exportData: () =>
    apiClient.get<Record<string, unknown>>('/user/data-export'),
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

  /** Delete a community (owner or admin only). */
  remove: (communityId: string) =>
    apiClient.delete<{ status: string }>(`/community/${communityId}`),

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
    startsAt: string;   // ISO-8601 — when the bracket kicks off
    endsAt?: string;    // ISO-8601 — optional; server defaults to startsAt + 7d
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

  /** Bracket view: rounds → matches (main draw + consolation draw). */
  getBracket: (id: string) =>
    apiClient.get<{
      tournamentId: string;
      rounds: Record<string, any[]>;
      consolationRounds?: Record<string, any[]>;
    }>(`/tournament/${id}/bracket`),

  /** Delete a tournament (creator or admin only). */
  remove: (id: string) =>
    apiClient.delete<{ status: string }>(`/tournament/${id}`),

  /** Pause/resume a tournament (creator or admin only). */
  pause:  (id: string) => apiClient.post<{ status: string }>(`/tournament/${id}/pause`),
  resume: (id: string) => apiClient.post<{ status: string }>(`/tournament/${id}/resume`),
};

// ── Grid Scrabble (shared-board, 2-4 players) ───────────────────────────────
export interface ScrabblePlacement { row: number; col: number; letter: string; blank: boolean; }

export interface ScrabbleSeat {
  seat:     number;
  name:     string | null;
  score:    number;
  current:  boolean;
  resigned: boolean;
  tiles:    number;     // rack size only — never the letters
}

export interface ScrabbleLogEntry {
  at:      number;
  seat:    number;
  type:    'WORD' | 'PASS' | 'SWAP' | 'RESIGN' | 'TIMEOUT' | 'GAME_END';
  player?: string | null;
  words?:  string[];
  score?:  number;
  bingo?:  boolean;
  count?:  number;
}

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
  maxPlayers:    number;      // 2-4 seats
  seatedCount:   number;
  yourSeat:      number;      // 0 = spectator
  spectator:     boolean;
  players:       ScrabbleSeat[];
  moveLog:       ScrabbleLogEntry[];
  turnDeadline:  number | null;   // epoch ms — 5-min PvP turn clock
  paused?:       boolean;
  difficulty?:   Difficulty;   // present on solo ladder games
  level?:        number;
  outcome?:      'WON' | 'LOST' | 'TIE' | 'SPECTATOR';
  winnerName?:   string | null;
}

export interface ScrabbleHint {
  placements:     { row: number; col: number; letter: string; blank: boolean }[];
  word:           string;
  score:          number;
  hintsRemaining: number;
}

export const scrabbleApi = {
  create: (players = 2) => apiClient.post<ScrabbleView>(`/scrabble?players=${players}`),
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
  pause:   (id: string)  => apiClient.post<ScrabbleView>(`/scrabble/${id}/pause`),
  resume:  (id: string)  => apiClient.post<ScrabbleView>(`/scrabble/${id}/resume`),
};

// ── Chess (real-time 2-player; friend + tournament) ─────────────────────────
export interface ChessPlayerView { color: 'WHITE' | 'BLACK'; name: string | null; current: boolean; }

export interface ChessView {
  gameId:       string;
  inviteCode:   string;
  status:       'WAITING_FOR_OPPONENT' | 'ACTIVE' | 'COMPLETE';
  board:        string[];    // 8 rows, rank 8 → rank 1; '.'=empty, UPPER=white
  fen:          string;
  yourColor:    'WHITE' | 'BLACK' | null;
  yourTurn:     boolean;
  currentColor: 'WHITE' | 'BLACK';
  hasOpponent:  boolean;
  spectator:    boolean;
  inCheck:      boolean;
  legalMoves:   string[];    // UCI ("e2e4", "e7e8q") — only on your turn
  moveLog:      string[];
  lastMove:     string | null;
  players:      ChessPlayerView[];
  turnDeadline: number | null;   // epoch ms — losing on time is the chess rule
  paused?:      boolean;
  vsComputer?:  boolean;
  difficulty?:  Difficulty;   // present on solo ladder games
  level?:       number;
  endReason?:   'CHECKMATE' | 'STALEMATE' | 'DRAW_50' | 'DRAW_MATERIAL' | 'RESIGN' | 'TIMEOUT';
  outcome?:     'WON' | 'LOST' | 'TIE' | 'SPECTATOR';
  winnerName?:  string | null;
}

export const chessApi = {
  create: () => apiClient.post<ChessView>('/chess'),
  solo:   (difficulty?: Difficulty, level?: number) =>
            apiClient.post<ChessView>(`/chess/solo${soloQuery(difficulty, level)}`),
  join:   (code: string) => apiClient.post<ChessView>(`/chess/${code}/join`),
  get:    (id: string)   => apiClient.get<ChessView>(`/chess/${id}`),
  move:   (id: string, move: string) =>
            apiClient.post<ChessView>(`/chess/${id}/move`, { move }),
  forfeit: (id: string)  => apiClient.post<ChessView>(`/chess/${id}/forfeit`),
  pause:   (id: string)  => apiClient.post<ChessView>(`/chess/${id}/pause`),
  resume:  (id: string)  => apiClient.post<ChessView>(`/chess/${id}/resume`),
};

// ── Monopoly (tournament-only tables of up to 8) ─────────────────────────────
export interface MonopolySquare {
  index: number;
  type:  'GO' | 'PROP' | 'RAIL' | 'UTIL' | 'TAX' | 'CHANCE' | 'CHEST' | 'JAIL' | 'GO_TO_JAIL' | 'FREE';
  name:  string;
  group: string | null;
  price: number;
  houseCost: number;
  rent:  number[];
}

export interface MonopolySeatView {
  seat:      number;
  name:      string | null;
  cash:      number;
  pos:       number;
  inJail:    boolean;
  jailCards: number;
  bankrupt:  boolean;
  left:      boolean;     // removed by a disable/kick (vs normal bankruptcy)
  timeouts:  number;      // consecutive missed turns
  kickable:  boolean;     // this player has stalled and you may disable them
  netWorth:  number;
  current:   boolean;
}

export interface MonopolyPropView { square: number; owner: number; houses: number; mortgaged: boolean; }

export type MonopolyAction =
  | 'ROLL' | 'BUY' | 'SKIP_BUY' | 'BUILD' | 'SELL_HOUSE'
  | 'MORTGAGE' | 'UNMORTGAGE' | 'PAY_JAIL' | 'USE_JAIL_CARD' | 'END_TURN'
  | 'AUCTION_BID' | 'AUCTION_PASS'
  | 'PROPOSE_TRADE' | 'COUNTER_TRADE' | 'ACCEPT_TRADE' | 'DECLINE_TRADE'
  | 'KICK';

// A live property auction (when someone declines to buy at list price).
export interface MonopolyAuction {
  square:         number;
  squareName:     string;
  highBid:        number;
  highBidder:     number;        // seat, -1 = no bid yet
  highBidderName: string | null;
  turn:           number;        // seat to bid next
  turnName:       string | null;
  in:             boolean[];     // still bidding, per seat
  yourBid:        boolean;       // it's your turn to bid
  minBid:         number;        // highBid + 1
}

// The trade payload the client sends and the server echoes back (with names).
export interface MonopolyTradePayload {
  to:               number;
  offerCash?:       number;
  requestCash?:     number;
  offerProps?:      number[];
  requestProps?:    number[];
  offerJailCards?:  number;
  requestJailCards?: number;
}

export interface MonopolyTradeView extends MonopolyTradePayload {
  from:      number;
  fromName:  string;
  toName:    string;
  incoming:  boolean;   // you're the recipient (accept / decline)
  outgoing:  boolean;   // you proposed it (cancel)
}

export interface MonopolyView {
  gameId:        string;
  status:        'ACTIVE' | 'COMPLETE';
  yourSeat:      number;      // -1 = spectator
  spectator:     boolean;
  yourTurn:      boolean;
  current:       number;
  phase:         'ROLL' | 'BUY' | 'AUCTION' | 'MANAGE';
  extraRoll:     boolean;
  lastRoll:      number[];
  pendingSquare: number;
  round:         number;
  maxRounds:     number;
  players:       MonopolySeatView[];
  properties:    MonopolyPropView[];
  log:           string[];
  auction:       MonopolyAuction | null;
  trade:         MonopolyTradeView | null;
  turnDeadline:  number | null;
  paused?:       boolean;
  outcome?:      'WON' | 'LOST' | 'TIE' | 'SPECTATOR';
  winnerName?:   string | null;
}

export const monopolyApi = {
  board: () => apiClient.get<MonopolySquare[]>('/monopoly/board'),
  get:   (id: string) => apiClient.get<MonopolyView>(`/monopoly/${id}`),
  act:   (id: string, action: MonopolyAction, opts?: { square?: number; amount?: number; trade?: MonopolyTradePayload; target?: number }) =>
           apiClient.post<MonopolyView>(`/monopoly/${id}/act`, { action, ...opts }),
  pause:  (id: string) => apiClient.post<MonopolyView>(`/monopoly/${id}/pause`),
  resume: (id: string) => apiClient.post<MonopolyView>(`/monopoly/${id}/resume`),
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
  spectator?:  boolean;
  turnDeadline?: number | null;   // epoch ms — 5-min PvP turn clock
  paused?:       boolean;
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
  pause:   (id: string)  => apiClient.post<GomokuView>(`/gomoku/${id}/pause`),
  resume:  (id: string)  => apiClient.post<GomokuView>(`/gomoku/${id}/resume`),
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
  spectator?:    boolean;
  turnDeadline?: number | null;   // epoch ms — 5-min PvP turn clock
  paused?:       boolean;
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
  pause:   (id: string)  => apiClient.post<BattleshipView>(`/battleship/${id}/pause`),
  resume:  (id: string)  => apiClient.post<BattleshipView>(`/battleship/${id}/resume`),
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
