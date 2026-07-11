export interface VsCodeApi<T = unknown> {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState(state: T): void;
}

declare global {
  function acquireVsCodeApi<T = unknown>(): VsCodeApi<T>;
}

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    api = acquireVsCodeApi();
  }
  return api;
}
