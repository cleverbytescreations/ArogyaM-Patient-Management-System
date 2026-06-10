import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTokenStore } from "./tokenStore";
import { apiClient } from "@/api/client";
import type { UserProfile, TokenResponse } from "@/types/auth";

interface AuthContextValue {
  user: UserProfile | null;
  permissions: string[];
  roles: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { setAccessToken, setRefreshToken, clearTokens, getRefreshToken } =
    useTokenStore();
  const queryClient = useQueryClient();

  const fetchUserInfo = useCallback(async () => {
    const { data } = await apiClient.get<UserProfile>("/me");
    setUser(data);
    setPermissions(data.permissions);
    setRoles(data.roles);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // ignore logout errors — clear tokens regardless
    } finally {
      clearTokens();
      setUser(null);
      setPermissions([]);
      setRoles([]);
      // Drop all cached query data so the next user can never see the
      // previous user's PHI from a matching query key (e.g. patient search).
      queryClient.clear();
    }
  }, [clearTokens, queryClient]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setPermissions([]);
      setRoles([]);
      clearTokens();
      queryClient.clear();
    };
    window.addEventListener("auth:session-expired", handleSessionExpired);
    return () => {
      window.removeEventListener("auth:session-expired", handleSessionExpired);
    };
  }, [clearTokens, queryClient]);

  useEffect(() => {
    const initialize = async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await apiClient.post<TokenResponse>("/auth/refresh", {
          refresh_token: refreshToken,
        });
        setAccessToken(data.access_token);
        setRefreshToken(data.refresh_token);
        await fetchUserInfo();
      } catch {
        clearTokens();
      } finally {
        setIsLoading(false);
      }
    };
    void initialize();
  }, [
    clearTokens,
    fetchUserInfo,
    getRefreshToken,
    setAccessToken,
    setRefreshToken,
  ]);

  const login = useCallback(
    async (username: string, password: string) => {
      // Defensively drop any residual cache before authenticating a new user,
      // in case a prior session was not explicitly logged out.
      queryClient.clear();
      const { data } = await apiClient.post<TokenResponse>("/auth/login", {
        username,
        password,
      });
      setAccessToken(data.access_token);
      setRefreshToken(data.refresh_token);
      await fetchUserInfo();
    },
    [fetchUserInfo, queryClient, setAccessToken, setRefreshToken]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        roles,
        isLoading,
        isAuthenticated: user !== null,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
