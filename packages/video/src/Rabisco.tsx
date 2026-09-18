import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { RabiscoProps, RabiscoScene } from '@editor-video/core/render';
import { Captions } from './components/Captions';
import { RabiscoProp, sipPhase } from './components/RabiscoProp';

/** Paper/off-white palette (RABISCO.md §12) — deliberadamente separada do
 * `theme.ts` escuro/bold dos outros pipelines; Rabisco é claro e introspectivo. */
const paper = {
  bg: '#f4efe4',
  ink: '#242018',
  inkSoft: 'rgba(36,32,24,0.62)',
  body: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const CHARACTER_SIZE = 620;

const POSITION_STYLE: Record<RabiscoScene['position'], React.CSSProperties> = {
  center: { justifyContent: 'center', alignItems: 'center' },
  left: { justifyContent: 'flex-start', alignItems: 'center', paddingLeft: 40 },
  right: { justifyContent: 'flex-end', alignItems: 'center', paddingRight: 40 },
  bottom: { justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 260 },
};

/** Pequenas oscilações imperfeitas, nunca cinematográficas (RABISCO.md §11). */
function animationStyle(animation: RabiscoScene['animation'], local: number, total: number): React.CSSProperties {
  const inFrames = Math.min(15, Math.floor(total / 3));
  const outFrames = Math.min(15, Math.floor(total / 3));

  const opacity = interpolate(
    local,
    [0, inFrames, Math.max(inFrames + 1, total - outFrames), total],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Leve flutuação vertical contínua em todas as animações — reforça a
  // sensação de "desenho que ganhou vida" mesmo depois da entrada.
  const float = Math.sin(local / 18) * 6;

  switch (animation) {
    case 'slide-left': {
      const x = interpolate(local, [0, inFrames], [-80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `translate(${x}px, ${float}px)` };
    }
    case 'slide-right': {
      const x = interpolate(local, [0, inFrames], [80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `translate(${x}px, ${float}px)` };
    }
    case 'rise': {
      const y = interpolate(local, [0, inFrames], [60, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `translateY(${y + float}px)` };
    }
    case 'float':
      return { opacity, transform: `translateY(${float}px)` };
    case 'zoom': {
      const scale = interpolate(local, [0, inFrames], [0.85, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return { opacity, transform: `scale(${scale}) translateY(${float}px)` };
    }
    case 'fade':
    default:
      return { opacity, transform: `translateY(${float}px)` };
  }
}

/**
 * Fronteira cabeça/corpo (fração da altura da imagem, de cima pra baixo) —
 * segue a pose real usada por cada ação (`RABISCO_ACTION_POSE` em
 * `@editor-video/core/rabisco`), não a ação em si. `DEFAULT_HEAD_SPLIT` cobre
 * qualquer ação sem entrada aqui.
 */
const HEAD_SPLIT: Partial<Record<RabiscoScene['action'], number>> = {
  thinking: 0.43,
  coffee: 0.43,
  learning: 0.43,
  sitting: 0.38,
  writing: 0.38,
  reading: 0.38,
  sky: 0.38,
  walking: 0.32,
  music: 0.32,
  sharing: 0.32,
  speaking: 0.46,
  pointing: 0.46,
  waving: 0.46,
  surprised: 0.46,
  celebrating: 0.46,
  sad: 0.48,
};
const DEFAULT_HEAD_SPLIT = 0.4;

type MotionPreset = 'idle' | 'gait' | 'sip' | 'gaze-up' | 'rhythm' | 'scribble' | 'scan' | 'offer';

/**
 * Assinatura de movimento por ação — cada preset dá cabeça/corpo próprios
 * pras 7 ações sem arte real, sem precisar de PNG novo (RABISCO_ANIMATION_ENGINE.md
 * §11-14, adaptado pra rodar 100% em Remotion, sem IA). `idle`/`gait` são o
 * comportamento original (thinking/sitting e walking), preservado ao pé da letra.
 */
const ACTION_MOTION: Record<RabiscoScene['action'], MotionPreset> = {
  thinking: 'idle',
  coffee: 'sip',
  learning: 'idle',
  sitting: 'idle',
  writing: 'scribble',
  reading: 'scan',
  sky: 'gaze-up',
  walking: 'gait',
  music: 'rhythm',
  sharing: 'offer',
  speaking: 'idle',
  pointing: 'idle',
  waving: 'idle',
  surprised: 'idle',
  celebrating: 'gait',
  sad: 'idle',
};

/** Balanço leve e contínuo, compartilhado por `idle` e `gait` (walking só muda o corpo). */
function idleHead(frame: number): React.CSSProperties {
  const rotateDeg = Math.sin(frame / 20) * 2.2;
  const bobPx = Math.sin(frame / 20 + Math.PI / 2) * 3;
  return { transform: `translateY(${bobPx}px) rotate(${rotateDeg}deg)`, transformOrigin: '50% 100%' };
}

const MOTION_PRESETS: Record<
  MotionPreset,
  { head: (frame: number) => React.CSSProperties; body: (frame: number) => React.CSSProperties }
> = {
  idle: {
    head: idleHead,
    body: (frame) => {
      const breathe = 1 + Math.sin(frame / 30) * 0.015;
      const sway = Math.sin(frame / 34) * 1.6;
      return { transform: `scaleY(${breathe}) translateX(${sway}px)`, transformOrigin: '50% 100%' };
    },
  },
  gait: {
    head: idleHead,
    body: (frame) => {
      const bounce = Math.abs(Math.sin(frame / 6)) * -6;
      const tilt = Math.sin(frame / 6) * 2.5;
      return { transform: `translateY(${bounce}px) rotate(${tilt}deg)`, transformOrigin: '50% 100%' };
    },
  },
  sip: {
    head: (frame) => {
      const phase = sipPhase(frame);
      const rotateDeg = -1 - phase * 3 + Math.sin(frame / 20) * 0.8;
      const bobPx = phase * 4 + Math.sin(frame / 20 + Math.PI / 2) * 1.5;
      return { transform: `translateY(${bobPx}px) rotate(${rotateDeg}deg)`, transformOrigin: '50% 100%' };
    },
    body: (frame) => {
      const breathe = 1 + Math.sin(frame / 30) * 0.015;
      const sway = Math.sin(frame / 34) * 0.8;
      return { transform: `scaleY(${breathe}) translateX(${sway}px)`, transformOrigin: '50% 100%' };
    },
  },
  'gaze-up': {
    head: (frame) => {
      const rise = interpolate(frame, [0, 28], [0, -7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const riseY = interpolate(frame, [0, 28], [0, -6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const drift = Math.sin(frame / 45) * 0.8;
      return { transform: `translateY(${riseY}px) rotate(${rise + drift}deg)`, transformOrigin: '50% 100%' };
    },
    body: (frame) => {
      const breathe = 1 + Math.sin(frame / 50) * 0.012;
      return { transform: `scaleY(${breathe})`, transformOrigin: '50% 100%' };
    },
  },
  rhythm: {
    head: (frame) => {
      const rotateDeg = Math.sin(frame / 3.8) * 3;
      const bobPx = Math.abs(Math.sin(frame / 3.8)) * -4;
      return { transform: `translateY(${bobPx}px) rotate(${rotateDeg}deg)`, transformOrigin: '50% 100%' };
    },
    body: (frame) => {
      const bounce = Math.abs(Math.sin(frame / 3.8)) * -3;
      const tilt = Math.sin(frame / 7.6) * 1.5;
      return { transform: `translateY(${bounce}px) rotate(${tilt}deg)`, transformOrigin: '50% 100%' };
    },
  },
  scribble: {
    head: (frame) => {
      const nod = Math.sin(frame / 5) * 1.2;
      const drift = Math.sin(frame / 28) * 2;
      return { transform: `translateX(${drift}px) rotate(${nod}deg)`, transformOrigin: '50% 100%' };
    },
    body: (frame) => {
      const lean = interpolate(frame, [0, 20], [0, 3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const breathe = 1 + Math.sin(frame / 30) * 0.008;
      return { transform: `scaleY(${breathe}) rotate(${lean}deg)`, transformOrigin: '50% 100%' };
    },
  },
  scan: {
    head: (frame) => {
      const cycle = frame % 70;
      const sweep = interpolate(cycle, [0, 55, 62, 70], [-4, 4, -4, -4], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      const tilt = Math.sin(frame / 70) * 1;
      return { transform: `translateX(${sweep}px) rotate(${tilt}deg)`, transformOrigin: '50% 100%' };
    },
    body: (frame) => {
      const breathe = 1 + Math.sin(frame / 30) * 0.015;
      return { transform: `scaleY(${breathe}) rotate(2deg)`, transformOrigin: '50% 100%' };
    },
  },
  offer: {
    head: (frame) => {
      const drift = Math.sin(frame / 40) * 0.8;
      return { transform: `rotate(${-2 + drift}deg)`, transformOrigin: '50% 100%' };
    },
    body: (frame) => {
      const lean = interpolate(frame, [6, 26], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      const settle = Math.sin(frame / 40) * 0.8;
      return { transform: `rotate(${lean + settle}deg)`, transformOrigin: '50% 100%' };
    },
  },
};

function headLayerStyle(action: RabiscoScene['action'], frame: number): React.CSSProperties {
  return MOTION_PRESETS[ACTION_MOTION[action]].head(frame);
}

function bodyLayerStyle(action: RabiscoScene['action'], frame: number): React.CSSProperties {
  return MOTION_PRESETS[ACTION_MOTION[action]].body(frame);
}

const ThoughtBubble: React.FC<{ text: string; position: RabiscoScene['position']; emotion: RabiscoScene['emotion'] }> = ({ text, position, emotion }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const align = position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center';

  const negative = emotion === 'desabafo' || emotion === 'confuso';
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: align, paddingTop: 220, pointerEvents: 'none' }}>
      <div
        style={{
          opacity,
          margin: '0 56px',
          maxWidth: 620,
          textAlign: 'center',
          fontFamily: paper.body,
          fontStyle: 'italic',
          fontSize: 40,
          color: paper.ink,
          background: 'rgba(255,255,255,0.76)',
          border: `2px ${negative ? 'dashed' : 'solid'} ${paper.ink}`,
          borderRadius: negative ? '42% 54% 46% 58%' : '48% 42% 52% 44%',
          padding: '18px 26px 28px',
        }}
      >
        {negative ? <span style={{ position: 'absolute', left: 20, top: 8, fontSize: 24, opacity: 0.38 }}>〰〰</span> : null}
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Cenários gráficos do kit Rabisco: usados só quando reforçam a cena. */
const SceneDecor: React.FC<{ scene: RabiscoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const bob = Math.sin(frame / 30) * 3;
  const ink = paper.ink;
  if (scene.action === 'sky') {
    const night = scene.emotion === 'reflexao' || scene.emotion === 'desabafo' || scene.emotion === 'confuso';
    return <svg viewBox="0 0 260 170" width={260} height={170} style={{ position: 'absolute', right: 70, top: 95, transform: `translateY(${bob}px)` }} fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round">{night ? <><path d="M158 24c-31 8-29 50 4 56-31 15-57-28-29-51 8-7 17-9 25-5Z" /><path d="m54 40 4 10 10 4-10 4-4 10-4-10-10-4 10-4ZM96 89l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /></> : <><circle cx="155" cy="68" r="25" /><path d="M155 25v13m0 60v13m-56-43h13m86 0h13m-84-39 9 9m38 38 9 9m0-56-9 9m-38 38-9 9" /></>}</svg>;
  }
  if (scene.action === 'walking') return <svg viewBox="0 0 420 100" width={420} height={100} style={{ position: 'absolute', bottom: 95, left: '50%', transform: 'translateX(-50%)', opacity: 0.65 }} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M0 80c125-8 286-8 420 0M12 80V56h32v24m12 0V27h38v53m12 0V48h31v32m16 0V20h42v60m14 0V43h28v37m10 0V59h19v21M0 87c120 5 289 5 420 0" /></svg>;
  if (scene.action === 'thinking' || scene.action === 'sitting' || scene.action === 'coffee') return <svg viewBox="0 0 380 80" width={380} height={80} style={{ position: 'absolute', bottom: 105, left: '50%', transform: `translateX(calc(-50% + ${bob}px))`, opacity: 0.78 }} fill="none" stroke={ink} strokeWidth="3" strokeLinecap="round"><path d="M4 58c110-7 245-7 371 0M18 58 9 40m23 18 8-27m20 27-3-18m29 18 11-25m25 25-3-17m169 17 8-20m23 20-4-29m28 29 8-17M5 65c107 4 255 4 370 0" /></svg>;
  if (scene.action === 'celebrating') return <svg viewBox="0 0 110 110" width={110} height={110} style={{ position: 'absolute', right: 100, top: 180, transform: `translateY(${bob}px)` }} fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round"><path d="M54 85C10 53 29 17 54 38 79 17 98 53 54 85Z" /><path d="M50 15v10m-22 1 7 7m43-7-7 7" /></svg>;
  return null;
};

const CharacterScene: React.FC<{ scene: RabiscoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const outerStyle = animationStyle(scene.animation, frame, scene.durationInFrames);
  const headSplit = HEAD_SPLIT[scene.action] ?? DEFAULT_HEAD_SPLIT;
  // As duas camadas se sobrepõem um pouco na costura (pescoço) — sem isso, a rotação/bob
  // independente de cada uma abre uma fresta visível mostrando o fundo entre elas.
  const SEAM_OVERLAP = 0.045;
  const headClip = `inset(0 0 ${Math.max(0, 1 - headSplit - SEAM_OVERLAP) * 100}% 0)`;
  const bodyClip = `inset(${Math.max(0, headSplit - SEAM_OVERLAP) * 100}% 0 0 0)`;
  // O pivô de rotação da cabeça precisa ser o próprio pescoço (a costura), não o pé da
  // imagem inteira — sem isso, qualquer rotação pequena "balança" a cabeça num raio enorme
  // (do pescoço até o chão) e abre um corte feio na costura em vez de só inclinar a cabeça.
  const headOrigin = `50% ${headSplit * 100}%`;

  return (
    <AbsoluteFill style={POSITION_STYLE.center}>
      <div style={{ width: CHARACTER_SIZE, position: 'relative', ...outerStyle }}>
        {/* Reserva a altura da caixa (as duas cópias animadas abaixo são absolutas). */}
        <Img
          src={scene.assetUrl}
          style={{ width: '100%', height: 'auto', display: 'block', visibility: 'hidden' }}
        />
        <div style={{ position: 'absolute', inset: 0, ...headLayerStyle(scene.action, frame), transformOrigin: headOrigin }}>
          <Img src={scene.assetUrl} style={{ width: '100%', height: 'auto', display: 'block', clipPath: headClip }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, ...bodyLayerStyle(scene.action, frame) }}>
          <Img src={scene.assetUrl} style={{ width: '100%', height: 'auto', display: 'block', clipPath: bodyClip }} />
        </div>
        <RabiscoProp action={scene.action} />
        <SceneDecor scene={scene} />
      </div>
      {scene.thought ? <ThoughtBubble text={scene.thought} position="center" emotion={scene.emotion} /> : null}
    </AbsoluteFill>
  );
};

const RabiscoWatermark: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 70,
      width: '100%',
      textAlign: 'center',
      fontFamily: paper.body,
      fontSize: 30,
      fontWeight: 600,
      letterSpacing: 2,
      color: paper.inkSoft,
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
);

export const Rabisco: React.FC<RabiscoProps> = ({
  watermark,
  voiceoverUrl,
  musicUrl,
  musicVolume,
  scenes,
  captions,
  captionStyle,
}) => {
  const total = Math.max(1, ...scenes.map((scene) => scene.startFrame + scene.durationInFrames));

  return (
    <AbsoluteFill style={{ backgroundColor: paper.bg }}>
      {scenes.map((scene, index) => (
        <Sequence key={index} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
          <CharacterScene scene={scene} />
        </Sequence>
      ))}

      {voiceoverUrl ? <Audio src={voiceoverUrl} /> : null}

      {musicUrl ? (
        <Audio
          src={musicUrl}
          loop
          volume={(frame) =>
            musicVolume *
            interpolate(frame, [0, 30, Math.max(31, total - 45), total], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}

      {captions.length > 0 ? <Captions captions={captions} captionStyle={captionStyle} background="light" /> : null}

      {watermark ? <RabiscoWatermark text={watermark} /> : null}
    </AbsoluteFill>
  );
};
