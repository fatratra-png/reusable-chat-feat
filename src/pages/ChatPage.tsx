import ChatLayout from "../components/chat/ChatLayout";
import "../styles/chat.css";
import type { User } from "../types";

interface ChatPageProps {
  currentUser: User;
  onUserLink?: (ref: string) => string;
  onNavigate?: (path: string) => void;
  customContacts?: User[];
}

export default function ChatPage({
  currentUser,
  onUserLink,
  onNavigate,
  customContacts,
}: ChatPageProps) {
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ backgroundColor: "var(--chat-bg)" }}
    >
      <div className="flex-1 overflow-hidden min-w-0 relative z-10">
        <ChatLayout
          currentUser={currentUser}
          onUserLink={onUserLink}
          onNavigate={onNavigate}
          customContacts={customContacts}
        />
      </div>
    </div>
  );
}

 