import React from 'react';
import { Composition } from 'remotion';
import {
  christianDurationInFrames,
  curiosidadeDurationInFrames,
  totalDurationInFrames,
  type ChristianProps,
  type CuriosidadeProps,
  type TopListProps,
} from '@editor-video/core/render';
import { Christian } from './Christian';
import { Curiosidade } from './Curiosidade';
import { TopList } from './TopList';

export const TOP_LIST_ID = 'TopList';
export const CURIOSIDADE_ID = 'Curiosidade';
export const CHRISTIAN_ID = 'Christian';

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
  scenes: [
    { src: '', durationInFrames: 150 },
    { src: '', durationInFrames: 150 },
  ],
  captions: [],
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
  </>
);
