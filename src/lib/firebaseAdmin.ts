// Firebase Admin SDK — SOLO servidor. Corre en las API Routes de Next.js
// (runtime Node, en Vercel Hobby gratis). El Admin SDK escribe en Firestore
// saltandose las reglas de seguridad, por eso es la autoridad del wallet/XP:
// el cliente NUNCA escribe coins/xp/stats directamente (ver firestore.rules).
//
// NO importar este modulo desde codigo de cliente. Las credenciales viven en
// variables de entorno server-only (sin prefijo NEXT_PUBLIC):
//   FIREBASE_ADMIN_PROJECT_ID   (cae a NEXT_PUBLIC_FIREBASE_PROJECT_ID)
//   FIREBASE_ADMIN_CLIENT_EMAIL
//   FIREBASE_ADMIN_PRIVATE_KEY  (con saltos de linea escapados como \n)
import "server-only";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _app: App | null = null;

function adminApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApp();
    return _app;
  }
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // En Vercel los saltos de linea de la clave llegan escapados.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan credenciales del Admin SDK (FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY / project id).",
    );
  }

  _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return _app;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

// Verifica el header Authorization: Bearer <idToken> y devuelve el uid, o null.
// Punto unico de autenticacion para las API Routes server-authoritative.
export async function verifyBearerUid(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
