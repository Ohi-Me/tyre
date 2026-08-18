-- Audit fix INFRA-C16: migrate String status / role / tier columns to Postgres enums.
--
-- Previously every status / role / tier column was `text` with the allowed value
-- set documented only in inline Prisma comments. No DB-level constraint, no
-- type safety at the Prisma client boundary. This migration:
--   1. Creates one Postgres enum type per logical domain (LoadStatus, TruckStatus,
--      UserRole, Region, etc. — see `backend/database/prisma/schema.prisma`).
--   2. ALTERs every previously-String column to its enum type, using
--      `USING <col>::text::<EnumType>` to cast the existing text values.
--      For columns whose existing data is lowercase (`entity_type`, 
--      `verification_type`) we wrap with UPPER() so the values match the
--      uppercase enum members.
--
-- Table and column names use the snake_case `@@map` / `@map` targets from
-- the schema (the actual Postgres identifiers), NOT the PascalCase Prisma
-- model names.
--
-- Reversibility: each `ALTER COLUMN ... TYPE` is reversible with
-- `ALTER COLUMN ... TYPE text USING <col>::text`; the enum types can then
-- be `DROP TYPE`'d. No data is destroyed in the forward direction (every
-- existing value is preserved verbatim, modulo the UPPER() casts noted
-- above for EntityType and VerificationType — both of which previously
-- held lowercase values that the codebase treated as case-insensitive).

-- ============================================================
-- 1. Create enum types
-- ============================================================

CREATE TYPE "UserRole" AS ENUM ('driver', 'shipper', 'broker', 'fleet_manager', 'operator', 'admin', 'super_admin');

CREATE TYPE "Region" AS ENUM ('IN', 'BD', 'PK', 'NP', 'LK', 'NG', 'KE', 'GH', 'ZA', 'EG', 'BR', 'MX', 'CO', 'PE', 'AE', 'SA', 'ID', 'VN', 'TH', 'PH');

CREATE TYPE "LoadStatus" AS ENUM ('OPEN', 'NEGOTIATING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

CREATE TYPE "TruckStatus" AS ENUM ('IDLE', 'LOADING', 'IN_TRANSIT', 'UNLOADING', 'MAINTENANCE');

CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ON_TRIP', 'OFFLINE');

CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'ESCROW_HELD', 'ADVANCE_RELEASED', 'BALANCE_RELEASED', 'REFUNDED', 'DISPUTED');

CREATE TYPE "NegotiationDecision" AS ENUM ('ACCEPTED', 'COUNTER', 'REJECTED');

CREATE TYPE "RfpStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AWARDED', 'REJECTED');

CREATE TYPE "FraudRecommendation" AS ENUM ('APPROVE', 'MONITOR', 'INVESTIGATE', 'BLOCK');

CREATE TYPE "FraudStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE', 'BLOCKED');

CREATE TYPE "ComplianceDocStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

CREATE TYPE "ConsigneeConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED');

CREATE TYPE "ReturnLoadMatchStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

CREATE TYPE "VoiceOnboardingStatus" AS ENUM ('INCOMPLETE', 'AWAITING_KYC', 'VERIFIED', 'REJECTED');

CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

CREATE TYPE "LastMileRouteStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

CREATE TYPE "TransactionType" AS ENUM ('FUNDING', 'ADVANCE_RELEASE', 'BALANCE_RELEASE', 'REFUND', 'TYRE_FEE');

CREATE TYPE "FastagTransactionType" AS ENUM ('TOLL', 'RECHARGE', 'REFUND');

CREATE TYPE "TriggerType" AS ENUM ('LOAD_ACCEPT', 'GPS_POD', 'CONSIGNEE_CONFIRM', 'CANCELLATION', 'ESCROW_FEE');

CREATE TYPE "EscrowStatus" AS ENUM ('PENDING_FUNDING', 'FUNDED', 'ADVANCE_RELEASED', 'COMPLETED', 'REFUNDED', 'DISPUTED');

CREATE TYPE "AgentName" AS ENUM ('Dispatch', 'Pricing', 'Fraud', 'Negotiation', 'Compliance', 'Contract', 'Payment', 'Route', 'Copilot', 'Fleet');

CREATE TYPE "AgentStatus" AS ENUM ('active', 'processing', 'idle', 'error');

CREATE TYPE "VoiceIntent" AS ENUM ('FIND_LOAD', 'CHECK_RATE', 'REPORT_ISSUE', 'NAVIGATE', 'STATUS', 'ACCEPT_LOAD', 'REQUEST_ADVANCE', 'UPLOAD_POD');

