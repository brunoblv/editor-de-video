-- CreateEnum
CREATE TYPE "SocialPostState" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ChannelAsset" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "state" "SocialPostState" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SocialPostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPostTarget" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "postedAt" TIMESTAMP(3),
    "remoteUrl" TEXT,

    CONSTRAINT "SocialPostTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelAsset_assetId_idx" ON "ChannelAsset"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelAsset_channelId_assetId_key" ON "ChannelAsset"("channelId", "assetId");

-- CreateIndex
CREATE INDEX "SocialPost_channelId_state_scheduledAt_idx" ON "SocialPost"("channelId", "state", "scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPostMedia_assetId_idx" ON "SocialPostMedia"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostMedia_postId_assetId_key" ON "SocialPostMedia"("postId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPostTarget_postId_platform_key" ON "SocialPostTarget"("postId", "platform");

-- AddForeignKey
ALTER TABLE "ChannelAsset" ADD CONSTRAINT "ChannelAsset_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelAsset" ADD CONSTRAINT "ChannelAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostMedia" ADD CONSTRAINT "SocialPostMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

