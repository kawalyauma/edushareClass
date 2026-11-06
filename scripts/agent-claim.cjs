#!/usr/bin/env node
"use strict";

/**
 * Autonomous, dependency-aware GitHub issue leasing for EduShareClass.
 * Node.js 20+. No external dependencies or stored credentials.
 * Claims are persisted on refs/heads/coordination/claims, never on main.
 *
 * Concurrency safety: every candidate claim is a child of the current
 * coordinator HEAD; updating the ref with force:false accepts only a
 * fast-forward. Competing children of the same HEAD cannot both win.
 */
const DEFAULT_REPO = "kawalyauma/edushareClass";
const COORD_BRANCH = "coordination/claims";
const STATE_PATH = "coordination/claims.json";
const LEASE_MS = 30 * 60 * 1000;
const MAX_RETRIES = 8;
const PRIORITY = [9, 1, 2, 3, 8, 4, 5, 6, 7, 10];
const DEPENDENCIES = Object.freeze({
  1: [], 2: [1, 9], 3: [1, 9], 4: [2, 3, 9],
  5: [2, 3, 9], 6: [2, 3, 9], 7: [3, 9],
  8: [2, 9], 9: [], 10: [1, 2, 3, 4, 5, 6, 7, 8, 9]
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function clean(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
}

function getTaskNumber(issue) {
  if (!issue || issue.pull_request) return null;
  const found = /^\[P01-(\d{2})\]/.exec(issue.title || "");
  return found ? Number(found[1]) : null;
}

function canonicalIssues(issues) {
  const map = new Map();
  for (const issue of issues) {
    const task = getTaskNumber(issue);
    if (task === null || !(task in DEPENDENCIES)) continue;
    const prior = map.get(task);
    // Duplicate task titles may exist: the oldest issue is canonical.
    if (!prior || issue.number < prior.number) map.set(task, issue);
  }
  return map;
}

function readyIssues(issues, claims, openPRs) {
  const canonical = canonicalIssues(issues);
  const busy = new Set();
  for (const pr of openPRs) {
    const body = String(pr.body || "");
    for (const issue of canonical.values()) {
      if (new RegExp("(?:closes|fixes|resolves)\\s+#" + issue.number + "\\b", "i").test(body)) busy.add(issue.number);
    }
  }
  return PRIORITY.map(task => canonical.get(task)).filter(issue => {
    if (!issue || issue.state !== "open" || busy.has(issue.number)) return false;
    if (claims[String(issue.number)]?.status === "claimed") return false;
    const task = getTaskNumber(issue);
    return DEPENDENCIES[task].every(dep => {
      const upstream = canonical.get(dep);
      // A closed duplicate (not_planned) must never satisfy dependencies.
      return upstream && upstream.state === "closed" && upstream.state_reason === "completed";
    });
  });
}

function leaseFor(agent, issue, provider, now = new Date()) {
  const agentSlug = clean(agent);
  if (!agentSlug) throw new Error("--agent must contain letters or digits");
  const task = getTaskNumber(issue);
  if (task === null) throw new Error("Only P01 issues are authorized");
  return {
    issue_number: issue.number,
    agent_id: agent,
    provider: provider || "unknown",
    claimed_at: now.toISOString(),
    heartbeat_at: now.toISOString(),
    expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
    branch: "agent/" + agentSlug + "/p01-" + String(task).padStart(2, "0"),
    status: "claimed"
  };
}

function parseArgs(argv) {
  const command = argv[0] || "help";
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || !argv[index + 1]) throw new Error("Expected --name value");
    options[argv[index].slice(2)] = argv[index + 1];
  }
  return { command, options };
}

function createApi(token) {
  if (!token) throw new Error("Set GITHUB_TOKEN to a credential with Contents read/write and Issues read access");
  const request = async (method, path, data) => {
    const response = await fetch("https://api.github.com" + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "edushareclass-agent-claim",
        ...(data === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(20000)
    });
    const body = await response.text();
    let parsed;
    try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
    if (!response.ok) throw new HttpError(response.status, "GitHub " + method + " " + path + ": " + response.status + " " + (parsed.message || ""));
    return parsed;
  };
  return {
    get: (path) => request("GET", path),
    post: (path, data) => request("POST", path, data),
    patch: (path, data) => request("PATCH", path, data)
  };
}