CREATE TYPE "EntityType" AS ENUM ('BROKER', 'DRIVER', 'TRUCK', 'LOAD', 'TRIP', 'ORGANIZATION', 'SHIPPER', 'FLEET', 'NEGOTIATION');

CREATE TYPE "TrustTier" AS ENUM ('Platinum', 'Gold', 'Silver', 'Bronze', 'Unverified');

CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');

CREATE TYPE "VerificationType" AS ENUM ('AADHAAR', 'PAN', 'GSTIN', 'BANK', 'VEHICLE', 'PHONE', 'INSURANCE', 'ADDRESS');

-- ============================================================
-- 2. Alter columns
-- ============================================================

-- ---- Region (12 columns) ----
ALTER TABLE organizations ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE users ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE drivers ALTER COLUMN current_region TYPE "Region" USING current_region::text::"Region";
ALTER TABLE brokers ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE loads ALTER COLUMN origin_region TYPE "Region" USING origin_region::text::"Region";
ALTER TABLE loads ALTER COLUMN destination_region TYPE "Region" USING destination_region::text::"Region";
ALTER TABLE trucks ALTER COLUMN current_region TYPE "Region" USING current_region::text::"Region";
ALTER TABLE shipper_rfps ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE compliance_docs ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE fleet_metrics ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE agent_logs ALTER COLUMN region TYPE "Region" USING region::text::"Region";
ALTER TABLE voice_interactions ALTER COLUMN region TYPE "Region" USING region::text::"Region";

-- ---- UserRole (2 columns; voice_interactions.user_role is nullable) ----
ALTER TABLE users ALTER COLUMN role TYPE "UserRole" USING role::text::"UserRole";
ALTER TABLE voice_interactions ALTER COLUMN user_role TYPE "UserRole" USING user_role::text::"UserRole";

-- ---- LoadStatus ----
ALTER TABLE loads ALTER COLUMN status TYPE "LoadStatus" USING status::text::"LoadStatus";

-- ---- TruckStatus ----
ALTER TABLE trucks ALTER COLUMN status TYPE "TruckStatus" USING status::text::"TruckStatus";

-- ---- TripStatus ----
ALTER TABLE trips ALTER COLUMN status TYPE "TripStatus" USING status::text::"TripStatus";

-- ---- DriverStatus ----
ALTER TABLE drivers ALTER COLUMN status TYPE "DriverStatus" USING status::text::"DriverStatus";

-- ---- RiskLevel (3 columns) ----
ALTER TABLE loads ALTER COLUMN risk_level TYPE "RiskLevel" USING risk_level::text::"RiskLevel";
ALTER TABLE trucks ALTER COLUMN predicted_breakdown_risk TYPE "RiskLevel" USING predicted_breakdown_risk::text::"RiskLevel";
ALTER TABLE fraud_incidents ALTER COLUMN severity TYPE "RiskLevel" USING severity::text::"RiskLevel";

-- ---- PaymentStatus ----
ALTER TABLE trips ALTER COLUMN payment_status TYPE "PaymentStatus" USING payment_status::text::"PaymentStatus";

-- ---- NegotiationDecision ----
ALTER TABLE negotiations ALTER COLUMN decision TYPE "NegotiationDecision" USING decision::text::"NegotiationDecision";

-- ---- RfpStatus ----
ALTER TABLE shipper_rfps ALTER COLUMN status TYPE "RfpStatus" USING status::text::"RfpStatus";

-- ---- FraudRecommendation ----
ALTER TABLE fraud_alerts ALTER COLUMN recommendation TYPE "FraudRecommendation" USING recommendation::text::"FraudRecommendation";

-- ---- FraudStatus (2 columns) ----
ALTER TABLE fraud_alerts ALTER COLUMN status TYPE "FraudStatus" USING status::text::"FraudStatus";
ALTER TABLE fraud_incidents ALTER COLUMN status TYPE "FraudStatus" USING status::text::"FraudStatus";

-- ---- ComplianceDocStatus ----
ALTER TABLE compliance_docs ALTER COLUMN status TYPE "ComplianceDocStatus" USING status::text::"ComplianceDocStatus";

-- ---- ConsigneeConfirmationStatus ----
ALTER TABLE consignee_confirmations ALTER COLUMN confirmation_status TYPE "ConsigneeConfirmationStatus" USING confirmation_status::text::"ConsigneeConfirmationStatus";

