// Generates images with the xAI (Grok) image API and saves them as optimized
// files for the app. The key is read from .env.local (XAI_API_KEY), never from
// the command line, so it does not end up in shell history or in the repo.
//
//   node scripts/xai-image.mjs --out public/noir/art/dealer-horacio.webp \
//     --size 320x400 --prompt "..." [--n 3] [--model grok-imagine-image-quality]
//
// With --n > 1 it writes name-1.webp, name-2.webp... to pick from.
// --pixel 64x80 [--colors 24] turns the result into real pixel art: shrink to
// that grid, snap to a small palette with dithering, then scale back up to
// --size with hard nearest-neighbour edges (saved as PNG, which stays tiny).
// `node scripts/xai-image.mjs --models` lists the image models on the account.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return "";
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.startsWith(name + "="));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const KEY = env("XAI_API_KEY");
const api = (p, body) =>
  fetch("https://api.x.ai/v1" + p, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j; });

async function listModels() {
  const j = await api("/image-generation-models").catch(() => api("/models"));
  console.log((j.models || j.data || []).map((m) => m.id).join("\n"));
}

async function generate() {
  const prompt = arg("prompt"), out = arg("out"), n = Number(arg("n", "1"));
  const model = arg("model", env("XAI_IMAGE_MODEL") || "grok-imagine-image-quality");
  const [w, h] = arg("size", "512x512").split("x").map(Number);
  if (!prompt || !out) throw new Error("Uso: --out <archivo.webp|png> --prompt <texto> [--size 320x400] [--n 1]");
  const res = await api("/images/generations", { model, prompt, n, response_format: "b64_json" });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ext = path.extname(out).toLowerCase(), base = out.slice(0, out.length - ext.length);
  for (const [i, item] of (res.data || []).entries()) {
    const src = item.b64_json ? Buffer.from(item.b64_json, "base64") : Buffer.from(await (await fetch(item.url)).arrayBuffer());
    const file = n > 1 ? `${base}-${i + 1}${ext}` : out;
    const pixel = arg("pixel");
    if (pixel) {
      const [pw, ph] = pixel.split("x").map(Number), colors = Number(arg("colors", "24"));
      const small = await sharp(src).resize(pw, ph, { fit: "cover", position: "attention", kernel: "lanczos3" }).png({ palette: true, colors, dither: 0.6 }).toBuffer();
      await sharp(small).resize(w, h, { kernel: "nearest" }).png({ palette: true, colors, dither: 0, compressionLevel: 9 }).toFile(file.replace(/\.webp$/, ".png"));
      console.log(file.replace(/\.webp$/, ".png"), fs.statSync(file.replace(/\.webp$/, ".png")).size, "bytes");
      continue;
    }
    let img = sharp(src).resize(w, h, { fit: "cover", position: "attention" });
    img = ext === ".png" ? img.png({ compressionLevel: 9 }) : img.webp({ quality: 82 });
    await img.toFile(file);
    console.log(file, fs.statSync(file).size, "bytes");
  }
}

if (!KEY) {
  console.error("Falta XAI_API_KEY en .env.local");
  process.exitCode = 1;
} else {
  await (args.includes("--models") ? listModels() : generate()).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
