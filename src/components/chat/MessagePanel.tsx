import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperPlane,
  faPaperclip,
  faChevronLeft,
  faSpinner,
  faFile,
  faChevronDown,
  faTrash,
  faSmile,
  faXmark,
  faDownload,
  faEye,
  faReply,
  faCamera,
} from "@fortawesome/free-solid-svg-icons";
import UserAvatar from "../ui/UserAvatar";
import api from "../../api";
import DOMPurify from "dompurify";
import {
  isSameDay,
  GROUP_GAP,
  formatTime,
  formatDateLabel,
  isFileMessage,
  parseFileContent,
} from "./chat-utils";
import { useLongPress } from "./useLongPress";
import type { Contact, Message, ParsedFile, SocketState, GroupedItem } from "../../types";

const EmojiPicker = lazy(() => import("emoji-picker-react"));
const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

interface MessagePanelProps {
  contact: Contact;
  messages: Message[];
  loading: boolean;
  onSend: (content: string, replyToId?: number | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenContacts: () => void;
  isAtBottom: boolean;
  onAtBottomChange: (atBottom: boolean) => void;
  onScrollToBottom: () => void;
  onlineUsers: Set<number | string>;
  onLoadOlder: () => Promise<void>;
  replyTo: { id: number; sender: string; content: string } | null;
  onReply: (reply: { id: number; sender: string; content: string } | null) => void;
  typingUsers: string[];
  socketState: SocketState;
  onTypingChange: (isTyping: boolean) => void;
  onReact: (messageId: number, emoji: string) => Promise<void>;
  currentUserId: number | string;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
}

function ReactionPicker({ onReact, onClose }: { onReact: (emoji: string) => void; onClose: () => void }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-full px-2 py-1.5 shadow-xl z-50 chat-animate-fade-in"
      style={{
        backgroundColor: "var(--chat-primary)",
        border: "1px solid var(--chat-border)",
      }}
      onMouseLeave={onClose}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => { e.stopPropagation(); onReact(emoji); onClose(); }}
          className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 active:scale-110 transition-transform rounded-full"
          style={{ color: "var(--chat-text-inverse)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface ReactionListProps {
  reactions: Message["reactions"];
  currentUserId: number | string;
  onReact: (emoji: string) => void;
}

function ReactionList({ reactions, currentUserId, onReact }: ReactionListProps) {
  if (!reactions?.length) return null;

  const grouped = reactions.reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
    acc[r.emoji].count++;
    if (r.userId === currentUserId) acc[r.emoji].hasOwn = true;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-1 mt-1 px-1">
      {Object.entries(grouped).map(([emoji, { count, hasOwn }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          title={hasOwn ? "Remove reaction" : "React"}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all active:scale-95"
          style={{
            backgroundColor: hasOwn ? "var(--chat-accent-soft)" : "var(--chat-bg-hover)",
            borderColor: hasOwn ? "var(--chat-accent-border)" : "var(--chat-border)",
            color: hasOwn ? "var(--chat-accent)" : "var(--chat-text-secondary)",
          }}
        >
          <span>{emoji}</span>
          <span className="font-semibold tabular-nums">{count}</span>
        </button>
      ))}
    </div>
  );
}

function ChatAvatar({ avatar, name, userRef, onUserLink, onNavigate }: {
  avatar?: string | null;
  name: string;
  userRef?: string | null;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const inner = !avatar || failed ? (
    <UserAvatar name={name} size="sm" color="var(--chat-accent)" />
  ) : (
    <img
      src={avatar}
      alt={name}
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  );
  if (userRef && onUserLink) {
    const href = onUserLink(userRef);
    if (onNavigate) {
      return (
        <a
          href={href}
          onClick={(e) => { e.preventDefault(); onNavigate(href); }}
          className="block w-full h-full"
        >
          {inner}
        </a>
      );
    }
    return <a href={href} className="block w-full h-full">{inner}</a>;
  }
  return inner;
}

function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--chat-border)" }} />
      <span className="text-xs font-medium shrink-0 px-1" style={{ color: "var(--chat-text-muted)" }}>
        {formatDateLabel(date)}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--chat-border)" }} />
    </div>
  );
}

function ReplyQuote({ replyToContent, replyToSender, isOwn }: {
  replyToContent?: string | null;
  replyToSender?: string | null;
  isOwn: boolean;
}) {
  if (!replyToContent) return null;
  const parsed = parseFileContent(replyToContent);
  const isImage = parsed?.type === "img";
  const isFile = parsed && !isImage;

  return (
    <div
      className="flex items-stretch mb-1 rounded-xl overflow-hidden max-w-full text-xs"
      style={{
        backgroundColor: "var(--chat-bg-hover)",
        border: "1px solid var(--chat-border-light)",
      }}
    >
      <div
        className="w-[3px] shrink-0"
        style={{ backgroundColor: isOwn ? "var(--chat-accent-dark)" : "var(--chat-accent)" }}
      />
      <div className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-1.5">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold mb-0.5 truncate" style={{ color: "var(--chat-accent)" }}>
            ↩ {replyToSender}
          </p>
          {isFile ? (
            <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--chat-text-muted)" }}>
              <FontAwesomeIcon icon={faFile} className="text-[9px] shrink-0" />
              <span className="truncate">{parsed.filename}</span>
            </div>
          ) : (
            <p className="text-[10px] truncate leading-snug" style={{ color: "var(--chat-text-muted)" }}>
              {isImage ? <FontAwesomeIcon icon={faCamera} /> : getMessagePreview(replyToContent)}
            </p>
          )}
        </div>
        {isImage && (
          <img
            src={parsed.url}
            alt=""
            className="w-8 h-8 rounded-md object-cover shrink-0"
            style={{ opacity: 0.7 }}
          />
        )}
      </div>
    </div>
  );
}

