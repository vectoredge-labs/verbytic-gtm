ALTER TYPE "GtmLifecycleStatus" RENAME VALUE 'READY_FOR_OUTREACH' TO 'DRAFT_READY';
ALTER TYPE "GtmLifecycleStatus" RENAME VALUE 'ENGAGED' TO 'REPLIED';
ALTER TYPE "GtmLifecycleStatus" RENAME VALUE 'QUALIFIED' TO 'INTERESTED';
ALTER TYPE "GtmLifecycleStatus" RENAME VALUE 'NURTURE' TO 'NOT_NOW';
ALTER TYPE "GtmLifecycleStatus" RENAME VALUE 'CLOSED_LOST' TO 'CLOSED';
ALTER TYPE "GtmLifecycleStatus" RENAME VALUE 'DO_NOT_CONTACT' TO 'SUPPRESSED';
ALTER TYPE "GtmLifecycleStatus" ADD VALUE 'OUTREACH_PENDING_APPROVAL' AFTER 'DRAFT_READY';
ALTER TYPE "GtmLifecycleStatus" ADD VALUE 'OBJECTION' AFTER 'INTERESTED';
ALTER TYPE "GtmLifecycleStatus" ADD VALUE 'ARCHIVED' AFTER 'SUPPRESSED';

CREATE TYPE "GtmDraftType" AS ENUM ('INITIAL_OUTREACH', 'FOLLOW_UP', 'REPLY', 'MEETING_PROPOSAL');
CREATE TYPE "GtmRiskCategory" AS ENUM ('STANDARD', 'STRATEGIC_ACCOUNT', 'PRICING_COMMERCIAL', 'NUMERIC_ROI', 'LEGAL_SECURITY', 'EXTERNAL_SEND');
CREATE TYPE "GtmDraftStatus" AS ENUM ('ACTIVE', 'CANCELLED');

ALTER TABLE "company"
  ADD COLUMN "primaryUseCase" TEXT,
  ADD COLUMN "accountStrategyNotes" TEXT;

ALTER TABLE "emailThread"
  ADD COLUMN "replyClass" "GtmReplyClass",
  ADD COLUMN "needs" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "objections" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "commitments" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "nextActionDueAt" TIMESTAMP(3),
  ADD COLUMN "lastInboundAt" TIMESTAMP(3),
  ADD COLUMN "lastOutboundAt" TIMESTAMP(3),
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "summaryVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "summaryFreshAt" TIMESTAMP(3),
  ADD COLUMN "currentOwnerId" TEXT;

ALTER TABLE "gtmResearchBrief" ADD COLUMN "supersededById" TEXT;

CREATE TABLE "gtmOutboundDraft" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "companyId" TEXT,
  "threadId" TEXT,
  "draftType" "GtmDraftType" NOT NULL,
  "status" "GtmDraftStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gtmOutboundDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gtmOutboundDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmOutboundDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmOutboundDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gtmOutboundDraft_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "emailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "gtmOutboundDraft_cancellation_check" CHECK (
    ("status" = 'ACTIVE' AND "cancelledAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL)
  )
);

CREATE TABLE "gtmOutboundDraftRevision" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "senderIdentity" TEXT NOT NULL,
  "riskCategory" "GtmRiskCategory" NOT NULL,
  "evidenceReferences" JSONB NOT NULL DEFAULT '[]',
  "authorUserId" TEXT,
  "authorAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gtmOutboundDraftRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gtmOutboundDraftRevision_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "gtmOutboundDraftRevision_author_check" CHECK ("authorUserId" IS NOT NULL OR "authorAgent" IS NOT NULL),
  CONSTRAINT "gtmOutboundDraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "gtmOutboundDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gtmOutboundDraftRevision_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "gtmApproval"
  ADD COLUMN "draftRevisionId" TEXT,
  ADD COLUMN "invalidatedAt" TIMESTAMP(3),
  ADD COLUMN "invalidatedByRevisionId" TEXT;

CREATE UNIQUE INDEX "gtmResearchBrief_supersededById_key" ON "gtmResearchBrief"("supersededById");
CREATE INDEX "emailThread_currentOwnerId_idx" ON "emailThread"("currentOwnerId");
CREATE INDEX "emailThread_organizationId_nextActionDueAt_idx" ON "emailThread"("organizationId", "nextActionDueAt");
CREATE UNIQUE INDEX "gtmOutboundDraft_organizationId_id_key" ON "gtmOutboundDraft"("organizationId", "id");
CREATE INDEX "gtmOutboundDraft_organizationId_contactId_createdAt_idx" ON "gtmOutboundDraft"("organizationId", "contactId", "createdAt");
CREATE INDEX "gtmOutboundDraft_organizationId_status_idx" ON "gtmOutboundDraft"("organizationId", "status");
CREATE UNIQUE INDEX "gtmOutboundDraftRevision_draftId_revision_key" ON "gtmOutboundDraftRevision"("draftId", "revision");
CREATE INDEX "gtmOutboundDraftRevision_draftId_createdAt_idx" ON "gtmOutboundDraftRevision"("draftId", "createdAt");
CREATE UNIQUE INDEX "gtmApproval_draftRevisionId_key" ON "gtmApproval"("draftRevisionId");

