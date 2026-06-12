export interface User {
  id: number | string;
  pseudo?: string;
  name?: string;
  ref?: string | null;
  avatar?: string | null;
  isGlobal?: boolean;
}

export interface Contact {
  id: number | string;
  name: string;
  ref?: string | null;
  avatar?: string | null;
}

export interface SearchResult {
  id: number;
  pseudo: string;
  ref: string | null;
  avatar: string | null;
}

export interface Reaction {
  userId: number | string;
  userName: string;
  emoji: string;
}

export interface Message {
  id: number;
  sender: string;
  senderAvatar: string | null;
  senderId: number;
  senderRef: string | null;
  content: string;
  own: boolean;
  seen: boolean;
  createdAt: string;
  reactions: Reaction[];
  replyToId: number | null;
  replyToContent: string | null;
  replyToSender: string | null;
}

export interface UnreadContact {
  unread: number;
  pending: number;
}

export interface Unread {
  contacts: Record<string, UnreadContact>;
}

export interface ParsedFile {
  filename: string;
  url: string;
  type: "img" | "file";
  size?: number;
  extension?: string;
}

export type SocketState =
  | "connected"
  | "disconnected"
  | "connecting"
  | "reconnecting"
  | "connect_error"
  | "reconnect_failed"
  | "reconnected";

export interface TypingUsers {
  [userId: string]: string;
}

export interface MessageGroup {
  type: "group";
  isOwn: boolean;
  messages: Message[];
}

export interface DateSeparatorItem {
  type: "separator";
  date: Date;
}

export type GroupedItem = MessageGroup | DateSeparatorItem;

declare global {
  interface Window {
    __CHAT_TOKEN_GETTER?: () => string | null;
    __CHAT_ON_UNAUTHORIZED?: () => void;
    __CHAT_API_URL?: string;
  }
}
