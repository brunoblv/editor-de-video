/**
 * Entrada só com os componentes de composição — sem `registerRoot()`.
 * O `index.ts` é a entrada do bundle do Remotion (registra a root); importar
 * ele fora do Remotion (ex: no preview do apps/web via @remotion/player)
 * dispararia o registerRoot no navegador à toa.
 */
export { Rabisco } from './Rabisco';
export { Christian } from './Christian';
export { Curiosidade } from './Curiosidade';
export { TopList } from './TopList';
export { Captions } from './components/Captions';
