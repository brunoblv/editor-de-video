/**
 * Canais e formatos preservados do legado (§3), como DADOS configuráveis.
 *
 * Fonte: catálogos em packages/core (midnight/christian/rabisco), regras do
 * worker legado (apps/worker/src/christian/safety.ts, character.ts, cta.ts) e
 * docs editoriais. Nada aqui inventa canais: são os três núcleos encontrados
 * no repositório + dois formatos reutilizáveis (TOP_LIST, CURIOSIDADE).
 */
import { z } from 'zod';
import {
  LEGACY_PRESET_TO_RECIPE,
  MIDNIGHT_BRAND,
  MIDNIGHT_PIPELINE_VERSION,
  MIDNIGHT_PLAYLISTS,
  MIDNIGHT_RECIPES,
  MIDNIGHT_RECIPE_VERSION,
  MIDNIGHT_SERIES_ID,
  MIDNIGHT_TAGLINE,
  MIDNIGHT_UNIVERSES,
} from '@editor-video/core/midnight';
import { PILLARS, WEEKDAY_CATEGORIES } from '@editor-video/core/christian';
import {
  RABISCO_ACTIONS,
  RABISCO_ACTION_POSE,
  RABISCO_BASE_POSES,
  RABISCO_CHARACTER_NAME,
  RABISCO_EXPRESSIONS,
  RABISCO_TAGLINE,
} from '@editor-video/core/rabisco';

export const editorialRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** Regex (fonte) cujo match bloqueia o texto. */
  bannedPattern: z.string().optional(),
  severity: z.enum(['block', 'warn']).default('block'),
});

export const channelRulesSchema = z.object({
  tone: z.array(z.string()).default([]),
  forbidden: z.array(z.string()).default([]),
  editorialRules: z.array(editorialRuleSchema).default([]),
  /** Orientação inserida quando o tema é sensível (saúde/emocional). */
  sensitiveTopicGuidance: z.string().nullable().default(null),
  ctas: z.array(z.string()).default([]),
  /** Escritura sempre da biblioteca local; agente só reflete (§3.2). */
  scriptureFromLibraryOnly: z.boolean().default(false),
  /** Programação semanal: dia (0=domingo) → categorias priorizadas. */
  weeklySchedule: z.record(z.string(), z.array(z.string())).default({}),
  timezone: z.string().default('America/Sao_Paulo'),
});

export type ChannelRules = z.infer<typeof channelRulesSchema>;

export type SeriesSeed = {
  slug: string;
  name: string;
  /** Formato legado de origem (ProjectKind), quando houver. */
  legacyKind?: 'TOP_LIST' | 'CURIOSIDADE' | 'AMBIENT' | 'CHRISTIAN' | 'RABISCO';
  config: Record<string, unknown>;
};

export type TemplateSeed = {
  slug: string;
  name: string;
  engine: 'hyperframes' | 'ffmpeg' | 'remotion-legacy';
  /** Schema JSON dos parâmetros aceitos (validação antes de entrar na timeline). */
  paramsSchema: Record<string, unknown>;
  defaults: Record<string, unknown>;
};

export type ChannelSeed = {
  /** Slug estável: base dos IDs e do LegacyMapping. */
  slug: string;
  name: string;
  /** false = nome provisório, decisão pendente (§22). */
  nameConfirmed: boolean;
  tagline: string | null;
  languages: string[];
  legacyKinds: SeriesSeed['legacyKind'][];
  rules: ChannelRules;
  series: SeriesSeed[];
  templates: TemplateSeed[];
  brandKit: { colors: Record<string, string>; fonts: string[]; logoAssetKey: string | null };
  /** Configuração de domínio específica (receitas, pilares, personagem). */
  domain: Record<string, unknown>;
  /** Marca editorial vinculada — nunca presumida (§3). */
  linkedBrand: string | null;
};

const CHRISTIAN_BANNED: Array<{ id: string; description: string; pattern: string }> = [
  { id: 'cure-by-prayer', description: 'Não prometer cura pela oração', pattern: 'ore\\s+e\\s+voc[eê]\\s+ser[aá]\\s+curad[oa]' },
  { id: 'faith-cures', description: 'Não afirmar que a fé cura literalmente', pattern: 'a\\s+f[eé]\\s+(vai\\s+)?te\\s+cura(r|rá)' },
  { id: 'suffering-no-faith', description: 'Não culpar sofrimento por falta de fé', pattern: 'voc[eê]\\s+est[aá]\\s+sofrendo\\s+porque\\s+n[aã]o\\s+tem\\s+f[eé]' },
  { id: 'stop-medicine', description: 'Nunca desencorajar medicação', pattern: 'pare\\s+de\\s+tomar\\s+(o\\s+)?rem[eé]dio' },
  { id: 'no-doctor', description: 'Nunca desencorajar tratamento médico', pattern: 'n[aã]o\\s+precisa\\s+(de\\s+)?m[eé]dico' },
  { id: 'god-punish', description: 'Sem ameaça de castigo divino', pattern: 'deus\\s+vai\\s+te\\s+castigar' },
  { id: 'god-abandon', description: 'Sem ameaça de abandono divino', pattern: 'deus\\s+vai\\s+te\\s+abandonar' },
];

