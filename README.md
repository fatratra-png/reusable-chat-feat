# reusable-chat-feat

A drop-in real-time chat component for React apps. Import it, mount it, and it **automatically matches your brand colors** — zero config.

```tsx
import { ChatPage, autoThemeChat } from "reusable-chat-feat";

// Auto-detect and apply your app's colors
autoThemeChat();

function App() {
  return <ChatPage currentUser={user} />;
}
```

---

## Features

- **Auto-theming** — reads your app's CSS and derives a full palette
- Global chat room + private 1-to-1 messaging
- File/image sharing (local or Cloudinary)
- Emoji reactions, reply, delete
- Typing indicators, online presence, read receipts
- Unread counts, favorites, user search
- Mobile responsive with bottom-sheet actions
- Image lightbox with download
- Socket.IO real-time transport
- MIT licensed

---

## Installation

```bash
npm install reusable-chat-feat
```

### Peer dependencies

| Package | Version |
|---------|---------|
| react | ^18 \| ^19 |
| react-dom | ^18 \| ^19 |

The package bundles its own dependencies (`axios`, `socket.io-client`, `dompurify`, `emoji-picker-react`, FontAwesome), so you don't need to install them separately.

---

## Quick Start

### 1. Wrap your app with the chat provider (optional)

```tsx
import { ChatPage, autoThemeChat } from "reusable-chat-feat";

// Auto-detect brand colors from your app
autoThemeChat();

function App() {
  return (
    <div className="app">
      <ChatPage
        currentUser={{ id: 1, pseudo: "John", ref: "@john", avatar: "/avatar.jpg" }}
        onUserLink={(ref) => `/profile/${ref}`}
        onNavigate={(path) => console.log("navigate to", path)}
      />
    </div>
  );
}
```

### 2. Configure authentication

```tsx
import { setChatTokenGetter, setChatOnUnauthorized, setChatApiUrl } from "reusable-chat-feat";

setChatApiUrl("https://your-api.com");

setChatTokenGetter(() => localStorage.getItem("jwt"));

setChatOnUnauthorized(() => {
  window.location.href = "/login";
});
```

### 3. Mount the component

```tsx
<ChatPage
  currentUser={currentUser}
  onUserLink={(ref) => `/user/${ref}`}
  onNavigate={(path) => router.push(path)}
  customContacts={[{ id: 999, name: "Support", ref: "@support", avatar: null }]}
/>
```

---

## Auto-theming (how it works)

`autoThemeChat()` samples your app's **body element** computed styles and maps them to the chat's CSS variables:

| Your app's property | Chat variable |
|---------------------|---------------|
| `background-color` | `--chat-bg`, `--chat-surface`, `--chat-primary` |
| `color` | `--chat-text`, `--chat-text-secondary/muted` |
| `accent-color` | `--chat-accent`, `--chat-bubble-own` |
| `border-color` | `--chat-border` |
| `--color-danger` | `--chat-danger` |

**Light/dark detection** is automatic — the function samples the background luminance and generates appropriate light or dark variants.

### Sampling from a custom element

```tsx
autoThemeChat(document.querySelector(".app-container"));
```

### Manual override

Override any variable after calling `autoThemeChat()`:

```tsx
document.documentElement.style.setProperty("--chat-accent", "#f59e0b");
```

Or via CSS:

```css
:root {
  --chat-accent: #f59e0b;
  --chat-online: #10b981;
  --chat-danger: #ef4444;
}
```

### CSS variable reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `--chat-primary` | `#1f1f1f` | Dark surfaces, header backgrounds |
| `--chat-accent` | `#6b7280` | Brand accent, active states |
| `--chat-surface` | `#ffffff` | Card/dialog backgrounds |
| `--chat-bg` | `rgba(0,0,0,0.03)` | Page background |
| `--chat-text` | `#1f1f1f` | Primary text |
| `--chat-text-secondary` | `rgba(31,31,31,0.6)` | Secondary text |
| `--chat-text-muted` | `rgba(31,31,31,0.4)` | Timestamps, hints |
| `--chat-text-inverse` | `#ffffff` | Text on dark backgrounds |
| `--chat-border` | `rgba(0,0,0,0.1)` | Borders, dividers |
| `--chat-bubble-own` | `#e5e7eb` | Own message bubble |
| `--chat-bubble-other` | `rgba(0,0,0,0.06)` | Other's message bubble |
| `--chat-online` | `#22c55e` | Online status dot |
| `--chat-offline` | `#9ca3af` | Offline status dot |
| `--chat-danger` | `#ef4444` | Delete, errors |
| `--chat-overlay` | `rgba(0,0,0,0.5)` | Modal backdrops |
| `--chat-shadow` | `0 4px 24px rgba(0,0,0,0.12)` | Card shadows |

---

## API

### Components

#### `<ChatPage>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentUser` | `User` | required | Logged-in user |
| `onUserLink` | `(ref: string) => string` | `(ref) => "/user/"+ref` | Generate profile URL from ref |
| `onNavigate` | `(path: string) => void` | — | Client-side navigation handler |
| `customContacts` | `User[]` | `[]` | Extra contacts to always show |

#### `<ChatLayout>`

Same props as `ChatPage` minus the wrapper div — use when you want full layout control.

#### `<ContactList>` / `<MessagePanel>`

Individual sub-components for custom layouts.

### Helpers

| Function | Description |
|----------|-------------|
| `autoThemeChat(container?)` | Auto-detect host colors and apply as CSS variables |
| `setChatTokenGetter(fn)` | Set how the chat obtains the auth token |
| `setChatOnUnauthorized(fn)` | Callback when the API returns 401 |
| `setChatApiUrl(url)` | Override the API base URL (default: `VITE_CHAT_API_URL` env) |
| `getSocket()` | Get the Socket.IO singleton instance |
| `disconnectSocket()` | Tear down the socket connection |
| `refreshSocket()` | Disconnect and reconnect |
| `onConnectionChange(fn)` | Subscribe to socket connection state changes |

### Types

```tsx
interface User {
  id: number | string;
  pseudo?: string;
  name?: string;
  ref?: string | null;
  avatar?: string | null;
  isGlobal?: boolean;
}

interface Contact {
  id: number | string;
  name: string;
  ref?: string | null;
  avatar?: string | null;
  isGlobal?: boolean;
}

interface Message {
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

type SocketState =
  | "connected" | "disconnected" | "connecting"
  | "reconnecting" | "connect_error"
  | "reconnect_failed" | "reconnected";
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_CHAT_API_URL` | `http://localhost:3001` | API + Socket.IO endpoint |
| `VITE_API_URL` | fallback | Alternative API URL env |

---

## Backend

This package requires a real-time backend. You can find the official server at the [stdhub-chat-server](https://github.com/fatratra-png/stdhub-chat) repository.

The backend provides:
- REST API (`/api/messages/*`, `/api/messages/favorites/*`, `/api/messages/search`)
- WebSocket events (message:global, message:private, typing, reactions, etc.)
- File upload (local or Cloudinary)
- Push notifications (Web Push API)
- PostgreSQL database with asyncpg

---

## Development

```bash
git clone https://github.com/fatratra-png/reusable-chat-feat.git
cd reusable-chat-feat
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Type-check

```bash
npm run typecheck
```

---

## License

MIT
