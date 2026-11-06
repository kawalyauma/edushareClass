"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalIssues, readyIssues, leaseFor, parseArgs, saveState, HttpError
} = require("../scripts/agent-claim.cjs");

function issue(number, task, state = "open", reason = null) {
  return { number, title: "[P01-" + String(task).padStart(2, "0") + "] sample",
    state, state_reason: reason, html_url: "https://github.com/example/repo/issues/" + number };
}

test("agents discover the issue automatically and bootstrap with coordinator first", () => {
  const ready = readyIssues([issue(1, 1), issue(9, 9), issue(2, 2)], {}, []);
  assert.deepEqual(ready.map(item => item.number), [9, 1]);
});

test("duplicate issue titles never supersede the oldest canonical issue", () => {
  const map = canonicalIssues([issue(108, 4), issue(4, 4), issue(105, 1, "closed", "duplicate"), issue(1, 1)]);
  assert.equal(map.get(4).number, 4);
  assert.equal(map.get(1).number, 1);
});

test("closed duplicate is not enough to satisfy a dependency", () => {
  const ready = readyIssues([issue(1, 1, "closed", "duplicate"), issue(9, 9, "closed", "completed"), issue(2, 2)], {}, []);
  assert.deepEqual(ready, []);
});

test("completed prerequisites unlock the next module", () => {
  const ready = readyIssues([issue(1, 1, "closed", "completed"), issue(9, 9, "closed", "completed"), issue(2, 2), issue(3, 3)], {}, []);
  assert.deepEqual(ready.map(item => item.number), [2, 3]);
});

test("claimed issues and issues covered by open PRs are not eligible", () => {
  const items = [issue(1, 1), issue(9, 9)];
  const active = readyIssues(items, { "9": { status: "claimed" } }, [{ body: "Closes #1" }]);
  assert.deepEqual(active, []);
});

test("leases carry a unique worker identity, 30-minute TTL and deterministic branch", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const lease = leaseFor("codex-worker-A", issue(9, 9), "codex", now);
  assert.equal(lease.issue_number, 9);
  assert.equal(lease.branch, "agent/codex-worker-a/p01-09");
  assert.equal(lease.expires_at, "2026-11-06T12:30:00.000Z");
  assert.equal(lease.status, "claimed");
});

test("no manual issue-number argument is needed", () => {
  assert.deepEqual(parseArgs(["next", "--agent", "antigravity-01", "--provider", "antigravity"]), {
    command: "next", options: { agent: "antigravity-01", provider: "antigravity" }
  });
});

test("coordinator commits reject sibling writes instead of silently overwriting", async () => {
  const commits = new Map([["base", null]]);
  let head = "base";
  let serial = 0;
  const api = {
    post: async (path, data) => {
      if (path.endsWith("/git/trees")) return { sha: "tree-" + (++serial) };
      if (path.endsWith("/git/commits")) {
        const sha = "commit-" + (++serial);
        commits.set(sha, data.parents[0]);
        return { sha };
      }
      throw Error("unexpected call " + path);
    },
    patch: async (_path, data) => {
      let ancestor = data.sha;
      while (ancestor && ancestor !== head) ancestor = commits.get(ancestor);
      if (ancestor !== head) throw new HttpError(422, "non-fast-forward rejected");
      head = data.sha;
      return { object: { sha: head } };
    }
  };
  const stale = { head: "base", treeSha: "tree-base", state: { version: 1, claims: { "9": { agent_id: "a" } } } };
  await saveState(api, "owner/repo", stale);
  assert.notEqual(head, "base");
  await assert.rejects(() => saveState(api, "owner/repo", stale), { status: 422 });
});
