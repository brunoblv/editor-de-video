# RABISCO — Especificação Técnica de Implementação

> Este documento traduz a especificação de produto do personagem **Rabisco**
> (canal de pensamentos/desabafos/filosofia/espiritualidade) para mudanças
> concretas neste repositório. Ele assume que o leitor já conhece a arquitetura
> geral (`docs/video-automation-v2-especificacao.md`) e usa o pipeline
> **Christian** (`docs/Cristão/projeto.md`) como referência direta, por ser o
> mais próximo arquiteturalmente: LLM escreve um texto → TTS narra → template
> Remotion renderiza sobre imagens/vídeo de fundo → Whisper/Gemini gera
> legendas → QA → `READY_FOR_REVIEW`.
>
> Convenção deste doc: cada seção tem **O que muda**, **Arquivos** (existentes
> a editar / novos a criar) e, quando relevante, **Por quê** ligando à decisão
> de produto original.

---

## 0. Decisões de arquitetura (antes de tudo)

1. **Personagem ≠ estilo.** `RABISCO` é um `ProjectKind` (o pipeline/produto).
   O personagem em si (assets, biblioteca de expressões/ações) vive em
   `packages/core` e `apps/web/public` como uma biblioteca reutilizável,
   desacoplada do pipeline — para permitir, no futuro, "Rabisco Fé",
   "Rabisco Filosofia" etc. como variações do mesmo `kind` (via um campo
   `style`/`mood`), sem precisar de um mascote novo.
2. **Sem geração de imagem por IA no MVP.** O personagem é uma biblioteca de
   PNGs estáticos com fundo transparente, versionada no repo
   (`apps/web/public/characters/rabisco/**`). O LLM só **escolhe** entre
   assets existentes (expressão + ação + posição + animação), nunca gera
   arte nova. Isso é o oposto do padrão já existente para vídeo de fundo
   (Christian/Curiosidade buscam banco de imagens externo) — aqui é uma
   biblioteca local fechada, mais parecida com o padrão de `BibleVerse`
   (nunca deixar o LLM gerar o "canônico", só escolher/compor a partir de
   uma fonte local confiável).
3. **Gemini, não Ollama.** A spec de produto pede Ollama, mas **nenhum
   pipeline hoje usa Ollama** — Christian e Curiosidade chamam a API do
   Gemini diretamente (`apps/worker/src/christian/gemini.ts`) com
   `responseSchema` (structured output). Ollama nunca foi de fato conectado,
   apesar de citado em `docs/video-automation-v2-especificacao.md` §44.
   **Recomendação: Rabisco segue o padrão real (Gemini + responseSchema)**,
   não o padrão do documento antigo. Se o usuário insistir em Ollama local,
   isso é um projeto à parte (adicionar o primeiro client Ollama do repo) e
   deve ser tratado como uma fase 2, não bloqueando o MVP.
4. **Remotion, como Christian.** Ambient é o único pipeline que renderiza via
   FFmpeg puro; Christian/Curiosidade/TopList usam Remotion. Rabisco entra
   como a 4ª composição Remotion.
5. **`CharacterState` do Christian é código morto** — nunca é renderizado
   (`CharacterScene.tsx` não é importado por `Christian.tsx`). Não copiar
   esse padrão (estado numérico interpolado sem visual real). Rabisco define
   assets discretos por cena (`RabiscoScene[]`), renderizados de fato.

---

## 1. Schema (Prisma)

**Arquivo:** `packages/db/prisma/schema.prisma`

### 1.1 `ProjectKind`

```prisma
enum ProjectKind {
  TOP_LIST
  CURIOSIDADE
  AMBIENT
  CHRISTIAN
  RABISCO
}
```

### 1.2 Campos no `Project`

Seguindo a convenção observada (campos nomeados e tipados para o que é
consultável; `xxxJson` só para o resultado estruturado do LLM/algoritmo):

```prisma
model Project {
  // ...campos existentes...

  /// --- Rabisco ---
  /// Pensamento/desabafo original digitado pelo usuário (input bruto)
  rabiscoThought String?
  /// Roteiro gerado pelo LLM (hook/body/payoff/cta/narration) — mesmo papel de scriptJson do Christian
  rabiscoScriptJson Json?
  /// Sequência de cenas do personagem (emotion/action/position/animation/thought por trecho)
  characterScenesJson Json?
  /// Preset de duração alvo: SHORT (único suportado no MVP) | MEDIUM | LONG
  durationPreset String? @default("SHORT")
  /// Versão do prompt usado nesta geração (ver §5) — auditoria/A-B futura
  rabiscoPromptVersion String?
}
```

