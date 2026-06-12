import type { ParsedFile, Message } from "../../types";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const GROUP_GAP = 5 * MINUTE;

export const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const getDayDiff = (a: Date, b: Date): number => {
  const ta = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const tb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ta.getTime() - tb.getTime()) / DAY);
};

export const formatTime = (date: Date): string =>
  date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const formatDateLabel = (date: Date): string => {
  const now = new Date();
  const diff = getDayDiff(now, date);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7)
    return date.toLocaleDateString("fr-FR", { weekday: "long" });
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
    });
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const isFileMessage = (content: string): boolean =>
  Boolean(content && content.startsWith("[FILE:"));

export const parseFileContent = (content: string): ParsedFile | null => {
  if (!content || !content.startsWith("[FILE:") || !content.endsWith("]"))
    return null;
  const inner = content.slice(6, -1);

  const newMatch = inner.match(/^(.*?):(.+):(img|file)(?::(\d+))?$/);
  if (newMatch) {
    const file: ParsedFile = {
      filename: newMatch[1],
      url: newMatch[2],
      type: newMatch[3] as "img" | "file",
    };
    if (newMatch[4]) {
      const dotIndex = file.filename.lastIndexOf(".");
      file.size = Number.parseInt(newMatch[4], 10);
      file.extension =
        dotIndex !== -1 && dotIndex !== 0
          ? file.filename.slice(dotIndex + 1).toLowerCase()
          : "";
    }
    return file;
  }

  const oldMatch = inner.match(/^(.*?):(.+)$/);
  if (oldMatch) {
    const filename = oldMatch[1];
    const url = oldMatch[2];
    const isImage =
      /\.(jpg|jpeg|png|gif|webp)/i.test(url) ||
      /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
    return { filename, url, type: isImage ? "img" : "file" };
  }

  return null;
};

export const shouldGroup = (prevMsg: Message, nextMsg: Message): boolean => {
  if (!prevMsg || !nextMsg) return false;
  if (prevMsg.own !== nextMsg.own) return false;
  if (prevMsg.sender !== nextMsg.sender) return false;
  const prevDate = new Date(prevMsg.createdAt);
  const nextDate = new Date(nextMsg.createdAt);
  const gap = nextDate.getTime() - prevDate.getTime();
  return gap > 0 && gap < GROUP_GAP;
};
