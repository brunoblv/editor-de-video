import { config } from '@editor-video/core';
import { prisma, type BibleVerse } from '@editor-video/db';

/**
 * Controle de repetição de versículos (docs/Cristão/projeto.md §9).
 * Nunca pede ao LLM para "escolher" ou reproduzir um versículo — só empresta
 * texto já validado na biblioteca local, então pede a reflexão em cima dele.
 */
export async function selectVerse(category: string): Promise<BibleVerse> {
  const cutoff = new Date(Date.now() - config.christian.verseReuseDays * 24 * 60 * 60 * 1000);

  const eligible = await prisma.bibleVerse.findMany({
    where: {
      themes: { has: category },
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
    },
  });

  const pool =
    eligible.length > 0
      ? eligible
      : await prisma.bibleVerse.findMany({ where: { OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] } });

  // Nunca deve ficar bloqueado: se todos já foram usados dentro da janela,
  // cai para o menos usado recentemente (fallback do próprio requisito §9).
  const finalPool =
    pool.length > 0 ? pool : await prisma.bibleVerse.findMany({ orderBy: { lastUsedAt: 'asc' }, take: 10 });

  if (finalPool.length === 0) {
    throw new Error('Biblioteca bíblica vazia. Rode o script seed-bible antes de gerar conteúdo.');
  }

  return finalPool[Math.floor(Math.random() * finalPool.length)]!;
}

export async function markVerseUsed(verseId: string): Promise<void> {
  const now = new Date();
  await prisma.bibleVerse.update({
    where: { id: verseId },
    data: {
      lastUsedAt: now,
      usageCount: { increment: 1 },
    },
  });
  // firstUsedAt só é setado uma vez.
  await prisma.bibleVerse.updateMany({
    where: { id: verseId, firstUsedAt: null },
    data: { firstUsedAt: now },
  });
}
