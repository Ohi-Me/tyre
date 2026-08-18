import NextAuth from "next-auth";
import { authOptions } from "@tyre/auth";

// This handler was missing entirely in the pre-merge repo, despite
// middleware.ts already calling next-auth/middleware's withAuth() against
// it — see MERGE_REPORT.md, "Conflict Analysis: Auth". Restored here.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