Não reaproveitar `scriptJson`/`characterStateJson`/`topic` do Christian — são
campos com semântica e schema próprios de outro pipeline; mesmo que o Prisma
não impeça, misturar shapes diferentes no mesmo campo quebra a garantia de
"coluna = um shape". `rabiscoThought` é o análogo do `topic` da Curiosidade
(input livre do usuário); `rabiscoScriptJson` é o análogo do `scriptJson` da
Curiosidade/`voiceScriptJson`+conteúdo do Christian, mas com nome próprio.

Índices: seguir o padrão (`@@index([kind])` já cobre consultas por pipeline;
não é necessário indexar os campos novos, nenhum deles é usado em filtro
frequente — mesmo critério do Christian, cujos campos `Json?` não são
indexados).

### 1.3 Migration

```bash
cd packages/db
npx prisma migrate dev --name add_rabisco_project_kind
```

Rodar localmente e commitar a migration gerada; não editar
`schema.prisma` sem gerar a migration correspondente (mesmo fluxo usado nas
migrations anteriores de Christian/Ambient).

---

## 2. Tipos compartilhados (`packages/core`)

**Arquivo:** `packages/core/src/types.ts` (mesmo arquivo que define
`ChristianProps`/`ChristianScene`/`CaptionSegment` — deve continuar
"browser-safe", sem imports de Node, pois é consumido tanto pelo worker
quanto pela composição Remotion no browser).

```ts
export type RabiscoEmotion =
  | 'leveza'
  | 'reflexao'
  | 'desabafo'
  | 'ideia'
  | 'gratidao'
  | 'confuso'
  | 'surpresa';

export type RabiscoAction =
  | 'thinking'
  | 'writing'
  | 'reading'
  | 'walking'
  | 'coffee'
  | 'music'
  | 'sky'
  | 'sitting'
  | 'sharing'
  | 'learning';

export type RabiscoPosition = 'center' | 'left' | 'right' | 'bottom';

export type RabiscoAnimation =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'rise'
  | 'float'
  | 'zoom';

export type RabiscoScene = {
  startFrame: number;
  durationInFrames: number;
  emotion: RabiscoEmotion;
  action: RabiscoAction;
  position: RabiscoPosition;
  animation: RabiscoAnimation;
  /** Pensamento visual curto (ex: "E se?"). Sem isso, nenhum balão é exibido. */
  thought?: string;
};

export type RabiscoProps = {
  title: string;
  watermark: string | null;
  voiceoverUrl: string;
  musicUrl: string | null;
  musicVolume: number;
  scenes: RabiscoScene[];
  captions: CaptionSegment[];
};

export function rabiscoDurationInFrames(props: RabiscoProps): number {
  return props.scenes.reduce(
    (acc, scene) => Math.max(acc, scene.startFrame + scene.durationInFrames),
    0,
  );
}
```

Nota: diferente de `ChristianScene` (cenas sequenciais de vídeo de fundo, sem
gaps), `RabiscoScene` usa `startFrame` explícito porque cenas do personagem
podem ter overlap zero mas não precisam cobrir 100% da timeline sem gap —
o fundo (papel) é estático e sempre visível, então não há necessidade de
"cursor contínuo" como no Christian. `rabiscoDurationInFrames` usa `max`, não
`reduce+soma`, por isso.

### 2.1 Biblioteca de assets — registro central

**Novo arquivo:** `packages/core/src/rabisco.ts` (mesmo papel de
`packages/core/src/christian.ts`: dados estáticos, sem I/O, importável tanto
pelo worker quanto pelo client Next.js via subpath `@editor-video/core/rabisco`).

```ts
export const RABISCO_CHARACTER_NAME = 'Rabisco';
export const RABISCO_TAGLINE = 'Pensador por natureza. Falante por necessidade.';

const BASE = '/characters/rabisco';

export const RABISCO_EXPRESSIONS: Record<RabiscoEmotion, string> = {
  leveza: `${BASE}/expressions/leveza.png`,
  reflexao: `${BASE}/expressions/reflexao.png`,
  desabafo: `${BASE}/expressions/desabafo.png`,
  ideia: `${BASE}/expressions/ideia.png`,
  gratidao: `${BASE}/expressions/gratidao.png`,
  confuso: `${BASE}/expressions/confuso.png`,
  surpresa: `${BASE}/expressions/surpresa.png`,
};

export const RABISCO_ACTIONS: Record<RabiscoAction, string> = {
  thinking: `${BASE}/actions/thinking.png`,
  writing: `${BASE}/actions/writing.png`,
  reading: `${BASE}/actions/reading.png`,
  coffee: `${BASE}/actions/coffee.png`,
  walking: `${BASE}/actions/walking.png`,
  music: `${BASE}/actions/music.png`,
  sky: `${BASE}/actions/sky.png`,
  sitting: `${BASE}/actions/sitting.png`,
  sharing: `${BASE}/actions/sharing.png`,
  learning: `${BASE}/actions/learning.png`,
};

/** MVP: cada cena usa apenas o asset de `action` (já expressivo o bastante).
 *  `RABISCO_EXPRESSIONS` fica reservado para uma 2ª camada de composição
 *  (expressão sobreposta à pose) quando houver assets suficientes. */
export function resolveRabiscoAsset(action: RabiscoAction): string {
  return RABISCO_ACTIONS[action];
}
```

