import { createHmac, pbkdf2, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const pbkdf2Async = promisify(pbkdf2);

const SESSION_COOKIE_NAME = "dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 32;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MINUTES = 15;

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
}

export class MissingSessionSecretError extends Error {
  constructor() {
    super("SESSION_SECRET is required to create sessions.");
    this.name = "MissingSessionSecretError";
  }
}

interface SessionPayload {
  userId: string;
  expiresAt: number;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new MissingSessionSecretError();
  }

  return "development-session-secret-change-before-production";
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    userId,
    expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !safeCompare(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;

    if (!payload.userId || !payload.expiresAt || payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) return null;

  const user = await prisma.usuarios.findFirst({
    where: {
      id: session.userId,
      ativo: true,
      deletado_em: null
    },
    select: {
      id: true,
      nome: true,
      email: true
    }
  });

  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export async function verifyPassword(password: string, storedHash: string) {
  try {
    const [algorithm, iterationsRaw, salt, hash] = storedHash.split("$");
    const digest = algorithm?.replace("pbkdf2_", "");
    const iterations = Number(iterationsRaw);

    if (!digest || !iterations || !salt || !hash || !algorithm.startsWith("pbkdf2_")) {
      return false;
    }

    const candidate = await pbkdf2Async(password, salt, iterations, PASSWORD_KEY_LENGTH, digest);

    return safeCompare(candidate.toString("base64url"), hash);
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: unknown) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 255;
}

export function validateLoginPassword(password: unknown) {
  return typeof password === "string" && password.length > 0 && password.length <= 128;
}

export function isUserBlocked(bloqueadoAte: Date | null) {
  return Boolean(bloqueadoAte && bloqueadoAte.getTime() > Date.now());
}

export function getNextLoginFailureState(currentAttempts: number) {
  const attempts = currentAttempts + 1;

  return {
    tentativas_login: attempts,
    bloqueado_ate: attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOGIN_BLOCK_MINUTES * 60 * 1000) : null
  };
}
