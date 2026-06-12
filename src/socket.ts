import { io, Socket } from "socket.io-client";
import type { SocketState } from "./types";

const SOCKET_URL =
  import.meta.env.VITE_CHAT_API_URL ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001";

let socket: Socket | null = null;
let connectionPromise: Promise<Socket> | null = null;
const listeners = new Set<(state: SocketState, details?: Record<string, unknown>) => void>();
const MAX_RECONNECT_ATTEMPTS = 15;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

const notifyListeners = (state: SocketState, details: Record<string, unknown> = {}): void => {
  listeners.forEach((fn) => fn(state, details));
};

export const onConnectionChange = (
  fn: (state: SocketState, details?: Record<string, unknown>) => void,
): (() => void) => {
  listeners.add(fn);
  if (socket) {
    fn(socket.connected ? "connected" : "disconnected", {
      connected: socket.connected,
    });
  }
  return () => listeners.delete(fn);
};

export const getSocket = async (): Promise<Socket> => {
  if (socket?.connected) return socket;
  if (connectionPromise) return connectionPromise;

  const getToken =
    window.__CHAT_TOKEN_GETTER ||
    (() => localStorage.getItem("chat_token"));
  const token = getToken();
  if (!token) throw new Error("No auth token available");

  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionDelay: BASE_RECONNECT_DELAY,
    reconnectionDelayMax: MAX_RECONNECT_DELAY,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    timeout: 15000,
    autoConnect: true,
  });

  socket.on("connect", () => {
    connectionPromise = null;
    notifyListeners("connected", { socketId: socket!.id });
  });

  socket.on("disconnect", (reason: string) => {
    notifyListeners("disconnected", { reason });
  });

  socket.on("reconnect_attempt", (attempt: number) => {
    notifyListeners("reconnecting", { attempt, max: MAX_RECONNECT_ATTEMPTS });
  });

  socket.on("reconnect", (attempt: number) => {
    notifyListeners("reconnected", { attempt });
  });

  socket.on("reconnect_failed", () => {
    notifyListeners("reconnect_failed");
  });

  socket.on("connect_error", (err: Error) => {
    notifyListeners("connect_error", { error: err.message });
  });

  connectionPromise = new Promise<Socket>((resolve, reject) => {
    socket!.on("connect", () => {
      connectionPromise = null;
      resolve(socket!);
    });
    socket!.on("connect_error", (err: Error) => {
      connectionPromise = null;
      console.error("Socket connection error:", err);
      reject(err);
    });
    setTimeout(() => {
      if (!socket?.connected) {
        connectionPromise = null;
        reject(new Error("Socket connection timeout"));
      }
    }, 15000);
  });

  return connectionPromise;
};

export const disconnectSocket = (): void => {
  if (socket) {
    notifyListeners("disconnected");
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    connectionPromise = null;
  }
};

export const refreshSocket = async (): Promise<Socket> => {
  disconnectSocket();
  return getSocket();
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!socket?.connected) {
      refreshSocket().catch(() => {});
    }
  });
}
