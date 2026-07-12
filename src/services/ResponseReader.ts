export interface LimitedBody {
  text: string;
  truncated: boolean;
}

/** Reads at most maxBytes from a fetch response and cancels the remaining stream. */
export async function readResponseBody(response: Response, maxBytes: number): Promise<LimitedBody> {
  const boundedMaximum = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(response.headers.get("content-length"));
  const reader = response.body?.getReader();
  if (!reader) {
    return { text: "", truncated: false };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = Number.isFinite(declaredLength) && declaredLength > boundedMaximum;
  try {
    while (total < boundedMaximum) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const remaining = boundedMaximum - total;
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }

    if (total >= boundedMaximum && !truncated) {
      const next = await reader.read();
      truncated = !next.done;
    }
  } finally {
    if (truncated) {
      await reader.cancel().catch(() => undefined);
    }
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(body), truncated };
}
