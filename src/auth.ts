import { timingSafeEqual } from "node:crypto";

export function isAuthorized(header: string | undefined, token: string): boolean {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const candidate = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
