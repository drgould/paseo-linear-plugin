import { Platform } from "react-native";

type PointerEventLike = { clientX: number };
type PointerListener = (event: PointerEventLike) => void;

interface MinimalWindow {
  addEventListener(type: "mousemove" | "mouseup", listener: PointerListener): void;
  removeEventListener(type: "mousemove" | "mouseup", listener: PointerListener): void;
}

declare const window: MinimalWindow;

/**
 * Tracks a mouse drag across the whole window rather than the element under the cursor — a narrow
 * drag handle loses `mousemove` the instant the pointer outruns its hit area, which is why a fast
 * drag used to stall. No-op on native, where RN's touch responder system already keeps routing
 * moves to the view that started the gesture regardless of where the finger travels.
 *
 * Returns the same cleanup `mouseup` would otherwise run, so a caller can end the drag early —
 * e.g. if the mouse button was released outside the window and `mouseup` never fired here.
 */
export function trackWindowDrag(onMove: PointerListener, onEnd: () => void): () => void {
  if (Platform.OS !== "web") return () => {};
  const handleMove: PointerListener = (event) => onMove(event);
  const handleUp = () => {
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
    onEnd();
  };
  window.addEventListener("mousemove", handleMove);
  window.addEventListener("mouseup", handleUp);
  return handleUp;
}
