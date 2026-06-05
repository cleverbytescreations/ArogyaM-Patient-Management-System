import axios from "axios";
import { useTokenStore } from "@/auth/tokenStore";
import type { TokenResponse } from "@/types/auth";
import type { ApiError } from "@/types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token as string);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  (config) => {
    const { accessToken } = useTokenStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    const requestId = crypto.randomUUID();
    config.headers["X-Request-ID"] = requestId;
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as import("axios").AxiosError<ApiError>;
    const originalRequest = axiosError.config as import("axios").InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (axiosError.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = useTokenStore.getState().getRefreshToken();

      if (!refreshToken) {
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err: unknown) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post<TokenResponse>(
          `${API_BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken }
        );

        const { setAccessToken, setRefreshToken } = useTokenStore.getState();
        setAccessToken(data.access_token);
        setRefreshToken(data.refresh_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        processQueue(null, data.access_token);
        return apiClient(originalRequest);
      } catch (refreshError: unknown) {
        processQueue(refreshError, null);
        useTokenStore.getState().clearTokens();
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
