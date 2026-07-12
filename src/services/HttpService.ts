import * as vscode from "vscode";
import { BatchResult, HttpResult } from "../types";
import { ResolvedRequest } from "./EnvResolver";
import { readResponseBody } from "./ResponseReader";

const ABSOLUTE_MAX_BATCH = 500;
const ABSOLUTE_MAX_CONCURRENCY = 20;
const ABSOLUTE_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class HttpService {
  public async executeBatch(
    request: ResolvedRequest,
    total: number,
    concurrency: number,
    signal?: AbortSignal
  ): Promise<BatchResult> {
    const configuredMaximum = vscode.workspace.getConfiguration("easyrequest").get<number>("maxBatchRequests", 100);
    const maximum = this.toBoundedInteger(configuredMaximum, 1, ABSOLUTE_MAX_BATCH);
    const safeTotal = this.toBoundedInteger(total, 1, maximum);
    const safeConcurrency = this.toBoundedInteger(concurrency, 1, Math.min(safeTotal, ABSOLUTE_MAX_CONCURRENCY));
    const started = performance.now();
    const results = new Array<HttpResult>(safeTotal);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < safeTotal && !signal?.aborted) {
        const index = nextIndex++;
        results[index] = await this.executeOnce(request, index, signal);
      }
    };
    await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));

    return { results: results.filter(Boolean), totalDurationMs: Math.round(performance.now() - started) };
  }

  private async executeOnce(request: ResolvedRequest, index: number, parentSignal?: AbortSignal): Promise<HttpResult> {
    const started = performance.now();
    const configuredTimeout = vscode.workspace.getConfiguration("easyrequest").get<number>("requestTimeoutMs", 30000);
    const timeout = this.toBoundedInteger(configuredTimeout, 1000, 300000);
    const configuredMaxKb = vscode.workspace.getConfiguration("easyrequest").get<number>("maxResponseSizeKb", 1024);
    const maxResponseBytes = this.toBoundedInteger(configuredMaxKb, 64, 10240) * 1024;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);
    const abortFromParent = () => controller.abort();
    if (parentSignal?.aborted) {
      controller.abort();
    } else {
      parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    }

    try {
      const url = this.withQueryParameters(request.url, request.params);
      this.assertHttpUrl(url);
      const headers = this.validatedHeaders(request.headers);
      const canHaveBody = !["GET", "HEAD"].includes(request.method);
      if (canHaveBody && request.body && request.bodyType === "json" && !this.hasHeader(headers, "content-type")) {
        headers["content-type"] = "application/json";
      }

      const response = await fetch(url, {
        method: request.method,
        headers,
        body: canHaveBody && request.bodyType !== "none" && request.body ? request.body : undefined,
        signal: controller.signal
      });
      const body = await readResponseBody(response, Math.min(maxResponseBytes, ABSOLUTE_MAX_RESPONSE_BYTES));
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        Object.defineProperty(responseHeaders, key, { value, enumerable: true, configurable: true, writable: true });
      });

      return {
        index,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: Math.round(performance.now() - started),
        headers: responseHeaders,
        body: body.text,
        truncated: body.truncated || undefined
      };
    } catch (error) {
      const timedOut = controller.signal.aborted && !parentSignal?.aborted;
      const cancelled = Boolean(parentSignal?.aborted);
      return {
        index,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        headers: {},
        body: "",
        error: cancelled
          ? "La petición fue cancelada."
          : timedOut
            ? `La petición superó el límite de ${timeout} ms.`
            : this.errorMessage(error)
      };
    } finally {
      clearTimeout(timeoutHandle);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  }

  private withQueryParameters(rawUrl: string, params: Record<string, string>): string {
    const entries = Object.entries(params);
    if (!entries.length) {
      return rawUrl;
    }

    try {
      const url = new URL(rawUrl);
      entries.forEach(([key, value]) => url.searchParams.set(key, value));
      return url.toString();
    } catch {
      const query = new URLSearchParams(params).toString();
      return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}${query}`;
    }
  }

  private hasHeader(headers: Record<string, string>, expected: string): boolean {
    return Object.keys(headers).some((key) => key.toLowerCase() === expected);
  }

  private assertHttpUrl(rawUrl: string): void {
    if (/{{[^}]+}}/.test(rawUrl)) {
      throw new Error("La URL todavía contiene variables sin resolver.");
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error("La URL debe ser absoluta y válida.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Sólo se permiten URLs HTTP o HTTPS.");
    }
  }

  private validatedHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)) {
        throw new Error(`El header '${key}' no tiene un nombre válido.`);
      }
      if (/[\r\n]/.test(value)) {
        throw new Error(`El header '${key}' contiene saltos de línea no permitidos.`);
      }
      Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
    }
    return result;
  }

  private toBoundedInteger(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "La petición no pudo completarse.";
  }
}
