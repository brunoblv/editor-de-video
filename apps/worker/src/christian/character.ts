import { prisma, ProjectKind } from '@editor-video/db';
import type { CharacterState } from '@editor-video/core';
import type { Pillar } from './pillars.js';

/**
 * Arcos narrativos (docs/Cristão/projeto.md §14/§48) — cada arco eleva o piso
 * de cor/luz do personagem. Depois do último arco o personagem permanece
 * "encontrado", e a variação visível passa a ser só a evolução dentro do
 * próprio vídeo (feita pelo CharacterScene).
 */
const ARCS: Array<{ name: string; episodes: number; baseColor: number; baseLight: number }> = [
  { name: 'Descoberta', episodes: 10, baseColor: 0.0, baseLight: 0.05 },
  { name: 'Acolhimento', episodes: 10, baseColor: 0.15, baseLight: 0.2 },
  { name: 'Esperança', episodes: 10, baseColor: 0.35, baseLight: 0.4 },
  { name: 'Transformação', episodes: 10, baseColor: 0.55, baseLight: 0.6 },
  { name: 'Propósito', episodes: 10, baseColor: 0.75, baseLight: 0.8 },
];

function arcForEpisode(episode: number): { name: string; baseColor: number; baseLight: number } {
  let cursor = 0;
  for (const arc of ARCS) {
    cursor += arc.episodes;
    if (episode <= cursor) return arc;
  }
  return ARCS[ARCS.length - 1]!;
}

/** Número global do episódio (1-based) dentro da série "THE JOURNEY" (§46). */
export async function nextEpisodeNumber(): Promise<number> {
  const count = await prisma.project.count({ where: { kind: ProjectKind.CHRISTIAN } });
  return count + 1;
}

const SENSITIVE_EMOTION: CharacterState['emotion'] = 'sad';
const UPLIFTING_EMOTION: CharacterState['emotion'] = 'hopeful';

export function computeCharacterStates(opts: {
  episode: number;
  pillar: Pillar;
}): { start: CharacterState; end: CharacterState; arcName: string } {
  const arc = arcForEpisode(opts.episode);
  const startEmotion = opts.pillar.sensitive ? SENSITIVE_EMOTION : 'calm';

  const start: CharacterState = {
    colorLevel: arc.baseColor,
    lightLevel: arc.baseLight,
    detailLevel: Math.min(0.9, arc.baseColor + 0.15),
    emotion: startEmotion,
    pose: opts.pillar.category === 'oracao' ? 'kneeling' : 'standing',
    environment: 'dark_room',
    particles: false,
  };

  const end: CharacterState = {
    colorLevel: Math.min(1, arc.baseColor + 0.35),
    lightLevel: Math.min(1, arc.baseLight + 0.4),
    detailLevel: Math.min(1, arc.baseColor + 0.5),
    emotion: UPLIFTING_EMOTION,
    pose: 'looking_up',
    environment: 'sunrise',
    particles: true,
  };

  return { start, end, arcName: arc.name };
}
