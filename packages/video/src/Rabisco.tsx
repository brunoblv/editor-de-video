import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, useCurrentFrame } from 'remotion';
import type { RabiscoProps, RabiscoScene } from '@editor-video/core/render';
import { Captions } from './components/Captions';

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
 * Fronteira cabeça/corpo (fração da altura da imagem, de cima pra baixo),
 * estimada visualmente por pose — é um efeito de estilo, não uma costura
 * anatômica exata. `DEFAULT_HEAD_SPLIT` cobre qualquer ação sem entrada aqui.
 */
const HEAD_SPLIT: Partial<Record<RabiscoScene['action'], number>> = {
  thinking: 0.43,
  sitting: 0.38,
  walking: 0.32,
};
const DEFAULT_HEAD_SPLIT = 0.4;

/** Ações em que o corpo simula passada em vez de respiração parada. */
const GAIT_ACTIONS = new Set<RabiscoScene['action']>(['walking']);

/** Balanço leve e contínuo da cabeça, fora de fase do corpo — RABISCO.md §11: pequenas
 * oscilações, nunca cinematográficas. */
function headLayerStyle(frame: number): React.CSSProperties {
  const rotateDeg = Math.sin(frame / 20) * 2.2;
  const bobPx = Math.sin(frame / 20 + Math.PI / 2) * 3;
  return { transform: `translateY(${bobPx}px) rotate(${rotateDeg}deg)`, transformOrigin: '50% 100%' };
}

/** Corpo: passada simulada (walking) ou respiração/balanço sutil (poses paradas). */
function bodyLayerStyle(action: RabiscoScene['action'], frame: number): React.CSSProperties {
  if (GAIT_ACTIONS.has(action)) {
    const bounce = Math.abs(Math.sin(frame / 6)) * -6;
    const tilt = Math.sin(frame / 6) * 2.5;
    return { transform: `translateY(${bounce}px) rotate(${tilt}deg)`, transformOrigin: '50% 100%' };
  }
  const breathe = 1 + Math.sin(frame / 30) * 0.015;
  const sway = Math.sin(frame / 34) * 1.6;
  return { transform: `scaleY(${breathe}) translateX(${sway}px)`, transformOrigin: '50% 100%' };
}

const ThoughtBubble: React.FC<{ text: string; position: RabiscoScene['position'] }> = ({ text, position }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const align = position === 'left' ? 'flex-start' : position === 'right' ? 'flex-end' : 'center';

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
          background: 'rgba(255,255,255,0.72)',
          border: `2px solid ${paper.ink}`,
          borderRadius: 28,
          padding: '18px 26px',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const CharacterScene: React.FC<{ scene: RabiscoScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const outerStyle = animationStyle(scene.animation, frame, scene.durationInFrames);
  const headSplit = HEAD_SPLIT[scene.action] ?? DEFAULT_HEAD_SPLIT;
  // As duas camadas se sobrepõem um pouco na costura (pescoço) — sem isso, a rotação/bob
  // independente de cada uma abre uma fresta visível mostrando o fundo entre elas.
  const SEAM_OVERLAP = 0.03;
  const headClip = `inset(0 0 ${Math.max(0, 1 - headSplit - SEAM_OVERLAP) * 100}% 0)`;
  const bodyClip = `inset(${Math.max(0, headSplit - SEAM_OVERLAP) * 100}% 0 0 0)`;

  return (
    <AbsoluteFill style={POSITION_STYLE[scene.position]}>
      <div style={{ width: CHARACTER_SIZE, position: 'relative', ...outerStyle }}>
        {/* Reserva a altura da caixa (as duas cópias animadas abaixo são absolutas). */}
        <Img
          src={scene.assetUrl}
          style={{ width: '100%', height: 'auto', display: 'block', visibility: 'hidden' }}
        />
        <div style={{ position: 'absolute', inset: 0, ...headLayerStyle(frame) }}>
          <Img src={scene.assetUrl} style={{ width: '100%', height: 'auto', display: 'block', clipPath: headClip }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, ...bodyLayerStyle(scene.action, frame) }}>
          <Img src={scene.assetUrl} style={{ width: '100%', height: 'auto', display: 'block', clipPath: bodyClip }} />
        </div>
      </div>
      {scene.thought ? <ThoughtBubble text={scene.thought} position={scene.position} /> : null}
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

export const Rabisco: React.FC<RabiscoProps> = ({ watermark, voiceoverUrl, musicUrl, musicVolume, scenes, captions }) => {
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

      {captions.length > 0 ? <Captions captions={captions} /> : null}

      {watermark ? <RabiscoWatermark text={watermark} /> : null}
    </AbsoluteFill>
  );
};
