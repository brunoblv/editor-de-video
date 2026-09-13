/**
 * Biblioteca de identidade e assets do personagem Rabisco.
 * Dados puros (sem Node), compartilhados entre o worker (prompt/direção de
 * cena) e o web (formulário, preview). Adicionar um asset novo é só um item
 * aqui — o código nunca deve espalhar caminhos de arquivo pelo projeto.
 *
 * Só existe arte real pra 3 poses (`RABISCO_BASE_POSES`). As outras 7 ações
 * reaproveitam uma dessas poses como corpo (`RABISCO_ACTION_POSE`) — a
 * distinção visual entre elas vem do preset de movimento e do prop SVG no
 * Remotion, não de um PNG próprio. Dar arte real a uma ação nova é só trocar
 * a entrada dela em `RABISCO_ACTION_POSE`.
 */
import type { RabiscoAction, RabiscoEmotion } from './types.js';

export const RABISCO_CHARACTER_NAME = 'Rabisco';
export const RABISCO_TAGLINE = 'Pensador por natureza. Falante por necessidade.';

const BASE = '/characters/rabisco';

/**
 * MVP: apenas 7 expressões catalogadas por nome — reservadas para uma 2ª
 * camada de composição (expressão sobreposta à pose) quando houver assets
 * suficientes. Hoje `resolveRabiscoAsset` usa só `action`.
 */
export const RABISCO_EXPRESSIONS: Record<RabiscoEmotion, string> = {
  leveza: `${BASE}/expressions/leveza.png`,
  reflexao: `${BASE}/expressions/reflexao.png`,
  desabafo: `${BASE}/expressions/desabafo.png`,
  ideia: `${BASE}/expressions/ideia.png`,
  gratidao: `${BASE}/expressions/gratidao.png`,
  confuso: `${BASE}/expressions/confuso.png`,
  surpresa: `${BASE}/expressions/surpresa.png`,
};

/** Únicas 3 poses com arte real hoje — as demais ações reaproveitam uma delas. */
export const RABISCO_BASE_POSES = ['thinking', 'sitting', 'walking', 'coffee', 'writing', 'music', 'learning', 'sharing', 'speaking', 'pointing', 'waving', 'surprised', 'celebrating', 'sad'] as const;
export type RabiscoBasePose = (typeof RABISCO_BASE_POSES)[number];

/**
 * Pose base usada pelo corpo de cada ação. Sem arte própria pras outras 7
 * ações (`coffee`/`learning`/`writing`/`reading`/`sky`/`music`/`sharing`) —
 * a distinção visual delas vem do preset de movimento + prop SVG no Remotion
 * (packages/video/src/Rabisco.tsx e RabiscoProp.tsx), não do PNG.
 */
export const RABISCO_ACTION_POSE: Record<RabiscoAction, RabiscoBasePose> = {
  thinking: 'thinking',
  coffee: 'coffee',
  learning: 'learning',
  sitting: 'sitting',
  writing: 'writing',
  reading: 'sitting',
  sky: 'sitting',
  walking: 'walking',
  music: 'music',
  sharing: 'sharing',
  speaking: 'speaking',
  pointing: 'pointing',
  waving: 'waving',
  surprised: 'surprised',
  celebrating: 'celebrating',
  sad: 'sad',
};

export const RABISCO_ACTIONS: Record<RabiscoAction, string> = {
  thinking: `${BASE}/actions/thinking.png`,
  writing: `${BASE}/actions/writing-v2.png`,
  reading: `${BASE}/actions/${RABISCO_ACTION_POSE.reading}.png`,
  coffee: `${BASE}/actions/coffee-v2.png`,
  walking: `${BASE}/actions/walking-v2.png`,
  music: `${BASE}/actions/music-v2.png`,
  sky: `${BASE}/actions/${RABISCO_ACTION_POSE.sky}.png`,
  sitting: `${BASE}/actions/sitting.png`,
  sharing: `${BASE}/actions/sharing-v2.png`,
  learning: `${BASE}/actions/learning-v2.png`,
  speaking: `${BASE}/actions/speaking.png`,
  pointing: `${BASE}/actions/pointing.png`,
  waving: `${BASE}/actions/waving.png`,
  surprised: `${BASE}/actions/surprised.png`,
  celebrating: `${BASE}/actions/celebrating.png`,
  sad: `${BASE}/actions/sad.png`,
};

/** Cada cena usa o asset de `action` — já expressivo o bastante para o MVP. */
export function resolveRabiscoAsset(action: RabiscoAction): string {
  return RABISCO_ACTIONS[action];
}

/** Pose real usada como corpo dessa ação (ver `RABISCO_ACTION_POSE`). */
export function resolveRabiscoPose(action: RabiscoAction): RabiscoBasePose {
  return RABISCO_ACTION_POSE[action];
}
