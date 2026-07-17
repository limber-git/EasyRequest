import { useCallback, type CSSProperties } from "react";
import type { CollectionFolder, EasyRequestDocument, Environment, RequestContract, RequestSpec } from "../../src/types";
import { addFolder, addRequestToFolder, findRequestNode, removeRequestNode, requestIds, renameNode, updateRequestNode, moveNode } from "../../src/services/CollectionTree";
import { EndpointTree } from "./components/EndpointTree";
import { EnvironmentEditor } from "./components/EnvironmentEditor";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { useCollectionDocument } from "./hooks/useCollectionDocument";
import { usePaneResize } from "./hooks/usePaneResize";
import { getVsCodeApi } from "./vscode-api";

const RESIZE_STEP = 20;

export function App(): JSX.Element {
  const vscode = getVsCodeApi();
  const state = useCollectionDocument(vscode);
  const { workspaceRef, paneWidths, isResizing, resizePane, startResize, moveResize, finishResize } = usePaneResize();
  const activeNode = findRequestNode(state.document.root, state.activeRequestId) ?? findRequestNode(state.document.root, requestIds(state.document.root)[0] ?? "");
  const activeRequest = activeNode?.request;
  const activeEnvironment = state.document.environments.find((item) => item.id === state.document.selectedEnvironmentId);

  const updateRequest = (request: RequestSpec) => state.updateDocument((current) => ({ ...current, root: updateRequestNode(current.root, request.id, () => request) as CollectionFolder }));
  const createRequest = (parentId = state.document.root.id) => {
    const id = crypto.randomUUID();
    const request: RequestSpec = { id, name: "Nueva petición", method: "GET", url: "/", headers: [], params: [], body: "", bodyType: "none" };
    state.setActiveRequestId(id);
    state.updateDocument((current) => ({ ...current, root: addRequestToFolder(current.root, parentId, { id, type: "request", name: request.name, request }) }));
  };
  const createFolder = (parentId = state.document.root.id) => state.updateDocument((current) => {
    const id = crypto.randomUUID();
    return { ...current, root: addFolder(current.root, parentId, { id, type: "folder", name: "Nueva carpeta", children: [] }) };
  });
  const deleteNode = (id: string) => {
    state.updateDocument((current) => ({ ...current, root: removeRequestNode(current.root, id), contracts: current.contracts?.filter((contract) => contract.requestId !== id) }));
    if (state.activeRequestId === id) state.setActiveRequestId(requestIds(removeRequestNode(state.documentRef.current.root, id))[0] ?? "");
  };
  const saveContract = (contract: RequestContract) => state.updateDocument((current) => ({ ...current, contracts: [...(current.contracts ?? []).filter((item) => item.requestId !== contract.requestId), contract] }));
  const deleteContract = () => state.updateDocument((current) => ({ ...current, contracts: current.contracts?.filter((item) => item.requestId !== state.activeRequestId) }));
  const changeEnvironment = (environment: Environment) => state.updateDocument((current) => ({ ...current, environments: current.environments.map((item) => item.id === environment.id ? environment : item) }));
  const addEnvironment = () => state.updateDocument((current) => {
    const id = crypto.randomUUID();
    return { ...current, selectedEnvironmentId: id, environments: [...current.environments, { id, name: `Entorno ${current.environments.length + 1}`, variables: {} }] };
  });
  const deleteEnvironment = (id: string) => state.updateDocument((current) => {
    const environments = current.environments.filter((environment) => environment.id !== id);
    return { ...current, environments, selectedEnvironmentId: environments[0]?.id ?? "" };
  });
  const execute = useCallback((total: number, concurrency: number) => {
    if (!activeRequest) return;
    state.flushSave();
    state.setRunning(true);
    vscode.postMessage({ type: "executeRequest", document: state.documentRef.current, requestId: activeRequest.id, environmentId: state.documentRef.current.selectedEnvironmentId, total, concurrency });
  }, [activeRequest, state, vscode]);

  if (state.loadError) return <main className="fatal-error"><h1>No se pudo abrir la colección</h1><p>{state.loadError}</p><p>El archivo no fue modificado. Corrige el JSON en el editor de texto o restaura una copia válida.</p></main>;

  return <div className="app-shell">
    <AppHeader swaggerUrl={state.swaggerUrl} onSwaggerUrlChange={state.setSwaggerUrl} document={state.document} onDiscover={() => { state.flushSave(); vscode.postMessage({ type: "discover", swaggerUrl: state.swaggerUrl }); }} onDiscoverDotNet={() => { state.flushSave(); vscode.postMessage({ type: "discoverDotNet" }); }} onEnvironmentSelect={(id) => state.updateDocument((current) => ({ ...current, selectedEnvironmentId: id }))} onEnvironmentChange={changeEnvironment} onEnvironmentAdd={addEnvironment} onEnvironmentDelete={deleteEnvironment} />
    {state.notice && <div className="notice" role="status"><span>{state.notice}</span><button className="icon-button" onClick={() => state.setNotice(undefined)} aria-label="Cerrar mensaje">×</button></div>}
    {state.conflict && <div className="conflict" role="alert"><span>Hay cambios externos pendientes.</span><button className="vscode-button secondary" onClick={state.reloadConflict}>Recargar archivo</button><button className="text-button" onClick={() => vscode.postMessage({ type: "saveCopy", document: state.documentRef.current })}>Guardar edición como copia</button></div>}
    <div ref={workspaceRef} className={`workspace-grid${isResizing ? " is-resizing" : ""}`} style={{ "--collection-width": `${paneWidths.collection}px`, "--response-width": `${paneWidths.response}px` } as CSSProperties}>
      <EndpointTree root={state.document.root} activeId={activeRequest?.id ?? ""} onSelect={state.setActiveRequestId} onNew={createRequest} onNewFolder={createFolder} onDelete={deleteNode} onRename={(id, name) => state.updateDocument((current) => ({ ...current, root: renameNode(current.root, id, name) }))} onMove={(nodeId, targetId, index) => state.updateDocument((current) => ({ ...current, root: moveNode(current.root, nodeId, targetId, index) }))} />
      <PaneSplitter label="Redimensionar colección" side="collection" startResize={startResize} moveResize={moveResize} finishResize={finishResize} resizePane={resizePane} />
      {activeRequest ? <RequestPanel key={activeRequest.id} request={activeRequest} root={state.document.root} environment={activeEnvironment} onChange={updateRequest} onExecute={execute} onCancel={() => vscode.postMessage({ type: "cancelRequest" })} running={state.running} onEditFolderBaseUrl={(folderId) => { state.flushSave(); vscode.postMessage({ type: "editFolderBaseUrl", folderId }); }} onOpenEnvironment={() => { const editor = window.document.querySelector(".environment-editor") as HTMLDetailsElement | null; if (editor) editor.open = true; }} /> : <main className="request-panel"><div className="response-empty"><p><strong>Selecciona o crea una petición</strong> en la colección de la izquierda para empezar.</p><p style={{ marginTop: 8, fontSize: ".85em" }}>Usa <span className="kbd">Ctrl+Enter</span> para enviar · <span className="kbd">Esc</span> para cancelar</p></div></main>}
      <PaneSplitter label="Redimensionar respuesta" side="response" startResize={startResize} moveResize={moveResize} finishResize={finishResize} resizePane={resizePane} />
      <ResponsePanel batch={state.batch} contract={state.document.contracts?.find((item) => item.requestId === activeRequest?.id)} requestId={activeRequest?.id ?? ""} onSaveContract={saveContract} onDeleteContract={deleteContract} onCopy={(text) => vscode.postMessage({ type: "copyToClipboard", text })} />
    </div>
  </div>;
}

