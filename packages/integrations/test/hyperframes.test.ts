/**
 * Integração real com Hyperframes (versão fixada em @editor-video/templates).
 * Pule com SKIP_HYPERFRAMES=1 em máquinas sem Chrome/recursos.
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { validateTemplateParams } from '@editor-video/templates';
import { inspectMedia, materializeComposition, renderComposition } from '../src/index.js';

const skip = process.env.SKIP_HYPERFRAMES === '1';

describe('templates Hyperframes', () => {
  it('valida parâmetros pelas variáveis declaradas', () => {
    assert.ok(validateTemplateParams('christian-verse-card', { reference: 'João 3:16' }).ok);
    const bad = validateTemplateParams('christian-verse-card', { lightLevel: 3, inventado: 'x' });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.deepEqual(bad.issues.map((i) => i.id).sort(), ['inventado', 'lightLevel']);
    assert.equal(validateTemplateParams('rabisco-scene', { animation: 'explode' }).ok, false);
    assert.ok(validateTemplateParams('arquetipo-ativacao', { name: 'A Feiticeira', gift1Title: 'Intuição' }).ok);
    assert.equal(validateTemplateParams('arquetipo-ativacao', { name: 'x'.repeat(29) }).ok, false);
  });

  it('materializa sandbox com GSAP local e exige arquivos declarados', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-hf-'));
    const { projectDir } = await materializeComposition({ templateSlug: 'midnight-title-card', templateVersion: 1, params: {}, width: 1080, height: 1920, durationSec: 3, workDir: dir });
    const html = await fsp.readFile(path.join(projectDir, 'index.html'), 'utf8');
    assert.match(html, /data-width="1080"/);
    assert.doesNotMatch(html, /__WIDTH__|cdn\.jsdelivr/);
    await fsp.access(path.join(projectDir, 'vendor', 'gsap.min.js'));
    await assert.rejects(
      materializeComposition({ templateSlug: 'rabisco-scene', templateVersion: 1, params: {}, width: 1080, height: 1920, durationSec: 3, workDir: dir }),
      /exige o arquivo assets\/character\.png/,
    );
    await assert.rejects(
      materializeComposition({ templateSlug: 'arquetipo-ativacao', templateVersion: 1, params: {}, width: 1080, height: 1920, durationSec: 20, workDir: dir }),
      /exige o arquivo assets\/arquetipo\.png/,
    );
  });

  it('renderiza MP4 real do cartão de versículo', { skip }, async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-hf-'));
    const out = path.join(dir, 'verse.mp4');
    const result = await renderComposition({
      templateSlug: 'christian-verse-card',
      templateVersion: 1,
      params: { text: 'Tudo posso naquele que me fortalece.', reference: 'Filipenses 4:13', translation: 'ARC' },
      width: 720,
      height: 1280,
      durationSec: 3,
      quality: 'preview',
      workDir: dir,
      outputPath: out,
      timeoutMs: 8 * 60_000,
    });
    const info = await inspectMedia(result.outputPath);
    assert.equal(info.video?.displayWidth, 720);
    assert.equal(info.video?.displayHeight, 1280);
    assert.ok(Math.abs((info.durationSec ?? 0) - 3) < 0.2, `duração ${info.durationSec}`);
    assert.equal(result.hyperframesVersion, '0.8.190');
  });
});
