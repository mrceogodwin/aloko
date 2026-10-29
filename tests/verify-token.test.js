import test from "node:test";
import assert from "node:assert/strict";
import {
  extractBearerToken,
  verifyAccessToken,
  verifyRequestToken,
} from "../api/_lib/verify-token.js";

test("extractBearerToken accepts only well-formed Bearer headers", () => {
  assert.equal(extractBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(extractBearerToken("bearer token-value"), "token-value");
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken(""), null);
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(undefined), null);
});

test("verifyAccessToken fails closed when token is missing", async () => {
  assert.equal(await verifyAccessToken(null), null);
  assert.equal(await verifyAccessToken(""), null);
  assert.equal(await verifyAccessToken("   "), null);
});

test("verifyAccessToken fails closed when no JWKS / base URL is configured", async () => {
  // Ensure the default path (no verifyFn, no env) returns null.
  const result = await verifyAccessToken("some.jwt.token", {
    baseUrl: "",
    jwksUrl: "",
  });
  assert.equal(result, null);
});

test("verifyAccessToken accepts an injected successful verification with UUID sub", async () => {
  const sub = "11111111-1111-4111-8111-111111111111";
  const result = await verifyAccessToken("fake-token", {
    verifyFn: async () => ({ sub, payload: { email: "seller@example.com" } }),
  });
  assert.deepEqual(result, {
    sub,
    payload: { email: "seller@example.com" },
  });
});

test("verifyAccessToken rejects non-UUID sub claims", async () => {
  const result = await verifyAccessToken("fake-token", {
    verifyFn: async () => ({ sub: "not-a-uuid", payload: {} }),
  });
  assert.equal(result, null);
});

test("verifyAccessToken returns null when the injected verifier throws", async () => {
  const result = await verifyAccessToken("fake-token", {
    verifyFn: async () => {
      throw new Error("jwks unreachable");
    },
  });
  assert.equal(result, null);
});

test("verifyRequestToken reads Authorization header and stays fail-closed", async () => {
  const unauth = await verifyRequestToken({ headers: {} });
  assert.equal(unauth, null);

  const badScheme = await verifyRequestToken({
    headers: { authorization: "Basic xyz" },
  });
  assert.equal(badScheme, null);

  const sub = "22222222-2222-4222-8222-222222222222";
  const ok = await verifyRequestToken(
    { headers: { authorization: "Bearer good.token.here" } },
    {
      verifyFn: async () => ({ sub, payload: {} }),
    },
  );
  assert.equal(ok.sub, sub);
});