**Por quê `Record` exaustivo por union type, não um objeto solto:** garante em
tempo de compilação que todo `RabiscoAction`/`RabiscoEmotion` novo obriga a
adicionar o asset correspondente — não há como esquecer um caminho e só
descobrir em render. Resolve diretamente o requisito nº 26 da spec ("o código
nunca deve espalhar caminhos de arquivos pelo projeto").

**Path dos assets:** servidos como estáticos do Next
(`apps/web/public/characters/rabisco/...`), **não** de
`assets/characters/rabisco/` na raiz do repo como a spec sugere — porque o
worker precisa servir esses arquivos via HTTP para o Remotion renderizar
(mesmo mecanismo do `voiceoverUrl`: `apps/worker/src/static-server.ts` +
`assets.baseUrl`), e o jeito mais simples de conseguir isso sem duplicar
lógica de storage é reaproveitar o Next `public/` + copiar/servir a mesma
pasta a partir do worker. Ver §6.3.

---

## 3. Assets do personagem — MVP

Conforme a recomendação de produto (começar pequeno): **7 ações, sem camada
de expressão separada no MVP** (a ação já carrega a expressão — ex.:
`sitting.png` já desenha o Rabisco sentado com uma cara de desabafo).
Isso simplifica o v1 de 17 combinações teóricas (7 ações × 7 expressões via
composição de camadas) para 10 PNGs finais (um por ação), adiando o sistema
de camadas (expressão desenhada por cima da pose) para a v2 quando houver
mais assets prontos.

```
apps/web/public/characters/rabisco/
├── base/
│   └── rabisco-base.png        (referência de design, não usada em render)
└── actions/
    ├── thinking.png
    ├── writing.png
    ├── reading.png
    ├── coffee.png
    ├── walking.png
    ├── music.png
    ├── sky.png
    ├── sitting.png
    ├── sharing.png
    └── learning.png
```

Requisitos técnicos de cada PNG (para renderizar bem em 1080×1920 a qualquer
`scale`): fundo transparente, personagem centralizado no canvas com margem
segura, resolução mínima recomendada 1200×1600px (o Remotion faz downscale,
nunca upscale sem perda).

**Quem produz os PNGs não é o Claude Code** — são assets de arte fornecidos
pelo usuário (a imagem de referência já enviada define o estilo). O código
só precisa que os arquivos existam nesses caminhos exatos antes do primeiro
render funcionar ponta a ponta.

---

## 4. Worker — pipeline

**Novo diretório:** `apps/worker/src/rabisco/` (espelha
`apps/worker/src/christian/`).

```
apps/worker/src/rabisco/
├── pipeline.ts        # runRabiscoPipeline(projectId) — orquestra os estágios
├── gemini.ts          # generateReflection({thought}) → chama Gemini
├── director.ts        # divide a narração em RabiscoScene[] (emotion/action/thought por trecho)
└── prompts/
    └── content.ts      # buildContentPrompt() + contentResponseSchema() + RABISCO_PROMPT_VERSION
```

### 4.1 Registro no worker

**Arquivo:** `apps/worker/src/index.ts` — adicionar mais um branch ao
dispatch por `kind` (mesmo formato dos existentes):

```ts
else if (project.kind === ProjectKind.RABISCO) await runRabiscoPipeline(projectId);
```

### 4.2 Estágios do `runRabiscoPipeline`

Segue o mesmo esqueleto do Christian (`apps/worker/src/christian/pipeline.ts`),
com `setProgress(projectId, pct, label)` em cada etapa:

1. **Validação de input** (2%): `project.rabiscoThought` obrigatório (texto
   do usuário). Sem seleção de "pilar" — não há categoria fixa, o LLM
   trabalha só a partir do pensamento livre.
2. **Roteiro via Gemini** (10%, "Escrevendo a reflexão"):
   `generateReflection({ thought })` em `rabisco/gemini.ts`, usando
   `buildContentPrompt()`/`contentResponseSchema()` de
   `rabisco/prompts/content.ts` (ver §5). Retorna hook/body/payoff/cta/
   narration completos + `durationTargetSec`.
3. **Direção de cena** (20%, "Dirigindo o Rabisco"): `directScenes(narration)`
   em `rabisco/director.ts` — segmenta a narração em blocos e, para cada
   bloco, escolhe `emotion` + `action` + `position` + `animation` + `thought?`
   opcional. **Duas opções de implementação, escolher uma:**
   - (a) Uma 2ª chamada de LLM (Gemini) com `responseSchema` retornando
     `CharacterScene[]` diretamente, dado o texto da narração já segmentado
     por frase/pausa (mais fiel ao §8/§28 da spec, "o LLM escolhe";
     mais previsível de testar/validar contra o schema).
   - (b) Pedir ao Gemini para retornar `characterScenes` **na mesma chamada**
     do roteiro (um único `responseSchema` com os dois blocos), reduzindo
     custo/latência para metade das chamadas de LLM.
   **Recomendação: (b) para o MVP** — mesma filosofia de "uma chamada faz
   tudo" que o Christian já usa (`content.ts` retorna hook+script+reflection+
   cta+metadata num único schema). Divisão em chamada separada só se, na
   prática, o modelo não conseguir manter roteiro e cenas coerentes num
   único JSON grande.