function AppHeader({ swaggerUrl, onSwaggerUrlChange, document, onDiscover, onDiscoverDotNet, onEnvironmentSelect, onEnvironmentChange, onEnvironmentAdd, onEnvironmentDelete }: { swaggerUrl: string; onSwaggerUrlChange(value: string): void; document: EasyRequestDocument; onDiscover(): void; onDiscoverDotNet(): void; onEnvironmentSelect(id: string): void; onEnvironmentChange(environment: Environment): void; onEnvironmentAdd(): void; onEnvironmentDelete(id: string): void }): JSX.Element {
  return <header className="topbar"><div className="brand"><span className="brand-mark">↗</span> EasyRequest</div><div className="sync-controls"><input value={swaggerUrl} placeholder="URL de swagger/openapi.json" onChange={(event) => onSwaggerUrlChange(event.target.value)} aria-label="URL de Swagger" /><button className="vscode-button secondary" onClick={onDiscover}>Sincronizar</button><button className="vscode-button secondary" onClick={onDiscoverDotNet}>Analizar C#</button></div><EnvironmentEditor environments={document.environments} selectedId={document.selectedEnvironmentId} onSelect={onEnvironmentSelect} onChange={onEnvironmentChange} onAdd={onEnvironmentAdd} onDelete={onEnvironmentDelete} /></header>;
}

function PaneSplitter({ label, side, startResize, moveResize, finishResize, resizePane }: { label: string; side: "collection" | "response"; startResize: ReturnType<typeof usePaneResize>["startResize"]; moveResize: ReturnType<typeof usePaneResize>["moveResize"]; finishResize: ReturnType<typeof usePaneResize>["finishResize"]; resizePane: ReturnType<typeof usePaneResize>["resizePane"] }): JSX.Element {
  return <div className="pane-splitter" role="separator" aria-label={label} aria-orientation="vertical" tabIndex={0} onPointerDown={(event) => startResize(side, event)} onPointerMove={(event) => moveResize(side, event)} onPointerUp={finishResize} onPointerCancel={finishResize} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizePane(side, event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP); } }} />;
}
