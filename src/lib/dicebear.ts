import { createAvatar } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";

const cache = new Map<string, string>();

export function avatarSvg(seed: string): string {
  const cached = cache.get(seed);
  if (cached) return cached;
  const svg = createAvatar(lorelei, {
    seed,
    backgroundColor: ["f4f4f5", "e4e4e7", "d4d4d8"],
    radius: 50,
  }).toString();
  cache.set(seed, svg);
  return svg;
}

export function randomSeed(): string {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return buf[0].toString(36) + buf[1].toString(36);
}