4. **Persistência**: salva `rabiscoScriptJson`, `characterScenesJson`,
   `title`, `rabiscoPromptVersion` no `Project`.
5. **TTS** (50%, "Gerando narração"): reaproveitar 100%
   `voice/director.ts` + `voice/synth.ts` (Piper/Gemini TTS) do Christian —
   não há motivo para um módulo de voz próprio; é o mesmo texto→áudio.
6. **Legendas** (65%, "Gerando legendas"): reaproveitar `captions.ts`/
   `gemini-captions.ts`/`whisper.ts` sem alteração.
7. **Conversão de tempo**: como `RabiscoScene` usa `startFrame`/`durationInFrames`
   e a direção de cena (passo 3) trabalha em segundos relativos ao roteiro,
   converter `startSec/endSec` → frames usando o fps da composição (30) só
   depois de saber a duração real do áudio gerado (passo 5) — mesmo motivo
   pelo qual o Christian recalcula frames de cena só depois do TTS
   (`sceneFrameCounts()`), para não dessincronizar com a duração real da
   narração gravada.
8. **Render Remotion** (75-95%, "Renderizando"): `renderRabisco({props,
   outputPath, onProgress})` em `apps/worker/src/render.ts`, mesmo padrão de
   `renderChristian`/`renderTopList`.
9. **QA automático** (mesmos critérios do §29 da spec de produto = mesmos já
   aplicados ao Christian): arquivo tem áudio, duração bate com a narração,
   resolução 1080×1920, todas as `RabiscoScene[]` referenciam um asset
   existente em `RABISCO_ACTIONS` (checar antes do render, não depois —
   falhar cedo), legendas dentro da área segura.
10. **Status final**: `READY_FOR_REVIEW`, mesmos campos (`outputKey`,
    `outputSizeByte`, `renderedAt`, `progress: 100`).

### 4.3 Fila / jobs

**Nenhuma mudança em `packages/core/src/queue.ts`.** Rabisco usa a mesma fila
única `RENDER_QUEUE` e o mesmo `RenderJobData { projectId }` — não precisa de
opções extras como `ambientMode`, porque o pipeline não tem múltiplos modos
no MVP (só "gerar do zero").

---

## 5. Prompt do Gemini

**Novo arquivo:** `apps/worker/src/rabisco/prompts/content.ts`, seguindo
exatamente a convenção do Christian
(`apps/worker/src/christian/prompts/content.ts`): `export const
RABISCO_PROMPT_VERSION = '1.0'` como comentário/changelog manual, mais
`buildContentPrompt()` retornando `{system, user}` e `contentResponseSchema()`
retornando o JSON schema para `generationConfig.responseSchema`.

Diferente do Christian, **persistir a versão** em
`Project.rabiscoPromptVersion` a cada geração (o Christian define a
constante mas nunca grava — lacuna identificada em código existente; não
repetir aqui).

### 5.1 System prompt — pontos obrigatórios (da spec de produto, §17-19)

- Rabisco não é um guru, não tem todas as respostas, não é professor.
- Tom: pensamento íntimo/desabafo, não palestra motivacional.
- Proibido: frases motivacionais genéricas, tom de coach, clichês, excesso de
  positividade, linguagem artificial, conclusões definitivas.
- Preferir: vulnerabilidade, questionamentos, contradições, pequenas
  descobertas, silêncio, humanidade.
