/** DB singleton re-export — kept here so existing `@/lib/db` imports in v2.1 code still work.
 *  `dbRead` is the read-replica client (TYRE v1.1 item #9); it falls back to the primary
 *  when TYRE_DATABASE_URL_READONLY is unset. Use it only for analytics / metrics reads. */
export { db, dbRead } from "@tyre/db";