const CHRISTIAN_ARCS = [
  { name: 'Descoberta', episodes: 10, baseColor: 0.0, baseLight: 0.05 },
  { name: 'Acolhimento', episodes: 10, baseColor: 0.15, baseLight: 0.2 },
  { name: 'Esperança', episodes: 10, baseColor: 0.35, baseLight: 0.4 },
  { name: 'Transformação', episodes: 10, baseColor: 0.55, baseLight: 0.6 },
  { name: 'Propósito', episodes: 10, baseColor: 0.75, baseLight: 0.8 },
];

const CHRISTIAN_CTAS = [
  'Se essa mensagem tocou seu coração, deixe seu like, inscreva-se no canal e compartilhe com alguém que precisa ouvir isso agora.',
  'Se essa palavra fez sentido para você, se inscreva, deixe o like e mande esse vídeo para quem precisa ouvir hoje.',
  'Inscreva-se para receber uma mensagem como essa todos os dias, deixe seu like e envie para alguém que precisa.',
  'Deixe seu like, siga o canal e compartilhe com alguém que está precisando dessa palavra agora.',
];

const textParams = {
  type: 'object',
  properties: { title: { type: 'string', maxLength: 120 }, subtitle: { type: 'string', maxLength: 200 } },
  additionalProperties: false,
};

