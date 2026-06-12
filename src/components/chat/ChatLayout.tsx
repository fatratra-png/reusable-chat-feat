import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Socket } from "socket.io-client";
import api from "../../api";
import { getSocket, onConnectionChange } from "../../socket";
import ContactList from "./ContactList";
import MessagePanel from "./MessagePanel";
import type { User, Contact, Message, Unread, TypingUsers, SocketState } from "../../types";

interface ChatLayoutProps {
  currentUser: User;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
  customContacts?: User[];
}

interface ApiMessage {
  id: number;
  sender_id: number;
  receiver_id?: number;
  content: string;
  is_global: boolean;
  seen: boolean;
  seen_at?: string;
  reply_to_id?: number | null;
  created_at: string;
  sender_pseudo?: string;
  sender_ref?: string | null;
  sender_avatar?: string | null;
  reply_to_content?: string | null;
  reply_to_sender?: string | null;
  reactions?: Message["reactions"];
}

interface UnreadUpdateData {
  contactId: number | string;
  unread?: number;
  pending?: number;
}

const GLOBAL_CONTACT: Contact = {
  id: "global",
  name: "Global Chat",
  isGlobal: true,
};

function showNotification(title: string, body: string): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/logo.png",
      tag: "stdhub-chat",
    });
    setTimeout(() => n.close(), 5000);
  } catch {}
}

