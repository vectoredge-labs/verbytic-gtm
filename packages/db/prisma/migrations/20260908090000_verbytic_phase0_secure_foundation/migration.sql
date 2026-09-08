CREATE TYPE "GtmLifecycleStatus" AS ENUM ('NEW', 'RESEARCHED', 'READY_FOR_OUTREACH', 'CONTACTED', 'ENGAGED', 'MEETING_PROPOSED', 'MEETING_BOOKED', 'QUALIFIED', 'NURTURE', 'CLOSED_LOST', 'DO_NOT_CONTACT');
CREATE TYPE "GtmReplyClass" AS ENUM ('INTERESTED', 'QUESTION', 'OBJECTION', 'PRICING', 'SECURITY_LEGAL', 'REFERRAL', 'NOT_NOW', 'UNSUBSCRIBE', 'BOOK_MEETING', 'RESCHEDULE', 'NEGATIVE', 'OUT_OF_OFFICE', 'UNKNOWN');
CREATE TYPE "GtmApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');
CREATE TYPE "GtmApprovalDecisionKind" AS ENUM ('APPROVED_UNCHANGED', 'EDITED_LIGHTLY', 'REWROTE_HEAVILY', 'REJECTED', 'ESCALATED', 'MARKED_DO_NOT_CONTACT');

