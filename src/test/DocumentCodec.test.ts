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
  const document = createDefaultDocument();
  const node = document.root.children[0];
  if (node.type !== "request") {
    throw new Error("Expected a request node");
  }
  node.request.method = "TRACE" as never;

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
  document.root.children.push({ ...document.root.children[0] });

  assert.throws(() => codec.fromUnknown(document), /identificadores duplicados/);
});

test("migrates a version 1 collection into a rooted tree", () => {
  const codec = new DocumentCodec();
  const migrated = codec.fromUnknown({
    version: 1,
    selectedEnvironmentId: "default",
    environments: [{ id: "default", name: "Default", variables: { apiUrl: "https://example.test" } }],
    requests: [{ id: "legacy", name: "Legacy", method: "GET", url: "{{apiUrl}}/health", headers: [], params: [], body: "", bodyType: "none" }],
    endpoints: []
  });

  assert.equal(migrated.version, 2);
  assert.equal(migrated.root.baseUrl, "{{apiUrl}}");
  assert.equal(migrated.root.children[0].type, "folder");
});
