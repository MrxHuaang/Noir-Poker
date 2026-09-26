// Local development against the Firebase Emulator Suite (Auth + Firestore):
// starts the emulators with this repo's firestore.rules, then `next dev` wired
// to them (browser SDK via NEXT_PUBLIC_FIREBASE_EMULATORS, Admin SDK in the API
// routes via FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST). Nothing
// touches the production project, and test accounts can be created freely.
//
//   npm run dev:emu            (Next on :3000)
//   npm run dev:emu -- --port 3100
//
// Needs Java 11+ and firebase-tools (npm i -g firebase-tools).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

function readEnvLocal() {
  const env = {};
  if (!existsSync(".env.local")) return env;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const local = readEnvLocal();
const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  local.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "demo-poker-sim";
const portFlag = process.argv.indexOf("--port");
const port = (portFlag > 0 && process.argv[portFlag + 1]) || process.env.PORT || "3000";
const isWin = process.platform === "win32";

function waitForPort(p, timeoutMs = 300_000) {
  const until = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(p, "127.0.0.1");
      sock.once("connect", () => {
        sock.end();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() > until) reject(new Error(`port ${p} did not open`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

const children = [];
function run(cmd, args, env) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on("exit", (code) => {
    for (const c of children) if (c !== child) c.kill();
    process.exit(code ?? 0);
  });
  return child;
}

run("firebase", ["emulators:start", "--only", "auth,firestore", "--project", projectId], {});
await Promise.all([waitForPort(8080), waitForPort(9099)]);
run("npx", ["next", "dev", "-p", port], {
  NEXT_PUBLIC_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  FIREBASE_ADMIN_PROJECT_ID: projectId,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const c of children) c.kill();
    process.exit(0);
  });
}
