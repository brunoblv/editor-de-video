-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'EDITOR', 'REVIEWER');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('YOUTUBE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('VIDEO', 'AUDIO', 'IMAGE', 'FONT', 'CHARACTER', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'ANALYZING', 'READY', 'FAILED', 'MISSING');

-- CreateEnum
CREATE TYPE "VideoProjectState" AS ENUM ('DRAFT', 'EDITING', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('ANALYZE', 'TRANSCRIBE', 'RENDER_PREVIEW', 'RENDER_FINAL', 'RESOLVE_EXPORT', 'PUBLISH');

-- CreateEnum
CREATE TYPE "DeliverableState" AS ENUM ('PENDING', 'RENDERING', 'VALIDATING', 'READY', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('PREVIEW', 'FINAL', 'COVER', 'CAPTIONS', 'RESOLVE_PACKAGE');

-- CreateEnum
CREATE TYPE "DeliverableOrigin" AS ENUM ('HUB', 'EXTERNAL', 'LEGACY');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'UPLOADING', 'PROCESSING_REMOTE', 'PUBLISHED', 'FAILED', 'UNKNOWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentRunState" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "channelId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "tagline" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rulesJson" JSONB NOT NULL,
    "domainJson" JSONB NOT NULL,
    "linkedBrand" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "capabilitiesJson" JSONB,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'CONNECTED',
    "encryptedCredentials" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenExpiresAt" TIMESTAMP(3),
    "isTestAccount" BOOLEAN NOT NULL DEFAULT false,
    "legacyYouTubeChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKitVersion" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "colorsJson" JSONB NOT NULL,
    "fonts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoAssetId" TEXT,
    "stylesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKitVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legacyKind" "ProjectKind",
    "configJson" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "paramsSchemaJson" JSONB NOT NULL,
    "defaultsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterProfile" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileJson" JSONB NOT NULL,
    "assetsVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'UPLOADING',
    "sha256" TEXT,
    "storageKey" TEXT NOT NULL,
    "proxyKey" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fpsNum" INTEGER,
    "fpsDen" INTEGER,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "mediaInfoJson" JSONB,
    "provider" TEXT,
    "sourceUrl" TEXT,
    "author" TEXT,
    "license" TEXT,
    "licenseVerdict" "LicenseVerdict" NOT NULL DEFAULT 'UNKNOWN',
    "attribution" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetUsage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "segmentsJson" JSONB NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "seriesId" TEXT,
    "title" TEXT NOT NULL,
    "briefing" TEXT,
    "objective" TEXT,
    "targetDurationSec" INTEGER,
    "formats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" "VideoProjectState" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionId" TEXT,
    "legacyKind" "ProjectKind",
    "legacyProjectId" TEXT,
    "legacyReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "legacySnapshotJson" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "parentRevisionId" TEXT,
    "schemaVersion" INTEGER NOT NULL,
    "documentJson" JSONB NOT NULL,
    "editorialHash" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorUserId" TEXT,
    "agentRunId" TEXT,
    "command" TEXT,
    "summary" TEXT,
    "restoredFromRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "command" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "state" "AgentRunState" NOT NULL DEFAULT 'RUNNING',
    "baseRevisionId" TEXT,
    "resultRevisionId" TEXT,
    "planJson" JSONB,
    "toolCallsJson" JSONB,
    "responseText" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "numTurns" INTEGER,
    "sdkVersion" TEXT,
    "sessionId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "queue" TEXT NOT NULL,
    "revisionId" TEXT,
    "variantId" TEXT,
    "deliverableId" TEXT,
    "assetId" TEXT,
    "paramsJson" JSONB,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "errorCategory" TEXT,
    "environmentJson" JSONB,
    "requestedById" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cacheKey" TEXT,
    "state" "JobState" NOT NULL DEFAULT 'QUEUED',
    "artifactKey" TEXT,
    "outputJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactCache" (
    "cacheKey" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "artifactKey" TEXT,
    "outputJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactCache_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionId" TEXT,
    "variantId" TEXT,
    "kind" "DeliverableKind" NOT NULL,
    "origin" "DeliverableOrigin" NOT NULL DEFAULT 'HUB',
    "state" "DeliverableState" NOT NULL DEFAULT 'PENDING',
    "presetVersion" TEXT,
    "storageKey" TEXT,
    "sha256" TEXT,
    "sizeBytes" BIGINT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "planHash" TEXT,
    "validationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewApproval" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "note" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "frame" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deliverableId" TEXT,
    "socialAccountId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "publicationKey" TEXT,
    "intent" TEXT NOT NULL DEFAULT 'main',
    "metadataJson" JSONB,
    "approvalId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "requestedScheduleAt" TIMESTAMP(3),
    "remoteId" TEXT,
    "remoteUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "historical" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationAttempt" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "resumableSessionUrl" TEXT,
    "remoteId" TEXT,
    "bytesSent" BIGINT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerseUsage" (
    "id" TEXT NOT NULL,
    "verseId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerseUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationRun" (
    "id" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "reportJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MigrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyMapping" (
    "id" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "migrationRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_workspaceId_slug_key" ON "Channel"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_legacyYouTubeChannelId_key" ON "SocialAccount"("legacyYouTubeChannelId");

-- CreateIndex
CREATE INDEX "SocialAccount_channelId_idx" ON "SocialAccount"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_workspaceId_platform_externalId_key" ON "SocialAccount"("workspaceId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKitVersion_channelId_version_key" ON "BrandKitVersion"("channelId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Series_channelId_slug_key" ON "Series"("channelId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_channelId_slug_version_key" ON "TemplateVersion"("channelId", "slug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterProfile_channelId_slug_key" ON "CharacterProfile"("channelId", "slug");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_kind_idx" ON "Asset"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_workspaceId_sha256_key" ON "Asset"("workspaceId", "sha256");

-- CreateIndex
CREATE INDEX "AssetUsage_projectId_idx" ON "AssetUsage"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetUsage_assetId_projectId_key" ON "AssetUsage"("assetId", "projectId");

-- CreateIndex
CREATE INDEX "TranscriptVersion_cacheKey_idx" ON "TranscriptVersion"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptVersion_assetId_version_key" ON "TranscriptVersion"("assetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VideoProject_currentRevisionId_key" ON "VideoProject"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoProject_legacyProjectId_key" ON "VideoProject"("legacyProjectId");

-- CreateIndex
CREATE INDEX "VideoProject_workspaceId_channelId_idx" ON "VideoProject"("workspaceId", "channelId");

-- CreateIndex
CREATE INDEX "VideoProject_state_idx" ON "VideoProject"("state");

-- CreateIndex
CREATE INDEX "TimelineRevision_projectId_createdAt_idx" ON "TimelineRevision"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineRevision_projectId_number_key" ON "TimelineRevision"("projectId", "number");

-- CreateIndex
CREATE INDEX "AgentRun_projectId_createdAt_idx" ON "AgentRun"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RenderJob_idempotencyKey_key" ON "RenderJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RenderJob_state_queue_idx" ON "RenderJob"("state", "queue");

-- CreateIndex
CREATE INDEX "RenderJob_projectId_createdAt_idx" ON "RenderJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "JobStep_cacheKey_idx" ON "JobStep"("cacheKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobStep_jobId_name_key" ON "JobStep"("jobId", "name");

-- CreateIndex
CREATE INDEX "Deliverable_projectId_createdAt_idx" ON "Deliverable"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewApproval_deliverableId_idx" ON "ReviewApproval"("deliverableId");

-- CreateIndex
CREATE INDEX "ReviewApproval_fingerprint_idx" ON "ReviewApproval"("fingerprint");

-- CreateIndex
CREATE INDEX "ReviewComment_projectId_revisionId_idx" ON "ReviewComment"("projectId", "revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_publicationKey_key" ON "Publication"("publicationKey");

-- CreateIndex
CREATE INDEX "Publication_state_scheduledAt_idx" ON "Publication"("state", "scheduledAt");

-- CreateIndex
CREATE INDEX "Publication_socialAccountId_idx" ON "Publication"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationAttempt_publicationId_number_key" ON "PublicationAttempt"("publicationId", "number");

-- CreateIndex
CREATE INDEX "VerseUsage_channelId_usedAt_idx" ON "VerseUsage"("channelId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerseUsage_verseId_projectId_key" ON "VerseUsage"("verseId", "projectId");

-- CreateIndex
CREATE INDEX "LegacyMapping_targetTable_targetId_idx" ON "LegacyMapping"("targetTable", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyMapping_sourceTable_sourceId_targetTable_key" ON "LegacyMapping"("sourceTable", "sourceId", "targetTable");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKitVersion" ADD CONSTRAINT "BrandKitVersion_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Series" ADD CONSTRAINT "Series_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterProfile" ADD CONSTRAINT "CharacterProfile_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptVersion" ADD CONSTRAINT "TranscriptVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProject" ADD CONSTRAINT "VideoProject_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "TimelineRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineRevision" ADD CONSTRAINT "TimelineRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep" ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RenderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "TimelineRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewApproval" ADD CONSTRAINT "ReviewApproval_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewApproval" ADD CONSTRAINT "ReviewApproval_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerseUsage" ADD CONSTRAINT "VerseUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerseUsage" ADD CONSTRAINT "VerseUsage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyMapping" ADD CONSTRAINT "LegacyMapping_migrationRunId_fkey" FOREIGN KEY ("migrationRunId") REFERENCES "MigrationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