INSERT INTO "organization" ("id", "name", "slug", "createdAt")
VALUES ('workspace', 'CRM', 'crm', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

DROP INDEX "company_domain_active_key";
DROP INDEX "contact_email_active_key";
DROP INDEX "emailThread_rootMessageId_key";
DROP INDEX "mailboxSync_userId_source_key";
DROP INDEX "calendarEvent_iCalUid_originalStartTime_key";

ALTER TABLE "company"
  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN "segment" TEXT,
  ADD COLUMN "icpTier" TEXT,
  ADD COLUMN "knownInitiatives" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "verbyticUseCases" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "strategicAccount" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "contact"
  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace',
  ADD COLUMN "relationshipType" TEXT,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "gtmStatus" "GtmLifecycleStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "doNotContact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "automationPaused" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "agentTask" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "emailThread" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "emailMessage" ADD COLUMN "replyClass" "GtmReplyClass";
ALTER TABLE "deal" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "activity" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "mailboxSync" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "calendarEvent" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';


CREATE UNIQUE INDEX "company_organizationId_id_key" ON "company"("organizationId", "id");
CREATE UNIQUE INDEX "company_workspace_domain_active_key" ON "company"("organizationId", "domain") WHERE "archivedAt" IS NULL;
CREATE INDEX "company_organizationId_strategicAccount_idx" ON "company"("organizationId", "strategicAccount");
CREATE UNIQUE INDEX "contact_organizationId_id_key" ON "contact"("organizationId", "id");
CREATE UNIQUE INDEX "contact_workspace_email_active_key" ON "contact"("organizationId", "email") WHERE "archivedAt" IS NULL;
CREATE INDEX "contact_organizationId_gtmStatus_idx" ON "contact"("organizationId", "gtmStatus");
CREATE INDEX "agentTask_organizationId_dueAt_leasedUntil_idx" ON "agentTask"("organizationId", "dueAt", "leasedUntil");
CREATE UNIQUE INDEX "emailThread_organizationId_id_key" ON "emailThread"("organizationId", "id");
CREATE UNIQUE INDEX "emailThread_organizationId_rootMessageId_key" ON "emailThread"("organizationId", "rootMessageId");
CREATE INDEX "emailThread_organizationId_lastMessageAt_idx" ON "emailThread"("organizationId", "lastMessageAt");
CREATE UNIQUE INDEX "deal_organizationId_id_key" ON "deal"("organizationId", "id");
CREATE INDEX "deal_organizationId_stage_idx" ON "deal"("organizationId", "stage");
CREATE INDEX "activity_organizationId_createdAt_idx" ON "activity"("organizationId", "createdAt");
CREATE UNIQUE INDEX "mailboxSync_organizationId_userId_source_key" ON "mailboxSync"("organizationId", "userId", "source");
CREATE UNIQUE INDEX "calendarEvent_organizationId_iCalUid_originalStartTime_key" ON "calendarEvent"("organizationId", "iCalUid", "originalStartTime");
CREATE INDEX "calendarEvent_organizationId_startsAt_idx" ON "calendarEvent"("organizationId", "startsAt");

ALTER TABLE "company" ADD CONSTRAINT "company_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact" ADD CONSTRAINT "contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agentTask" ADD CONSTRAINT "agentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal" ADD CONSTRAINT "deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity" ADD CONSTRAINT "activity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mailboxSync" ADD CONSTRAINT "mailboxSync_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendarEvent" ADD CONSTRAINT "calendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suppressedDomain" ADD COLUMN "id" TEXT;
ALTER TABLE "suppressedDomain" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "suppressedDomain" ADD COLUMN "createdById" TEXT;
UPDATE "suppressedDomain" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "suppressedDomain" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "suppressedDomain" DROP CONSTRAINT "suppressedDomain_pkey";
ALTER TABLE "suppressedDomain" ADD CONSTRAINT "suppressedDomain_pkey" PRIMARY KEY ("id");
ALTER TABLE "suppressedDomain" ADD CONSTRAINT "suppressedDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppressedDomain" ADD CONSTRAINT "suppressedDomain_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "suppressedDomain_organizationId_domain_key" ON "suppressedDomain"("organizationId", "domain");

ALTER TABLE "suppressedContact" ADD COLUMN "id" TEXT;
ALTER TABLE "suppressedContact" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE "suppressedContact" ADD COLUMN "createdById" TEXT;
UPDATE "suppressedContact" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "suppressedContact" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "suppressedContact" DROP CONSTRAINT "suppressedContact_pkey";
ALTER TABLE "suppressedContact" ADD CONSTRAINT "suppressedContact_pkey" PRIMARY KEY ("id");
ALTER TABLE "suppressedContact" ADD CONSTRAINT "suppressedContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "suppressedContact" ADD CONSTRAINT "suppressedContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "suppressedContact_organizationId_email_key" ON "suppressedContact"("organizationId", "email");

CREATE TABLE "gtmResearchBrief" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "companyId" TEXT,
  "version" INTEGER NOT NULL,
  "accountSummary" TEXT,
  "contactSummary" TEXT,
  "companySignals" JSONB NOT NULL DEFAULT '[]',
  "likelyPainPoints" JSONB NOT NULL DEFAULT '[]',
  "relevantUseCases" JSONB NOT NULL DEFAULT '[]',
  "bestOutreachAngle" TEXT,
  "personalizationPoints" JSONB NOT NULL DEFAULT '[]',
  "risksOrUncertainties" JSONB NOT NULL DEFAULT '[]',
  "recommendedCta" TEXT,
  "confidence" DOUBLE PRECISION,
  "sources" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gtmResearchBrief_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gtmResearchBrief_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "gtmResearchBrief_version_check" CHECK ("version" > 0),
  CONSTRAINT "gtmResearchBrief_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmResearchBrief_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmResearchBrief_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gtmResearchBrief_organizationId_contactId_version_key" ON "gtmResearchBrief"("organizationId", "contactId", "version");
CREATE INDEX "gtmResearchBrief_organizationId_createdAt_idx" ON "gtmResearchBrief"("organizationId", "createdAt");

CREATE TABLE "gtmApproval" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "companyId" TEXT,
  "threadId" TEXT,
  "kind" TEXT NOT NULL,
  "riskReason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "confidence" DOUBLE PRECISION,
  "originalContent" TEXT NOT NULL,
  "editedContent" TEXT,
  "status" "GtmApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decisionKind" "GtmApprovalDecisionKind",
  "decisionNote" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gtmApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gtmApproval_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "gtmApproval_decision_attribution_check" CHECK (
    ("status" = 'PENDING' AND "decisionKind" IS NULL AND "decidedById" IS NULL AND "decidedAt" IS NULL)
    OR ("status" <> 'PENDING' AND "decisionKind" IS NOT NULL AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL)
  ),
  CONSTRAINT "gtmApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmApproval_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gtmApproval_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "emailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gtmApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "gtmApproval_organizationId_id_key" ON "gtmApproval"("organizationId", "id");
CREATE INDEX "gtmApproval_organizationId_status_createdAt_idx" ON "gtmApproval"("organizationId", "status", "createdAt");
CREATE INDEX "gtmApproval_contactId_createdAt_idx" ON "gtmApproval"("contactId", "createdAt");

CREATE TABLE "gtmAuditEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gtmAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gtmAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "gtmAuditEvent_organizationId_createdAt_idx" ON "gtmAuditEvent"("organizationId", "createdAt");
CREATE INDEX "gtmAuditEvent_organizationId_entityType_entityId_createdAt_idx" ON "gtmAuditEvent"("organizationId", "entityType", "entityId", "createdAt");

CREATE FUNCTION gtm_guard_approval_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'Approval decisions are terminal';
  END IF;
  IF NEW."status" = 'PENDING' OR NEW."decisionKind" IS NULL OR NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL THEN
    RAISE EXCEPTION 'Approval decision attribution is required';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "gtmApproval_terminal_decision" BEFORE UPDATE ON "gtmApproval" FOR EACH ROW EXECUTE FUNCTION gtm_guard_approval_transition();

CREATE FUNCTION gtm_apply_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "contact"
  SET "doNotContact" = true, "automationPaused" = true, "gtmStatus" = 'DO_NOT_CONTACT'
  WHERE "organizationId" = NEW."organizationId" AND lower("email") = lower(NEW."email");
  UPDATE "agentTask"
  SET "finishedAt" = CURRENT_TIMESTAMP, "outcome" = 'cancelled: contact suppressed'
  WHERE "organizationId" = NEW."organizationId" AND "contactId" IN (
    SELECT "id" FROM "contact" WHERE "organizationId" = NEW."organizationId" AND lower("email") = lower(NEW."email")
  ) AND "finishedAt" IS NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "suppressedContact_apply" AFTER INSERT ON "suppressedContact" FOR EACH ROW EXECUTE FUNCTION gtm_apply_suppression();

CREATE FUNCTION gtm_apply_domain_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "contact"
  SET "doNotContact" = true, "automationPaused" = true, "gtmStatus" = 'DO_NOT_CONTACT'
  WHERE "organizationId" = NEW."organizationId" AND split_part(lower("email"), '@', 2) = lower(NEW."domain");
  UPDATE "agentTask"
  SET "finishedAt" = CURRENT_TIMESTAMP, "outcome" = 'cancelled: domain suppressed'
  WHERE "organizationId" = NEW."organizationId" AND "contactId" IN (
    SELECT "id" FROM "contact"
    WHERE "organizationId" = NEW."organizationId" AND split_part(lower("email"), '@', 2) = lower(NEW."domain")
  ) AND "finishedAt" IS NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "suppressedDomain_apply" AFTER INSERT ON "suppressedDomain" FOR EACH ROW EXECUTE FUNCTION gtm_apply_domain_suppression();

CREATE FUNCTION gtm_enforce_contact_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."email" IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM "suppressedContact"
      WHERE "organizationId" = NEW."organizationId" AND lower("email") = lower(NEW."email")
    ) OR EXISTS (
      SELECT 1 FROM "suppressedDomain"
      WHERE "organizationId" = NEW."organizationId" AND lower("domain") = split_part(lower(NEW."email"), '@', 2)
    )
  ) THEN
    NEW."doNotContact" = true;
    NEW."automationPaused" = true;
    NEW."gtmStatus" = 'DO_NOT_CONTACT';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "contact_enforce_suppression" BEFORE INSERT OR UPDATE OF "organizationId", "email" ON "contact" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_contact_suppression();

