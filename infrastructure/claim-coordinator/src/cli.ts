#!/usr/bin/env node
/* Usage: npm run claims -- <claim|heartbeat|release|complete|list> [issue] [--agent id] [--provider p] [--branch b] */
import { ClaimCoordinator } from './coordinator.js';
import { FileClaimStore, GitHubClaimStore } from './stores.js';
import type { ClaimStore } from './types.js';

const [cmd, issueArg, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function makeStore(): ClaimStore {
  const repo = process.env.CLAIMS_GITHUB_REPO; // "owner/repo"
  const token = process.env.GITHUB_TOKEN;
  if (repo && token) {
    const [owner, name] = repo.split('/');
    return new GitHubClaimStore({ owner: owner!, repo: name!, token });
  }
  return new FileClaimStore(process.env.CLAIMS_FILE ?? 'coordination/claims.json');
}

const coordinator = new ClaimCoordinator({ store: makeStore() });
const issue = Number(issueArg);
const agent = flag('agent') ?? process.env.AGENT_ID ?? '';

async function main() {
  if (cmd === 'list') return console.log(JSON.stringify(await coordinator.list(), null, 2));
  if (!Number.isInteger(issue) || !agent)
    throw new Error('issue number and --agent (or AGENT_ID) required');
  if (cmd === 'claim') {
    const r = await coordinator.claim({
      issueNumber: issue,
      agentId: agent,
      provider: flag('provider') ?? 'unknown',
      branch: flag('branch') ?? `agent/${agent}/issue-${issue}`,
    });
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.ok ? 0 : 1;
  } else if (cmd === 'heartbeat' || cmd === 'release' || cmd === 'complete') {
    const ok = await coordinator[cmd](issue, agent);
    console.log(JSON.stringify({ ok }));
    process.exitCode = ok ? 0 : 1;
  } else {
    throw new Error('unknown command');
  }
}
main().catch((e) => {
  console.error(String(e));
  process.exitCode = 2;
});