- Estrutura: GANCHO → SITUAÇÃO/SENTIMENTO → CONFLITO INTERNO → QUESTIONAMENTO
  → PEQUENA PERCEPÇÃO → FINAL ABERTO.
- Espiritualidade/cristianismo pode aparecer naturalmente se estiver no
  pensamento original do usuário, mas **sem transformar automaticamente em
  pregação** — diferença chave vs. o pipeline Christian, que é
  deliberadamente religioso do início ao fim.

### 5.2 Schema de resposta

```ts
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    hook: { type: 'string' },
    narration: { type: 'string' },
    durationTargetSec: { type: 'number' },
    characterScenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startSec: { type: 'number' },
          endSec: { type: 'number' },
          emotion: { type: 'string', enum: [/* RabiscoEmotion */] },
          action: { type: 'string', enum: [/* RabiscoAction */] },
          position: { type: 'string', enum: ['center', 'left', 'right', 'bottom'] },
          animation: { type: 'string', enum: ['fade', 'slide-left', 'slide-right', 'rise', 'float', 'zoom'] },
          thought: { type: 'string' },
        },
        required: ['startSec', 'endSec', 'emotion', 'action', 'position', 'animation'],
      },
    },
  },
  required: ['title', 'hook', 'narration', 'durationTargetSec', 'characterScenes'],
} as const;
```

Regra explícita no `system` prompt: `thought` (o balão de pensamento visual)
deve ser curto — reforçar no prompt "no máximo 6 palavras, nunca um
parágrafo" (requisito nº 10 da spec), já que `responseSchema` do Gemini não
consegue impor limite de caracteres por si só.

`emotion`/`action` no `enum` do schema devem ser gerados a partir das mesmas
constantes de `packages/core/src/types.ts` (não redigitar a lista à mão em
dois lugares) — importar os literais ou gerar o array programaticamente a
partir de `Object.keys(RABISCO_ACTIONS)` para as duas listas nunca
divergirem.

---

## 6. Remotion (`packages/video`)

### 6.1 Registro da composição

**Arquivo:** `packages/video/src/Root.tsx`

```tsx
export const RABISCO_ID = 'Rabisco';
// ...
<Composition
  id={RABISCO_ID}
  component={Rabisco}
  defaultProps={rabiscoDefaultProps}
  width={1080}
  height={1920}
  fps={30}
  durationInFrames={rabiscoDurationInFrames(rabiscoDefaultProps)}
  calculateMetadata={({ props }) => ({ durationInFrames: rabiscoDurationInFrames(props) })}
/>
```

### 6.2 Componente — `packages/video/src/Rabisco.tsx`

Estrutura análoga a `Christian.tsx`, mas:

- **Fundo**: não é vídeo (`OffthreadVideo`) — é uma textura estática de
  papel/off-white (`<Img src={paperTextureUrl}>` ou CSS puro com leve
  ruído/gradiente, conforme §12 da spec: "não transformar o fundo em
  ilustração complexa"). Pode ficar 100% em CSS/SVG inline (sem asset
  externo) para o MVP — mais simples e sem depender de mais um PNG.
- **Personagem**: por cena, `<Img src={resolveRabiscoAsset(scene.action)}>`
  dentro de um `<Sequence from={scene.startFrame}
  durationInFrames={scene.durationInFrames}>`, posicionado conforme
  `scene.position` (`center|left|right|bottom` → mapeado para
  `justifyContent`/`alignItems`/`transform`) e animado conforme
  `scene.animation` — usar `interpolate(frame, ...)` para opacity/translateX/
  translateY/scale, mesmo padrão já usado em `VerseCard`/`CtaOverlay` do
  Christian (fade-in/out nos primeiros/últimos N frames da sequência).
- **Balão de pensamento**: se `scene.thought` existir, renderizar um bloco de
  texto curto próximo à cabeça do personagem (posição relativa fixa por
  `position`), com o mesmo tratamento de fade da `VerseCard`.
- **Áudio**: idêntico ao Christian — `<Audio src={voiceoverUrl}>` sempre,
  `<Audio src={musicUrl} loop volume={fadeEnvelope}>` opcional.
- **Legendas**: reaproveitar `<Captions captions={captions}>` (componente
  existente, `packages/video/src/components/Captions.tsx`) sem alteração —
  já suporta o requisito §21 de alto contraste; se necessário, um `raised`
  prop diferente para não colidir com a posição do personagem quando
  `position === 'bottom'`.
- **Watermark**: reaproveitar `<Watermark>` existente.

