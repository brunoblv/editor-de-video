import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { RabiscoAction } from '@editor-video/core/render';

/**
 * Overlays em SVG pras 7 ações sem arte própria — dão identidade visual sem
 * precisar de um PNG novo. Estilo combina com o traço do personagem:
 * preto (#111111), sem preenchimento sólido, traço meio torto (dupla passada
 * levemente deslocada, imitando um rabisco desenhado duas vezes).
 */
const INK = '#111111';
const STROKE_W = 5;

const SKETCH_BASE: React.SVGProps<SVGPathElement> = {
  fill: 'none',
  stroke: INK,
  strokeWidth: STROKE_W,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** Traço "rabiscado": desenha o mesmo path duas vezes, levemente deslocado. */
const Sketch: React.FC<{ d: string; fill?: string; opacity?: number }> = ({ d, fill, opacity = 1 }) => (
  <g opacity={opacity}>
    <path {...SKETCH_BASE} d={d} fill={fill ?? 'none'} opacity={0.55} transform="translate(1.4 1) rotate(0.6 50 50)" />
    <path {...SKETCH_BASE} d={d} fill={fill ?? 'none'} />
  </g>
);

/** Fase 0→1→0 de um gole de café: sobe até a boca, segura, desce. Compartilhada
 * com o preset de movimento `sip` em Rabisco.tsx pra ficarem em fase. */
export function sipPhase(frame: number): number {
  const cycle = frame % 90;
  return interpolate(cycle, [0, 25, 40, 55, 90], [0, 0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

const CoffeeCup: React.FC<{ frame: number }> = ({ frame }) => {
  const phase = sipPhase(frame);
  const steamDrift = Math.sin(frame / 20) * 3;
  return (
    <div
      style={{
        position: 'absolute',
        left: '26%',
        top: '50%',
        width: 90,
        transform: `translateY(${-phase * 20}px) rotate(${-phase * 14}deg)`,
      }}
    >
      <svg viewBox="0 0 100 100" width={90} height={90}>
        <Sketch d="M28 40 L30 68 Q30 76 40 76 L58 76 Q68 76 68 68 L70 40 Z" />
        <Sketch d="M70 46 Q84 46 84 56 Q84 66 70 64" />
        <g opacity={0.6 + Math.sin(frame / 15) * 0.3} transform={`translate(0 ${steamDrift})`}>
          <Sketch d="M42 30 Q38 22 44 16 Q48 11 44 4" />
          <Sketch d="M56 30 Q52 22 58 16 Q62 11 58 4" />
        </g>
      </svg>
    </div>
  );
};

const Notepad: React.FC<{ frame: number }> = ({ frame }) => {
  const cycle = frame % 70;
  const pencilX = interpolate(cycle, [0, 35, 70], [-14, 14, -14], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: '66%', top: '50%', width: 140 }}>
      <svg viewBox="0 0 100 100" width={140} height={140}>
        <Sketch d="M10 20 L74 16 L78 78 L14 82 Z" />
        <Sketch d="M22 34 Q42 32 60 34" opacity={0.8} />
        <Sketch d="M20 48 Q44 46 64 48" opacity={0.8} />
        <Sketch d="M20 62 Q38 60 52 62" opacity={0.8} />
        <g transform={`translate(${pencilX} -4) rotate(28 60 55)`}>
          <Sketch d="M52 66 L84 34 L92 42 L60 74 Z" />
          <Sketch d="M84 34 L92 42" />
        </g>
      </svg>
    </div>
  );
};

const OpenBook: React.FC<{ frame: number }> = ({ frame }) => {
  const pageFlutter = Math.sin(frame / 40) * 3;
  return (
    <div style={{ position: 'absolute', left: '64%', top: '48%', width: 150, transform: 'rotate(-6deg)' }}>
      <svg viewBox="0 0 100 100" width={150} height={104}>
        <Sketch d="M50 20 L50 78 L10 70 Q8 46 12 24 Z" />
        <g style={{ transformOrigin: '50px 50px', transform: `rotate(${pageFlutter}deg)` }}>
          <Sketch d="M50 20 L50 78 L90 70 Q92 46 88 24 Z" />
          <Sketch d="M58 34 Q70 32 80 34" opacity={0.75} />
          <Sketch d="M58 46 Q70 44 80 46" opacity={0.75} />
          <Sketch d="M58 58 Q68 56 76 58" opacity={0.75} />
        </g>
        <Sketch d="M20 30 Q30 28 38 30" opacity={0.75} />
        <Sketch d="M20 42 Q30 40 40 42" opacity={0.75} />
        <Sketch d="M20 54 Q28 52 34 54" opacity={0.75} />
      </svg>
    </div>
  );
};

const LearningSpark: React.FC<{ frame: number }> = ({ frame }) => {
  const pop = interpolate(frame, [8, 16, 24], [0, 1.15, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tickOpacity = 0.55 + Math.sin(frame / 22) * 0.35;
  return (
    <div style={{ position: 'absolute', left: '14%', top: '2%', width: 100, transform: `scale(${pop})` }}>
      <svg viewBox="0 0 100 100" width={100} height={100}>
        <Sketch d="M50 30 Q66 30 66 46 Q66 58 56 62 L56 70 L44 70 L44 62 Q34 58 34 46 Q34 30 50 30 Z" />
        <Sketch d="M46 74 L54 74" />
        <g opacity={tickOpacity}>
          <Sketch d="M50 10 L50 20" />
          <Sketch d="M26 30 L34 34" />
          <Sketch d="M74 30 L66 34" />
        </g>
      </svg>
    </div>
  );
};

const SkyLight: React.FC<{ frame: number }> = ({ frame }) => {
  const rayRotate = frame * 0.15;
  const starOpacity = 0.6 + Math.sin(frame / 50) * 0.3;
  return (
    <div style={{ position: 'absolute', left: '66%', top: '2%', width: 110 }}>
      <svg viewBox="0 0 100 100" width={110} height={110}>
        <g style={{ transformOrigin: '40px 30px', transform: `rotate(${rayRotate}deg)` }}>
          <Sketch d="M40 8 L40 16" />
          <Sketch d="M40 44 L40 52" />
          <Sketch d="M18 30 L26 30" />
          <Sketch d="M54 30 L62 30" />
          <Sketch d="M24 14 L29 19" />
          <Sketch d="M51 41 L56 46" />
        </g>
        <Sketch d="M28 20 Q40 16 52 20 Q56 30 52 40 Q40 44 28 40 Q24 30 28 20 Z" />
        <g opacity={starOpacity}>
          <Sketch d="M78 54 L82 54 M80 52 L80 56" />
          <Sketch d="M88 68 L91 68 M89.5 66.5 L89.5 69.5" />
        </g>
      </svg>
    </div>
  );
};

/** Fone + ondas sonoras junto da orelha, em vez de um arco sobre a cabeça —
 * em escala pequena um "band" horizontal lia como uma sobrancelha estranha. */
const MusicMoment: React.FC<{ frame: number }> = ({ frame }) => {
  const noteA = (frame % 60) / 60;
  const noteB = ((frame + 20) % 60) / 60;
  const waveOpacity = 0.6 + Math.sin(frame / 12) * 0.35;
  return (
    <div style={{ position: 'absolute', left: '72%', top: '26%', width: 110 }}>
      <svg viewBox="0 0 100 100" width={110} height={110}>
        <Sketch d="M20 12 Q14 16 14 24 L14 40 Q14 48 22 48 Q28 48 28 42 L28 24 Q28 16 20 12 Z" />
        <g opacity={waveOpacity}>
          <Sketch d="M36 20 Q46 30 36 40" />
          <Sketch d="M44 14 Q60 30 44 46" />
        </g>
        <g opacity={interpolate(noteA, [0, 0.1, 0.8, 1], [0, 1, 1, 0])} transform={`translate(56 ${52 - noteA * 30})`}>
          <Sketch d="M0 0 L0 18 Q-7 22 -9 15 Q-11 9 -2 10" />
          <Sketch d="M0 0 L10 -3" />
        </g>
        <g opacity={interpolate(noteB, [0, 0.1, 0.8, 1], [0, 1, 1, 0])} transform={`translate(70 ${58 - noteB * 30})`}>
          <Sketch d="M0 0 L0 15 Q-6 18 -7 12 Q-9 7 -2 8" />
        </g>
      </svg>
    </div>
  );
};

const ShareHeart: React.FC<{ frame: number }> = ({ frame }) => {
  const cycle = (frame % 75) / 75;
  const rise = interpolate(cycle, [0, 1], [0, 55]);
  const opacity = interpolate(cycle, [0, 0.15, 0.75, 1], [0, 1, 1, 0]);
  return (
    <div style={{ position: 'absolute', left: '68%', top: '48%', width: 60, transform: `translateY(${-rise}px)`, opacity }}>
      <svg viewBox="0 0 100 100" width={60} height={60}>
        <Sketch d="M50 78 C20 56 12 36 26 24 Q38 14 50 30 Q62 14 74 24 C88 36 80 56 50 78 Z" />
      </svg>
    </div>
  );
};

const PROP_BY_ACTION: Partial<Record<RabiscoAction, React.FC<{ frame: number }>>> = {
  coffee: CoffeeCup,
  writing: Notepad,
  reading: OpenBook,
  learning: LearningSpark,
  sky: SkyLight,
  music: MusicMoment,
  sharing: ShareHeart,
};

/** `null` pras 3 ações com arte própria (thinking/sitting/walking) — sem prop. */
export const RabiscoProp: React.FC<{ action: RabiscoAction }> = ({ action }) => {
  const frame = useCurrentFrame();
  const Prop = PROP_BY_ACTION[action];
  if (!Prop) return null;
  return <Prop frame={frame} />;
};
