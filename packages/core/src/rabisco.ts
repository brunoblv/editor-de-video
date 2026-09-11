/**
 * Biblioteca de identidade e assets do personagem Rabisco.
 * Dados puros (sem Node), compartilhados entre o worker (prompt/direção de
 * cena) e o web (formulário, preview). Adicionar um asset novo é só um item
 * aqui — o código nunca deve espalhar caminhos de arquivo pelo projeto.
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

export const RABISCO_ACTIONS: Record<RabiscoAction, string> = {
  thinking: `${BASE}/actions/thinking.png`,
  writing: `${BASE}/actions/writing.png`,
  reading: `${BASE}/actions/reading.png`,
  coffee: `${BASE}/actions/coffee.png`,
  walking: `${BASE}/actions/walking.png`,
  music: `${BASE}/actions/music.png`,
  sky: `${BASE}/actions/sky.png`,
  sitting: `${BASE}/actions/sitting.png`,
  sharing: `${BASE}/actions/sharing.png`,
  learning: `${BASE}/actions/learning.png`,
};

/** Cada cena usa o asset de `action` — já expressivo o bastante para o MVP. */
export function resolveRabiscoAsset(action: RabiscoAction): string {
  return RABISCO_ACTIONS[action];
}
