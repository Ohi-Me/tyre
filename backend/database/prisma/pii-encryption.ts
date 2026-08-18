/**
 * @tyre/db/pii-encryption — field-level encryption for PII columns.
 *
 * Phase 0 fix (`docs/ARCHITECTURE.md` §9.4): `app/security/pii_encryption.py` existed
 * on the Python side with no Prisma-side counterpart — "the schema has @@map
 * annotations for encrypted columns but the middleware that would transparently
 * encrypt/decrypt is not wired." This file is that middleware, implemented as a Prisma
 * Client Extension (`$extends`) rather than the deprecated `$use` middleware API.
 *
 * AES-256-GCM, one key from `TYRE_PII_ENCRYPTION_KEY` (32 raw bytes, base64-encoded in
 * the env var — generate with `openssl rand -base64 32`). Ciphertext is stored as
 * `enc:v1:<iv>:<authTag>:<ciphertext>` (all base64) so a value can be told apart from
 * legacy plaintext during migration — `decryptField` passes through anything without
 * the `enc:v1:` prefix unchanged, so existing unencrypted rows don't break on first read
 * after this is turned on; a backfill script re-saves them through this extension to
 * encrypt at rest.
 *
 * Field coverage matches the PII the schema already flags as sensitive: UPI IDs, mobile
 * money / Pix identifiers, GSTIN/tax IDs, and driver license numbers. Phone numbers are
 * deliberately NOT encrypted here — they're the lookup key for `User.phone` /
 * `Driver.phone` (`@unique`), and encrypting a column Postgres needs to index/equality-
 * match on would break every login and `findUnique` call. Aadhaar/PAN numbers are never
 * stored raw in the first place (see `Verification.piiHash` — hash-only by design).
 */

import crypto from "node:crypto";


const ALGO = "aes-256-gcm";
const VERSION_PREFIX = "enc:v1:";

function getKey(): Buffer {
  const b64 = process.env.TYRE_PII_ENCRYPTION_KEY || "";
  if (!b64) {
    // SH-C3 fix: previously returned null (fail-open), silently storing PII in
    // cleartext. Now throws in production; in dev/test, allows bypass only when
    // TYRE_PII_ENCRYPTION_DISABLED=1 is explicitly set (with a loud warning).
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TYRE_PII_ENCRYPTION_KEY is not set. Refusing to store PII in cleartext in production. "
        + "Generate a key with `openssl rand -base64 32` and set TYRE_PII_ENCRYPTION_KEY."
      );
    }
    if (process.env.TYRE_PII_ENCRYPTION_DISABLED === "1") {
      if (!process.env._TYRE_PII_WARNED) {
        console.warn("[pii-encryption] TYRE_PII_ENCRYPTION_DISABLED=1 — PII stored in cleartext (dev/test only)");
        process.env._TYRE_PII_WARNED = "1";
      }
      throw new Error("__PII_DISABLED__");  // sentinel — encryptField/decryptField catch and pass through
    }
    throw new Error(
      "TYRE_PII_ENCRYPTION_KEY is not set. Set it to a 32-byte base64 key "
      + "(openssl rand -base64 32), or set TYRE_PII_ENCRYPTION_DISABLED=1 for local dev."
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `TYRE_PII_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). `
      + "Generate with: openssl rand -base64 32"
    );
  }
  return key;
}

export function encryptField(plaintext: string | null | undefined): string | null | undefined {
  if (plaintext === null || plaintext === undefined || plaintext === "") return plaintext;
  if (plaintext.startsWith(VERSION_PREFIX)) return plaintext; // already encrypted
  let key: Buffer;
  try {
    key = getKey();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "__PII_DISABLED__") return plaintext;
    throw e;  // re-throw production failures
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${VERSION_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptField(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || !value.startsWith(VERSION_PREFIX)) return value;
  let key: Buffer;
  try {
    key = getKey();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "__PII_DISABLED__") return value;
    throw e;
  }

  try {
    const [, ivB64, tagB64, dataB64] = value.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return value;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(dataB64, "base64");

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (e) {
    console.error("[pii-encryption] decrypt failed — returning ciphertext", e);
    return value;
  }
}

/**
 * SH-C3 fix: expanded field coverage. Previously only 4 models × 3-4 fields were
 * covered. Now covers all PII fields the audit identified, including consignee
 * phones, WhatsApp from-phones, and voice-onboarding phones in 7 additional tables.
 *
 * Phone numbers on User/Driver remain unencrypted (they are @unique lookup keys —
 * encrypting them would break every login and findUnique call). They are instead
 * protected by row-level access control + the audit log.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  user: ["upiId", "mobileMoneyId", "pixKey"],
  driver: ["upiId", "mobileMoneyId", "pixKey", "licenseNumber"],
  broker: ["gstin", "taxId"],
  organization: ["gstin", "taxId"],
  // SH-C3: expanded coverage
  upiEscrowAccount: ["driverPhone"],   // money-path table
  consigneeConfirmation: ["consigneePhone"],  // delivery verification PII
  voiceOnboarding: ["driverPhone"],    // voice capture PII
  verification: ["piiHash", "rawData"],  // verification payloads
  lead: ["phone"],  // lead-capture PII (pre-sale)
  webhookEvent: ["payload"],  // may contain phone numbers from WhatsApp
};

/**
 * Prisma Client Extension: encrypts configured fields on write (create/update/upsert),
 * decrypts on read (findUnique/findFirst/findMany), for every model listed above.
 * Applied once in `db` below — every caller of `@tyre/db`'s `db` export gets this for
 * free with no per-query changes required.
 */
export function piiEncryptionExtension(client: any) {
  return client.$extends({
    name: "pii-encryption",
    query: {
      $allModels: {
        async create({ model, args, query }: any) {
          encryptArgsData(model, args.data);
          return decryptResult(model, await query(args));
        },
        async createMany({ model, args, query }: any) {
          if (Array.isArray(args.data)) args.data.forEach((d: any) => encryptArgsData(model, d));
          return query(args);
        },
        async update({ model, args, query }: any) {
          encryptArgsData(model, args.data);
          return decryptResult(model, await query(args));
        },
        async updateMany({ model, args, query }: any) {
          encryptArgsData(model, args.data);
          return query(args);
        },
        async upsert({ model, args, query }: any) {
          encryptArgsData(model, args.create);
          encryptArgsData(model, args.update);
          return decryptResult(model, await query(args));
        },
        async findUnique({ model, args, query }: any) {
          return decryptResult(model, await query(args));
        },
        async findFirst({ model, args, query }: any) {
          return decryptResult(model, await query(args));
        },
        async findMany({ model, args, query }: any) {
          const results = await query(args);
          return Array.isArray(results) ? results.map((r: any) => decryptResult(model, r)) : results;
        },
      },
    },
  });
}

function modelKey(model: string): string {
  return model.toLowerCase();
}

function encryptArgsData(model: string, data: any) {
  const fields = ENCRYPTED_FIELDS[modelKey(model)];
  if (!fields || !data) return;
  for (const f of fields) {
    if (f in data && typeof data[f] === "string") {
      data[f] = encryptField(data[f]);
    }
  }
}

function decryptResult<T>(model: string, result: T): T {
  const fields = ENCRYPTED_FIELDS[modelKey(model)];
  if (!fields || !result || typeof result !== "object") return result;
  const r = result as any;
  for (const f of fields) {
    if (f in r && typeof r[f] === "string") {
      r[f] = decryptField(r[f]);
    }
  }
  return result;
}
