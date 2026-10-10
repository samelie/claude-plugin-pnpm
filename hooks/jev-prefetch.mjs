#!/usr/bin/env node
// UserPromptSubmit hook — off by default (JEV_PROXY_ENABLED unset), see packages/jev-proxy/README.md.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

if (!process.env.JEV_PROXY_ENABLED) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const pkgDir = join(projectDir, "packages/jev-proxy");
const distCli = join(pkgDir, "dist/cli.js");

// the harness's own process never has TYPESAFE_API_KEY exported — read the gitignored
// .env directly rather than assume something upstream already sourced it.
const loadEnvFile = (path) => {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (match) env[match[1]] = match[2];
    }
  } catch {
    // no .env yet (key not hydrated) — child just runs without it, same as today.
  }
  return env;
};

let payload = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) payload += chunk;

const { cmd, args } = existsSync(distCli)
  ? { cmd: "node", args: [distCli] }
  : { cmd: "pnpm", args: ["-F", "@adddog/jev-proxy", "exec", "tsx", "src/cli.ts"] };

const result = spawnSync(cmd, [...args, "--repo-root", projectDir], {
  input: payload,
  cwd: pkgDir,
  encoding: "utf8",
  timeout: 4000,
  env: { ...process.env, ...loadEnvFile(join(pkgDir, ".env")) },
});

if (result.status !== 0 || !result.stdout) process.exit(0);

let parsed;
try {
  parsed = JSON.parse(result.stdout);
} catch {
  process.exit(0);
}

if (!parsed.context) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: parsed.context },
  }),
);
