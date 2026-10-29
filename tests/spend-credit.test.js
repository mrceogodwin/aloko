import test from "node:test";
import assert from "node:assert/strict";
import { spendListingCredit } from "../api/_lib/spend-credit.js";

const sellerId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";

test("spendListingCredit succeeds when balance is available", async () => {
  const result = await spendListingCredit(
    {
      async query() {
        return { rows: [{ balance: 2, ledger_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", has_account: true, prior_balance: 3 }] };
      },
    },
    { sellerId, listingId, actorId }
  );
  assert.equal(result.ok, true);
  assert.equal(result.balance, 2);
});

test("spendListingCredit returns 402 when no credits", async () => {
  const result = await spendListingCredit(
    {
      async query() {
        return { rows: [{ balance: null, ledger_id: null, has_account: true, prior_balance: 0 }] };
      },
    },
    { sellerId, listingId, actorId }
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 402);
});
