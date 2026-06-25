import { apiClient } from './client';
import type {
  SessionStartRequest, SessionStartResponse,
  MoveRequest, MoveResponse,
  HintResponse,
  PointsBalance, LedgerEntry,
  GemBalance, GemTransaction, GiftGemsRequest,
  GameType,
  UserProfile,
  Community,
  Tournament, LeaderboardEntry, PlayerRank,
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

// ── Points (pure score / leaderboard metric — no value, no conversion) ───────
export const pointsApi = {
  getBalance: () =>
    apiClient.get<PointsBalance>('/user/points/balance'),

  getHistory: (limit = 50) =>
    apiClient.get<LedgerEntry[]>(`/user/points/history?limit=${limit}`),
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
export const profileApi = {
  getProfile: () =>
    apiClient.get<UserProfile>('/user/profile'),

  updateProfile: (data: Partial<UserProfile>) =>
    apiClient.put('/user/profile', data),

  updateDeviceToken: (deviceToken: string) =>
    apiClient.put('/user/device-token', { deviceToken }),

  getSessions: (limit = 20) =>
    apiClient.get(`/user/sessions?limit=${limit}`),

  deleteAccount: () =>
    apiClient.post('/user/delete-account'),
};

// ── Privacy (GDPR / CCPA) ──────────────────────────────────────────────────
export const privacyApi = {
  /** GDPR Art. 15/20 — all personal data as machine-readable JSON. */
  exportData: () =>
    apiClient.get<Record<string, unknown>>('/user/data-export'),

  /** GDPR Art. 7(3) — stops marketing emails immediately. */
  withdrawConsent: () =>
    apiClient.post('/user/consent/withdraw'),

  /** CCPA — records the do-not-sell preference. */
  doNotSell: () =>
    apiClient.post('/user/privacy/do-not-sell'),
};

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
};

// ── Tournament ─────────────────────────────────────────────────────────────
export const tournamentApi = {
  list: (status?: string) =>
    apiClient.get<Tournament[]>(`/tournament${status ? `?status=${status}` : ''}`),

  create: (payload: {
    name: string;
    gameType: GameType;
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

  getLeaderboard: (id: string, limit = 100) =>
    apiClient.get<{ leaderboard: LeaderboardEntry[]; totalPlayers: number }>(
      `/tournament/${id}/leaderboard?limit=${limit}`
    ),

  getMyRank: (id: string) =>
    apiClient.get<PlayerRank>(`/tournament/${id}/rank`),
};

// ── Presence / activity ────────────────────────────────────────────────────
export const presenceApi = {
  heartbeat: () =>
    apiClient.post<{ status: string }>('/user/heartbeat'),
};
