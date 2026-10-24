/**
 * Serviços V3 sobre o banco (`@editor-video/db/v3`). Toda função pública
 * recebe o ator e autoriza por workspace antes de ler/escrever.
 */
export * from './access.js';
export * from './crypto.js';
export * from './channels.js';
export * from './projects.js';
export * from './assets.js';
export * from './jobs.js';
export * from './review.js';
export * from './agent-runs.js';
export { loadLegacySnapshot, findMissingFiles, runMigration } from './migrate-legacy.js';