**Não implementar animações de "traço aparecendo" (SVG path drawing) no
MVP** — a spec de produto já recomenda isso ("não tentar criar dezenas de
animações inicialmente"); ficam só as animações de câmera/entrada-saída
sobre o PNG estático (fade, slide, rise, float, zoom), que é exatamente o
conjunto do tipo `RabiscoAnimation` definido em §2.

### 6.3 Servir os assets do personagem para o Remotion

Igual ao problema já resolvido para `voiceoverUrl`/vídeos de fundo: o worker
roda `serveDirectory()` (`apps/worker/src/static-server.ts`) para expor
arquivos locais via HTTP durante o render (`assets.baseUrl`). Os PNGs do
Rabisco devem estar acessíveis pelo mesmo mecanismo — ou copiados para dentro
do diretório servido pelo worker no build, ou (mais simples) o worker aponta
`serveDirectory()` também para `apps/web/public/characters`, deixando um
único conjunto de arquivos fonte da verdade em `apps/web/public/`. Definir em
`apps/worker/src/static-server.ts` qual das duas abordagens evita duplicar os
PNGs em dois lugares do repo — recomendação: apontar para
`apps/web/public/characters` diretamente (symlink ou path relativo), nunca
copiar.

**Implementado de fato (worker):** o worker copia o PNG de cada ação usada
para dentro da pasta de assets efêmera do render (`copyCharacterAssets` em
`apps/worker/src/rabisco/pipeline.ts`), como arquivo achatado
`character-<action>.png` — `serveDirectory()`
(`apps/worker/src/static-server.ts`) serve tudo pelo `basename` da URL contra
uma única pasta raiz, sem suporte a subpastas, então esse é o único esquema
compatível (nunca apontar `serveDirectory()` para `apps/web/public/characters`
diretamente).

### 6.4 Pós-MVP: animação real do personagem (não só câmera)

O §6.2 original limitava a animação a efeitos de câmera sobre um PNG estático
(fade/slide/rise/zoom). Depois do primeiro teste com arte real, o usuário
pediu movimento de verdade do personagem, não só da câmera — e sem custo de
geração de IA. Implementado em `packages/video/src/Rabisco.tsx`
(`CharacterScene`):

- A mesma imagem do personagem é renderizada **duas vezes**, sobrepostas,
  cada cópia recortada via CSS `clip-path: inset(...)` — uma mantendo só a
  região da cabeça, outra só o resto do corpo. Corte por ação (`HEAD_SPLIT`,
  fração da altura a partir do topo, com um valor default para ações sem
  entrada específica), com ~3% de sobreposição na costura (`SEAM_OVERLAP`)
  pra rotação/deslocamento independente não abrir uma fresta mostrando o
  fundo.
- Cada camada anima de forma independente e contínua (`headLayerStyle`/
  `bodyLayerStyle`, funções de `frame`): cabeça com leve inclinação + bob
  vertical fora de fase; corpo com "respiração" sutil (`scaleY`) nas poses
  paradas, ou passada simulada (bounce + tilt mais rápido) na ação `walking`.
- Isso continua **dentro** do `<div>` já animado pela câmera
  (`animationStyle`/`RabiscoAnimation`) — sem conflito, são transforms em
  elementos DOM diferentes (o wrapper externo vs. as duas camadas internas).
- Nenhuma mudança de tipo foi necessária (`RabiscoScene`/`RabiscoProps`
  continuam iguais) — é puramente uma mudança de renderização em cima do
  mesmo `assetUrl` único por cena.

**Correção de assets associada:** os PNGs gerados por IA vieram com o
"quadriculado de transparência" desenhado como pixel opaco em vez de alpha
real, e descentralizados no canvas — corrigido via
`apps/worker/src/rabisco/fix-character-alpha.ts` (`npm run rabisco:fix-alpha`,
ver `apps/web/public/characters/rabisco/README.md` para detalhes técnicos e
a armadilha de usar flood-fill/conectividade nesse estilo de arte — não usar).

**Upgrade futuro opcional (não implementado):** animação via IA de verdade
(múltiplos frames reais, não recorte de 2 camadas da mesma imagem), usando o
modelo Higgsfield `autosprite` (1 imagem → sprite sheet, com opção
`remove_bg: 'ultra'` resolvendo transparência na origem). Exige créditos,
um teste piloto (formato exato do atlas retornado é desconhecido até rodar
um job real, e há risco do estilo derivar pra "sprite de jogo"), e mudança
de tipo (`RabiscoScene.assetUrl: string` → um tipo discriminado
`RabiscoCharacterAsset = {kind:'static',url} | {kind:'sprite', sheetUrl,
frameCount, columns, rows, frameWidth, frameHeight, fps, loop}`), com o
player de sprite em `Rabisco.tsx` via `background-position` (determinístico
por frame, sem decodificar nova imagem a cada frame do Remotion).

### 6.5 Cobrindo as 10 ações sem IA (aliasing de pose + presets + props)

Um documento posterior (`docs/RABISCO_ANIMATION_ENGINE.md`) propôs um sistema
bem maior — Director/Router/manifest/providers de IA local (LTX/WAN)/cache/
fila dedicada/UI admin — pra resolver um problema concreto: só 3 das 10
`RabiscoAction` têm arte real (`thinking`, `sitting`, `walking`); as outras 7
apontavam pra PNGs placeholder de 1x1 pixel (personagem invisível nessas
cenas). Decisão: sem GPU disponível pra IA local, ficou fora de escopo toda a
arquitetura de roteamento entre tecnologias — sobrando só o Remotion, que já
existia. A solução ficou inteiramente dentro de `packages/core`/`packages/video`,
sem Prisma/fila/IA nova:

- **`RABISCO_ACTION_POSE`** (`packages/core/src/rabisco.ts`) — mapeia cada uma
  das 10 ações pra uma das 3 poses reais (`RABISCO_BASE_POSES`). `RABISCO_ACTIONS`
  passou a ser *derivado* desse mapa (mesmas 10 chaves/ordem, então o enum do
  prompt/schema do Gemini em `content.ts`/`gemini.ts` não mudou — sem bump de
  `RABISCO_PROMPT_VERSION`). `resolveRabiscoPose(action)` expõe a pose
  resolvida pro worker (`copyCharacterAssets` em `apps/worker/src/rabisco/pipeline.ts`
  copia um PNG por pose, não por ação, evitando duplicar o mesmo arquivo).
- **Presets de movimento** (`packages/video/src/Rabisco.tsx`) — `HEAD_SPLIT`
  agora cobre as 10 ações (herdando o valor da pose usada). `headLayerStyle`/
  `bodyLayerStyle` viraram wrappers finos sobre uma tabela `MOTION_PRESETS`
  (`idle`/`gait`/`sip`/`gaze-up`/`rhythm`/`scribble`/`scan`/`offer`), cada um
  uma função de `frame` no mesmo estilo `Math.sin`/`interpolate` de antes —
  `idle` e `gait` são cópia literal do comportamento original
  (thinking/sitting e walking), os outros seis dão a cada ação reaproveitada
  uma assinatura de movimento própria (`ACTION_MOTION` faz o mapeamento).
- **Props em SVG** (`packages/video/src/components/RabiscoProp.tsx`) — pras 7
  ações sem arte própria, um overlay pequeno em SVG (xícara, caderno+lápis,
  livro, lâmpada/spark, sol+estrelas, fone+notas, coração), traço preto com
  dupla passada levemente deslocada (`Sketch`) pra imitar o estilo torto do
  personagem. `sipPhase()` sincroniza a animação da xícara com o preset `sip`.
  Montado dentro do `<div>` já animado pela câmera em `CharacterScene`, junto
  do `ThoughtBubble`.
- Nenhuma mudança em `RabiscoScene`/`RabiscoProps`/Prisma/fila — é puramente
  visual, em cima do mesmo `assetUrl` único por cena.
- Adicionar arte real pra uma dessas 7 ações no futuro é só trocar a entrada
  dela em `RABISCO_ACTION_POSE` pra apontar pra si mesma — o preset de
  movimento e o prop continuam funcionando por cima da arte nova.

---

## 7. `apps/web` — UI

### 7.1 Formulário de novo projeto

**Arquivo:** `apps/web/src/components/NewProjectForm.tsx`

- Adicionar `'RABISCO'` a `Mode`.
- Adicionar botão de toggle "Rabisco — Pensamento".
- Bloco condicional: `textarea` grande (placeholder conforme §15 da spec:
  "Escreva aqui o que você está sentindo, pensando ou querendo desabafar...").
- Sem campo de categoria/pilar — é texto livre, diferente do Christian.
- Body do `POST /api/projects`: `{ kind: 'RABISCO', title, rabiscoThought,
  watermark }`. `title` pode ser derivado automaticamente (ex: primeiras
  palavras do pensamento) se o formulário não pedir título explícito — mais
  fiel ao fluxo de produto descrito (usuário só escreve o pensamento e clica
  "Criar reflexão"), então o título final vem do próprio roteiro gerado pelo
  LLM (`title` retornado pelo schema em §5.2) e é atualizado no worker após
  a geração, não fixado pelo usuário no formulário.

### 7.2 API — criação de projeto

**Arquivo:** `apps/web/src/app/api/projects/route.ts`

- Adicionar `'RABISCO'` à checagem de kind permitido.
- Novo branch `if (kindRaw === 'RABISCO')`: validar `rabiscoThought` (string
  não vazia, ex. mínimo de ~10 caracteres para evitar prompts vazios), criar
  `prisma.project.create({ data: { kind: ProjectKind.RABISCO, title: '(gerando...)', rabiscoThought, watermark, durationPreset: 'SHORT' } })`.

### 7.3 Enfileirar render

**Arquivo:** `apps/web/src/app/api/projects/[id]/render/route.ts` — Rabisco
cai no caminho genérico (mesma validação leve do Christian: sem checagem
extra além de status atual do projeto), nenhuma rota nova necessária.

### 7.4 Editor / página do projeto

**Novo arquivo:** `apps/web/src/components/RabiscoEditor.tsx` (mesmo papel de
`ChristianEditor.tsx`): mostra o pensamento original, o roteiro gerado
(editável antes de re-renderizar, se o padrão existente permitir edição
manual — conferir `ChristianEditor.tsx` como referência exata antes de
implementar), preview do vídeo, status.

Branch em `apps/web/src/app/projects/[id]/page.tsx` (ou onde o componente de
editor é escolhido por `project.kind`) para renderizar `RabiscoEditor` quando
`kind === 'RABISCO'`.

---

## 8. Config

**Arquivo:** `packages/core/src/config.ts` — novo bloco, mesmo padrão de
`config.christian`:

```ts
rabisco: {
  geminiApiKey: str('RABISCO_GEMINI_API_KEY', config.christian?.geminiApiKey ?? ''),
  geminiModel: str('RABISCO_GEMINI_MODEL', 'gemini-2.0-flash'),
  minDurationSec: num('RABISCO_MIN_DURATION_SEC', 30),
  maxDurationSec: num('RABISCO_MAX_DURATION_SEC', 45), // SHORT apenas no MVP
},
```

Reaproveitar a mesma chave de API do Christian por padrão (`?? config.christian.geminiApiKey`) evita exigir uma segunda credencial só para este pipeline, mas permite override via env se o usuário quiser cotas separadas.

---

## 9. Fora do escopo do MVP (registrar, não implementar agora)

Para não repetir o erro apontado pela própria pesquisa deste repo (Christian
tem `CharacterState`/`CharacterScene.tsx` especificados mas nunca ligados ao
render final) — a ordem de implementação deve ser: **schema → prompt →
worker → Remotion (assets estáticos reais) → UI**, sempre validando um
render ponta a ponta antes de avançar para a próxima camada de polimento.
Adiar explicitamente:

- Camada de expressão sobreposta à pose (composição de 2 PNGs por cena).
- Presets `MEDIUM`/`LONG` (só `SHORT` no MVP, como pedido no requisito §23).
- Música ambiente automática por humor (pode nascer como campo manual
  primeiro, auto-seleção por IA depois).
- "Character Director" como módulo separado/reutilizável entre variações do
  Rabisco (Fé, Filosofia, Histórias) — no MVP a lógica de direção de cena
  vive dentro do próprio `rabisco/` do worker; extrair para
  `packages/core` só quando houver uma 2ª variação real precisando dela.
- Geração de novas poses via IA com fluxo de aprovação antes de entrar na
  biblioteca oficial (requisito §27) — todo o MVP assume biblioteca fechada
  e fornecida manualmente.
- Ollama (ver §0.3) — usar Gemini até haver motivo concreto para trocar.

---

## 10. Ordem sugerida de implementação

1. Migration Prisma (§1) — sem isso nada mais compila contra o schema.
2. Tipos + registro de assets em `packages/core` (§2) — sem imports de Node,
   testável isoladamente.
3. Colocar os 10 PNGs em `apps/web/public/characters/rabisco/actions/` (§3)
   — bloqueante para qualquer teste visual real; pode usar placeholders
   temporários (retângulos coloridos) para desbloquear o resto do pipeline
   antes da arte final chegar.
4. Prompt + chamada Gemini no worker (§4.2 passos 1-4, §5) — testável
   isoladamente rodando o worker com um `rabiscoThought` de exemplo e
   inspecionando o JSON retornado, sem precisar de TTS/Remotion ainda.
5. Composição Remotion (§6) — testável via `apps/web` do Remotion Studio
   (`npm run dev` do pacote `video`) com `defaultProps` mockados, sem
   depender do worker.
6. Ligar TTS/legendas/render real no pipeline (§4.2 passos 5-10).
7. UI de criação + editor (§7).
8. QA automático + smoke test ponta a ponta: criar um projeto Rabisco real
   pela UI, rodar o worker, conferir `READY_FOR_REVIEW` com vídeo válido.
