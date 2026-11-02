-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('TOP_LIST', 'CURIOSIDADE', 'AMBIENT', 'CHRISTIAN', 'RABISCO');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'WAITING_PREVIEW_APPROVAL', 'READY', 'READY_FOR_REVIEW', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "LicenseVerdict" AS ENUM ('SAFE', 'ATTRIBUTION_REQUIRED', 'UNKNOWN', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "watermark" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" "ProjectKind" NOT NULL DEFAULT 'TOP_LIST',
    "captionStyle" TEXT DEFAULT 'minimal',
    "userId" TEXT,
    "topic" TEXT,
    "scriptJson" JSONB,
    "voiceoverKey" TEXT,
    "pillar" TEXT,
    "verseId" TEXT,
    "safetyJson" JSONB,
    "characterStateJson" JSONB,
    "voiceScriptJson" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "errorMessage" TEXT,
    "outputKey" TEXT,
    "outputSizeByte" INTEGER,
    "renderedAt" TIMESTAMP(3),
    "environment" TEXT,
    "weather" TEXT,
    "timeOfDay" TEXT,
    "purpose" TEXT,
    "durationMinutes" INTEGER,
    "preset" TEXT,
    "seed" INTEGER,
    "conceptJson" JSONB,
    "ambientConfigJson" JSONB,
    "audioTimelineJson" JSONB,
    "visualTimelineJson" JSONB,
    "qualityScore" DOUBLE PRECISION,
    "qualityJson" JSONB,
    "previewKey" TEXT,
    "metadataJson" JSONB,
    "recipeId" TEXT,
    "recipeVersion" INTEGER,
    "pipelineVersion" TEXT,
    "rabiscoThought" TEXT,
    "rabiscoScriptJson" JSONB,
    "characterScenesJson" JSONB,
    "durationPreset" TEXT DEFAULT 'SHORT',
    "rabiscoPromptVersion" TEXT,
    "universe" TEXT,
    "variationId" TEXT,
    "seriesId" TEXT,
    "seriesEpisode" INTEGER,
    "youtubeVideoId" TEXT,
    "youtubeShortId" TEXT,
    "youtubePlaylistIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "parentProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibleVerse" (
    "id" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT NOT NULL DEFAULT 'ARC',
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstUsedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BibleVerse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "label" TEXT,
    "transcribe" BOOLEAN NOT NULL DEFAULT false,
    "transcriptJson" JSONB,
    "sourceKey" TEXT NOT NULL,
    "sizeByte" INTEGER NOT NULL,
    "sourceDurationSec" DOUBLE PRECISION,
    "maxDurationSec" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "normalizedKey" TEXT,
    "normalizedDurationSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "author" TEXT,
    "license" TEXT,
    "query" TEXT NOT NULL,
    "localKey" TEXT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "scriptStartSec" DOUBLE PRECISION,
    "scriptEndSec" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoundAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "localKey" TEXT NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "sampleRate" INTEGER,
    "channels" INTEGER,
    "lufs" DOUBLE PRECISION,
    "peak" DOUBLE PRECISION,
    "license" TEXT,
    "licenseUrl" TEXT,
    "attribution" TEXT,
    "commercialUse" BOOLEAN NOT NULL DEFAULT false,
    "modificationAllowed" BOOLEAN NOT NULL DEFAULT false,
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "licenseVerdict" "LicenseVerdict" NOT NULL DEFAULT 'UNKNOWN',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "loopScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoundAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbientProjectAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetId" TEXT,
    "type" TEXT NOT NULL,
    "layer" TEXT,
    "startTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endTime" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbientProjectAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "universe" TEXT,
    "pillar" TEXT,
    "seriesId" TEXT,
    "episode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeVersion" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definitionJson" JSONB NOT NULL,
    "pipelineVersion" TEXT NOT NULL DEFAULT 'ambient-midnight-v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouTubeChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelTitle" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "playlistMapJson" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YouTubeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "Project_kind_idx" ON "Project"("kind");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_recipeId_idx" ON "Project"("recipeId");

-- CreateIndex
CREATE INDEX "Project_universe_idx" ON "Project"("universe");

-- CreateIndex
CREATE INDEX "Project_youtubeVideoId_idx" ON "Project"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "Project_verseId_idx" ON "Project"("verseId");

-- CreateIndex
CREATE INDEX "Project_pillar_idx" ON "Project"("pillar");

-- CreateIndex
CREATE INDEX "Project_scheduledAt_idx" ON "Project"("scheduledAt");

-- CreateIndex
CREATE INDEX "BibleVerse_lastUsedAt_idx" ON "BibleVerse"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BibleVerse_book_chapter_verse_translation_key" ON "BibleVerse"("book", "chapter", "verse", "translation");

-- CreateIndex
CREATE INDEX "Clip_projectId_idx" ON "Clip"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_projectId_position_key" ON "Clip"("projectId", "position");

-- CreateIndex
CREATE INDEX "MediaAsset_projectId_idx" ON "MediaAsset"("projectId");

-- CreateIndex
CREATE INDEX "SoundAsset_category_idx" ON "SoundAsset"("category");

-- CreateIndex
CREATE INDEX "SoundAsset_licenseVerdict_idx" ON "SoundAsset"("licenseVerdict");

-- CreateIndex
CREATE INDEX "SoundAsset_createdAt_idx" ON "SoundAsset"("createdAt");

-- CreateIndex
CREATE INDEX "AmbientProjectAsset_projectId_idx" ON "AmbientProjectAsset"("projectId");

-- CreateIndex
CREATE INDEX "AmbientProjectAsset_assetId_idx" ON "AmbientProjectAsset"("assetId");

-- CreateIndex
CREATE INDEX "RecipeVersion_recipeId_idx" ON "RecipeVersion"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeVersion_recipeId_version_key" ON "RecipeVersion"("recipeId", "version");

-- CreateIndex
CREATE INDEX "YouTubeChannel_channelId_idx" ON "YouTubeChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "YouTubeChannel_userId_key" ON "YouTubeChannel"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_verseId_fkey" FOREIGN KEY ("verseId") REFERENCES "BibleVerse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbientProjectAsset" ADD CONSTRAINT "AmbientProjectAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbientProjectAsset" ADD CONSTRAINT "AmbientProjectAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "SoundAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouTubeChannel" ADD CONSTRAINT "YouTubeChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

