import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "./common/filters/api-error.js";
import { toErrorResponse } from "./common/filters/http-error.filter.js";
import { allowedOrigins, isAllowedOrigin, jsonDepthExceeds, MAX_JSON_DEPTH } from "./configure-app.js";

describe("CORS origins", () => {
  test("production: the live site with and without www, nothing else", () => {
    const allowed = allowedOrigins("https://npsindore.org/", undefined);
    for (const origin of ["https://npsindore.org", "https://www.npsindore.org", "https://NPSINDORE.org"])
      assert.equal(isAllowedOrigin(origin, allowed, "production"), true, origin);
    for (const origin of [
      "https://test.npsindore.org",
      "https://anything.npsindore.org",
      "http://app.npsindore.org",
      "https://www.app.npsindore.org",
      "https://a.b.npsindore.org",
      "http://localhost:5173",
      "http://npsindore.org",
    ])
      assert.equal(isAllowedOrigin(origin, allowed, "production"), false, origin);
  });
  test("the mobile app's origin, on every environment", () => {
    for (const [frontend, env] of [
      ["https://npsindore.org/", "production"],
      ["https://test.npsindore.org", "test"],
      ["http://localhost:5173", "development"],
    ])
      assert.equal(isAllowedOrigin("https://app.npsindore.org", allowedOrigins(frontend, undefined), env), true, env);
  });
  test("test server: only its own frontend (and the app), no localhost", () => {
    const allowed = allowedOrigins("https://test.npsindore.org", undefined);
    assert.equal(isAllowedOrigin("https://test.npsindore.org", allowed, "test"), true);
    assert.equal(isAllowedOrigin("https://npsindore.org", allowed, "test"), false);
    assert.equal(isAllowedOrigin("http://localhost:5173", allowed, "test"), false);
  });
  test("extra origins from CORS_ORIGINS; localhost on developer machines", () => {
    const allowed = allowedOrigins("http://localhost:5173", " https://admin.npsindore.org , not a url");
    assert.equal(isAllowedOrigin("https://admin.npsindore.org", allowed, "development"), true);
    assert.equal(isAllowedOrigin("http://localhost:9999", allowed, "development"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:5173", allowed, "development"), true);
    assert.equal(isAllowedOrigin("http://localhost.evil.example", allowed, "development"), false);
  });
});

describe("JSON depth limit", () => {
  const nested = (levels: number): unknown => {
    let value: unknown = 1;
    for (let i = 0; i < levels; i++) value = { a: value };
    return value;
  };
  test("normal bodies pass; thousands of levels are refused without recursion", () => {
    assert.equal(jsonDepthExceeds({ a: [{ b: { c: 1 } }], d: null }), false);
    assert.equal(jsonDepthExceeds(nested(MAX_JSON_DEPTH)), false);
    assert.equal(jsonDepthExceeds(nested(MAX_JSON_DEPTH + 1)), true);
    assert.equal(jsonDepthExceeds(nested(100_000)), true);
    assert.equal(jsonDepthExceeds("text"), false);
  });
});

describe("error responses", () => {
  test("internal errors never expose their message", () => {
    assert.deepEqual(toErrorResponse(new RangeError("Maximum call stack size exceeded")), { status: 500, body: { error: "Internal Server Error" } });
    assert.deepEqual(toErrorResponse(new TypeError('The "password" argument must be of type string')), {
      status: 500,
      body: { error: "Internal Server Error" },
    });
  });
  test("body parser errors keep their 4xx status with a fixed text", () => {
    const parse = Object.assign(new SyntaxError("Unexpected end of JSON input"), { status: 400, type: "entity.parse.failed" });
    assert.deepEqual(toErrorResponse(parse), { status: 400, body: { error: "The request body is not valid JSON." } });
    const big = Object.assign(new Error("request entity too large"), { status: 413, type: "entity.too.large" });
    assert.deepEqual(toErrorResponse(big), { status: 413, body: { error: "The request body is too large." } });
  });
  test("our own errors keep their status and message", () => {
    assert.deepEqual(toErrorResponse(new ApiError(403, "Not allowed by CORS")), { status: 403, body: { error: "Not allowed by CORS" } });
  });
});
