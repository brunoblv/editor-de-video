/**
 * Adaptador Hyperframes (§15): encapsula a versão fixada e o formato de
 * projeto do fornecedor. O domínio só vê "template + parâmetros → MP4".
 *
 * Isolamento (§9): cada render roda num diretório próprio, com cópia do
 * template, GSAP local, variáveis em arquivo, ambiente mínimo (sem tokens)
 * e timeout. Arquivos externos só entram pela lista explícita `files`.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  getTemplate,
  gsapPath,
  hyperframesBin,
  templateDir,
  validateTemplateParams,
} from '@editor-video/templates';
import { minimalEnv, runProcess } from './process.js';

export type CompositionRenderInput = {
  templateSlug: string;
  templateVersion: number;
  params: Record<string, unknown>;
  width: number;
  height: number;
  durationSec: number;
  quality: 'preview' | 'final';
  /** Diretório de trabalho exclusivo desta composição/tentativa. */
  workDir: string;
  outputPath: string;
  /** Arquivos a copiar para o sandbox: caminho relativo no projeto → caminho absoluto. */
  files?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type CompositionRenderResult = {
  outputPath: string;
  hyperframesVersion: string;
  variables: Record<string, unknown>;
};

function assertInside(root: string, rel: string): string {
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`Caminho fora do sandbox: ${rel}`);
  return full;
}

/** Monta o projeto Hyperframes no sandbox, sem renderizar (útil para prévia no Studio). */
export async function materializeComposition(input: Omit<CompositionRenderInput, 'outputPath' | 'quality'>): Promise<{ projectDir: string; variables: Record<string, unknown> }> {
  const template = getTemplate(input.templateSlug, input.templateVersion);
  const validation = validateTemplateParams(template.slug, input.params);
  if (!validation.ok) {
    throw new Error(`Parâmetros inválidos para ${template.slug}: ${validation.issues.map((i) => `${i.id}: ${i.message}`).join('; ')}`);
  }
  for (const required of template.requiredFiles) {
    if (!input.files?.[required]) throw new Error(`Template ${template.slug} exige o arquivo ${required}`);
  }
  const projectDir = path.join(input.workDir, 'project');
  await fsp.rm(projectDir, { recursive: true, force: true });
  await fsp.cp(templateDir(template.slug), projectDir, { recursive: true });

  const indexPath = path.join(projectDir, 'index.html');
  const html = (await fsp.readFile(indexPath, 'utf8'))
    .replaceAll('__WIDTH__', String(input.width))
    .replaceAll('__HEIGHT__', String(input.height))
    .replaceAll('__DURATION__', String(Math.round(input.durationSec * 1000) / 1000));
  await fsp.writeFile(indexPath, html, 'utf8');

  await fsp.mkdir(path.join(projectDir, 'vendor'), { recursive: true });
  await fsp.copyFile(gsapPath(), path.join(projectDir, 'vendor', 'gsap.min.js'));
  for (const [rel, abs] of Object.entries(input.files ?? {})) {
    const dest = assertInside(projectDir, rel);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.copyFile(abs, dest);
  }
  await fsp.writeFile(path.join(projectDir, 'variables.json'), JSON.stringify(validation.values, null, 2), 'utf8');
  return { projectDir, variables: validation.values };
}

export async function renderComposition(input: CompositionRenderInput): Promise<CompositionRenderResult> {
  const { projectDir, variables } = await materializeComposition(input);
  const bin = hyperframesBin();
  const out = path.resolve(input.outputPath);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const part = `${out}.part.mp4`;
  try {
    await runProcess(
      bin.node,
      [
        bin.script,
        'render',
        '--quality', input.quality === 'final' ? 'delivery' : 'draft',
        '--variables-file', 'variables.json',
        '--strict-variables',
        '--output', part,
      ],
      {
        cwd: projectDir,
        signal: input.signal,
        timeoutMs: input.timeoutMs ?? 10 * 60_000,
        env: minimalEnv({ HYPERFRAMES_TELEMETRY: '0', DO_NOT_TRACK: '1', CI: '1' }),
      },
    );
    await fsp.rename(part, out);
  } catch (err) {
    await fsp.rm(part, { force: true });
    throw err;
  }
  return { outputPath: out, hyperframesVersion: bin.version, variables };
}
