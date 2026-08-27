import { config } from '@editor-video/core/config';
import { PILLARS, WEEKDAY_CATEGORIES, type Pillar } from '@editor-video/core';
import { ProjectKind } from '@prisma/client';
import { prisma } from './client.js';

async function recentPillarIds(days: number): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.project.findMany({
    where: { kind: ProjectKind.CHRISTIAN, pillar: { not: null }, createdAt: { gte: cutoff } },
    select: { pillar: true },
  });
  return new Set(rows.map((row) => row.pillar).filter((id): id is string => Boolean(id)));
}

function pickPillar(now: Date, exclude: Set<string>): Pillar {
  const todayCategories = WEEKDAY_CATEGORIES[now.getDay()] ?? [];
  const eligible = PILLARS.filter((pillar) => !exclude.has(pillar.id));
  const pool = eligible.length > 0 ? eligible : PILLARS;
  const preferred = pool.filter((pillar) => todayCategories.includes(pillar.category));
  const finalPool = preferred.length > 0 ? preferred : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)]!;
}

/**
 * Content Planner (docs/Cristão/projeto.md §4/§28): escolhe o pilar do dia
 * evitando repetição recente e priorizando as categorias do dia da semana.
 */
export async function selectPillar(now: Date = new Date()): Promise<Pillar> {
  const recent = await recentPillarIds(config.christian.themeReuseDays);
  return pickPillar(now, recent);
}

/** Escolhe N pilares distintos entre si (além de evitar reuso recente) — geração em lote. */
export async function selectDistinctPillars(count: number, now: Date = new Date()): Promise<Pillar[]> {
  const recent = await recentPillarIds(config.christian.themeReuseDays);
  const excluded = new Set(recent);
  const chosen: Pillar[] = [];
  for (let i = 0; i < count; i++) {
    const pillar = pickPillar(now, excluded);
    chosen.push(pillar);
    excluded.add(pillar.id);
  }
  return chosen;
}
