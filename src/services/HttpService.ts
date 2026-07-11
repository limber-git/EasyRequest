import pLimit from "p-limit";
import * as vscode from "vscode";
import { BatchResult, HttpResult } from "../types";
import { ResolvedRequest } from "./EnvResolver";

export class HttpService {
  public async executeBatch(request: ResolvedRequest, total: number, concurrency: number): Promise<BatchResult> {
    const maximum = vscode.workspace.getConfiguration("easyrequest").get<number>("maxBatchRequests", 100);
    const safeTotal = this.toBoundedInteger(total, 1, maximum);
    const safeConcurrency = this.toBoundedInteger(concurrency, 1, safeTotal);
    const started = performance.now();
    const limit = pLimit(safeConcurrency);
    const results = await Promise.all(
      Array.from({ length: safeTotal }, (_, index) => limit(() => this.executeOnce(request, index)))
    );

    return { results, totalDurationMs: Math.round(performance.now() - started) };
  }

  private async executeOnce(request: ResolvedRequest, index: number): Promise<HttpResult> {
    const started = performance.now();
    const timeout = vscode.workspace.getConfiguration("easyrequest").get<number>("requestTimeoutMs", 30000);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    try {
      const url = this.withQueryParameters(request.url, request.params);
      const headers = { ...request.headers };
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
      const body = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        index,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs: Math.round(performance.now() - started),
        headers: responseHeaders,
        body
      };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      return {
        index,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        headers: {},
        body: "",
        error: timedOut ? `La petición superó el límite de ${timeout} ms.` : this.errorMessage(error)
      };
    } finally {
      clearTimeout(timeoutHandle);
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

  private toBoundedInteger(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.floor(Number.isFinite(value) ? value : min)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "La petición no pudo completarse.";
  }
}
