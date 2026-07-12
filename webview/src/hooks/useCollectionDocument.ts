import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchResult, EasyRequestDocument } from "../../../src/types";
import { findRequestNode, requestIds } from "../../../src/services/CollectionTree";
import type { VsCodeApi } from "../vscode-api";

type HostMessage =
  | { type: "document"; document: EasyRequestDocument; revision: number }
  | { type: "documentError"; message: string }
  | { type: "saveComplete"; requestId: number; revision: number }
  | { type: "documentConflict"; document: EasyRequestDocument; revision: number; requestId?: number }
  | { type: "batchResult"; batch: BatchResult }
  | { type: "requestCancelled" }
  | { type: "copySaved" }
  | { type: "error" | "warning"; message: string }
  | { type: "discoveryComplete"; source: string; count: number; baseUrl?: string; warning?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isHostMessage = (value: unknown): value is HostMessage => {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "document") return isRecord(value.document) && typeof value.revision === "number";
  if (["documentError", "error", "warning"].includes(value.type)) return typeof value.message === "string";
  if (value.type === "saveComplete") return typeof value.requestId === "number" && typeof value.revision === "number";
  if (value.type === "documentConflict") return isRecord(value.document) && typeof value.revision === "number";
  if (value.type === "batchResult") return isRecord(value.batch) && Array.isArray(value.batch.results);
  if (["requestCancelled", "copySaved"].includes(value.type)) return true;
  return value.type === "discoveryComplete" && typeof value.source === "string" && typeof value.count === "number";
};

const initialDocument = (): EasyRequestDocument => ({
  version: 2,
  selectedEnvironmentId: "default",
  environments: [{ id: "default", name: "Default", variables: { apiUrl: "https://httpbin.org" } }],
  root: { id: "root", type: "folder", name: "Colección", baseUrl: "{{apiUrl}}", children: [{ id: "request-1", type: "request", name: "Nueva petición", request: { id: "request-1", name: "Nueva petición", method: "GET", url: "/get", headers: [], params: [], body: "", bodyType: "none" } }] }
});

export function useCollectionDocument(vscode: VsCodeApi) {
  const [document, setDocument] = useState<EasyRequestDocument>(initialDocument);
  const documentRef = useRef(document);
  const [activeRequestId, setActiveRequestId] = useState(() => {
    const restored = vscode.getState() as { activeRequestId?: unknown } | undefined;
    return typeof restored?.activeRequestId === "string" ? restored.activeRequestId : requestIds(document.root)[0] ?? "";
  });
  const [batch, setBatch] = useState<BatchResult>();
  const [notice, setNotice] = useState<string>();
  const [swaggerUrl, setSwaggerUrl] = useState("");
  const [loadError, setLoadError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [conflict, setConflict] = useState<{ document: EasyRequestDocument; revision: number }>();
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number>();
  const saveInFlight = useRef<number>();
  const sentSnapshot = useRef("");
  const nextSaveId = useRef(1);
  const conflictRef = useRef<typeof conflict>();

  const applyHostDocument = useCallback((next: EasyRequestDocument, revision: number) => {
    const isLocal = JSON.stringify(next) === JSON.stringify(documentRef.current);
    if ((dirtyRef.current || saveInFlight.current) && !isLocal) {
      const pending = { document: next, revision };
      conflictRef.current = pending;
      setConflict(pending);
      setNotice("La colección cambió fuera de EasyRequest. Recarga los cambios externos o conserva tu edición sin sobrescribir el archivo.");
      return;
    }
    revisionRef.current = revision;
    dirtyRef.current = false;
    documentRef.current = next;
    setDocument(next);
    setLoadError(undefined);
    setActiveRequestId((current) => findRequestNode(next.root, current) ? current : requestIds(next.root)[0] ?? "");
    setSwaggerUrl(next.swaggerUrl ?? "");
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    if (!dirtyRef.current || saveInFlight.current || !revisionRef.current || conflictRef.current) return;
    const requestId = nextSaveId.current++;
    saveInFlight.current = requestId;
    sentSnapshot.current = JSON.stringify(documentRef.current);
    vscode.postMessage({ type: "saveDocument", document: documentRef.current, baseRevision: revisionRef.current, requestId });
  }, [vscode]);

  const updateDocument = useCallback((updater: (current: EasyRequestDocument) => EasyRequestDocument) => {
    const next = updater(documentRef.current);
    documentRef.current = next;
    setDocument(next);
    dirtyRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (!saveInFlight.current) saveTimer.current = window.setTimeout(flushSave, 250);
  }, [flushSave]);

  useEffect(() => {
    const listener = (event: MessageEvent<unknown>) => {
      if ((event.origin && event.origin !== window.location.origin) || !isHostMessage(event.data)) return;
      const message = event.data;
      switch (message.type) {
        case "document": applyHostDocument(message.document, message.revision); break;
        case "documentError": setRunning(false); setLoadError(message.message); break;
        case "saveComplete":
          if (message.requestId === saveInFlight.current) {
            revisionRef.current = message.revision; saveInFlight.current = undefined;
            dirtyRef.current = JSON.stringify(documentRef.current) !== sentSnapshot.current;
            if (dirtyRef.current) window.setTimeout(flushSave, 0);
          }
          break;
        case "documentConflict":
          saveInFlight.current = undefined; conflictRef.current = { document: message.document, revision: message.revision }; setConflict(conflictRef.current); setNotice("Se evitó sobrescribir una modificación externa de la colección."); break;
        case "batchResult": setBatch(message.batch); setRunning(false); break;
        case "requestCancelled": setRunning(false); setNotice("Petición cancelada."); break;
        case "copySaved":
          setNotice("La edición local se guardó como una nueva colección.");
          if (conflictRef.current) {
            const external = conflictRef.current;
            saveInFlight.current = undefined;
            dirtyRef.current = false;
            conflictRef.current = undefined;
            setConflict(undefined);
            applyHostDocument(external.document, external.revision);
          }
          break;
        case "discoveryComplete": setNotice(`${message.count} endpoints cargados desde ${message.source}.${message.baseUrl ? ` Origen guardado: {{apiUrl}} = ${message.baseUrl}.` : ""}${message.warning ? ` ${message.warning}` : ""}`); break;
        case "error": setRunning(false); saveInFlight.current = undefined; setNotice(message.message); break;
        case "warning": setNotice(message.message); break;
      }
    };
    const flushWhenHidden = () => { if (window.document.visibilityState === "hidden") flushSave(); };
    window.addEventListener("message", listener); window.addEventListener("pagehide", flushSave); window.document.addEventListener("visibilitychange", flushWhenHidden); vscode.postMessage({ type: "ready" });
    return () => { window.removeEventListener("message", listener); window.removeEventListener("pagehide", flushSave); window.document.removeEventListener("visibilitychange", flushWhenHidden); flushSave(); };
  }, [applyHostDocument, flushSave, vscode]);

  useEffect(() => { vscode.setState({ activeRequestId }); }, [activeRequestId, vscode]);

  const reloadConflict = () => {
    if (!conflict) return;
    saveInFlight.current = undefined; dirtyRef.current = false; conflictRef.current = undefined; setConflict(undefined);
    applyHostDocument(conflict.document, conflict.revision); setNotice("Cambios externos cargados.");
  };

  return { document, documentRef, activeRequestId, setActiveRequestId, batch, notice, setNotice, swaggerUrl, setSwaggerUrl, loadError, running, setRunning, conflict, updateDocument, flushSave, reloadConflict };
}
