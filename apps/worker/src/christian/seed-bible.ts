import { prisma } from '@editor-video/db';
import { BIBLE_SEED } from './bible-seed.js';
import { logger } from '../logger.js';

const log = logger('christian:seed');

/** Popula/atualiza a biblioteca bíblica local. Idempotente (upsert por book+chapter+verse+translation). */
async function main(): Promise<void> {
  let created = 0;
  let updated = 0;

  for (const entry of BIBLE_SEED) {
    const existing = await prisma.bibleVerse.findUnique({
      where: {
        book_chapter_verse_translation: {
          book: entry.book,
          chapter: entry.chapter,
          verse: entry.verse,
          translation: entry.translation,
        },
      },
    });

    if (existing) {
      await prisma.bibleVerse.update({
        where: { id: existing.id },
        data: { text: entry.text, themes: entry.themes },
      });
      updated += 1;
    } else {
      await prisma.bibleVerse.create({
        data: {
          book: entry.book,
          chapter: entry.chapter,
          verse: entry.verse,
          text: entry.text,
          translation: entry.translation,
          themes: entry.themes,
        },
      });
      created += 1;
    }
  }

  log.info(`Biblioteca bíblica: ${created} criados, ${updated} atualizados (total seed: ${BIBLE_SEED.length}).`);
}

main()
  .catch((err: unknown) => {
    log.error('Falha ao popular biblioteca bíblica', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
