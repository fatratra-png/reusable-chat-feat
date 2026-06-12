export { default as ChatPage } from "./pages/ChatPage";
export { default as ChatLayout } from "./components/chat/ChatLayout";
export { default as ContactList } from "./components/chat/ContactList";
export { default as MessagePanel } from "./components/chat/MessagePanel";
export { useLongPress } from "./components/chat/useLongPress";
export {
  isFileMessage,
  parseFileContent,
  formatTime,
  formatDateLabel,
  isSameDay,
  GROUP_GAP,
} from "./components/chat/chat-utils";
export { getSocket, disconnectSocket, refreshSocket, onConnectionChange } from "./socket";
export { autoThemeChat } from "./autoTheme";
export type { User, Contact, Message, Reaction, Unread, ParsedFile, SocketState } from "./types";

import "./styles/chat.css";

export function setChatTokenGetter(getter: () => string | null): void {
  window.__CHAT_TOKEN_GETTER = getter;
}

export function setChatOnUnauthorized(handler: () => void): void {
  window.__CHAT_ON_UNAUTHORIZED = handler;
}

export function setChatApiUrl(url: string): void {
  window.__CHAT_API_URL = url;
}
