export const theme = {
  bg: '#07070b',
  accent: '#ff2d55',
  accentSoft: '#ff6b8a',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.62)',
  // Fontes de sistema: evita dependência de rede durante o render.
  display: '"Arial Black", "Archivo Black", Impact, "Segoe UI", sans-serif',
  body: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

export const shadow = {
  hard: '0 8px 0 rgba(0,0,0,0.35)',
  glow: '0 0 60px rgba(255,45,85,0.45)',
  text: '0 4px 24px rgba(0,0,0,0.85)',
} as const;
