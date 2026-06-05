import { create } from "zustand";

const REFRESH_TOKEN_KEY = "arogyam_refresh_token";

interface TokenStore {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  getRefreshToken: () => string | null;
  setRefreshToken: (token: string | null) => void;
  clearTokens: () => void;
}

export const useTokenStore = create<TokenStore>((set) => ({
  accessToken: null,

  setAccessToken: (token) => set({ accessToken: token }),

  getRefreshToken: () => sessionStorage.getItem(REFRESH_TOKEN_KEY),

  setRefreshToken: (token) => {
    if (token) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  },

  clearTokens: () => {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    set({ accessToken: null });
  },
}));
