import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./env";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// ─── JWT helpers ───
function getSecretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(openId: string, name: string): Promise<string> {
  return new SignJWT({ openId, name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .sign(getSecretKey());
}

async function verifySession(token: string): Promise<{ openId: string; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.openId === "string") {
      return { openId: payload.openId, name: (payload.name as string) || "" };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Auto-create local dev user ───
async function getOrCreateLocalUser(): Promise<User | null> {
  try {
    let user = await db.getUserByOpenId(ENV.ownerOpenId);
    if (!user) {
      await db.upsertUser({
        openId: ENV.ownerOpenId,
        name: "管理員",
        email: "admin@localhost",
        role: "admin",
        lastSignedIn: new Date(),
      });
      user = await db.getUserByOpenId(ENV.ownerOpenId);
    }
    return user || null;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Try JWT session cookie first
  const cookieHeader = opts.req.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookieHeader(cookieHeader);
    const token = cookies[COOKIE_NAME];
    if (token) {
      const session = await verifySession(token);
      if (session) {
        user = await db.getUserByOpenId(session.openId) || null;
      }
    }
  }

  // If no valid session, auto-login as local dev user
  if (!user) {
    user = await getOrCreateLocalUser();
    // Set session cookie for future requests
    if (user) {
      try {
        const token = await createSessionToken(user.openId, user.name || "");
        const { getSessionCookieOptions } = await import("./cookies");
        const cookieOptions = getSessionCookieOptions(opts.req);
        opts.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
      } catch { /* cookie setting is optional */ }
    }
  }

  return { req: opts.req, res: opts.res, user };
}
