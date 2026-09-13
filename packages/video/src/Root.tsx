import React from 'react';
import { Composition } from 'remotion';
import {
  christianDurationInFrames,
  curiosidadeDurationInFrames,
  rabiscoDurationInFrames,
  totalDurationInFrames,
  type ChristianProps,
  type CuriosidadeProps,
  type RabiscoProps,
  type TopListProps,
} from '@editor-video/core/render';
import { Christian } from './Christian';
import { Curiosidade } from './Curiosidade';
import { Rabisco } from './Rabisco';
import { TopList } from './TopList';

export const TOP_LIST_ID = 'TopList';
export const CURIOSIDADE_ID = 'Curiosidade';
export const CHRISTIAN_ID = 'Christian';
export const RABISCO_ID = 'Rabisco';

// Usado apenas no Remotion Studio; o worker sempre passa inputProps reais com
// URLs servidas pelo processo de render.
const defaultTopList: TopListProps = {
  title: 'Momentos constrangedores',
  watermark: '@seucanal',
  clips: [
    { src: '', rank: 3, label: 'Contexto do clipe', durationInFrames: 150 },
    { src: '', rank: 2, label: null, durationInFrames: 150 },
    { src: '', rank: 1, label: 'O melhor de todos', durationInFrames: 150 },
  ],
  captionStyle: 'minimal',
};

const defaultCuriosidade: CuriosidadeProps = {
  title: 'Buracos negros',
  watermark: '@seucanal',
  hookText: 'Eles engolem até a luz.',
  voiceoverUrl: '',
  scenes: [
    { src: '', durationInFrames: 90 },
    { src: '', durationInFrames: 120 },
    { src: '', durationInFrames: 120 },
  ],
  captions: [],
  captionStyle: 'highlight',
};

const defaultChristian: ChristianProps = {
  title: 'Versículo do Dia',
  watermark: '@seucanal',
  pillarLabel: 'Versículo do Dia',
  hookText: 'Talvez hoje você precisasse ouvir isso.',
  verse: { reference: 'Isaías 41:10', text: 'Não temas, porque eu sou contigo...' },
  reflectionText: '',
  ctaText: 'Se essa mensagem falou com você, compartilhe com alguém.',
  voiceoverUrl: '',
  musicUrl: null,
  musicVolume: 0.06,
  scenes: [
    { src: '', durationInFrames: 150 },
    { src: '', durationInFrames: 150 },
  ],
  captions: [],
  captionStyle: 'highlight',
  characterStart: {
    colorLevel: 0,
    lightLevel: 0,
    detailLevel: 0.2,
    emotion: 'sad',
    pose: 'standing',
    environment: 'dark_room',
    particles: false,
  },
  characterEnd: {
    colorLevel: 0.6,
    lightLevel: 0.7,
    detailLevel: 0.7,
    emotion: 'hopeful',
    pose: 'looking_up',
    environment: 'sunrise',
    particles: true,
  },
};

const defaultRabisco: RabiscoProps = {
  title: 'Talvez eu não precise saber',
  watermark: '@seucanal',
  voiceoverUrl: '',
  musicUrl: null,
  musicVolume: 0.06,
  scenes: [
    {
      startFrame: 0,
      durationInFrames: 90,
      emotion: 'reflexao',
      action: 'thinking',
      position: 'center',
      animation: 'fade',
      assetUrl: '',
    },
    {
      startFrame: 90,
      durationInFrames: 120,
      emotion: 'confuso',
      action: 'walking',
      position: 'left',
      animation: 'slide-left',
      thought: 'E se eu estiver tentando controlar tudo?',
      assetUrl: '',
    },
    {
      startFrame: 210,
      durationInFrames: 120,
      emotion: 'leveza',
      action: 'sky',
      position: 'center',
      animation: 'rise',
      assetUrl: '',
    },
    {
      startFrame: 330,
      durationInFrames: 100,
      emotion: 'reflexao',
      action: 'coffee',
      position: 'center',
      animation: 'fade',
      assetUrl: '',
    },
    {
      startFrame: 430,
      durationInFrames: 100,
      emotion: 'ideia',
      action: 'writing',
      position: 'center',
      animation: 'fade',
      assetUrl: '',
    },
    {
      startFrame: 530,
      durationInFrames: 100,
      emotion: 'reflexao',
      action: 'reading',
      position: 'center',
      animation: 'fade',
      assetUrl: '',
    },
    {
      startFrame: 630,
      durationInFrames: 100,
      emotion: 'ideia',
      action: 'learning',
      position: 'center',
      animation: 'fade',
      assetUrl: '',
    },
    {
      startFrame: 730,
      durationInFrames: 120,
      emotion: 'leveza',
      action: 'music',
      position: 'left',
      animation: 'slide-left',
      assetUrl: '',
    },
    {
      startFrame: 850,
      durationInFrames: 120,
      emotion: 'gratidao',
      action: 'sharing',
      position: 'right',
      animation: 'slide-right',
      assetUrl: '',
    },
  ],
  captions: [],
  captionStyle: 'handwritten',
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id={TOP_LIST_ID}
      component={TopList}
      defaultProps={defaultTopList}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={totalDurationInFrames(defaultTopList)}
      calculateMetadata={({ props }) => ({
        durationInFrames: totalDurationInFrames(props),
      })}
    />
    <Composition
      id={CURIOSIDADE_ID}
      component={Curiosidade}
      defaultProps={defaultCuriosidade}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={curiosidadeDurationInFrames(defaultCuriosidade)}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, curiosidadeDurationInFrames(props)),
      })}
    />
    <Composition
      id={CHRISTIAN_ID}
      component={Christian}
      defaultProps={defaultChristian}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={christianDurationInFrames(defaultChristian)}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, christianDurationInFrames(props)),
      })}
    />
    <Composition
      id={RABISCO_ID}
      component={Rabisco}
      defaultProps={defaultRabisco}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={rabiscoDurationInFrames(defaultRabisco)}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, rabiscoDurationInFrames(props)),
      })}
    />
  </>
);
