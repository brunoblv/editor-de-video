/**
 * Catálogo de templates V3 (Hyperframes). Cada template é um projeto
 * Hyperframes autocontido em compositions/<slug>/ cujos parâmetros são as
 * variáveis declaradas em `data-composition-variables` — a mesma declaração
 * valida a entrada do agente/da interface e alimenta `--variables-file`.
 *
 * Versões são imutáveis: alterar um template exige nova versão; revisões
 * antigas continuam apontando para a versão com que foram editadas (§8).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

export type VariableDeclaration =
  | { id: string; type: 'string'; label: string; default: string; maxLength?: number }
  | { id: string; type: 'number'; label: string; default: number; min?: number; max?: number; step?: number }
  | { id: string; type: 'color'; label: string; default: string }
  | { id: string; type: 'boolean'; label: string; default: boolean }
  | { id: string; type: 'enum'; label: string; default: string; options: Array<{ value: string; label: string }> };

export type TemplateDefinition = {
  slug: string;
  version: number;
  name: string;
  channelSlug: string | null;
  engine: 'hyperframes';
  /** Arquivos que o chamador deve fornecer, relativos ao projeto (ex.: arte do personagem). */
  requiredFiles: string[];
  defaultDurationSec: number;
};

export const TEMPLATES: TemplateDefinition[] = [
  { slug: 'midnight-title-card', version: 1, name: 'Cartão de título Midnight', channelSlug: 'midnight-relaxing-sounds', engine: 'hyperframes', requiredFiles: [], defaultDurationSec: 6 },
  { slug: 'christian-verse-card', version: 1, name: 'Versículo com referência', channelSlug: 'canal-cristao', engine: 'hyperframes', requiredFiles: [], defaultDurationSec: 8 },
  { slug: 'rabisco-scene', version: 1, name: 'Cena do Rabisco', channelSlug: 'rabisco', engine: 'hyperframes', requiredFiles: ['assets/character.png'], defaultDurationSec: 5 },
  { slug: 'arquetipo-ativacao', version: 1, name: 'Arquétipo: ativação à meia-noite', channelSlug: 'mago-da-meia-noite', engine: 'hyperframes', requiredFiles: ['assets/arquetipo.png'], defaultDurationSec: 20 },
  { slug: 'mago-reflexao', version: 1, name: 'Reflexão do blog', channelSlug: 'mago-da-meia-noite', engine: 'hyperframes', requiredFiles: [], defaultDurationSec: 15 },
];

export function getTemplate(slug: string, version?: number): TemplateDefinition {
  const t = TEMPLATES.find((x) => x.slug === slug && (version === undefined || x.version === version));
  if (!t) throw new Error(`Template ${slug}${version ? `@${version}` : ''} não existe`);
  return t;
}

export function templateDir(slug: string): string {
  return path.join(packageRoot, 'compositions', slug);
}

export function readTemplateHtml(slug: string): string {
  return fs.readFileSync(path.join(templateDir(slug), 'index.html'), 'utf8');
}

export function templateVariables(slug: string): VariableDeclaration[] {
  const html = readTemplateHtml(slug);
  const m = /data-composition-variables='([\s\S]*?)'/.exec(html);
  if (!m) return [];
  return JSON.parse(m[1]!) as VariableDeclaration[];
}

export type ParamIssue = { id: string; message: string };

/** Valida e completa parâmetros com defaults. Chaves desconhecidas são erro. */
export function validateTemplateParams(
  slug: string,
  params: Record<string, unknown>,
): { ok: true; values: Record<string, unknown> } | { ok: false; issues: ParamIssue[] } {
  const declarations = templateVariables(slug);
  const issues: ParamIssue[] = [];
  const values: Record<string, unknown> = {};
  const known = new Set(declarations.map((d) => d.id));
  for (const key of Object.keys(params)) if (!known.has(key)) issues.push({ id: key, message: 'Parâmetro não declarado pelo template' });

  for (const decl of declarations) {
    const value = params[decl.id] ?? decl.default;
    switch (decl.type) {
      case 'string':
        if (typeof value !== 'string') issues.push({ id: decl.id, message: 'Deve ser texto' });
        else if (decl.maxLength && value.length > decl.maxLength) issues.push({ id: decl.id, message: `Máximo ${decl.maxLength} caracteres` });
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) issues.push({ id: decl.id, message: 'Deve ser número' });
        else if ((decl.min !== undefined && value < decl.min) || (decl.max !== undefined && value > decl.max)) issues.push({ id: decl.id, message: `Fora do intervalo ${decl.min}–${decl.max}` });
        break;
      case 'color':
        if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) issues.push({ id: decl.id, message: 'Cor #RRGGBB' });
        break;
      case 'boolean':
        if (typeof value !== 'boolean') issues.push({ id: decl.id, message: 'Deve ser booleano' });
        break;
      case 'enum':
        if (!decl.options.some((o) => o.value === value)) issues.push({ id: decl.id, message: `Opções: ${decl.options.map((o) => o.value).join(', ')}` });
        break;
    }
    values[decl.id] = value;
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}

/** Caminho do GSAP fixado, copiado para o sandbox (render sem rede). */
export function gsapPath(): string {
  return require.resolve('gsap/dist/gsap.min.js');
}

/** Executável do Hyperframes fixado no package.json (sem `npx` baixando versões). */
export function hyperframesBin(): { node: string; script: string; version: string } {
  const pkgPath = require.resolve('hyperframes/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string; bin: Record<string, string> };
  return { node: process.execPath, script: path.join(path.dirname(pkgPath), pkg.bin.hyperframes!), version: pkg.version };
}
