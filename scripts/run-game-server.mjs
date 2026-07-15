// Compila y ejecuta el servidor Go del modo online en localhost:8080.
// Uso: npm run server   (requiere Go instalado; ver .env.local NEXT_PUBLIC_GAME_WS_URL)
// ALLOW_DEV_OPEN_WS=true desactiva la verificacion de tokens Firebase — SOLO dev local.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");
const bin = process.platform === "win32" ? "server-local.exe" : "server-local";

const build = spawn("go", ["build", "-o", bin, "./cmd/server"], {
  cwd: serverDir,
  stdio: "inherit",
  shell: true,
});

build.on("exit", (code) => {
  if (code) process.exit(code);
  const run = spawn(join(serverDir, bin), [], {
    cwd: serverDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ALLOW_DEV_OPEN_WS: process.env.ALLOW_DEV_OPEN_WS ?? "true",
      PORT: process.env.PORT ?? "8080",
    },
  });
  run.on("exit", (c) => process.exit(c ?? 0));
});
