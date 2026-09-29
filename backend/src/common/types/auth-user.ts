export interface AuthUser {
  sub: string;
  email: string;
}

export interface AccessTokenPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  preferredCurrency: string | null;
  preferredRateType: string | null;
  createdAt: Date;
  updatedAt: Date;
};
