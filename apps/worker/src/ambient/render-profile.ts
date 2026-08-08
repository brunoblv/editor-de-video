import { config } from '@editor-video/core';

export type AmbientRenderProfile = {
  format: 'youtube' | 'shorts';
  width: number;
  height: number;
  fps: number;
};

/** Perfil de render Ambient determinado pelo format (YouTube 16:9 / Shorts 9:16). */
export function getAmbientRenderProfile(
  format: 'youtube' | 'shorts' | undefined,
): AmbientRenderProfile {
  const fps = config.ambient.fps;
  if (format === 'shorts') {
    return { format: 'shorts', width: 1080, height: 1920, fps };
  }
  return {
    format: 'youtube',
    width: config.ambient.width || 1920,
    height: config.ambient.height || 1080,
    fps,
  };
}
