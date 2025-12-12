import { NextRequest } from "next/server";

const requestLog = new Map<string, number[]>();

export function getClientId(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp =
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-client-ip");

  return realIp || "unknown";
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = requestLog.get(key)?.filter((ts) => ts > windowStart) ?? [];
  timestamps.push(now);

  requestLog.set(key, timestamps);

  return timestamps.length > limit;
}
