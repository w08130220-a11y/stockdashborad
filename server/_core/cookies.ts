import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

function isLocalHost(req: Request): boolean {
  const hostname = req.hostname || "";
  return LOCAL_HOSTS.has(hostname);
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const isLocal = isLocalHost(req);
  // In production (non-localhost), always set secure=true because:
  // 1. SameSite=None REQUIRES Secure=true or browsers will reject the cookie
  // 2. In production behind a reverse proxy, connection is typically secure
  // 3. trust proxy is set, but as a safety net we force secure for non-local
  const secure = isLocal ? isSecureRequest(req) : true;

  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure,
  };
}
