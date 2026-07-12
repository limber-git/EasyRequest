import { createHash } from "crypto";
import * as vscode from "vscode";
import { EasyRequestDocument, Environment } from "../types";

export class CollectionSecrets {
  public constructor(private readonly secrets: vscode.SecretStorage) {}

  public async hydrate(uri: vscode.Uri, document: EasyRequestDocument): Promise<EasyRequestDocument> {
    const environments = await Promise.all(document.environments.map(async (environment) => {
      const variables = { ...environment.variables };
      for (const name of environment.secretVariableNames ?? []) {
        variables[name] = await this.secrets.get(this.key(uri, environment.id, name)) ?? "";
      }
      return { ...environment, variables };
    }));
    return { ...document, environments };
  }

  public async prepareForStorage(
    uri: vscode.Uri,
    document: EasyRequestDocument,
    previous?: EasyRequestDocument
  ): Promise<EasyRequestDocument> {
    const activeKeys = new Set<string>();
    const environments: Environment[] = [];
    for (const environment of document.environments) {
      const variables = { ...environment.variables };
      for (const name of environment.secretVariableNames ?? []) {
        const storageKey = this.key(uri, environment.id, name);
        activeKeys.add(storageKey);
        await this.secrets.store(storageKey, variables[name] ?? "");
        variables[name] = "";
      }
      environments.push({ ...environment, variables });
    }

    for (const environment of previous?.environments ?? []) {
      for (const name of environment.secretVariableNames ?? []) {
        const storageKey = this.key(uri, environment.id, name);
        if (!activeKeys.has(storageKey)) {
          await this.secrets.delete(storageKey);
        }
      }
    }
    return { ...document, environments };
  }

  private key(uri: vscode.Uri, environmentId: string, name: string): string {
    const collection = createHash("sha256").update(uri.toString(true)).digest("hex");
    const variable = createHash("sha256").update(`${environmentId}\0${name}`).digest("hex");
    return `easyrequest.${collection}.${variable}`;
  }
}
