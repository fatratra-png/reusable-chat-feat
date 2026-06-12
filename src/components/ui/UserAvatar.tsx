import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  size?: AvatarSize;
  color?: string;
  className?: string;
  imageClassName?: string;
  alt?: string;
}

const SIZES: Record<AvatarSize, string> = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-10 h-10 text-sm",
  xl: "w-24 h-24 text-3xl",
};

export default function UserAvatar({
  avatar,
  name,
  size = "md",
  color = "var(--chat-primary, #1a1a2e)",
  className = "",
  imageClassName = "",
  alt,
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = name ? name.charAt(0).toUpperCase() : null;
  const sizeClass = SIZES[size] || SIZES.md;

  useEffect(() => {
    setFailed(false);
  }, [avatar]);

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold shrink-0 overflow-hidden ring-1 ring-black/5 ${className}`}
      style={{ backgroundColor: color }}
    >
      {avatar && !failed ? (
        <img
          src={avatar}
          alt={alt || name || "avatar"}
          className={`w-full h-full object-cover ${imageClassName}`}
          onError={() => setFailed(true)}
        />
      ) : (
        initial || <FontAwesomeIcon icon={faUser} className="text-current" />
      )}
    </div>
  );
}
