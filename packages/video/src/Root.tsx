import React from 'react';
import { Composition } from 'remotion';
import {
  curiosidadeDurationInFrames,
  totalDurationInFrames,
  type CuriosidadeProps,
  type TopListProps,
} from '@editor-video/core/render';
import { Curiosidade } from './Curiosidade';
import { TopList } from './TopList';

export const TOP_LIST_ID = 'TopList';
export const CURIOSIDADE_ID = 'Curiosidade';

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
  </>
);
