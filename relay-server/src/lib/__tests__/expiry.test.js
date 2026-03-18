/**
 * Unit tests for the 72hr expiry rule.
 * Run: node --test src/lib/__tests__/expiry.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { computeExpiresAt } from "../expiry.js";

describe("computeExpiresAt (72hr rule)", () => {
  it("returns a date in the UTC day window 3 days later (floor sent to day + 72h + random 0..1440 min)", () => {
    const from = new Date("2025-03-14T12:00:00.000Z");
    const got = computeExpiresAt(from);
    const diff = got.getTime() - from.getTime();
    const seventyTwoHours = 72 * 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    assert.ok(diff >= seventyTwoHours - oneDay && diff <= seventyTwoHours + oneDay, "expiry in [72h-24h, 72h+24h]");
  });

  it("expiry is UTC midnight + random minutes 0..1440 (same calendar day as 72h after send day)", () => {
    const from = new Date("2025-03-14T00:00:00.000Z");
    const got = computeExpiresAt(from);
    const expectedDay = new Date(Date.UTC(2025, 2, 17, 0, 0, 0, 0)); // 14 + 3 days
    assert.ok([17, 18].includes(got.getUTCDate()), "expiry on 17th or 18th (1440 min = next day midnight)");
    assert.strictEqual(got.getUTCMonth(), expectedDay.getUTCMonth());
    assert.strictEqual(got.getUTCFullYear(), expectedDay.getUTCFullYear());
    assert.strictEqual(got.getUTCSeconds(), 0, "random is whole minutes so seconds are 0");
    assert.strictEqual(got.getUTCMilliseconds(), 0, "milliseconds are 0");
    const minutesOffset = got.getUTCHours() * 60 + got.getUTCMinutes();
    assert.ok(minutesOffset >= 0 && minutesOffset <= 1440, "random offset in [0, 1440] minutes");
  });

  it("multiple calls from same instant fall within same UTC day window", () => {
    const from = new Date("2025-03-10T15:30:00.000Z");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(computeExpiresAt(from));
    const day = results[0].getUTCDate();
    const month = results[0].getUTCMonth();
    const year = results[0].getUTCFullYear();
    for (const d of results) {
      assert.strictEqual(d.getUTCDate(), day);
      assert.strictEqual(d.getUTCMonth(), month);
      assert.strictEqual(d.getUTCFullYear(), year);
    }
  });
});
