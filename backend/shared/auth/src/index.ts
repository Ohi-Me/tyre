/**
 * @tyre/auth — NextAuth config with phone-OTP + role-based access.
 * RBAC matrix is exported for use in both web middleware and API routes.
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { UserRole, Region } from "@tyre/shared";
import { db } from "@tyre/db";
import { verifyOtp } from "./otp";
import { recordAudit } from "./audit";

export * from "./jwt";
export * from "./otp";
export * from "./audit";
export * from "./rate-limit";
export * from "./internal";
export * from "./rbac-guard";
export * from "./api-key";

export interface TyreSession {
  user: {
    id: string;
    phone: string;
    name: string;
    role: UserRole;
    region: Region;
    preferred_locale: string;
    org_id: string;
    kyc_verified: boolean;
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Phone OTP",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) return null;

        const otpValid = await verifyOtp(credentials.phone, credentials.otp);
        if (!otpValid) return null;

        const user = await db.user.findUnique({ where: { phone: credentials.phone } });
        if (!user || !user.isActive) return null;

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await recordAudit({
          userId: user.id,
          action: "USER_LOGIN",
          entityType: "User",
          entityId: user.id,
        });

        return {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: user.role as UserRole,
          region: user.region as Region,
          preferred_locale: user.preferredLocale,
          org_id: user.orgId,
          kyc_verified: user.kycVerified,
        } as any;
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) Object.assign(token, user);
      return token;
    },
    async session({ session, token }) {
      (session as any).user = token;
      return session;
    },
  },
  pages: { signIn: "/auth/signin" },
};

/**
 * RBAC matrix — role × action.
 * Used by both web middleware and API route guards.
 */
export const RBAC: Record<UserRole, string[]> = {
  driver: ["loads:match", "loads:accept", "trips:self", "voice:process"],
  shipper: ["loads:create", "rfp:create", "pricing:compute", "trips:track"],
  broker: ["loads:broker", "negotiate:run", "fraud:self"],
  fleet_manager: ["trucks:manage", "fleet:metrics", "drivers:manage", "documents:manage", "billing:manage", "trips:*"],
  // Phase 0: operator gets all operational actions + fraud + RFP management.
  // apikeys:* is admin-only — operators should not issue service credentials.
  operator: [
    "loads:*", "trips:*", "negotiation:*", "pricing:*",
    "fleet:read", "rfp:*", "fraud:*", "documents:*", "billing:*",
    "drivers:manage", "trucks:manage",
    "admin:metrics", // operators can read metrics, admin can do everything
  ],
  admin: ["*"],
  super_admin: ["*"],
};

export function can(role: UserRole, action: string): boolean {
  const perms = RBAC[role] || [];
  if (perms.includes("*")) return true;
  return perms.some((p) => p === action || p === `${action.split(":")[0]}:*`);
}