export default function ChatLayout({
  currentUser,
  onUserLink = (ref: string) => `/user/${ref}`,
  onNavigate,
  customContacts,
}: ChatLayoutProps) {
  const [contacts, setContacts] = useState<Contact[]>([GLOBAL_CONTACT]);
  const [activeContact, setActiveContact] = useState<Contact>(GLOBAL_CONTACT);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [showContactList, setShowContactList] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: number; sender: string; content: string } | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<number | string>>(new Set());
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unread, setUnread] = useState<Unread>({ global: 0, contacts: {} });
  const [contactTotal, setContactTotal] = useState(0);
  const [favorites, setFavorites] = useState<(number | string)[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUsers>({});
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [loadingContacts, setLoadingContacts] = useState(true);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingEmitRef = useRef(0);
  const TYPING_TIMEOUT_MS = 3000;
  const TYPING_THROTTLE_MS = 1500;

  useEffect(() => {
    api
      .get("/messages/favorites")
      .then(({ data }) => setFavorites(Array.isArray(data) ? data : []))
      .catch(() => setFavorites([]));
  }, []);

  const toggleFavorite = useCallback(async (id: number | string) => {
    setFavorites((prev) => {
      const isFav = prev.includes(id);
      if (isFav) {
        api
          .delete(`/messages/favorites/${id}`)
          .catch(() => setFavorites((p) => [...p, id]));
        return prev.filter((fid) => fid !== id);
      }
      api
        .post("/messages/favorites", { contact_id: id })
        .catch(() => setFavorites((p) => p.filter((fid) => fid !== id)));
      return [...prev, id];
    });
  }, []);

  const activeContactRef = useRef(activeContact);
  const isAtBottomRef = useRef(true);
  const messagesRef = useRef(messages);

  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const fetchUnread = useCallback(async () => {
    try {
      const { data } = await api.get("/messages/unread");
      setUnread(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const markGlobalRead = useCallback(async (messageId: number) => {
    try {
      await api.post("/messages/global/read", { messageId });
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    setLoadingContacts(true);
    api
      .get("/messages/contacts", { params: { limit: 200 } })
      .then(({ data }) => {
        const usersList = Array.isArray(data) ? data : data?.users;
        if (!Array.isArray(usersList)) return;
        const formatted: Contact[] = usersList.map((c: User) => ({
          id: c.id,
          name: c.pseudo || "",
          ref: c.ref,
          avatar: c.avatar || null,
        }));

        const extra = Array.isArray(customContacts)
          ? customContacts.filter((c) => !c.isGlobal).map((c) => ({ id: c.id, name: c.name || c.pseudo || "", ref: c.ref, avatar: c.avatar }))
          : [];
        setContacts([GLOBAL_CONTACT, ...extra, ...formatted]);
        if (data.total) setContactTotal(data.total);
      })
      .catch(console.error)
      .finally(() => setLoadingContacts(false));
    fetchUnread();
  }, [fetchUnread, customContacts]);

  const markSeen = useCallback(
    async (contact: Contact) => {
      if (contact.isGlobal) {
        const msgs = messagesRef.current["global"] || [];
        const last = msgs[msgs.length - 1];
        if (last) markGlobalRead(last.id);
        setUnread((prev) => ({ ...prev, global: 0 }));
        return;
      }
      const msgs = messagesRef.current[contact.id] || [];
      const unseenIds = msgs.filter((m) => !m.own && !m.seen).map((m) => m.id);
      if (unseenIds.length > 0) {
        try {
          await api.patch("/messages/seen", { ids: unseenIds });
        } catch (err) {
          console.error(err);
        }
      }
      setUnread((prev) => ({
        ...prev,
        contacts: {
          ...prev.contacts,
          [contact.id]: { ...prev.contacts[contact.id], unread: 0 },
        },
      }));
    },
    [markGlobalRead],
  );

  const formatMsg = useCallback(
    (m: ApiMessage): Message => ({
      id: m.id,
      sender: m.sender_pseudo || "Inconnu",
      senderAvatar: m.sender_avatar || null,
      senderId: m.sender_id,
      senderRef: m.sender_ref || null,
      content: m.content || "",
      own: m.sender_id === currentUser.id,
      seen: m.seen || false,
      createdAt: m.created_at,
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      replyToId: m.reply_to_id ?? null,
      replyToContent: m.reply_to_content ?? null,
      replyToSender: m.reply_to_sender ?? null,
    }),
    [currentUser],
  );

  const loadMessages = useCallback(
    async (contact: Contact, silent = false) => {
      if (!silent) setLoadingMessages(true);
      try {
        let data: { messages?: ApiMessage[] } | ApiMessage[];
        if (contact.isGlobal) {
          ({ data } = await api.get("/messages/global", {
            params: { limit: 200 },
          }));
        } else {
          ({ data } = await api.get(`/messages/private/${contact.id}`, {
            params: { limit: 100 },
          }));
        }
        const msgList = Array.isArray(data) ? data : data?.messages;
        if (!Array.isArray(msgList)) return;
        const formatted = msgList.map(formatMsg);
        messagesRef.current = {
          ...messagesRef.current,
          [contact.id]: formatted,
        };
        setMessages((prev) => ({
          ...prev,
          [contact.id]: formatted,
        }));
      } catch (err) {
        console.error(err);
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    [formatMsg],
  );

  const loadOlderMessages = useCallback(
    async (contact: Contact) => {
      const currentMsgs = messagesRef.current[contact.id] || [];
      if (currentMsgs.length === 0) return;
      const oldestId = currentMsgs[0].id;
      try {
        let data: { messages?: ApiMessage[] } | ApiMessage[];
        if (contact.isGlobal) {
          ({ data } = await api.get("/messages/global", {
            params: { before: oldestId, limit: 100 },
          }));
        } else {
          ({ data } = await api.get(`/messages/private/${contact.id}`, {
            params: { before: oldestId, limit: 100 },
          }));
        }
        const msgList = Array.isArray(data) ? data : data?.messages;
        if (!Array.isArray(msgList) || msgList.length === 0) return;
        const msgs = msgList.map(formatMsg);
        setMessages((prev) => ({
          ...prev,
          [contact.id]: [
            ...(prev[contact.id] || []),
            ...msgs.reverse(),
          ],
        }));
      } catch (err) {
        console.error(err);
      }
    },
    [formatMsg],
  );

  useEffect(() => {
    if (activeContact) {
      (async () => {
        await loadMessages(activeContact);
        markSeen(activeContact);
      })();
    }
  }, [activeContact, loadMessages, markSeen]);

  const emitTyping = useCallback(async (isTyping: boolean) => {
    const contact = activeContactRef.current;
    if (!contact) return;
    const now = Date.now();
    if (isTyping && now - lastTypingEmitRef.current < TYPING_THROTTLE_MS)
      return;
    lastTypingEmitRef.current = now;
    try {
      const s = await getSocket();
      s.emit(isTyping ? "typing:started" : "typing:stopped", {
        contactId: contact.isGlobal ? "global" : contact.id,
        isGlobal: contact.isGlobal,
      });
    } catch {}
  }, []);

  const emitTypingThrottled = useCallback(
    (isTyping: boolean) => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      emitTyping(isTyping);
      if (isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          emitTyping(false);
        }, TYPING_TIMEOUT_MS);
      }
    },
    [emitTyping],
  );

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | undefined;
    let cleanupListener: (() => void) | undefined;

    cleanupListener = onConnectionChange((state) => {
      setSocketState(state);
      if (state === "reconnected" || state === "connected") {
        getSocket()
          .then((s) => {
            s.emit("user:join", currentUser.id);
            fetchUnread();
            if (activeContactRef.current) {
              markSeen(activeContactRef.current);
            }
          })
          .catch(console.error);
      }
    });

    getSocket()
      .then((s) => {
        if (cancelled) return;
        socket = s;
        socket.emit("user:join", currentUser.id);

        socket.on("message:global", (data: ApiMessage) => {
          const msg = formatMsg(data);
          setMessages((prev) => {
            const existing = prev["global"] || [];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, global: [...existing, msg] };
          });
          if (!msg.own) {
            const active = activeContactRef.current;
            if (document.hidden || !active?.isGlobal) {
              showNotification(
                "Global Chat",
                `${msg.sender}: ${msg.content.replace(/\[FILE:.+\]/, "[File]")}`,
              );
            }
            if (!active?.isGlobal) {
              setUnread((prev) => ({ ...prev, global: prev.global + 1 }));
            }
          }
        });

        socket.on("message:private", (data: ApiMessage) => {
          const msg = formatMsg(data);
          const otherId =
            msg.senderId === currentUser.id ? data.receiver_id! : msg.senderId;
          setMessages((prev) => {
            const existing = prev[otherId] || [];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [otherId]: [...existing, msg] };
          });
          if (!msg.own) {
            const active = activeContactRef.current;
            if (document.hidden || active?.id !== otherId) {
              showNotification(
                `Message from ${msg.sender}`,
                msg.content.replace(/\[FILE:.+\]/, "[File]"),
              );
            }
            if (active?.id !== otherId) {
              setUnread((prev) => ({
                ...prev,
                contacts: {
                  ...prev.contacts,
                  [otherId]: {
                    unread: (prev.contacts[otherId]?.unread || 0) + 1,
                    pending: prev.contacts[otherId]?.pending || 0,
                  },
                },
              }));
            }
          }
        });

        socket.on("user:online", (userId: number | string) => {
          setOnlineUsers((prev) => new Set(prev).add(userId));
        });

        socket.on("user:offline", (userId: number | string) => {
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        });

        socket.on("message:seen", ({ messageId }: { messageId: number }) => {
          let seenContactId: string | number | null = null;
          setMessages((prev) => {
            const updated = { ...prev };
            for (const key of Object.keys(updated)) {
              updated[key] = updated[key].map((m) => {
                if (m.id === messageId) {
                  seenContactId = key;
                  return { ...m, seen: true };
                }
                return m;
              });
            }
            return updated;
          });
          if (seenContactId && seenContactId !== "global") {
            setUnread((prev) => {
              const contact = prev.contacts[seenContactId];
              if (!contact || !contact.pending) return prev;
              return {
                ...prev,
                contacts: {
                  ...prev.contacts,
                  [seenContactId]: {
                    ...contact,
                    pending: Math.max(0, contact.pending - 1),
                  },
                },
              };
            });
          }
        });

        socket.on("message:deleted", ({ messageId }: { messageId: number }) => {
          setMessages((prev) => {
            const updated = { ...prev };
            for (const key of Object.keys(updated)) {
              updated[key] = updated[key].filter((m) => m.id !== messageId);
            }
            return updated;
          });
        });

        socket.on("unread:update", ({ contactId, unread: u, pending }: UnreadUpdateData) => {
          setUnread((prev) => ({
            ...prev,
            contacts: {
              ...prev.contacts,
              [contactId]: {
                unread: u ?? prev.contacts[contactId]?.unread ?? 0,
                pending: pending ?? prev.contacts[contactId]?.pending ?? 0,
              },
            },
          }));
        });

        socket.on("typing:started", ({ userId, pseudo }: { userId: number | string; pseudo: string }) => {
          const active = activeContactRef.current;
          if (!active) return;
          if (active.isGlobal) {
            setTypingUsers((prev) => ({ ...prev, [userId]: pseudo }));
          } else if (String(userId) === String(active.id)) {
            setTypingUsers((prev) => ({ ...prev, [userId]: pseudo }));
          }
        });

        socket.on("typing:stopped", ({ userId }: { userId: number | string }) => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        });

        socket.on("message:reaction", ({ messageId, reactions }: { messageId: number; reactions: Message["reactions"] }) => {
          setMessages((prev) => {
            const updated = { ...prev };
            for (const key of Object.keys(updated)) {
              updated[key] = updated[key].map((m) =>
                m.id === messageId ? { ...m, reactions } : m,
              );
            }
            return updated;
          });
        });

        if (cancelled) return;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (cleanupListener) cleanupListener();
      if (socket) {
        socket.off("message:global");
        socket.off("message:private");
        socket.off("user:online");
        socket.off("user:offline");
        socket.off("message:seen");
        socket.off("message:deleted");
        socket.off("unread:update");
        socket.off("typing:started");
        socket.off("typing:stopped");
        socket.off("message:reaction");
      }
    };
  }, [currentUser, formatMsg, fetchUnread, markSeen]);

  const deleteMessage = async (messageId: number) => {
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].filter((m) => m.id !== messageId);
        }
        return updated;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async (content: string, replyToId: number | null = null) => {
    try {
      const payload = activeContact.isGlobal
        ? { content, is_global: true, reply_to_id: replyToId }
        : {
            content,
            receiver_id: activeContact.id,
            is_global: false,
            reply_to_id: replyToId,
          };
      await api.post("/messages", payload);
      setReplyTo(null);
      emitTyping(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReact = useCallback(
    async (messageId: number, emoji: string) => {
      const { id: userId, pseudo: userName } = currentUser;
      setMessages((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          updated[key] = updated[key].map((m) => {
            if (m.id !== messageId) return m;
            const reactions = m.reactions || [];
            const mine = reactions.find((r) => r.userId === userId);
            let newReactions;
            if (!mine) {
              newReactions = [
                ...reactions,
                { userId, userName, emoji },
              ];
            } else if (mine.emoji === emoji) {
              newReactions = reactions.filter((r) => r.userId !== userId);
            } else {
              newReactions = reactions.map((r) =>
                r.userId === userId ? { ...r, emoji } : r,
              );
            }
            return { ...m, reactions: newReactions };
          });
        }
        return updated;
      });
      try {
        await api.post(`/messages/${messageId}/reactions`, { emoji });
      } catch (err) {
        console.error("Reaction error:", err);
        loadMessages(activeContactRef.current, true);
      }
    },
    [currentUser, loadMessages],
  );

  const handleSelectContact = useCallback((contact: Contact) => {
    setActiveContact(contact);
    setShowContactList(false);
    setReplyTo(null);
    setIsAtBottom(true);
    setTypingUsers({});
  }, []);

  const handleScrollToBottom = () => {
    setIsAtBottom(true);
  };

  const typingList = useMemo(() => {
    return Object.values(typingUsers).filter(Boolean);
  }, [typingUsers]);

  return (
    <div className="chat-root flex w-full h-full overflow-hidden">
      {/* Contact list sidebar */}
      <div
        className={`
          lg:relative lg:translate-x-0 lg:w-72 lg:flex lg:shrink-0
          fixed inset-y-0 left-0 z-20 w-[85vw] max-w-80
          transform transition-transform duration-300 ease-out
          ${showContactList ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <ContactList
          contacts={contacts}
          activeId={activeContact.id}
          onSelect={handleSelectContact}
          onlineUsers={onlineUsers}
          unread={unread}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      </div>

      {/* Mobile overlay */}
      {showContactList && (
        <div
          className="lg:hidden fixed inset-0 z-10 chat-animate-fade-in"
          style={{ backgroundColor: "var(--chat-overlay)" }}
          onClick={() => setShowContactList(false)}
        />
      )}

      {/* Message panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <MessagePanel
          contact={activeContact}
          messages={messages[activeContact.id] || []}
          loading={loadingMessages}
          onSend={sendMessage}
          onDelete={deleteMessage}
          onOpenContacts={() => setShowContactList(true)}
          isAtBottom={isAtBottom}
          onAtBottomChange={setIsAtBottom}
          onScrollToBottom={handleScrollToBottom}
          onlineUsers={onlineUsers}
          onLoadOlder={() => loadOlderMessages(activeContact)}
          replyTo={replyTo}
          onReply={setReplyTo}
          typingUsers={typingList}
          socketState={socketState}
          onTypingChange={emitTypingThrottled}
          onReact={handleReact}
          currentUserId={currentUser.id}
          onUserLink={onUserLink}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