-- ---- ReturnLoadMatchStatus ----
ALTER TABLE return_load_matches ALTER COLUMN status TYPE "ReturnLoadMatchStatus" USING status::text::"ReturnLoadMatchStatus";

-- ---- VoiceOnboardingStatus ----
ALTER TABLE voice_onboardings ALTER COLUMN status TYPE "VoiceOnboardingStatus" USING status::text::"VoiceOnboardingStatus";

-- ---- ConversationStatus ----
ALTER TABLE conversations ALTER COLUMN status TYPE "ConversationStatus" USING status::text::"ConversationStatus";

-- ---- LastMileRouteStatus ----
ALTER TABLE last_mile_routes ALTER COLUMN status TYPE "LastMileRouteStatus" USING status::text::"LastMileRouteStatus";

-- ---- TransactionStatus (2 columns) ----
ALTER TABLE fastag_transactions ALTER COLUMN status TYPE "TransactionStatus" USING status::text::"TransactionStatus";
ALTER TABLE upi_escrow_transactions ALTER COLUMN status TYPE "TransactionStatus" USING status::text::"TransactionStatus";

-- ---- TransactionType (UpiEscrowTransaction) ----
ALTER TABLE upi_escrow_transactions ALTER COLUMN transaction_type TYPE "TransactionType" USING transaction_type::text::"TransactionType";

-- ---- FastagTransactionType ----
ALTER TABLE fastag_transactions ALTER COLUMN transaction_type TYPE "FastagTransactionType" USING transaction_type::text::"FastagTransactionType";

-- ---- TriggerType ----
ALTER TABLE upi_escrow_transactions ALTER COLUMN trigger_type TYPE "TriggerType" USING trigger_type::text::"TriggerType";

-- ---- EscrowStatus ----
ALTER TABLE upi_escrow_accounts ALTER COLUMN status TYPE "EscrowStatus" USING status::text::"EscrowStatus";

-- ---- AgentName ----
ALTER TABLE agent_logs ALTER COLUMN agent_name TYPE "AgentName" USING agent_name::text::"AgentName";

-- ---- VoiceIntent (2 nullable columns) ----
ALTER TABLE voice_interactions ALTER COLUMN intent TYPE "VoiceIntent" USING intent::text::"VoiceIntent";
ALTER TABLE conversation_messages ALTER COLUMN intent TYPE "VoiceIntent" USING intent::text::"VoiceIntent";

-- ---- EntityType (6 columns; existing data is lowercase, so UPPER() first) ----
ALTER TABLE audit_logs ALTER COLUMN entity_type TYPE "EntityType" USING UPPER(entity_type)::text::"EntityType";
ALTER TABLE multilingual_content ALTER COLUMN entity_type TYPE "EntityType" USING UPPER(entity_type)::text::"EntityType";
ALTER TABLE trust_scores ALTER COLUMN entity_type TYPE "EntityType" USING UPPER(entity_type)::text::"EntityType";
ALTER TABLE verifications ALTER COLUMN entity_type TYPE "EntityType" USING UPPER(entity_type)::text::"EntityType";
ALTER TABLE trust_action_logs ALTER COLUMN entity_type TYPE "EntityType" USING UPPER(entity_type)::text::"EntityType";
ALTER TABLE fraud_incidents ALTER COLUMN entity_type TYPE "EntityType" USING UPPER(entity_type)::text::"EntityType";

-- ---- TrustTier (3 columns; existing data is already mixed-case matching the enum) ----
ALTER TABLE trust_scores ALTER COLUMN tier TYPE "TrustTier" USING tier::text::"TrustTier";
ALTER TABLE trust_action_logs ALTER COLUMN old_tier TYPE "TrustTier" USING old_tier::text::"TrustTier";
ALTER TABLE trust_action_logs ALTER COLUMN new_tier TYPE "TrustTier" USING new_tier::text::"TrustTier";

-- ---- VerificationType (existing data is lowercase, so UPPER() first) ----
ALTER TABLE verifications ALTER COLUMN verification_type TYPE "VerificationType" USING UPPER(verification_type)::text::"VerificationType";

-- ============================================================
-- 3. Notes
-- ============================================================
-- VerificationStatus and AgentStatus enums are declared but not applied
-- to any column in this migration: the `Verification` model uses a boolean
-- `success` field rather than a status string, and `AgentLog` likewise
-- uses `success Boolean`. Both enums are reserved for future use (e.g.
-- when Verification grows an expiry-driven status, or when AgentLog gains
-- a status column to distinguish ERROR from IDLE without relying on
-- `success = false`).
