import { useRef, useCallback } from "react";

interface LongPressHandlers {
  onClick: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
}

export function useLongPress(
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
  onTap?: ((e: React.TouchEvent | React.MouseEvent) => void) | null,
  delay: number = 500,
): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const touched = useRef(false);
  const moved = useRef(false);

  const touchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      touched.current = true;
      fired.current = false;
      moved.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress(e);
      }, delay);
    },
    [onLongPress, delay],
  );

  const touchMove = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    moved.current = true;
  }, []);

  const touchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (timer.current) clearTimeout(timer.current);
      if (fired.current) {
        e.preventDefault();
      } else if (!moved.current) {
        e.preventDefault();
        onTap?.(e);
      }
    },
    [onTap],
  );

  return {
    onClick: (e: React.MouseEvent) => {
      if (touched.current) {
        touched.current = false;
        return;
      }
      if (!fired.current) onTap?.(e);
    },
    onTouchStart: touchStart,
    onTouchEnd: touchEnd,
    onTouchMove: touchMove,
  };
}