function ReplyBar({ replyingTo, onCancel }: {
  replyingTo: { sender: string; content: string };
  onCancel: () => void;
}) {
  if (!replyingTo) return null;
  return (
    <div
      className="absolute bottom-[calc(100%+0.5rem)] left-4 sm:left-6 right-4 sm:right-6
                 flex items-center gap-3 px-4 py-3 z-20 rounded-xl shadow-xl chat-animate-fade-in"
      style={{
        backgroundColor: "var(--chat-primary)",
        border: "1px solid var(--chat-border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: "var(--chat-accent)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold mb-0.5 truncate" style={{ color: "var(--chat-accent)" }}>
          ↩ {replyingTo.sender}
        </p>
        <p className="text-xs truncate leading-snug" style={{ color: "var(--chat-text-secondary)" }}>
          {getMessagePreview(replyingTo.content)}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0"
        style={{ color: "var(--chat-text-muted)" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--chat-text)"; e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--chat-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        title="Cancel reply"
      >
        <FontAwesomeIcon icon={faXmark} className="text-sm" />
      </button>
    </div>
  );
}

function MessageActionSheet({ msg, isOwn, currentUserId, onReact, onClose, children }: {
  msg: Message;
  isOwn: boolean;
  currentUserId: number | string;
  onReact: (emoji: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div       className="fixed inset-0 z-40" style={{ backgroundColor: "var(--chat-overlay)" }} onClick={onClose} />
      <div
        className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl shadow-2xl chat-animate-fade-in pb-safe"
        style={{
          backgroundColor: "var(--chat-primary)",
          borderTop: "1px solid var(--chat-border)",
        }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-5" style={{ backgroundColor: "var(--chat-border)" }} />
        <div className="flex justify-around items-center px-6 pb-5">
          {QUICK_REACTIONS.map((emoji) => {
            const hasOwn = msg.reactions?.some(
              (r) => r.userId === currentUserId && r.emoji === emoji,
            );
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => { onReact(emoji); onClose(); }}
                className="flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all active:scale-90"
                style={hasOwn ? { backgroundColor: "var(--chat-accent-soft)" } : {}}
              >
                <span className="text-3xl leading-none">{emoji}</span>
                {hasOwn && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--chat-accent)" }} />
                )}
              </button>
            );
          })}
        </div>
        <div className="h-px mx-5 mb-2" style={{ backgroundColor: "var(--chat-border)" }} />
        <div className="flex flex-col pb-6">{children}</div>
      </div>
    </>
  );
}

interface TextMessageProps {
  msg: Message;
  isOwn: boolean;
  currentUserId: number | string;
  isFirst: boolean;
  onReact: (messageId: number, emoji: string) => void;
  onDelete: (msg: Message) => void;
  onImageClick: (img: { url: string; filename: string }) => void;
  onDownload: (url: string, filename: string) => void;
  pickerMsgId: number | null;
  setPickerMsgId: (id: number | null) => void;
  onReply?: (reply: { id: number; sender: string; content: string }) => void;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
}

function TextMessage({
  msg, isOwn, currentUserId,
  isFirst, onReact, onDelete, onImageClick, onDownload,
  pickerMsgId, setPickerMsgId, onReply, onUserLink, onNavigate,
}: TextMessageProps) {
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const isMobile = useRef(
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  ).current;
  const timeStr = formatTime(new Date(msg.createdAt));
  const longPressHandlers = useLongPress(
    () => { if (isMobile) setActionSheetOpen(true); },
    null,
  );

  return (
    <>
      <div
        className={`group relative flex items-end gap-2 mb-2 max-w-[95%] sm:max-w-[75%] min-w-0 ${
          isOwn ? "flex-row-reverse" : "flex-row"
        } chat-animate-message-in`}
        {...longPressHandlers}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!isOwn && isFirst && (
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 self-end" style={{ boxShadow: "0 0 0 2px var(--chat-border)" }}>
            <ChatAvatar avatar={msg.senderAvatar} name={msg.sender} userRef={msg.senderRef} onUserLink={onUserLink} onNavigate={onNavigate} />
          </div>
        )}
        {!isOwn && !isFirst && <div className="w-7 shrink-0" />}

        <div className={`flex flex-col min-w-0 max-w-full ${isOwn ? "items-end" : "items-start"}`}>
          {isFirst && (
            <span
              className="text-[11px] font-semibold mb-1 ml-1 flex items-center"
              style={{ color: isOwn ? "var(--chat-primary-dark)" : "var(--chat-accent)" }}
            >
              {isOwn ? "You" : msg.senderRef ? (
                <a
                  href={onUserLink ? onUserLink(msg.senderRef) : "#"}
                  onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(onUserLink!(msg.senderRef)); } }}
                  className="hover:underline"
                  style={{ color: "var(--chat-accent)" }}
                >
                  {msg.sender}
                </a>
              ) : (
                msg.sender
              )}
            </span>
          )}

          <ReplyQuote replyToContent={msg.replyToContent} replyToSender={msg.replyToSender} isOwn={isOwn} />

          <div className="relative">
            {!isMobile && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-all ${
                  isOwn ? "-left-[4.5rem]" : "-right-[4.5rem]"
                }`}
              >
                <button type="button"
                  onClick={() => onReply?.({ id: msg.id, sender: isOwn ? "You" : msg.sender, content: msg.content })}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:scale-110 active:scale-95 transition-transform"
                  style={{
                    backgroundColor: "var(--chat-primary)",
                    border: "1px solid var(--chat-border)",
                  }}
                  title="Reply"
                >
                  <FontAwesomeIcon icon={faReply} style={{ color: "var(--chat-text-secondary)" }} />
                </button>
                <button type="button"
                  onClick={() => setPickerMsgId(pickerMsgId === msg.id ? null : msg.id)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm hover:scale-110 active:scale-95 transition-transform"
                  style={{
                    backgroundColor: "var(--chat-primary)",
                    border: "1px solid var(--chat-border)",
                  }}
                  title="React"
                >
                  <FontAwesomeIcon icon={faSmile} style={{ color: "var(--chat-text-secondary)" }} />
                </button>
              </div>
            )}

            {!isMobile && pickerMsgId === msg.id && (
              <div className={`absolute bottom-full mb-1 z-50 ${isOwn ? "right-0" : "left-0"}`}>
                <ReactionPicker onReact={(emoji) => onReact?.(msg.id, emoji)} onClose={() => setPickerMsgId(null)} />
              </div>
            )}

            <div
              className="px-4 py-2 text-sm leading-relaxed min-w-0 max-w-full select-none rounded-xl"
              style={{
                backgroundColor: isOwn ? "var(--chat-bubble-own)" : "var(--chat-bubble-other)",
                color: isOwn ? "var(--chat-bubble-own-text)" : "var(--chat-bubble-other-text)",
                borderBottomRightRadius: isOwn ? 4 : 12,
                borderBottomLeftRadius: isOwn ? 12 : 4,
                boxShadow: isOwn ? "0 1px 4px var(--chat-bubble-shadow)" : "none",
              }}
            >
              {renderContent(msg.content, onImageClick, () => onDelete?.(msg), isOwn, onDownload)}
            </div>
          </div>

          <ReactionList reactions={msg.reactions} currentUserId={currentUserId} onReact={(emoji) => onReact?.(msg.id, emoji)} />

          <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
            <span className="text-[10px]" style={{ color: "var(--chat-text-muted)" }}>{timeStr}</span>
            {isOwn && (
              <>
                <span className="text-[10px]" style={{ color: msg.seen ? "var(--chat-accent)" : "var(--chat-text-muted)" }}>
                  {msg.seen ? "✓✓" : "✓"}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete?.(msg)}
                  className="opacity-0 group-hover:opacity-100 transition-all text-[10px] ml-1"
                  style={{ color: "var(--chat-text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--chat-danger)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--chat-text-muted)")}
                  title="Delete"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {actionSheetOpen && (
        <MessageActionSheet msg={msg} isOwn={isOwn} currentUserId={currentUserId} onReact={(emoji) => onReact?.(msg.id, emoji)} onClose={() => setActionSheetOpen(false)}>
          <button type="button"
            onClick={() => { setActionSheetOpen(false); onReply?.({ id: msg.id, sender: isOwn ? "You" : msg.sender, content: msg.content }); }}
            className="flex items-center gap-3 w-full px-6 py-4 text-sm transition" style={{ color: "var(--chat-text)" }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <FontAwesomeIcon icon={faReply} /> Reply
          </button>
          {isOwn && (
            <button type="button"
              onClick={() => { setActionSheetOpen(false); onDelete?.(msg); }}
              className="flex items-center gap-3 w-full px-6 py-4 text-sm transition"
              style={{ color: "var(--chat-danger-text)" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <FontAwesomeIcon icon={faTrash} /> Delete
            </button>
          )}
        </MessageActionSheet>
      )}
    </>
  );
}

function ImageMessage({ parsed }: { parsed: ParsedFile }) {
  return (
    <img
      src={parsed.url}
      alt={parsed.filename}
      className="max-w-[200px] sm:max-w-[320px] max-h-[300px] w-auto h-auto object-contain rounded-lg block select-none"
      style={{ backgroundColor: "var(--chat-bg-hover)" }}
      loading="lazy"
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

function FileMessage({ parsed }: { parsed: ParsedFile }) {
  return (
    <div className="flex items-center gap-2 py-3 px-2 max-w-full" style={{ backgroundColor: "var(--chat-accent-soft)" }}>
      <div
        className="flex flex-col items-center rounded-lg shrink-0 py-2 px-3"
        style={{ border: "2px solid var(--chat-accent)", backgroundColor: "var(--chat-accent-soft)" }}
      >
        <FontAwesomeIcon className="text-sm" icon={faFile} style={{ color: "var(--chat-accent)" }} />
        <span className="text-[9px] font-bold uppercase" style={{ color: "var(--chat-accent)" }}>
          {parsed.extension && `.${parsed.extension}`}
        </span>
      </div>
      <div className="flex flex-col text-xs font-medium" style={{ color: "var(--chat-text-secondary)" }}>
        <span className="truncate">{parsed.filename?.substring(0, 20)}...</span>
        <span>{parsed.size && `(${(parsed.size / 1024).toFixed(1)} KB)`}</span>
      </div>
    </div>
  );
}

interface MediaMessageProps {
  msg: Message;
  isOwn: boolean;
  isFirst: boolean;
  currentUserId: number | string;
  onReact: (messageId: number, emoji: string) => void;
  onDelete: (msg: Message) => void;
  onImageClick: (img: { url: string; filename: string }) => void;
  onDownload: (url: string, filename: string) => void;
  pickerMsgId: number | null;
  setPickerMsgId: (id: number | null) => void;
  onReply?: (reply: { id: number; sender: string; content: string }) => void;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
}

function MediaMessage({
  msg, isOwn, isFirst, currentUserId,
  onReact, onDelete, onImageClick, onDownload,
  pickerMsgId, setPickerMsgId, onReply, onUserLink, onNavigate,
}: MediaMessageProps) {
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const parsed = parseFileContent(msg.content)!;
  const isImage = parsed?.type === "img";
  const isMobile = useRef(window.matchMedia("(max-width: 1023px)").matches).current;
  const timeStr = formatTime(new Date(msg.createdAt));

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(parsed.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = parsed.filename || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(parsed.url, "_blank");
    }
  }, [parsed.url, parsed.filename]);

  const longPressHandlers = useLongPress(
    () => setActionSheetOpen(true),
    () =>
      isImage
        ? onImageClick?.({ url: parsed.url, filename: parsed.filename })
        : handleDownload(),
  );

  return (
    <>
      <div
        className={`group relative flex items-end gap-2 mb-2 max-w-[95%] sm:max-w-[75%] min-w-0 ${
          isOwn ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {!isOwn && isFirst && (
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 self-end" style={{ boxShadow: "0 0 0 2px var(--chat-border)" }}>
            <ChatAvatar avatar={msg.senderAvatar} name={msg.sender} userRef={msg.senderRef} onUserLink={onUserLink} onNavigate={onNavigate} />
          </div>
        )}
        {!isOwn && !isFirst && <div className="w-7 shrink-0" />}

        <div className={`flex flex-col min-w-0 max-w-full ${isOwn ? "items-end" : "items-start"}`}>
          {isFirst && (
            <span className="text-[11px] font-semibold mb-1 ml-1 flex items-center" style={{ color: isOwn ? "var(--chat-primary-dark)" : "var(--chat-accent)" }}>
              {isOwn ? "You" : msg.senderRef ? (
                <a href={onUserLink ? onUserLink(msg.senderRef) : "#"} className="hover:underline" style={{ color: "var(--chat-accent)" }}>{msg.sender}</a>
              ) : (
                msg.sender
              )}
            </span>
          )}

          <div className="relative">
            {!isMobile && (
              <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-all ${isOwn ? "-left-[4.5rem]" : "-right-[4.5rem]"}`}>
                <button type="button"
                  onClick={() => onReply?.({ id: msg.id, sender: isOwn ? "You" : msg.sender, content: msg.content })}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs hover:scale-110 active:scale-95 transition-transform"
                  style={{ backgroundColor: "var(--chat-primary)", border: "1px solid var(--chat-border)" }}
                >
                  <FontAwesomeIcon icon={faReply} style={{ color: "var(--chat-text-secondary)" }} />
                </button>
                <button type="button"
                  onClick={() => setPickerMsgId(pickerMsgId === msg.id ? null : msg.id)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm hover:scale-110 active:scale-95 transition-transform"
                  style={{ backgroundColor: "var(--chat-primary)", border: "1px solid var(--chat-border)" }}
                >
                  <FontAwesomeIcon icon={faSmile} style={{ color: "var(--chat-text-secondary)" }} />
                </button>
              </div>
            )}

            {!isMobile && pickerMsgId === msg.id && (
              <div className={`absolute bottom-full mb-1 z-50 ${isOwn ? "right-0" : "left-0"}`}>
                <ReactionPicker onReact={(emoji) => onReact?.(msg.id, emoji)} onClose={() => setPickerMsgId(null)} />
              </div>
            )}

            <div
              className="rounded-xl overflow-hidden cursor-pointer"
              style={{
                backgroundColor: isOwn ? "var(--chat-bubble-own)" : "var(--chat-bubble-other)",
                border: isOwn ? "none" : "1px solid var(--chat-border)",
              }}
              {...longPressHandlers}
              onContextMenu={(e) => e.preventDefault()}
            >
              {isImage ? <ImageMessage parsed={parsed} /> : <FileMessage parsed={parsed} />}
            </div>
          </div>

          <ReactionList reactions={msg.reactions} currentUserId={currentUserId} onReact={(emoji) => onReact?.(msg.id, emoji)} />

          <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
            <span className="text-[10px]" style={{ color: "var(--chat-text-muted)" }}>{timeStr}</span>
            {isOwn && (
              <span className="text-[10px]" style={{ color: msg.seen ? "var(--chat-accent)" : "var(--chat-text-muted)" }}>
                {msg.seen ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>
      </div>

      {actionSheetOpen && (
        <MessageActionSheet msg={msg} isOwn={isOwn} currentUserId={currentUserId} onReact={(emoji) => onReact?.(msg.id, emoji)} onClose={() => setActionSheetOpen(false)}>
          {isImage && (
            <button type="button"
              onClick={() => { setActionSheetOpen(false); onImageClick?.({ url: parsed.url, filename: parsed.filename }); }}
              className="flex items-center gap-3 w-full px-6 py-4 text-sm transition" style={{ color: "var(--chat-text)" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <FontAwesomeIcon icon={faEye} /> View
            </button>
          )}
          <button type="button"
            onClick={() => { setActionSheetOpen(false); onReply?.({ id: msg.id, sender: isOwn ? "You" : msg.sender, content: msg.content }); }}
            className="flex items-center gap-3 w-full px-6 py-4 text-sm transition" style={{ color: "var(--chat-text)" }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <FontAwesomeIcon icon={faReply} /> Reply
          </button>
          <button type="button"
            onClick={() => { setActionSheetOpen(false); handleDownload(); }}
            className="flex items-center gap-3 w-full px-6 py-4 text-sm transition" style={{ color: "var(--chat-text)" }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <FontAwesomeIcon icon={faDownload} /> Download
          </button>
          {isOwn && (
            <button type="button"
              onClick={() => { setActionSheetOpen(false); onDelete?.(msg); }}
              className="flex items-center gap-3 w-full px-6 py-4 text-sm transition" style={{ color: "var(--chat-danger-text)" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <FontAwesomeIcon icon={faTrash} /> Delete
            </button>
          )}
        </MessageActionSheet>
      )}
    </>
  );
}

function renderContent(
  content: string,
  onImageClick: (img: { url: string; filename: string }) => void,
  onDelete: () => void,
  isOwn: boolean,
  onDownload: (url: string, filename: string) => void,
): React.ReactNode {
  const parsed = parseFileContent(content);
  if (parsed) {
    if (parsed.type === "img") {
      return <ImageMessage parsed={parsed} />;
    }
    return <FileMessage parsed={parsed} />;
  }
  const clean = DOMPurify.sanitize(content || "");
  return (
    <span className="break-words overflow-wrap-anywhere whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: clean }} />
  );
}

function getMessagePreview(content: string): string {
  const parsed = parseFileContent(content);
  if (parsed) {
    return parsed.type === "img" ? "Attached image" : `Attached file: ${parsed.filename}`;
  }
  const compact = String(content || "").replace(/\s+/g, " ").trim();
  if (!compact) return "Empty message";
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

interface DeleteMessageDialogProps {
  message: Message | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteMessageDialog({ message, deleting, onCancel, onConfirm }: DeleteMessageDialogProps) {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ backgroundColor: "var(--chat-overlay-heavy)", backdropFilter: "blur(4px)" }}>
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden chat-animate-fade-in"
        style={{
          backgroundColor: "var(--chat-surface)",
          border: "1px solid var(--chat-border)",
        }}
      >
        <div className="flex items-start gap-3 p-5" style={{ borderBottom: "1px solid var(--chat-border)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--chat-danger-bg)", color: "var(--chat-danger-text)" }}>
            <FontAwesomeIcon icon={faTrash} className="text-sm" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base" style={{ color: "var(--chat-text)" }}>Delete this message?</h3>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--chat-text-secondary)" }}>
              This action is permanent and the message will disappear from the conversation.
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={deleting}
            className="w-8 h-8 rounded-lg transition disabled:opacity-40"
            style={{ color: "var(--chat-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--chat-text)"; e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--chat-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <FontAwesomeIcon icon={faXmark} className="text-sm" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--chat-bg)", border: "1px solid var(--chat-border-light)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--chat-text-muted)" }}>Preview</p>
            <p className="text-sm leading-relaxed break-words" style={{ color: "var(--chat-text-secondary)" }}>{getMessagePreview(message.content)}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button type="button" onClick={onCancel} disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-40"
            style={{ color: "var(--chat-text-secondary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--chat-text)"; e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--chat-text-secondary)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={deleting}
            className="px-4 py-2 rounded-xl text-white text-sm font-bold transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: "var(--chat-danger)" }}
            onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={(e) => { if (!deleting) e.currentTarget.style.opacity = "1"; }}
          >
            {deleting && <FontAwesomeIcon icon={faSpinner} className="text-xs animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageGroup({ messages, isOwn, onDelete, onImageClick, onDownload, onReact, onReply, currentUserId, onUserLink, onNavigate }: {
  messages: Message[];
  isOwn: boolean;
  onDelete: (msg: Message) => void;
  onImageClick: (img: { url: string; filename: string }) => void;
  onDownload: (url: string, filename: string) => void;
  onReact: (messageId: number, emoji: string) => void;
  onReply?: (reply: { id: number; sender: string; content: string }) => void;
  currentUserId: number | string;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
}) {
  const [pickerMsgId, setPickerMsgId] = useState<number | null>(null);

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      {messages.map((msg, idx) => {
        const isFirst = idx === 0;
        const sharedProps = {
          msg, isOwn, isFirst, currentUserId,
          onReact, onDelete, onImageClick, onDownload,
          onReply, pickerMsgId, setPickerMsgId,
          onUserLink, onNavigate,
        };
        if (isFileMessage(msg.content)) {
          return <MediaMessage key={msg.id} {...sharedProps} />;
        }
        return <TextMessage key={msg.id} {...sharedProps} />;
      })}
    </div>
  );
}

function ContactAvatar({ contact, onlineUsers }: {
  contact: Contact;
  onlineUsers: Set<number | string>;
}) {
  if (contact.isGlobal) {
    return (
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--chat-accent-soft)" }}>
        <FontAwesomeIcon icon={faReply} className="w-5 h-5" style={{ transform: "rotate(180deg)", color: "var(--chat-accent)" }} />
      </div>
    );
  }
  const online = onlineUsers.has(contact.id);
  return (
    <div className="relative shrink-0">
      <UserAvatar avatar={contact.avatar} name={contact.name} size="lg" color="var(--chat-accent)" />
      <span className="absolute -bottom-0.5 -right-0.5">
        <span className={`chat-status-dot ${online ? "chat-status-online" : "chat-status-offline"}`} />
      </span>
    </div>
  );
}

export default function MessagePanel({
  contact, messages, loading, onSend, onDelete, onOpenContacts,
  isAtBottom, onAtBottomChange, onScrollToBottom, onlineUsers,
  onLoadOlder, typingUsers, socketState, onTypingChange, onReact,
  currentUserId, onReply, onUserLink, onNavigate,
}: MessagePanelProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lightboxImg, setLightboxImg] = useState<{ url: string; filename: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const prevMsgCount = useRef(messages.length);
  const [replyingTo, setReplyingTo] = useState<{ id: number; sender: string; content: string } | null>(null);

  const handleReact = useCallback(async (messageId: number, emoji: string) => {
    try {
      await onReact?.(messageId, emoji);
    } catch (err) {
      console.error("Failed to react:", err);
    }
  }, [onReact]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDownloadImg = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const localUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = localUrl;
      a.download = filename || "image";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(localUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAtBottom]);

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      const el = scrollRef.current;
      if (el && !isAtBottom) {
        el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages, isAtBottom]);

  useEffect(() => {
    setShowEmojiPicker(false);
    setReplyingTo(null);
  }, [contact.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setReplyingTo(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (emojiPickerRef.current?.contains(target) || emojiButtonRef.current?.contains(target)) return;
      setShowEmojiPicker(false);
    };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowEmojiPicker(false); };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmojiPicker]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    onAtBottomChange(atBottom);
    if (el.scrollTop < 80 && messages.length > 0 && !loadingOlder && onLoadOlder) {
      prevScrollHeight.current = el.scrollHeight;
      setLoadingOlder(true);
      onLoadOlder().finally(() => setLoadingOlder(false));
    }
  };

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    const emoji = emojiData.emoji;
    const input = inputRef.current;
    if (!input) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    const cursor = start + emoji.length;
    setText(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  };

  const handleSend = async () => {
    setError("");
    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;
    setSending(true);
    try {
      if (selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        const { data } = await api.post("/messages/upload", fd);
        await onSend(
          `[FILE:${(data as { filename: string; url: string; isImage: boolean }).filename}:${(data as { filename: string; url: string; isImage: boolean }).url}:${(data as { filename: string; url: string; isImage: boolean }).isImage ? "img" : "file"}:${selectedFile.size}]`,
          replyingTo?.id ?? null,
        );
        setSelectedFile(null);
        setPreviewUrl(null);
      }
      if (trimmed && !selectedFile) {
        await onSend(trimmed, replyingTo?.id ?? null);
      }
      setText("");
      setReplyingTo(null);
      setShowEmojiPicker(false);
    } catch {
      setError("Error sending message.");
    } finally {
      setSending(false);
      onAtBottomChange(true);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large (max 10 MB).");
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
    e.target.value = "";
  };

  const requestDeleteMessage = (message: Message) => {
    setShowEmojiPicker(false);
    setDeleteTarget(message);
  };

  const cancelDeleteMessage = () => {
    if (deletingMessage) return;
    setDeleteTarget(null);
  };

  const confirmDeleteMessage = async () => {
    if (!deleteTarget || deletingMessage) return;
    setDeletingMessage(true);
    try {
      await onDelete?.(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeletingMessage(false);
    }
  };

  const grouped: GroupedItem[] = useMemo(() => {
    if (!messages.length) return [];
    const result: GroupedItem[] = [];
    let currentGroup: { isOwn: boolean; messages: Message[] } | null = null;
    let lastDate: Date | null = null;
    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt);
      if (lastDate && !isSameDay(msgDate, lastDate)) {
        result.push({ type: "separator", date: msgDate });
      }
      lastDate = msgDate;
      if (!currentGroup) {
        currentGroup = { isOwn: msg.own, messages: [msg] };
      } else {
        const prev = currentGroup.messages[currentGroup.messages.length - 1];
        const prevDate = new Date(prev.createdAt);
        const gap = msgDate.getTime() - prevDate.getTime();
        if (msg.own === currentGroup.isOwn && msg.sender === prev.sender && gap > 0 && gap < GROUP_GAP) {
          currentGroup.messages.push(msg);
        } else {
          result.push({ type: "group", ...currentGroup });
          currentGroup = { isOwn: msg.own, messages: [msg] };
        }
      }
    }
    if (currentGroup) result.push({ type: "group", ...currentGroup });
    return result;
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-w-0" style={{ backgroundColor: "var(--chat-bg)" }}>
      {/* Header */}
      <div
        className="relative flex flex-col items-center justify-center gap-1.5 px-4 sm:px-6 py-3 sm:py-4 shrink-0"
        style={{
          backgroundColor: "var(--chat-glass-bg)",
          backdropFilter: "blur(var(--chat-glass-blur))",
          borderBottom: "1px solid var(--chat-border)",
        }}
      >
        <div className="flex flex-col items-center gap-1.5">
          <ContactAvatar contact={contact} onlineUsers={onlineUsers} />
          <div className="min-w-0 text-center">
            <h3 className="font-bold text-sm sm:text-base truncate flex items-center justify-center gap-1.5" style={{ color: "var(--chat-text)" }}>
              {contact.name}
            </h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--chat-text-secondary)" }}>
              {typingUsers && typingUsers.length > 0
                ? typingUsers.length === 1
                  ? `${typingUsers[0]} is typing…`
                  : `${typingUsers.length} people typing…`
                : contact.isGlobal
                  ? "Global chat – everyone"
                  : "User"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenContacts}
          title="Contacts"
          className="absolute right-4 sm:right-6 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-lg"
          style={{ backgroundColor: "var(--chat-accent)", color: "#fff" }}
        >
          <FontAwesomeIcon icon={faChevronLeft} className="text-sm" />
        </button>
        {socketState && socketState !== "connected" && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  socketState === "reconnecting" ? "var(--chat-accent)" :
                  socketState === "connect_error" || socketState === "reconnect_failed" ? "var(--chat-danger)" :
                  "var(--chat-text-muted)",
                animation: socketState === "reconnecting" ? "pulse 1s infinite" : "none",
              }}
            />
            <span className="text-[10px] hidden sm:inline" style={{ color: "var(--chat-text-secondary)" }}>
              {socketState === "reconnecting" ? "Reconnecting…" :
               socketState === "connect_error" || socketState === "reconnect_failed" ? "Offline" :
               "Connecting…"}
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden px-1 sm:px-6 py-4 sm:py-6 flex flex-col relative chat-scrollbar"
      >
        {loading && (
          <div className="flex justify-center py-10">
            <FontAwesomeIcon icon={faSpinner} className="text-2xl animate-spin" style={{ color: "var(--chat-accent)" }} />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40 select-none">
            <FontAwesomeIcon icon={faReply} className="w-14 h-14" style={{ transform: "rotate(180deg)", color: "var(--chat-text-muted)" }} />
            <p className="text-xs sm:text-sm" style={{ color: "var(--chat-text-secondary)" }}>No messages yet.</p>
          </div>
        )}

        {!loading &&
          grouped.map((item, idx) => {
            if (item.type === "separator") {
              return <DateSeparator key={`sep-${idx}`} date={item.date} />;
            }
            return (
              <div key={`g-${idx}`} className="mb-2 last:mb-0">
                <MessageGroup
                  messages={item.messages}
                  isOwn={item.isOwn}
                  onDelete={requestDeleteMessage}
                  onImageClick={setLightboxImg}
                  onDownload={(url: string, filename: string) => handleDownloadImg(url, filename)}
                  onReact={handleReact}
                  onReply={setReplyingTo}
                  currentUserId={currentUserId}
                  onUserLink={onUserLink}
                  onNavigate={onNavigate}
                />
              </div>
            );
          })}

        <div ref={bottomRef} />

        {!isAtBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onScrollToBottom();
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            className="fixed bottom-28 sm:bottom-32 right-6 sm:right-10 w-11 h-11 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg z-10"
            style={{
              backgroundColor: "var(--chat-glass-bg)",
              backdropFilter: "blur(12px)",
              border: "1px solid var(--chat-border)",
              color: "var(--chat-text)",
            }}
            title="Scroll to bottom"
          >
            <FontAwesomeIcon icon={faChevronDown} className="text-sm" />
          </button>
        )}
      </div>

      {/* Input */}
      <div
        className="relative px-1 sm:px-6 py-3 sm:py-5 shrink-0"
        style={{
          backgroundColor: "var(--chat-glass-bg)",
          backdropFilter: "blur(var(--chat-glass-blur))",
          borderTop: "1px solid var(--chat-border)",
        }}
      >
        {error && (
          <div
            className="absolute bottom-[calc(100%+0.5rem)] right-4 sm:right-10 px-4 py-2 rounded-xl backdrop-blur-md flex items-center gap-2 chat-animate-fade-in shadow-xl z-20 cursor-pointer"
            style={{ backgroundColor: "var(--chat-danger-bg)", border: "1px solid var(--chat-danger-text)" }}
            onClick={() => setError("")}
          >
            <FontAwesomeIcon icon={faReply} className="text-xs shrink-0" style={{ color: "var(--chat-danger-text)" }} />
            <span className="text-xs" style={{ color: "var(--chat-danger-text)" }}>{error}</span>
          </div>
        )}

        {selectedFile && (
          <div
            className="absolute bottom-[calc(100%+0.5rem)] left-4 sm:left-10 p-3 rounded-xl backdrop-blur-md flex items-center gap-4 chat-animate-fade-in shadow-xl z-20"
            style={{
              backgroundColor: "var(--chat-primary)",
              border: "1px solid var(--chat-border)",
            }}
          >
            <div className="relative">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-lg" style={{ boxShadow: "0 0 0 2px var(--chat-border)" }} />
              ) : (
                <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--chat-bg-hover)", boxShadow: "0 0 0 2px var(--chat-border)" }}>
                  <FontAwesomeIcon icon={faFile} className="text-2xl" style={{ color: "var(--chat-accent)" }} />
                </div>
              )}
              <button
                type="button"
                onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full text-white text-xs flex items-center justify-center shadow-lg"
                style={{ backgroundColor: "var(--chat-danger)" }}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="flex flex-col min-w-[120px] max-w-[200px]">
              <span className="text-sm font-medium truncate" style={{ color: "var(--chat-text)" }}>{selectedFile.name}</span>
              <span className="text-xs" style={{ color: "var(--chat-text-secondary)" }}>{(selectedFile.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
        )}

        {replyingTo && <ReplyBar replyingTo={replyingTo} onCancel={() => setReplyingTo(null)} />}

        <div
          className="relative flex items-center gap-2 rounded-xl px-2 sm:px-4 py-2 sm:py-3 transition-all"
          style={{
            backgroundColor: "var(--chat-bg-hover)",
            border: "1px solid var(--chat-border)",
          }}
        >
          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-full left-0 sm:left-4 mb-3 z-30 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl shadow-2xl"
              style={{ boxShadow: "var(--chat-shadow-lg)" }}
            >
              <Suspense
                fallback={
                  <div className="w-[min(360px,calc(100vw-1rem))] h-[420px] flex items-center justify-center text-sm" style={{ backgroundColor: "var(--chat-primary)", color: "var(--chat-text-secondary)" }}>
                    Loading...
                  </div>
                }
              >
                {/* @ts-expect-error emoji-picker-react types mismatch */}
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  theme="dark"
                  emojiStyle="native"
                  suggestedEmojisMode="recent"
                  skinTonePickerLocation="SEARCH"
                  searchPlaceholder="Search emoji"
                  lazyLoadEmojis
                  autoFocusSearch
                  width="min(360px, calc(100vw - 1rem))"
                  height={420}
                  previewConfig={{ showPreview: false }}
                />
              </Suspense>
            </div>
          )}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Attach file"
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 active:scale-90"
            style={{ color: "var(--chat-text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--chat-text)"; e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--chat-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <FontAwesomeIcon icon={faPaperclip} className="text-sm" />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />

          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => setShowEmojiPicker((open: boolean) => !open)}
            title="Add emoji"
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 active:scale-90"
            style={{
              color: showEmojiPicker ? "var(--chat-text-inverse)" : "var(--chat-text-muted)",
              backgroundColor: showEmojiPicker ? "var(--chat-accent)" : "transparent",
            }}
          >
            <FontAwesomeIcon icon={faSmile} className="text-sm" />
          </button>

          <input
            ref={inputRef}
            className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
            style={{ color: "var(--chat-text)" }}
            placeholder="Type a message..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError("");
              if (onTypingChange) onTypingChange(e.target.value.length > 0);
            }}
            onKeyDown={handleKey}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={(!text.trim() && !selectedFile) || sending}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--chat-accent)", color: "var(--chat-text-inverse)" }}
            onMouseEnter={(e) => { if (!sending && (text.trim() || selectedFile)) e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            {sending ? (
              <FontAwesomeIcon icon={faSpinner} className="text-sm animate-spin" />
            ) : (
              <FontAwesomeIcon icon={faPaperPlane} className="text-sm" />
            )}
          </button>
        </div>
      </div>

      <DeleteMessageDialog message={deleteTarget} deleting={deletingMessage} onCancel={cancelDeleteMessage} onConfirm={confirmDeleteMessage} />

      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 chat-animate-fade-in cursor-zoom-out"
          style={{ backgroundColor: "var(--chat-overlay-heavy)", backdropFilter: "blur(4px)" }}
          onClick={() => setLightboxImg(null)}
        >
          <div
            className="absolute top-0 inset-x-0 h-16 flex items-center justify-between px-6 text-white z-10"
            style={{ background: "linear-gradient(to bottom, var(--chat-overlay-heavy), transparent)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-medium truncate max-w-[60%] sm:max-w-[80%]">{lightboxImg.filename}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleDownloadImg(lightboxImg.url, lightboxImg.filename)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors chat-text-inverse"
                style={{ backgroundColor: "var(--chat-glass-bg)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--chat-glass-bg)")}
                title="Download image"
              >
                <FontAwesomeIcon icon={faDownload} className="text-sm" />
              </button>
              <button
                onClick={() => setLightboxImg(null)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors chat-text-inverse"
                style={{ backgroundColor: "var(--chat-glass-bg)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--chat-glass-bg)")}
                title="Close"
              >
                <FontAwesomeIcon icon={faXmark} className="text-base" />
              </button>
            </div>
          </div>
          <div className="relative max-w-full max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImg.url}
              alt={lightboxImg.filename}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl select-none chat-animate-scale-in"
            />
          </div>
        </div>
      )}
    </div>
  );
}