CREATE FUNCTION gtm_enforce_workspace_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME IN ('contact', 'deal', 'emailThread', 'calendarEvent', 'gtmResearchBrief', 'gtmApproval') AND to_jsonb(NEW)->>'companyId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "company" WHERE "id" = to_jsonb(NEW)->>'companyId' AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace company link is forbidden';
  END IF;
  IF TG_TABLE_NAME IN ('emailThread', 'calendarEvent', 'gtmResearchBrief', 'gtmApproval') AND to_jsonb(NEW)->>'contactId' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "contact" WHERE "id" = to_jsonb(NEW)->>'contactId' AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace contact link is forbidden';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "contact_workspace_links" BEFORE INSERT OR UPDATE ON "contact" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_workspace_links();
CREATE TRIGGER "deal_workspace_links" BEFORE INSERT OR UPDATE ON "deal" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_workspace_links();
CREATE TRIGGER "emailThread_workspace_links" BEFORE INSERT OR UPDATE ON "emailThread" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_workspace_links();
CREATE TRIGGER "calendarEvent_workspace_links" BEFORE INSERT OR UPDATE ON "calendarEvent" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_workspace_links();
CREATE TRIGGER "gtmResearchBrief_workspace_links" BEFORE INSERT OR UPDATE ON "gtmResearchBrief" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_workspace_links();
CREATE TRIGGER "gtmApproval_workspace_links" BEFORE INSERT OR UPDATE ON "gtmApproval" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_workspace_links();

CREATE FUNCTION gtm_protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GTM audit events are append-only';
END;
$$;
CREATE TRIGGER "gtmAuditEvent_append_only" BEFORE UPDATE OR DELETE ON "gtmAuditEvent" FOR EACH ROW EXECUTE FUNCTION gtm_protect_audit_event();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_runtime') THEN
    CREATE ROLE crm_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
END
$$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO crm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_runtime;
REVOKE UPDATE, DELETE ON "gtmAuditEvent" FROM crm_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO crm_runtime;
