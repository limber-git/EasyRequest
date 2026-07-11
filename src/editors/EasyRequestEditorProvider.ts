import { randomBytes } from "crypto";
import * as vscode from "vscode";
import { createDefaultDocument } from "../defaultDocument";
import { DiscoveryContext } from "../services/discovery/DiscoveryContext";
import { EnvResolver } from "../services/EnvResolver";
import { HttpService } from "../services/HttpService";
import { EasyRequestDocument, RequestSpec } from "../types";

type WebviewMessage = {
  type: "ready" | "saveDocument" | "executeRequest" | "discover" | "discoverDotNet";
  document?: EasyRequestDocument;
  request?: RequestSpec;
  environmentId?: string;
  total?: number;
  concurrency?: number;
  swaggerUrl?: string;
};

export class EasyRequestEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  public static readonly viewType = "easyrequest.editor";

  private readonly views = new Map<string, Set<vscode.Webview>>();
  private readonly resolver = new EnvResolver();
  private readonly httpService = new HttpService();
  private readonly discovery = new DiscoveryContext();
  private readonly documentChangeListener: vscode.Disposable;

  public constructor(private readonly extensionUri: vscode.Uri) {
    this.documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (this.isEasyRequest(event.document)) {
        this.broadcastDocument(event.document);
      }
    });
  }

  public dispose(): void {
    this.documentChangeListener.dispose();
    this.views.clear();
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "webview", "dist")]
    };
    webviewPanel.webview.html = this.webviewHtml(webviewPanel.webview);

    const key = document.uri.toString();
    const webviews = this.views.get(key) ?? new Set<vscode.Webview>();
    webviews.add(webviewPanel.webview);
    this.views.set(key, webviews);

    webviewPanel.onDidDispose(() => {
      const openViews = this.views.get(key);
      openViews?.delete(webviewPanel.webview);
      if (!openViews?.size) {
        this.views.delete(key);
      }
    });

    webviewPanel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(document, webviewPanel.webview, message);
    });
    this.postDocument(webviewPanel.webview, document);
  }

  public async createCollection(): Promise<void> {
    const target = await vscode.window.showSaveDialog({
      filters: { EasyRequest: ["erequest"] },
      saveLabel: "Crear colección EasyRequest"
    });
    if (!target) {
      return;
    }
    const file = target.path.endsWith(".erequest") ? target : target.with({ path: `${target.path}.erequest` });
    await vscode.workspace.fs.writeFile(file, Buffer.from(this.serialize(createDefaultDocument()), "utf8"));
    await vscode.commands.executeCommand("vscode.openWith", file, EasyRequestEditorProvider.viewType);
  }

  private async handleMessage(
    textDocument: vscode.TextDocument,
    webview: vscode.Webview,
    message: WebviewMessage
  ): Promise<void> {
    try {
      const current = message.document ?? this.readDocument(textDocument.getText());
      switch (message.type) {
        case "ready":
          this.post(webview, { type: "document", document: current });
          return;
        case "saveDocument":
          if (!message.document) {
            return;
          }
          await this.writeDocument(textDocument, message.document);
          return;
        case "executeRequest":
          if (!message.request) {
            return;
          }
          await this.execute(webview, current, message);
          return;
        case "discover":
          await this.discoverEndpoints(textDocument, webview, current, message.swaggerUrl);
          return;
        case "discoverDotNet":
          await this.discoverDotNet(textDocument, webview, current);
          return;
      }
    } catch (error) {
      this.post(webview, { type: "error", message: this.errorMessage(error) });
    }
  }

  private async execute(webview: vscode.Webview, document: EasyRequestDocument, message: WebviewMessage): Promise<void> {
    const environment = document.environments.find((item) => item.id === (message.environmentId ?? document.selectedEnvironmentId));
    const resolved = this.resolver.resolveRequest(message.request!, environment?.variables ?? {});
    if (resolved.missingVariables.length) {
      this.post(webview, {
        type: "warning",
        message: `Variables sin definir: ${resolved.missingVariables.join(", ")}.`
      });
    }
    const batch = await this.httpService.executeBatch(resolved, message.total ?? 1, message.concurrency ?? 1);
    this.post(webview, { type: "batchResult", batch });
  }

  private async discoverEndpoints(
    textDocument: vscode.TextDocument,
    webview: vscode.Webview,
    document: EasyRequestDocument,
    swaggerUrl?: string
  ): Promise<void> {
    const result = await this.discovery.discover({
      swaggerUrl: swaggerUrl ?? document.swaggerUrl,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri,
      cachedEndpoints: document.endpoints
    });
    const next = {
      ...document,
      endpoints: result.endpoints,
      swaggerUrl: swaggerUrl?.trim() || document.swaggerUrl,
      discoverySource: result.source
    } satisfies EasyRequestDocument;
    await this.writeDocument(textDocument, next);
    this.post(webview, { type: "discoveryComplete", source: result.source, count: result.endpoints.length, warning: result.warning });
  }

  private async discoverDotNet(
    textDocument: vscode.TextDocument,
    webview: vscode.Webview,
    document: EasyRequestDocument
  ): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      throw new Error("Abre una carpeta de espacio de trabajo para analizar código C#.");
    }
    const result = await this.discovery.discoverDotNet(root);
    const next = { ...document, endpoints: result.endpoints, discoverySource: result.source } satisfies EasyRequestDocument;
    await this.writeDocument(textDocument, next);
    this.post(webview, { type: "discoveryComplete", source: result.source, count: result.endpoints.length });
  }

  private async writeDocument(textDocument: vscode.TextDocument, document: EasyRequestDocument): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(textDocument.positionAt(0), textDocument.positionAt(textDocument.getText().length));
    edit.replace(textDocument.uri, fullRange, this.serialize(document));
    const changed = await vscode.workspace.applyEdit(edit);
    if (!changed) {
      throw new Error("VS Code no pudo guardar los cambios de la colección.");
    }
  }

  private broadcastDocument(textDocument: vscode.TextDocument): void {
    const state = this.readDocument(textDocument.getText());
    for (const webview of this.views.get(textDocument.uri.toString()) ?? []) {
      this.post(webview, { type: "document", document: state });
    }
  }

  private postDocument(webview: vscode.Webview, textDocument: vscode.TextDocument): void {
    this.post(webview, { type: "document", document: this.readDocument(textDocument.getText()) });
  }

  private post(webview: vscode.Webview, message: unknown): void {
    void webview.postMessage(message);
  }

  private readDocument(raw: string): EasyRequestDocument {
    if (!raw.trim()) {
      return createDefaultDocument();
    }
    try {
      const parsed = JSON.parse(raw) as Partial<EasyRequestDocument>;
      const fallback = createDefaultDocument();
      if (parsed.version !== 1) {
        throw new Error("Formato no compatible");
      }
      return {
        ...fallback,
        ...parsed,
        environments: Array.isArray(parsed.environments) ? parsed.environments : fallback.environments,
        requests: Array.isArray(parsed.requests) ? parsed.requests : fallback.requests,
        endpoints: Array.isArray(parsed.endpoints) ? parsed.endpoints : fallback.endpoints
      };
    } catch {
      return createDefaultDocument();
    }
  }

  private serialize(document: EasyRequestDocument): string {
    return `${JSON.stringify(document, null, 2)}\n`;
  }

  private isEasyRequest(document: vscode.TextDocument): boolean {
    return document.uri.fsPath.toLowerCase().endsWith(".erequest");
  }

  private webviewHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview", "dist", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "webview", "dist", "styles.css"));
    const csp = `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; worker-src blob:; img-src ${webview.cspSource} data:;`;
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
