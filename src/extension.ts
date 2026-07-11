import * as vscode from "vscode";
import { EasyRequestEditorProvider } from "./editors/EasyRequestEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new EasyRequestEditorProvider(context.extensionUri);
  context.subscriptions.push(
    provider,
    vscode.window.registerCustomEditorProvider(EasyRequestEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false
    }),
    vscode.commands.registerCommand("easyrequest.newCollection", () => provider.createCollection())
  );
}

export function deactivate(): void {
  // VS Code disposes registered providers through the extension context.
}
