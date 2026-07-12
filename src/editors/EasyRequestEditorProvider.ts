import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { createDefaultDocument } from "../defaultDocument";
import { CollectionSecrets } from "../services/CollectionSecrets";
import { discoveredVariables, DiscoveredService, findFolderNode, replaceDiscoveryFolder, requestWithContext, updateFolderBaseUrl } from "../services/CollectionTree";
import { DiscoveryContext } from "../services/discovery/DiscoveryContext";
import { DocumentCodec } from "../services/DocumentCodec";
import { EnvResolver } from "../services/EnvResolver";
import { HttpService } from "../services/HttpService";
import { EasyRequestDocument } from "../types";

type WebviewMessage =
  | { type: "ready" }
  | { type: "saveDocument"; document: unknown; baseRevision: number; requestId: number }
  | { type: "saveCopy"; document: unknown }
  | { type: "executeRequest"; document: unknown; requestId: string; environmentId?: string; total: number; concurrency: number }
  | { type: "cancelRequest" }
  | { type: "editFolderBaseUrl"; folderId: string }
  | { type: "copyToClipboard"; text: string }
  | { type: "discover"; swaggerUrl?: string }
  | { type: "discoverDotNet" };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export class EasyRequestEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  public static readonly viewType = "easyrequest.editor";

  private readonly extensionUri: vscode.Uri;
  private readonly views = new Map<string, Set<vscode.Webview>>();
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly activeRequests = new Map<vscode.Webview, Set<AbortController>>();
  private readonly internalWrites = new Map<string, string>();
  private readonly resolver = new EnvResolver();
  private readonly httpService = new HttpService();
  private readonly discovery = new DiscoveryContext();
  private readonly codec = new DocumentCodec();
  private readonly collectionSecrets: CollectionSecrets;
  private readonly documentChangeListener: vscode.Disposable;

  public constructor(context: vscode.ExtensionContext) {
    this.extensionUri = context.extensionUri;
    this.collectionSecrets = new CollectionSecrets(context.secrets);
    this.documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      const key = event.document.uri.toString();
      if (!this.isEasyRequest(event.document)) {
        return;
      }
      if (this.internalWrites.get(key) === event.document.getText()) {
        this.internalWrites.delete(key);
      } else {
        void this.broadcastDocument(event.document);
      }
    });
  }

  public dispose(): void {
    this.documentChangeListener.dispose();
    for (const controllers of this.activeRequests.values()) {
      controllers.forEach((controller) => controller.abort());
    }
    this.activeRequests.clear();
    this.internalWrites.clear();
    this.mutationQueues.clear();
    this.views.clear();
  }

  public async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "webview", "dist")]
    };
    webviewPanel.webview.html = this.webviewHtml(webviewPanel.webview);

    const key = document.uri.toString();
    const webviews = this.views.get(key) ?? new Set<vscode.Webview>();
    webviews.add(webviewPanel.webview);
    this.views.set(key, webviews);

    const messageListener = webviewPanel.webview.onDidReceiveMessage((raw: unknown) => {
      void this.handleMessage(document, webviewPanel.webview, raw);
    });
    webviewPanel.onDidDispose(() => {
      messageListener.dispose();
      this.cancelRequests(webviewPanel.webview);
      const openViews = this.views.get(key);
      openViews?.delete(webviewPanel.webview);
      if (!openViews?.size) {
        this.views.delete(key);
      }
    });
    await this.postDocument(webviewPanel.webview, document);
  }

  public async createCollection(): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      filters: { EasyRequest: ["erequest"] },
      saveLabel: "Crear colección EasyRequest"
    });
    if (!target) {
      return;
    }
    const file = target.path.toLowerCase().endsWith(".erequest") ? target : target.with({ path: `${target.path}.erequest` });
    await vscode.workspace.fs.writeFile(file, Buffer.from(this.codec.serialize(createDefaultDocument()), "utf8"));
    await vscode.commands.executeCommand("vscode.openWith", file, EasyRequestEditorProvider.viewType);
  }

  private async handleMessage(textDocument: vscode.TextDocument, webview: vscode.Webview, raw: unknown): Promise<void> {
    try {
      const message = this.message(raw);
      switch (message.type) {
        case "ready":
          await this.postDocument(webview, textDocument);
          return;
        case "saveDocument":
          await this.enqueueMutation(textDocument.uri, () => this.saveDocument(textDocument, webview, message));
          return;
        case "saveCopy":
          await this.saveCopy(textDocument, webview, message.document);
          return;
        case "executeRequest":
          await this.execute(webview, message);
          return;
        case "cancelRequest":
          this.cancelRequests(webview);
          this.post(webview, { type: "requestCancelled" });
          return;
        case "editFolderBaseUrl":
          await this.enqueueMutation(textDocument.uri, () => this.editFolderBaseUrl(textDocument, webview, message.folderId));
          return;
        case "copyToClipboard":
          await vscode.env.clipboard.writeText(message.text);
          this.post(webview, { type: "clipboardCopied" });
          return;
        case "discover":
          await this.enqueueMutation(textDocument.uri, () => this.discoverEndpoints(textDocument, webview, message.swaggerUrl));
          return;
        case "discoverDotNet":
          await this.enqueueMutation(textDocument.uri, () => this.discoverDotNet(textDocument, webview));
          return;
      }
    } catch (error) {
      this.post(webview, { type: "error", message: this.errorMessage(error) });
    }
  }

  private async saveDocument(
    textDocument: vscode.TextDocument,
    webview: vscode.Webview,
    message: Extract<WebviewMessage, { type: "saveDocument" }>
  ): Promise<void> {
    const incoming = this.codec.fromUnknown(message.document);
    if (message.baseRevision !== textDocument.version) {
      const current = await this.readHydratedDocument(textDocument);
      this.post(webview, { type: "documentConflict", document: current, revision: textDocument.version, requestId: message.requestId });
      return;
    }
    await this.writeDocument(textDocument, incoming);
    this.post(webview, { type: "saveComplete", requestId: message.requestId, revision: textDocument.version });
  }

  private async saveCopy(textDocument: vscode.TextDocument, webview: vscode.Webview, rawDocument: unknown): Promise<void> {
    const document = this.codec.fromUnknown(rawDocument);
    const baseName = textDocument.uri.path.replace(/\.erequest$/i, "-copia.erequest");
    const target = await vscode.window.showSaveDialog({
      defaultUri: textDocument.uri.with({ path: baseName }),
      filters: { EasyRequest: ["erequest"] },
      saveLabel: "Guardar copia"
    });
    if (!target) {
      return;
    }
    const file = target.path.toLowerCase().endsWith(".erequest") ? target : target.with({ path: `${target.path}.erequest` });
    const stored = await this.collectionSecrets.prepareForStorage(file, document);
    await vscode.workspace.fs.writeFile(file, Buffer.from(this.codec.serialize(stored), "utf8"));
    this.post(webview, { type: "copySaved" });
  }

  private async execute(
    webview: vscode.Webview,
    message: Extract<WebviewMessage, { type: "executeRequest" }>
  ): Promise<void> {
    const document = this.codec.fromUnknown(message.document);
    const request = requestWithContext(document.root, message.requestId);
    if (!request) {
      throw new Error("La petición seleccionada ya no existe.");
    }
    const environment = document.environments.find((item) => item.id === (message.environmentId ?? document.selectedEnvironmentId));
    const resolved = this.resolver.resolveRequest(request, environment?.variables ?? {});
    if (resolved.missingVariables.length) {
      throw new Error(`Variables sin definir: ${resolved.missingVariables.join(", ")}.`);
    }

    this.cancelRequests(webview);
    const controller = new AbortController();
    const controllers = this.activeRequests.get(webview) ?? new Set<AbortController>();
    controllers.add(controller);
    this.activeRequests.set(webview, controllers);
    try {
      const batch = await this.httpService.executeBatch(resolved, message.total, message.concurrency, controller.signal);
      if (controller.signal.aborted) {
        this.post(webview, { type: "requestCancelled" });
        return;
      }
      const requestedTotal = Math.max(1, Math.floor(message.total));
      if (batch.results.length < requestedTotal) {
        const configuredMaximum = vscode.workspace.getConfiguration("easyrequest").get<number>("maxBatchRequests", 100);
        const maximum = Math.min(500, Math.max(1, Math.floor(Number.isFinite(configuredMaximum) ? configuredMaximum : 100)));
        this.post(webview, { type: "warning", message: `La ráfaga se limitó a ${maximum} solicitudes.` });
      }
      this.post(webview, { type: "batchResult", batch });
    } finally {
      controllers.delete(controller);
      if (!controllers.size) {
        this.activeRequests.delete(webview);
      }
    }
  }

  private async discoverEndpoints(textDocument: vscode.TextDocument, webview: vscode.Webview, swaggerUrl?: string): Promise<void> {
    const document = await this.readHydratedDocument(textDocument);
    const result = await this.discovery.discover({
      swaggerUrl: swaggerUrl ?? document.swaggerUrl,
      workspaceRoot: this.workspaceRoot(textDocument.uri),
      cachedEndpoints: []
    });
    const services = this.servicesFor(result);
    const next = {
      ...document,
      root: replaceDiscoveryFolder(document.root, result.source, services),
      environments: this.setBaseUrls(document, services),
      swaggerUrl: swaggerUrl?.trim() || document.swaggerUrl,
      discoverySource: result.source
    } satisfies EasyRequestDocument;
    await this.writeDocument(textDocument, next);
    await this.postDocument(webview, textDocument);
    this.post(webview, {
      type: "discoveryComplete",
      source: result.source,
      count: result.endpoints.length,
      baseUrl: result.baseUrl,
      warning: result.warning
    });
  }

  private async editFolderBaseUrl(textDocument: vscode.TextDocument, webview: vscode.Webview, folderId: string): Promise<void> {
    const document = await this.readHydratedDocument(textDocument);
    const folder = findFolderNode(document.root, folderId);
    if (!folder) throw new Error("La carpeta seleccionada ya no existe.");
    const value = await vscode.window.showInputBox({
      title: "EasyRequest: URL base de carpeta",
      prompt: `URL base para “${folder.name}”. Déjala vacía para heredar la URL superior.`,
      value: folder.baseUrl ?? "",
      placeHolder: "{{apiUrl}} o https://api.example.com"
    });
    if (value === undefined) return;
    await this.writeDocument(textDocument, { ...document, root: updateFolderBaseUrl(document.root, folderId, value.trim() || undefined) });
    await this.postDocument(webview, textDocument);
  }

  private async discoverDotNet(textDocument: vscode.TextDocument, webview: vscode.Webview): Promise<void> {
    const root = this.workspaceRoot(textDocument.uri);
    if (!root) {
      throw new Error("Abre una carpeta de espacio de trabajo para analizar código C#.");
    }
    const document = await this.readHydratedDocument(textDocument);
    const result = await this.discovery.discoverDotNet(root);
    const services = this.servicesFor(result);
    const next = {
      ...document,
      root: replaceDiscoveryFolder(document.root, result.source, services),
      environments: this.setBaseUrls(document, services),
      discoverySource: result.source
    } satisfies EasyRequestDocument;
    await this.writeDocument(textDocument, next);
    await this.postDocument(webview, textDocument);
    this.post(webview, { type: "discoveryComplete", source: result.source, count: result.endpoints.length });
  }

  private async writeDocument(textDocument: vscode.TextDocument, document: EasyRequestDocument): Promise<void> {
    const previous = this.codec.parse(textDocument.getText());
    const stored = await this.collectionSecrets.prepareForStorage(textDocument.uri, document, previous);
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(textDocument.positionAt(0), textDocument.positionAt(textDocument.getText().length));
    const serialized = this.codec.serialize(stored);
    edit.replace(textDocument.uri, fullRange, serialized);
    const key = textDocument.uri.toString();
    this.internalWrites.set(key, serialized);
    try {
      const changed = await vscode.workspace.applyEdit(edit);
      if (!changed) {
        throw new Error("VS Code no pudo aplicar los cambios de la colección.");
      }
    } finally {
      setTimeout(() => {
        if (this.internalWrites.get(key) === serialized) {
          this.internalWrites.delete(key);
        }
      }, 1000);
    }
  }

  private async broadcastDocument(textDocument: vscode.TextDocument): Promise<void> {
    for (const webview of this.views.get(textDocument.uri.toString()) ?? []) {
      await this.postDocument(webview, textDocument);
    }
  }

  private async postDocument(webview: vscode.Webview, textDocument: vscode.TextDocument): Promise<void> {
    try {
      const document = await this.readHydratedDocument(textDocument);
      this.post(webview, { type: "document", document, revision: textDocument.version });
    } catch (error) {
      this.post(webview, { type: "documentError", message: this.errorMessage(error) });
    }
  }

  private async readHydratedDocument(textDocument: vscode.TextDocument): Promise<EasyRequestDocument> {
    return this.collectionSecrets.hydrate(textDocument.uri, this.codec.parse(textDocument.getText()));
  }

  private enqueueMutation(uri: vscode.Uri, task: () => Promise<void>): Promise<void> {
    const key = uri.toString();
    const queued = (this.mutationQueues.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
    this.mutationQueues.set(key, queued);
    const cleanup = () => {
      if (this.mutationQueues.get(key) === queued) {
        this.mutationQueues.delete(key);
      }
    };
    void queued.then(cleanup, cleanup);
    return queued;
  }

  private cancelRequests(webview: vscode.Webview): void {
    this.activeRequests.get(webview)?.forEach((controller) => controller.abort());
    this.activeRequests.delete(webview);
  }

  private message(raw: unknown): WebviewMessage {
    if (!isRecord(raw) || typeof raw.type !== "string") {
      throw new Error("Mensaje del webview inválido.");
    }
    switch (raw.type) {
      case "ready":
      case "cancelRequest":
      case "discoverDotNet":
        return { type: raw.type };
      case "editFolderBaseUrl":
        if (typeof raw.folderId !== "string" || raw.folderId.length > 500) throw new Error("El identificador de carpeta es inválido.");
        return { type: "editFolderBaseUrl", folderId: raw.folderId };
      case "copyToClipboard":
        if (typeof raw.text !== "string" || raw.text.length > 2 * 1024 * 1024) throw new Error("El texto a copiar es inválido o demasiado grande.");
        return { type: "copyToClipboard", text: raw.text };
      case "discover":
        if (raw.swaggerUrl !== undefined && typeof raw.swaggerUrl !== "string") {
          throw new Error("La URL de Swagger es inválida.");
        }
        return { type: "discover", swaggerUrl: raw.swaggerUrl?.slice(0, 8192) };
      case "saveDocument":
        return {
          type: "saveDocument",
          document: raw.document,
          baseRevision: this.integer(raw.baseRevision, "baseRevision", 1, Number.MAX_SAFE_INTEGER),
          requestId: this.integer(raw.requestId, "requestId", 1, Number.MAX_SAFE_INTEGER)
        };
      case "saveCopy":
        return { type: "saveCopy", document: raw.document };
      case "executeRequest":
        if (typeof raw.requestId !== "string" || raw.requestId.length > 500) {
          throw new Error("El identificador de la petición es inválido.");
        }
        if (raw.environmentId !== undefined && typeof raw.environmentId !== "string") {
          throw new Error("El entorno seleccionado es inválido.");
        }
        return {
          type: "executeRequest",
          document: raw.document,
          requestId: raw.requestId,
          environmentId: raw.environmentId,
          total: this.integer(raw.total, "total", 1, 500),
          concurrency: this.integer(raw.concurrency, "concurrency", 1, 20)
        };
      default:
        throw new Error("Tipo de mensaje no permitido.");
    }
  }

  private integer(value: unknown, name: string, minimum: number, maximum: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${name} debe ser numérico.`);
    }
    return Math.min(maximum, Math.max(minimum, Math.floor(value)));
  }

  private workspaceRoot(documentUri: vscode.Uri): vscode.Uri | undefined {
    return vscode.workspace.getWorkspaceFolder(documentUri)?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  private servicesFor(result: { source: "swagger" | "dotnet" | "cache"; endpoints: import("../types").Endpoint[]; services?: DiscoveredService[]; baseUrl?: string }): DiscoveredService[] {
    return result.services ?? [{
      id: result.source,
      name: result.source === "swagger" ? "API Swagger" : "API local",
      baseUrl: result.baseUrl,
      endpoints: result.endpoints
    }];
  }

  private setBaseUrls(document: EasyRequestDocument, services: DiscoveredService[]): EasyRequestDocument["environments"] {
    const variables = discoveredVariables(services);
    if (!Object.keys(variables).length) {
      return document.environments;
    }
    return document.environments.map((environment) => environment.id === document.selectedEnvironmentId
      ? { ...environment, variables: { ...environment.variables, ...variables } }
      : environment
    );
  }

  private isEasyRequest(document: vscode.TextDocument): boolean {
    return document.uri.path.toLowerCase().endsWith(".erequest");
  }

  private post(webview: vscode.Webview, message: unknown): void {
    void webview.postMessage(message);
  }

  private webviewHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview", "dist", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview", "dist", "styles.css"));
    const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; connect-src 'none'; form-action 'none';`;
    return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>EasyRequest</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
  }
}