async function ensureBranch(api, repo) {
  const base = "/repos/" + repo;
  const coord = base + "/git/ref/heads/" + COORD_BRANCH;
  try {
    return await api.get(coord);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const main = await api.get(base + "/git/ref/heads/main");
  try {
    await api.post(base + "/git/refs", {
      ref: "refs/heads/" + COORD_BRANCH,
      sha: main.object.sha
    });
  } catch (error) {
    if (error.status !== 422 && error.status !== 409) throw error;
    // Another runner already created the coordinator branch.
  }
  return api.get(coord);
}

async function readState(api, repo) {
  const base = "/repos/" + repo;
  const ref = await ensureBranch(api, repo);
  const head = ref.object.sha;
  const commit = await api.get(base + "/git/commits/" + head);
  let state = { version: 1, claims: {} };
  try {
    const file = await api.get(base + "/contents/" + STATE_PATH + "?ref=" + encodeURIComponent(COORD_BRANCH));
    const content = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
    state = JSON.parse(content);
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (state.version !== 1 || !state.claims || Array.isArray(state.claims) || typeof state.claims !== "object") {
    throw new Error("Unsupported coordinator state format; refusing to overwrite it");
  }
  return { head, treeSha: commit.tree.sha, state };
}

async function saveState(api, repo, snapshot) {
  const base = "/repos/" + repo;
  const tree = await api.post(base + "/git/trees", {
    base_tree: snapshot.treeSha,
    tree: [{
      path: STATE_PATH, mode: "100644", type: "blob",
      content: JSON.stringify(snapshot.state, null, 2) + "\n"
    }]
  });
  const commit = await api.post(base + "/git/commits", {
    message: "coordination: update exclusive agent leases",
    tree: tree.sha,
    parents: [snapshot.head]
  });
  // Non-force update acts as a compare-and-swap on an append-only branch.
  await api.patch(base + "/git/refs/heads/" + COORD_BRANCH, {
    sha: commit.sha, force: false
  });
}

async function listAll(api, repo, kind, query = "") {
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const items = await api.get("/repos/" + repo + "/" + kind + "?per_page=100&page=" + page + query);
    if (!Array.isArray(items)) throw new Error("Unexpected GitHub " + kind + " response");
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

async function applyWithRetries(api, repo, transform) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const snapshot = await readState(api, repo);
    const result = await transform(snapshot.state);
    if (!result.changed) return result.output;
    try {
      await saveState(api, repo, snapshot);
      return result.output;
    } catch (error) {
      if (error.status !== 409 && error.status !== 422) throw error;
      // A competing commit won. Re-read state and retry the decision.
    }
  }
  throw new Error("Claim coordinator was contended; retry the command");
}

async function nextClaim(api, repo, agent, provider) {
  if (!agent || !clean(agent)) throw new Error("Supply --agent <unique-worker-id>");
  const issues = await listAll(api, repo, "issues", "&state=all");
  const prs = await listAll(api, repo, "pulls", "&state=open");
  const claimed = await applyWithRetries(api, repo, state => {
    if (Object.values(state.claims).some(c => c.status === "claimed" && c.agent_id === agent)) {
      throw new Error("Agent already has an active claim; heartbeat or release it first");
    }
    const ready = readyIssues(issues, state.claims, prs);
    if (!ready.length) return { changed: false, output: null };
    const issue = ready[0];
    const lease = leaseFor(agent, issue, provider);
    state.claims[String(issue.number)] = lease;
    return { changed: true, output: { ...lease, title: issue.title, url: issue.html_url } };
  });
  return claimed;
}

async function changeOwnLease(api, repo, agent, mode) {
  if (!agent) throw new Error("Supply --agent <unique-worker-id>");
  return applyWithRetries(api, repo, state => {
    const entry = Object.entries(state.claims).find(([, c]) => c.agent_id === agent && c.status === "claimed");
    if (!entry) throw new Error("No active claim found for this agent");
    const [key, existing] = entry;
    if (mode === "heartbeat") {
      existing.heartbeat_at = new Date().toISOString();
      existing.expires_at = new Date(Date.now() + LEASE_MS).toISOString();
    } else {
      // Releasing an issue after abandoned work makes it eligible again.
      delete state.claims[key];
    }
    return { changed: true, output: mode === "heartbeat" ? existing : { released_issue_number: Number(key) } };
  });
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const { command, options } = parseArgs(argv);
  if (command === "help" || !["next", "heartbeat", "release", "status"].includes(command)) {
    console.log("Usage: GITHUB_TOKEN=... node scripts/agent-claim.cjs next --agent <id> --provider <name> [--repo owner/name]");
    console.log("       node scripts/agent-claim.cjs heartbeat|release --agent <id> [--repo owner/name]");
    console.log("       node scripts/agent-claim.cjs status [--repo owner/name]");
    return;
  }
  const repo = options.repo || env.GITHUB_REPOSITORY || DEFAULT_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid owner/repository");
  const api = createApi(env.GITHUB_TOKEN);
  let result;
  if (command === "next") result = await nextClaim(api, repo, options.agent, options.provider);
  else if (command === "status") result = (await readState(api, repo)).state;
  else result = await changeOwnLease(api, repo, options.agent, command);
  console.log(JSON.stringify(result === null ? { status: "no-eligible-issues" } : result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  getTaskNumber, canonicalIssues, readyIssues, leaseFor, parseArgs,
  createApi, ensureBranch, readState, saveState, nextClaim,
  changeOwnLease, applyWithRetries, HttpError, DEPENDENCIES
};
