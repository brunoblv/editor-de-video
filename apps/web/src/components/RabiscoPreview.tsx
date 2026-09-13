'use client';

import { useMemo, useState } from 'react';
import { Player } from '@remotion/player';
import { Rabisco } from '@editor-video/video/compositions';
import {
  RABISCO_ACTIONS,
  resolveRabiscoPose,
  type CaptionSegment,
  type CaptionStyle,
  type RabiscoAction,
  type RabiscoAnimation,
  type RabiscoProps,
  type RabiscoScene,
} from '@editor-video/core';

const FPS = 30;

const ACTION_LABEL: Record<RabiscoAction, string> = {
  thinking: 'Pensando (arte própria)',
  sitting: 'Sentado (arte própria)',
  walking: 'Caminhando (arte própria)',
  coffee: 'Café — gole + xícara',
  learning: 'Aprendendo — lâmpada',
  writing: 'Escrevendo — caderno + lápis',
  reading: 'Lendo — livro',
  sky: 'Olhando o céu — sol + estrelas',
  music: 'Música — fone + notas',
  sharing: 'Compartilhando — coração',
  speaking: 'Falando (arte própria)',
  pointing: 'Apontando (arte própria)',
  waving: 'Acenando (arte própria)',
  surprised: 'Surpreso (arte própria)',
  celebrating: 'Comemorando (arte própria)',
  sad: 'Triste (arte própria)',
};

const ANIMATION_LABEL: Record<RabiscoAnimation, string> = {
  fade: 'Fade',
  'slide-left': 'Entra pela esquerda',
  'slide-right': 'Entra pela direita',
  rise: 'Sobe',
  float: 'Flutua',
  zoom: 'Zoom',
};

const CAPTION_STYLE_LABEL: Record<CaptionStyle, string> = {
  minimal: 'Minimalista (texto limpo)',
  highlight: 'Highlight (marca-texto na palavra narrada)',
  handwritten: 'Manuscrita (Patrick Hand)',
};

const DEFAULT_CAPTIONS = [
  'Talvez eu não precise ter todas as respostas hoje.',
  'Um passo de cada vez.',
].join('\n');

/**
 * Distribui as palavras uniformemente no tempo da legenda — o estilo
 * `highlight` marca a palavra "sendo narrada", que no vídeo real vem dos
 * timestamps do Whisper/Gemini. Aqui simulamos para dar pra avaliar o efeito.
 */
function buildCaptions(lines: string[], framesPerLine: number): CaptionSegment[] {
  return lines.map((text, index) => {
    const startFrame = index * framesPerLine;
    const endFrame = startFrame + framesPerLine;
    const words = text.split(/\s+/).filter(Boolean);
    const perWord = words.length > 0 ? framesPerLine / words.length : framesPerLine;
    return {
      text,
      startFrame,
      endFrame,
      words: words.map((word, wordIndex) => ({
        text: word,
        startFrame: Math.round(startFrame + wordIndex * perWord),
        endFrame: Math.round(startFrame + (wordIndex + 1) * perWord),
      })),
    };
  });
}

export function RabiscoPreview() {
  const [action, setAction] = useState<RabiscoAction>('coffee');
  const [animation, setAnimation] = useState<RabiscoAnimation>('fade');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('handwritten');
  const [thought, setThought] = useState('');
  const [captionText, setCaptionText] = useState(DEFAULT_CAPTIONS);
  const [secondsPerLine, setSecondsPerLine] = useState(4);

  const lines = useMemo(
    () => captionText.split('\n').map((line) => line.trim()).filter(Boolean),
    [captionText],
  );

  const framesPerLine = Math.max(1, Math.round(secondsPerLine * FPS));
  const durationInFrames = Math.max(framesPerLine, lines.length * framesPerLine);

  const inputProps = useMemo<RabiscoProps>(() => {
    const scene: RabiscoScene = {
      startFrame: 0,
      durationInFrames,
      emotion: 'reflexao',
      action,
      position: 'center',
      animation,
      assetUrl: RABISCO_ACTIONS[action],
      ...(thought.trim() ? { thought: thought.trim() } : {}),
    };

    return {
      title: 'Preview',
      watermark: null,
      voiceoverUrl: '',
      musicUrl: null,
      musicVolume: 0,
      scenes: [scene],
      captions: buildCaptions(lines, framesPerLine),
      captionStyle,
    };
  }, [action, animation, captionStyle, durationInFrames, framesPerLine, lines, thought]);

  return (
    <div className="card">
      <h2>Preview do Rabisco</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Renderiza a composição real no navegador — nada é gerado no Gemini, nem TTS, nem fila.
        Serve pra aprovar movimentação do personagem, props e estilo de legenda antes de gerar
        vídeo de verdade.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ flex: '0 0 auto' }}>
          <Player
            component={Rabisco}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            compositionWidth={1080}
            compositionHeight={1920}
            fps={FPS}
            style={{ width: 320, height: 569, borderRadius: 10, overflow: 'hidden' }}
            controls
            loop
            autoPlay
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 8, maxWidth: 320 }}>
            A última legenda sempre vira o cartão de destaque (frase de fechamento) — por isso
            duas linhas mostram os dois tratamentos.
          </p>
        </div>

        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="preview-action">Ação do personagem</label>
            <select
              id="preview-action"
              value={action}
              onChange={(event) => setAction(event.target.value as RabiscoAction)}
            >
              {(Object.keys(ACTION_LABEL) as RabiscoAction[]).map((item) => (
                <option key={item} value={item}>
                  {ACTION_LABEL[item]}
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
              Pose usada: <strong>{resolveRabiscoPose(action)}</strong>
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="preview-animation">Animação de entrada</label>
            <select
              id="preview-animation"
              value={animation}
              onChange={(event) => setAnimation(event.target.value as RabiscoAnimation)}
            >
              {(Object.keys(ANIMATION_LABEL) as RabiscoAnimation[]).map((item) => (
                <option key={item} value={item}>
                  {ANIMATION_LABEL[item]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="preview-caption-style">Estilo de legenda</label>
            <select
              id="preview-caption-style"
              value={captionStyle}
              onChange={(event) => setCaptionStyle(event.target.value as CaptionStyle)}
            >
              {(Object.keys(CAPTION_STYLE_LABEL) as CaptionStyle[]).map((item) => (
                <option key={item} value={item}>
                  {CAPTION_STYLE_LABEL[item]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="preview-captions">Legendas (uma por linha)</label>
            <textarea
              id="preview-captions"
              value={captionText}
              onChange={(event) => setCaptionText(event.target.value)}
              rows={4}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="preview-thought">Balão de pensamento (opcional)</label>
            <input
              id="preview-thought"
              type="text"
              value={thought}
              onChange={(event) => setThought(event.target.value)}
              placeholder="E se eu estiver tentando controlar tudo?"
              maxLength={120}
            />
          </div>

          <div>
            <label htmlFor="preview-seconds">Segundos por legenda</label>
            <input
              id="preview-seconds"
              type="number"
              min={1}
              max={10}
              step={1}
              value={secondsPerLine}
              onChange={(event) => setSecondsPerLine(Number(event.target.value) || 1)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