ALTER TABLE "emailThread" ADD CONSTRAINT "emailThread_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gtmResearchBrief" ADD CONSTRAINT "gtmResearchBrief_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "gtmResearchBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gtmApproval" ADD CONSTRAINT "gtmApproval_draftRevisionId_fkey" FOREIGN KEY ("draftRevisionId") REFERENCES "gtmOutboundDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION gtm_guard_approval_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PENDING' THEN
    IF OLD."invalidatedAt" IS NULL
      AND NEW."invalidatedAt" IS NOT NULL
      AND NEW."invalidatedByRevisionId" IS NOT NULL
      AND (to_jsonb(NEW) - 'invalidatedAt' - 'invalidatedByRevisionId' - 'updatedAt') =
          (to_jsonb(OLD) - 'invalidatedAt' - 'invalidatedByRevisionId' - 'updatedAt') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Approval decisions are terminal';
  END IF;
  IF NEW."status" = 'PENDING' OR NEW."decisionKind" IS NULL OR NEW."decidedById" IS NULL OR NEW."decidedAt" IS NULL THEN
    RAISE EXCEPTION 'Approval decision attribution is required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION gtm_protect_draft_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Outbound draft revisions are immutable';
END;
$$;
CREATE TRIGGER "gtmOutboundDraftRevision_immutable" BEFORE UPDATE OR DELETE ON "gtmOutboundDraftRevision" FOR EACH ROW EXECUTE FUNCTION gtm_protect_draft_revision();

CREATE FUNCTION gtm_enforce_draft_workspace_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "contact" WHERE "id" = NEW."contactId" AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace contact link is forbidden';
  END IF;
  IF NEW."companyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "company" WHERE "id" = NEW."companyId" AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace company link is forbidden';
  END IF;
  IF NEW."threadId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "emailThread" WHERE "id" = NEW."threadId" AND "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Cross-workspace thread link is forbidden';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "gtmOutboundDraft_workspace_links" BEFORE INSERT OR UPDATE ON "gtmOutboundDraft" FOR EACH ROW EXECUTE FUNCTION gtm_enforce_draft_workspace_links();

CREATE OR REPLACE FUNCTION gtm_apply_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "contact"
  SET "doNotContact" = true, "automationPaused" = true, "gtmStatus" = 'SUPPRESSED'
  WHERE "organizationId" = NEW."organizationId" AND lower("email") = lower(NEW."email");
  UPDATE "agentTask"
  SET "finishedAt" = CURRENT_TIMESTAMP, "outcome" = 'cancelled: contact suppressed'
  WHERE "organizationId" = NEW."organizationId" AND "contactId" IN (
    SELECT "id" FROM "contact" WHERE "organizationId" = NEW."organizationId" AND lower("email") = lower(NEW."email")
  ) AND "finishedAt" IS NULL AND (
    lower("kind") LIKE '%outreach%' OR lower("kind") LIKE '%follow%' OR lower("kind") LIKE '%sales%'
  );
  UPDATE "gtmOutboundDraft"
  SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "cancelReason" = 'contact suppressed'
  WHERE "organizationId" = NEW."organizationId" AND "contactId" IN (
    SELECT "id" FROM "contact" WHERE "organizationId" = NEW."organizationId" AND lower("email") = lower(NEW."email")
  ) AND "status" = 'ACTIVE';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION gtm_apply_domain_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "contact"
  SET "doNotContact" = true, "automationPaused" = true, "gtmStatus" = 'SUPPRESSED'
  WHERE "organizationId" = NEW."organizationId" AND split_part(lower("email"), '@', 2) = lower(NEW."domain");
  UPDATE "agentTask"
  SET "finishedAt" = CURRENT_TIMESTAMP, "outcome" = 'cancelled: domain suppressed'
  WHERE "organizationId" = NEW."organizationId" AND "contactId" IN (
    SELECT "id" FROM "contact"
    WHERE "organizationId" = NEW."organizationId" AND split_part(lower("email"), '@', 2) = lower(NEW."domain")
  ) AND "finishedAt" IS NULL AND (
    lower("kind") LIKE '%outreach%' OR lower("kind") LIKE '%follow%' OR lower("kind") LIKE '%sales%'
  );
  UPDATE "gtmOutboundDraft"
  SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "cancelReason" = 'domain suppressed'
  WHERE "organizationId" = NEW."organizationId" AND "contactId" IN (
    SELECT "id" FROM "contact"
    WHERE "organizationId" = NEW."organizationId" AND split_part(lower("email"), '@', 2) = lower(NEW."domain")
  ) AND "status" = 'ACTIVE';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION gtm_enforce_contact_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
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
    NEW."gtmStatus" = 'SUPPRESSED';
  END IF;
  RETURN NEW;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "gtmOutboundDraft" TO crm_runtime;
GRANT SELECT, INSERT ON "gtmOutboundDraftRevision" TO crm_runtime;
REVOKE UPDATE, DELETE ON "gtmOutboundDraftRevision" FROM crm_runtime;
