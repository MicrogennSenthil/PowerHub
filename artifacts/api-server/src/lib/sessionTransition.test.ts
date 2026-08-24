import assert from "node:assert/strict";
import test from "node:test";
import { shouldReplaceOpenSession } from "./sessionTransition.ts";

test("Walk-in replaces a timed Visiting session", () => {
  assert.equal(shouldReplaceOpenSession(10, 20, true), true);
});

test("an HMS Checkin event without a Process Master still replaces Visiting", () => {
  assert.equal(shouldReplaceOpenSession(10, null, true), true);
});

test("repeated Checkin does not restart its usage session", () => {
  assert.equal(shouldReplaceOpenSession(20, 20, true), false);
});

test("a manual ON does not clear the current process", () => {
  assert.equal(shouldReplaceOpenSession(20, null, false), false);
});