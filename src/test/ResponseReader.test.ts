import * as assert from "node:assert/strict";
import test from "node:test";
import { readResponseBody } from "../services/ResponseReader";

test("reads a response within the configured limit", async () => {
  const result = await readResponseBody(new Response("hello"), 10);

  assert.deepEqual(result, { text: "hello", truncated: false });
});

test("truncates and cancels bodies larger than the configured limit", async () => {
  const result = await readResponseBody(new Response("hello world"), 5);

  assert.deepEqual(result, { text: "hello", truncated: true });
});
