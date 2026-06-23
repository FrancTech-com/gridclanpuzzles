import { apiClient } from './client';
import { AuthResponse, LoginRequest, RegisterRequest } from '@gridtypes/index';

export const authApi = {
  register: (data: RegisterRequest) =>
    apiClient.post<AuthResponse>('/auth/register', data),

  login: (data: LoginRequest) =>
    apiClient.post<AuthResponse>('/auth/login', data),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthResponse>('/auth/refresh', { refreshToken }),

  logout: () =>
    apiClient.post('/auth/logout'),

  forgotPassword: (identifier: string) =>
    apiClient.post('/auth/forgot-password', { identifier }),

  resetPassword: (identifier: string, otp: string, newPassword: string) =>
    apiClient.post('/auth/reset-password', { identifier, otp, newPassword }),
};
