import { useState, useMemo, memo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faPlus,
  faTimes,
  faSpinner,
  faComments,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import api from "../../api";
import UserAvatar from "../ui/UserAvatar";
import type { Contact, SearchResult, Unread } from "../../types";

interface ContactListProps {
  contacts: Contact[];
  activeId: number | string;
  onSelect: (contact: Contact) => void;
  onlineUsers: Set<number | string>;
  unread: Unread;
  favorites: (number | string)[];
  onToggleFavorite: (id: number | string) => void;
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`chat-status-dot ${online ? "chat-status-online" : "chat-status-offline"}`}
    />
  );
}

const ContactList = memo(function ContactList({
  contacts,
  activeId,
  onSelect,
  onlineUsers,
  unread,
  favorites,
  onToggleFavorite,
}: ContactListProps) {
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const sorted = useMemo(() => {
    return [...contacts].filter(Boolean).sort((a, b) => {
      if (a.isGlobal) return -1;
      if (b.isGlobal) return 1;
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      const aUnread = unread?.contacts?.[a.id]?.unread || 0;
      const bUnread = unread?.contacts?.[b.id]?.unread || 0;
      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [contacts, unread, favorites]);

  const filtered = sorted.filter((c) =>
    (c.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const getUnreadCount = (contact: Contact): number => {
    if (contact.isGlobal) return unread?.global || 0;
    const c = unread?.contacts?.[contact.id];
    return c?.unread || 0;
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get(
        `/messages/search?q=${encodeURIComponent(q)}`,
      );
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleStartConversation = (u: SearchResult) => {
    onSelect({
      id: u.id,
      name: u.pseudo,
      ref: u.ref,
      avatar: u.avatar,
    });
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const ContactAvatar = ({ contact, isActive }: { contact: Contact; isActive: boolean }) => {
    if (!contact || contact.isGlobal) {
      if (!contact) return null;
      return (
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            isActive ? "chat-accent-bg" : "chat-bg"
          }`}
          style={{ backgroundColor: isActive ? "var(--chat-accent)" : "var(--chat-border)" }}
        >
          <FontAwesomeIcon
            icon={faComments}
            className={`text-sm ${isActive ? "chat-text-inverse" : "chat-text-secondary"}`}
          />
        </div>
      );
    }
    const online = onlineUsers.has(contact.id);
    return (
      <div className="relative shrink-0 block">
        <UserAvatar
          avatar={contact.avatar}
          name={contact.name}
          size="md"
          color={isActive ? "var(--chat-accent)" : "var(--chat-bg-hover)"}
        />
        <span className="absolute -bottom-0.5 -right-0.5">
          <StatusDot online={online} />
        </span>
      </div>
    );
  };

  return (
    <div
      className="w-full h-full flex flex-col relative"
      style={{
        backgroundColor: "var(--chat-glass-bg)",
        backdropFilter: "blur(var(--chat-glass-blur))",
        borderRight: "1px solid var(--chat-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 shrink-0"
        style={{ borderBottom: "1px solid var(--chat-border)" }}
      >
        <div className="relative">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--chat-text-muted)", fontSize: 12 }}
          />
          <input
            className="w-full rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none transition-all"
            style={{
              backgroundColor: "var(--chat-bg-hover)",
              border: "1px solid var(--chat-border)",
              color: "var(--chat-text)",
            }}
            placeholder="Filtrer les conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {filtered.filter(Boolean).map((contact) => {
          const isActive = contact.id === activeId;
          return (
            <div
              key={contact.id}
              onClick={() => onSelect(contact)}
              role="button"
              tabIndex={0}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all cursor-pointer active:scale-[0.98] focus:outline-none"
              style={
                isActive
                  ? {
                      backgroundColor: "var(--chat-accent-soft)",
                      border: "1px solid var(--chat-accent-border)",
                    }
                  : {
                      border: "1px solid transparent",
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <ContactAvatar contact={contact} isActive={isActive} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-semibold text-sm truncate"
                    style={{
                      color: isActive ? "var(--chat-accent)" : "var(--chat-text)",
                    }}
                  >
                    {contact.name}
                  </span>
                  {!contact.isGlobal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(contact.id);
                      }}
                      className="shrink-0 transition-colors"
                      style={{
                        color: favorites.includes(contact.id)
                          ? "var(--chat-accent)"
                          : "var(--chat-border)",
                      }}
                      onMouseEnter={(e) => {
                        if (!favorites.includes(contact.id))
                          e.currentTarget.style.color = "var(--chat-accent)";
                      }}
                      onMouseLeave={(e) => {
                        if (!favorites.includes(contact.id))
                          e.currentTarget.style.color = "var(--chat-border)";
                      }}
                    >
                      <FontAwesomeIcon icon={faStar} className="text-[10px]" />
                    </button>
                  )}
                </div>
              </div>
              {getUnreadCount(contact) > 0 && (
                <span
                  className="min-w-[20px] h-5 rounded-full text-[10px] font-bold flex items-center justify-center px-1.5 shrink-0 self-center"
                  style={{
                    backgroundColor: "var(--chat-accent)",
                    color: "var(--chat-text-inverse)",
                  }}
                >
                  {getUnreadCount(contact) > 99 ? "99+" : getUnreadCount(contact)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Search modal */}
      {showSearch && (
        <div
          className="absolute inset-0 z-30 flex flex-col p-4 chat-animate-slide-up"
          style={{
            backgroundColor: "var(--chat-primary)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className="font-bold text-sm"
              style={{ color: "var(--chat-text-inverse)" }}
            >
              Nouvelle conversation
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
              style={{
                color: "var(--chat-text-muted)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--chat-bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <FontAwesomeIcon icon={faTimes} className="text-xs" />
            </button>
          </div>

          <div className="relative mb-4">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--chat-text-muted)", fontSize: 12 }}
            />
            <input
              autoFocus
              className="w-full rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none transition-all"
              style={{
                backgroundColor: "var(--chat-bg-hover)",
                border: "1px solid var(--chat-border)",
                color: "var(--chat-text-inverse)",
              }}
              placeholder="Rechercher un pseudo ou une référence..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {searching && (
              <div className="flex justify-center py-8">
                <FontAwesomeIcon
                  icon={faSpinner}
                  className="text-lg animate-spin"
                  style={{ color: "var(--chat-accent)" }}
                />
              </div>
            )}
            {!searching && searchQuery && searchResults.length === 0 && (
              <p
                className="text-xs text-center py-8"
                style={{ color: "var(--chat-text-muted)" }}
              >
                Aucun utilisateur trouvé
              </p>
            )}
            {!searching &&
              searchResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => handleStartConversation(u)}
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 transition-all text-left cursor-pointer focus:outline-none"
                  style={{ color: "var(--chat-text-inverse)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--chat-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <div className="relative shrink-0">
                    <UserAvatar
                      avatar={u.avatar}
                      name={u.pseudo}
                      size="md"
                      color="var(--chat-bg-hover)"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5">
                      <StatusDot online={onlineUsers.has(u.id)} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm truncate">
                      {u.pseudo}
                    </span>
                    <span
                      className="text-[11px] truncate block"
                      style={{ color: "var(--chat-text-secondary)" }}
                    >
                      {u.ref}
                    </span>
                  </div>
                </div>
              ))}
            {!searching && !searchQuery && (
              <p
                className="text-xs text-center py-8"
                style={{ color: "var(--chat-text-muted)" }}
              >
                Tapez un pseudo ou une référence
              </p>
            )}
          </div>
        </div>
      )}

      {/* New conversation button */}
      <div className="px-5 pb-5 flex justify-end shrink-0">
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ease-out shadow-lg"
          style={{
            backgroundColor: "var(--chat-accent)",
            color: "var(--chat-text-inverse)",
            boxShadow: "0 4px 12px var(--chat-accent-soft)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          title="Nouvelle conversation"
        >
          <FontAwesomeIcon icon={faPlus} className="text-sm" />
        </button>
      </div>
    </div>
  );
});

export default ContactList;
