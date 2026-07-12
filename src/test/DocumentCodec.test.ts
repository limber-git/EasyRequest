import * as assert from "node:assert/strict";
import test from "node:test";
import { createDefaultDocument } from "../defaultDocument";
import { DocumentCodec, DocumentFormatError } from "../services/DocumentCodec";

test("round-trips a valid collection", () => {
  const codec = new DocumentCodec();
  const document = createDefaultDocument();

  assert.deepEqual(codec.parse(codec.serialize(document)), document);
});

test("rejects invalid JSON instead of replacing it with defaults", () => {
  const codec = new DocumentCodec();

  assert.throws(() => codec.parse("{invalid"), DocumentFormatError);
});

test("rejects malformed nested request data", () => {
  const codec = new DocumentCodec();
  const document = createDefaultDocument() as unknown as { requests: Array<{ method: string }> };
  document.requests[0].method = "TRACE";

  assert.throws(() => codec.fromUnknown(document), /method contiene un valor no permitido/);
});

test("keeps only secret names backed by an environment variable", () => {
  const codec = new DocumentCodec();
  const document = createDefaultDocument();
  document.environments[0].secretVariableNames = ["apiUrl", "missing", "apiUrl"];

  const normalized = codec.fromUnknown(document);
  assert.deepEqual(normalized.environments[0].secretVariableNames, ["apiUrl"]);
});

test("rejects duplicate request identifiers", () => {
  const codec = new DocumentCodec();
  const document = createDefaultDocument();
  document.requests.push({ ...document.requests[0] });

  assert.throws(() => codec.fromUnknown(document), /identificadores duplicados/);
});
