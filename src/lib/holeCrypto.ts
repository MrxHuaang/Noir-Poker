"use client";
import type { Card } from "@/lib/poker";

// Owner-only encryption of hole cards (RSA-OAEP, Web Crypto, no deps).
//
// Each device holds an RSA keypair: the private key lives only in localStorage
// and never leaves the device; the public key is published in the lobby so the
// host can encrypt that seat's hole cards to it. Only the owning device can
// decrypt — Firestore (and the project admin browsing the console) only ever
// see ciphertext.
//
// Why owner-only (no host-decryptable copy): the host never reads the holes
// subcollection back. It keeps a plaintext copy of every hole in memory
// (dealtHolesRef in useNormalGame) for the live session — showdown, all-in
// reveal and equity all use that, plus the public `revealedHoles` field. So a
// second host-encrypted copy at rest would only re-introduce a decryptable
// blob for no benefit.

const ALGO = { name: "RSA-OAEP", hash: "SHA-256" } as const;
const GEN_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

function storageKey(uid: string): string {
  return `poker-sim:holekey:${uid}`;
}

type StoredKeys = { publicJwk: JsonWebKey; privateJwk: JsonWebKey };

function isCryptoAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof crypto !== "undefined" &&
    !!crypto.subtle
  );
}

// Imported private keys are cached so repeated decrypts don't re-import.
const privKeyCache = new Map<string, CryptoKey>();

async function loadOrCreate(uid: string): Promise<StoredKeys | null> {
  if (!isCryptoAvailable()) return null;
  const raw = localStorage.getItem(storageKey(uid));
  if (raw) {
    try {
      return JSON.parse(raw) as StoredKeys;
    } catch {
      /* corrupt — regenerate below */
    }
  }
  const pair = await crypto.subtle.generateKey(GEN_PARAMS, true, [
    "encrypt",
    "decrypt",
  ]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const stored: StoredKeys = { publicJwk, privateJwk };
  localStorage.setItem(storageKey(uid), JSON.stringify(stored));
  return stored;
}

// Public JWK (compact string) to publish in the lobby for this device's uid.
export async function getMyPublicKeyString(uid: string): Promise<string | null> {
  const keys = await loadOrCreate(uid);
  if (!keys) return null;
  return JSON.stringify(keys.publicJwk);
}

// Encrypt a pair of hole cards to a published public key (JWK string).
// Returns base64 ciphertext, or null if crypto is unavailable / key invalid.
export async function encryptCardsTo(
  publicKeyString: string,
  cards: [Card, Card],
): Promise<string | null> {
  if (!isCryptoAvailable()) return null;
  try {
    const jwk = JSON.parse(publicKeyString) as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", jwk, ALGO, false, [
      "encrypt",
    ]);
    const payload = new TextEncoder().encode(JSON.stringify(cards));
    const cipher = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, payload);
    return bufToB64(cipher);
  } catch {
    return null;
  }
}

// Decrypt our own hole cards using the private key in localStorage for `uid`.
export async function decryptMyCards(
  uid: string,
  b64: string,
): Promise<[Card, Card] | null> {
  if (!isCryptoAvailable()) return null;
  try {
    let priv = privKeyCache.get(uid);
    if (!priv) {
      const keys = await loadOrCreate(uid);
      if (!keys) return null;
      priv = await crypto.subtle.importKey("jwk", keys.privateJwk, ALGO, false, [
        "decrypt",
      ]);
      privKeyCache.set(uid, priv);
    }
    const plain = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      priv,
      b64ToBuf(b64),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as [Card, Card];
  } catch {
    return null;
  }
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
