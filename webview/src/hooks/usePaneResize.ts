import { useEffect, useRef, useState, type PointerEvent } from "react";

const SPLITTER_WIDTH = 8;
const MIN_COLLECTION_WIDTH = 180;
const MAX_COLLECTION_WIDTH = 360;
const MIN_CONSTRUCTOR_WIDTH = 320;
const MIN_RESPONSE_WIDTH = 280;

type Splitter = "collection" | "response";

export interface PaneWidths {
  collection: number;
  response: number;
}

interface ResizeSession {
  splitter: Splitter;
  startX: number;
  widths: PaneWidths;
}

export function usePaneResize() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<ResizeSession>();
  const [paneWidths, setPaneWidths] = useState<PaneWidths>({ collection: 260, response: 360 });
  const [isResizing, setIsResizing] = useState(false);
  const workspaceWidth = () => workspaceRef.current?.getBoundingClientRect().width ?? 0;
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

  const resizePane = (splitter: Splitter, delta: number, startWidths?: PaneWidths) => setPaneWidths((current) => {
    const widths = startWidths ?? current;
    const available = workspaceWidth() - SPLITTER_WIDTH * 2;
    if (splitter === "collection") {
      const maximum = Math.min(MAX_COLLECTION_WIDTH, available - widths.response - MIN_CONSTRUCTOR_WIDTH);
      return { ...widths, collection: clamp(widths.collection + delta, MIN_COLLECTION_WIDTH, maximum) };
    }
    const maximum = available - widths.collection - MIN_CONSTRUCTOR_WIDTH;
    return { ...widths, response: clamp(widths.response - delta, MIN_RESPONSE_WIDTH, maximum) };
  });

  const startResize = (splitter: Splitter, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSessionRef.current = { splitter, startX: event.clientX, widths: paneWidths };
    setIsResizing(true);
  };
  const moveResize = (splitter: Splitter, event: PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.splitter !== splitter) return;
    resizePane(splitter, event.clientX - session.startX, session.widths);
  };
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeSessionRef.current = undefined;
    setIsResizing(false);
  };

  useEffect(() => {
    const element = workspaceRef.current;
    if (!element) return;
    const keepInBounds = () => setPaneWidths((current) => {
      const available = workspaceWidth() - SPLITTER_WIDTH * 2;
      const collection = clamp(current.collection, MIN_COLLECTION_WIDTH, Math.min(MAX_COLLECTION_WIDTH, available - current.response - MIN_CONSTRUCTOR_WIDTH));
      const response = clamp(current.response, MIN_RESPONSE_WIDTH, available - collection - MIN_CONSTRUCTOR_WIDTH);
      return collection === current.collection && response === current.response ? current : { collection, response };
    });
    const observer = new ResizeObserver(keepInBounds);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { workspaceRef, paneWidths, isResizing, resizePane, startResize, moveResize, finishResize };
}
