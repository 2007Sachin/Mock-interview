import crypto from "node:crypto";

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function generateAccessCode() {
  const n = crypto.randomInt(1000, 9999);
  return `LUMA-${n}`;
}

export function hashAccessCode(accessCode: string, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(accessCode, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyAccessCode(accessCode: string, encoded: string) {
  const [salt, digest] = encoded.split(":");
  if (!salt || !digest) return false;
  const candidate = hashAccessCode(accessCode, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function signPayload(payload: unknown, secret: string) {
  const body = stableStringify(payload);
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function signCallbackPayload(payload: unknown, timestamp: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${stableStringify(payload)}`).digest("hex");
}

export function verifyCallbackPayload(payload: unknown, timestamp: string, signature: string, secret: string) {
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > 5 * 60_000) return false;
  const expected = signCallbackPayload(payload, timestamp, secret);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
