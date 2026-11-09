-- Reactive Lyrics Studio: somente aditiva (nova tabela, sem alterar colunas existentes).

-- CreateTable
CREATE TABLE "LyricsProject" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "audioAssetId" TEXT NOT NULL,
    "lyricsAssetId" TEXT,
    "language" TEXT,
    "lyricsFormat" TEXT NOT NULL,
    "rightsDeclaredAt" TIMESTAMP(3),
    "rightsDeclaredById" TEXT,
    "rightsNote" TEXT,
    "analysisVersion" TEXT,
    "musicalMapKey" TEXT,
    "bpmEstimate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LyricsProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LyricsProject_projectId_key" ON "LyricsProject"("projectId");

-- CreateIndex
CREATE INDEX "LyricsProject_audioAssetId_idx" ON "LyricsProject"("audioAssetId");

-- AddForeignKey
ALTER TABLE "LyricsProject" ADD CONSTRAINT "LyricsProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LyricsProject" ADD CONSTRAINT "LyricsProject_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LyricsProject" ADD CONSTRAINT "LyricsProject_lyricsAssetId_fkey" FOREIGN KEY ("lyricsAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