export function buildChannelSeeds(): ChannelSeed[] {
  const midnight: ChannelSeed = {
    slug: 'midnight-relaxing-sounds',
    name: MIDNIGHT_BRAND,
    nameConfirmed: true,
    tagline: MIDNIGHT_TAGLINE,
    languages: ['en'],
    legacyKinds: ['AMBIENT'],
    rules: channelRulesSchema.parse({
      tone: ['calmo', 'discreto', 'sem narração'],
      forbidden: ['cortes bruscos', 'flashes', 'texto excessivo'],
    }),
    series: [
      {
        slug: 'midnight-series',
        name: 'Midnight Series',
        legacyKind: 'AMBIENT',
        config: {
          legacySeriesId: MIDNIGHT_SERIES_ID,
          // Presets editoriais do canal (§3.1), não limites de plataforma.
          durationPresetsMin: { sleep: [360, 600], cozy: [60, 180], focus: [60, 180], short: [0.25, 0.5] },
          noSpeech: true,
        },
      },
      { slug: 'midnight-shorts', name: 'Midnight Shorts', legacyKind: 'AMBIENT', config: { durationSec: [15, 30], aspect: '9:16', derivedFrom: 'midnight-series' } },
    ],
    templates: [
      {
        slug: 'ambient-loop-segment',
        name: 'Segmento Ambient em loop',
        engine: 'ffmpeg',
        paramsSchema: {
          type: 'object',
          properties: {
            recipeId: { type: 'string' },
            variationId: { type: 'string' },
            seed: { type: 'integer' },
            segmentSec: { type: 'integer', minimum: 10, maximum: 3600 },
            crossfadeSec: { type: 'number', minimum: 0, maximum: 30 },
          },
          required: ['recipeId', 'seed'],
        },
        defaults: { segmentSec: 600, crossfadeSec: 8 },
      },
      { slug: 'midnight-title-card', name: 'Cartão de título Midnight', engine: 'hyperframes', paramsSchema: textParams, defaults: {} },
    ],
    brandKit: { colors: { background: '#0B1020', accent: '#C9B37E', text: '#F2EFE6' }, fonts: ['Cormorant Garamond', 'Inter'], logoAssetKey: null },
    domain: {
      pipelineVersion: MIDNIGHT_PIPELINE_VERSION,
      recipeVersion: MIDNIGHT_RECIPE_VERSION,
      universes: MIDNIGHT_UNIVERSES,
      playlists: MIDNIGHT_PLAYLISTS,
      recipeIds: MIDNIGHT_RECIPES.map((r) => r.id),
      legacyPresetToRecipe: LEGACY_PRESET_TO_RECIPE,
      loudnessProfile: 'ambient',
    },
    linkedBrand: null,
  };

  const christian: ChannelSeed = {
    slug: 'canal-cristao',
    // Nome comercial definitivo pendente (§22).
    name: 'Canal Cristão',
    nameConfirmed: false,
    tagline: null,
    languages: ['pt-BR'],
    legacyKinds: ['CHRISTIAN'],
    rules: channelRulesSchema.parse({
      tone: ['acolhedor', 'esperançoso', 'ótica religiosa'],
      forbidden: ['diagnosticar', 'recomendar medicamentos', 'desencorajar tratamento profissional', 'inventar escritura'],
      editorialRules: CHRISTIAN_BANNED.map((r) => ({ id: r.id, description: r.description, bannedPattern: r.pattern, severity: 'block' })),
      sensitiveTopicGuidance:
        'Se você está passando por uma situação de saúde, procure também ajuda profissional. A fé pode caminhar junto com o cuidado médico.',
      ctas: CHRISTIAN_CTAS,
      scriptureFromLibraryOnly: true,
      weeklySchedule: Object.fromEntries(Object.entries(WEEKDAY_CATEGORIES).map(([d, c]) => [d, c])),
    }),
    series: [
      {
        slug: 'the-journey',
        name: 'The Journey',
        legacyKind: 'CHRISTIAN',
        config: { arcs: CHRISTIAN_ARCS, captionStyles: ['minimal', 'highlight', 'handwritten'] },
      },
    ],
    templates: [
      {
        slug: 'christian-verse-card',
        name: 'Versículo com referência',
        engine: 'hyperframes',
        paramsSchema: {
          type: 'object',
          properties: {
            verseId: { type: 'string' },
            reference: { type: 'string' },
            translation: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['verseId', 'reference', 'translation', 'text'],
        },
        defaults: {},
      },
      {
        slug: 'christian-character-scene',
        name: 'Cena do personagem com progressão',
        engine: 'hyperframes',
        paramsSchema: {
          type: 'object',
          properties: {
            colorLevel: { type: 'number', minimum: 0, maximum: 1 },
            lightLevel: { type: 'number', minimum: 0, maximum: 1 },
            emotion: { type: 'string' },
            pose: { type: 'string' },
          },
        },
        defaults: {},
      },
    ],
    brandKit: { colors: { background: '#120E0A', accent: '#E8B65A', text: '#FFF8EC' }, fonts: ['Lora', 'Inter'], logoAssetKey: null },
    domain: {
      pillars: PILLARS,
      characterArcs: CHRISTIAN_ARCS,
      bibleTranslationDefault: 'ARC',
      loudnessProfile: 'speech',
    },
    linkedBrand: null,
  };

  const rabisco: ChannelSeed = {
    slug: 'rabisco',
    name: RABISCO_CHARACTER_NAME,
    nameConfirmed: true,
    tagline: RABISCO_TAGLINE,
    languages: ['pt-BR'],
    legacyKinds: ['RABISCO'],
    rules: channelRulesSchema.parse({
      tone: ['pensamento íntimo', 'vulnerável', 'questionador', 'final aberto'],
      forbidden: ['frases motivacionais genéricas', 'tom de coach', 'clichês', 'excesso de positividade', 'conclusões definitivas', 'pregação automática'],
    }),
    series: [
      {
        slug: 'pensamentos',
        name: 'Pensamentos do Rabisco',
        legacyKind: 'RABISCO',
        config: { structure: ['GANCHO', 'SITUAÇÃO/SENTIMENTO', 'CONFLITO INTERNO', 'QUESTIONAMENTO', 'PEQUENA PERCEPÇÃO', 'FINAL ABERTO'], durationPresets: ['SHORT'] },
      },
    ],
    templates: [
      {
        slug: 'rabisco-scene',
        name: 'Cena do Rabisco',
        engine: 'hyperframes',
        paramsSchema: {
          type: 'object',
          properties: {
            action: { enum: Object.keys(RABISCO_ACTIONS) },
            emotion: { enum: Object.keys(RABISCO_EXPRESSIONS) },
            position: { enum: ['center', 'left', 'right', 'bottom'] },
            animation: { enum: ['fade', 'slide-left', 'slide-right', 'rise', 'float', 'zoom'] },
            thought: { type: 'string', maxLength: 240 },
          },
          required: ['action', 'emotion'],
        },
        defaults: { position: 'center', animation: 'fade' },
      },
    ],
    brandKit: { colors: { background: '#FAF7F0', ink: '#1E1E1E', accent: '#F2C14E' }, fonts: ['Patrick Hand', 'Inter'], logoAssetKey: null },
    domain: {
      character: {
        name: RABISCO_CHARACTER_NAME,
        basePoses: RABISCO_BASE_POSES,
        actionPose: RABISCO_ACTION_POSE,
        actionAssets: RABISCO_ACTIONS,
        expressionAssets: RABISCO_EXPRESSIONS,
        // §3.3: caminhos declarados não são arte final validada.
        assetsVerified: false,
      },
      loudnessProfile: 'speech',
    },
    // §3: não presumir vínculo com outra marca.
    linkedBrand: null,
  };

  return [midnight, christian, rabisco];
}

/**
 * Canais criados a pedido do dono, fora do legado: ficam de fora do plano de
 * migração. Tom, regras e identidade visual são preenchidos em Canais.
 */
export function buildAdditionalChannelSeeds(): ChannelSeed[] {
  return [
    {
      slug: 'mago-da-meia-noite',
      name: 'Mago da Meia-Noite',
      nameConfirmed: true,
      tagline: null,
      languages: ['pt-BR'],
      legacyKinds: [],
      rules: channelRulesSchema.parse({}),
      series: [
        {
          slug: 'arquetipos',
          name: 'Arquétipos',
          config: {
            structure: ['NOITE: nome e epíteto', 'ATIVAÇÃO À MEIA-NOITE', 'TRÊS DÁDIVAS: o que pode trazer ao ativar', 'EM TROCA, PEDE'],
            // "Pode trazer": a peça convida, não garante resultado.
            guidance: 'Fale do que o arquétipo pode trazer, sem prometer resultado garantido.',
            template: 'arquetipo-ativacao',
            aspect: '9:16',
            durationSec: 20,
          },
        },
      ],
      templates: [
        {
          slug: 'arquetipo-ativacao',
          name: 'Arquétipo: ativação à meia-noite',
          engine: 'hyperframes',
          paramsSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', maxLength: 28 },
              epithet: { type: 'string', maxLength: 60 },
              gift1Title: { type: 'string', maxLength: 28 },
              gift1Text: { type: 'string', maxLength: 90 },
              gift2Title: { type: 'string', maxLength: 28 },
              gift2Text: { type: 'string', maxLength: 90 },
              gift3Title: { type: 'string', maxLength: 28 },
              gift3Text: { type: 'string', maxLength: 90 },
              asks: { type: 'string', maxLength: 90 },
            },
            required: ['name', 'gift1Title', 'gift2Title', 'gift3Title'],
          },
          defaults: {},
        },
        {
          slug: 'mago-reflexao',
          name: 'Reflexão do blog',
          engine: 'hyperframes',
          paramsSchema: {
            type: 'object',
            properties: {
              eyebrow: { type: 'string', maxLength: 40 },
              title: { type: 'string', maxLength: 90 },
              quote: { type: 'string', maxLength: 240 },
              closing: { type: 'string', maxLength: 60 },
            },
            required: ['title', 'quote'],
          },
          defaults: {},
        },
      ],
      brandKit: { colors: {}, fonts: [], logoAssetKey: null },
      domain: {},
      // §3: não presumir vínculo com Rabisco nem com Midnight.
      linkedBrand: null,
    },
  ];
}

/** Formatos reutilizáveis entre canais (§3): não pertencem a um canal. */
export const REUSABLE_FORMATS = [
  {
    slug: 'top-list',
    name: 'Top List',
    legacyKind: 'TOP_LIST' as const,
    config: { ranking: 'reverse', fields: ['order', 'rank', 'label', 'clip', 'transcript'] },
  },
  {
    slug: 'curiosidade',
    name: 'Curiosidade',
    legacyKind: 'CURIOSIDADE' as const,
    config: { fields: ['topic', 'script', 'narration', 'media', 'attributions', 'captions'] },
  },
];

export type RuleViolation = { ruleId: string; description: string; severity: 'block' | 'warn' };

/** Aplica as regras editoriais do canal a um texto (roteiro, legenda, descrição). */
export function checkEditorialRules(rules: ChannelRules, text: string): { passed: boolean; violations: RuleViolation[] } {
  const violations: RuleViolation[] = [];
  for (const rule of rules.editorialRules) {
    if (!rule.bannedPattern) continue;
    if (new RegExp(rule.bannedPattern, 'i').test(text)) {
      violations.push({ ruleId: rule.id, description: rule.description, severity: rule.severity });
    }
  }
  return { passed: !violations.some((v) => v.severity === 'block'), violations };
}
