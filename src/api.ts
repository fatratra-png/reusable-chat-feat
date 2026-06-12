import axios from "axios";

const getApiBaseUrl = (): string => {
  const configuredUrl =
    import.meta.env.VITE_CHAT_API_URL ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:3001";
  return configuredUrl.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const getToken =
    window.__CHAT_TOKEN_GETTER ||
    (() => localStorage.getItem("chat_token"));
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const onUnauthorized = window.__CHAT_ON_UNAUTHORIZED;
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(err);
  },
);

export default api;
