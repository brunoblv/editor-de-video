# Requisitos — Rabisco Animation Engine

## 1. Objetivo

Implementar no editor de vídeo um sistema chamado **Rabisco Animation Engine**.

O sistema deverá permitir utilizar uma imagem estática do personagem **Rabisco** como referência e gerar automaticamente pequenas animações do personagem para utilização nos vídeos.

Exemplos:
- Rabisco parado → respirando e olhando para cima
- Rabisco parado → caminhando
- Rabisco sentado → tomando café
- Rabisco sentado → escrevendo
- Rabisco olhando para frente → abaixa a cabeça pensativo

Todo o processo deve funcionar automaticamente via código, priorizando tecnologias open source e executáveis localmente.

Não depender de navegador, interação manual, sites externos, assinatura, créditos pagos, upload manual ou download manual.

---

## 2. Arquitetura

```text
Pensamento
    ↓
Ollama
    ↓
Roteiro
    ↓
Rabisco Director
    ↓
Scene Planner
    ↓
┌─────────────────────────────┐
│ Animation Router            │
│                             │
│ SIMPLE → Remotion           │
│ COMPLEX → AI Image-to-Video │
└─────────────────────────────┘
           ↓
      LTX / Wan
           ↓
     clips temporários
           ↓
        Remotion
           ↓
       FFmpeg
           ↓
       vídeo final
```

---

## 3. Princípio fundamental

O sistema **NÃO deve gerar um personagem diferente em cada cena**.

Existe apenas um personagem oficial: **RABISCO**.

Todas as animações devem utilizar uma imagem oficial do Rabisco como referência. A consistência visual do personagem é mais importante do que a complexidade da animação.

---

## 4. Character Reference

Criar:

```text
/public/characters/rabisco/
```

Estrutura:

```text
rabisco/
│
├── reference/
│   ├── rabisco-master.png
│   ├── rabisco-front.png
│   ├── rabisco-side.png
│   ├── rabisco-sitting.png
│   └── rabisco-thinking.png
│
├── expressions/
│   ├── neutral.png
│   ├── reflection.png
│   ├── sad.png
│   ├── happy.png
│   ├── confused.png
│   ├── idea.png
│   └── gratitude.png
│
├── generated/
├── animations/
└── props/
```

`rabisco-master.png` deverá ser a referência visual principal.

---

## 5. Character Manifest

Criar `rabisco.manifest.json`:

```json
{
  "id": "rabisco",
  "name": "Rabisco",
  "style": {
    "type": "hand_drawn_scribble",
    "primaryColor": "#111111",
    "background": "#F4EFE4",
    "lineStyle": "rough",
    "shading": "minimal"
  },
  "physical": {
    "head": "large circular scribbled head",
    "eyes": "two vertical black oval eyes",
    "body": "small simple black scribbled body",
    "arms": "thin black hand-drawn lines",
    "legs": "thin black hand-drawn lines"
  },
  "rules": [
    "Preserve character proportions",
    "Never add realistic facial features",
    "Never add mouth unless reference contains one",
    "Never convert character to 3D",
    "Never convert character to anime",
    "Never change eye design",
    "Keep black hand-drawn lines",
    "Maintain imperfect scribbled outlines"
  ]
}
```

Esse arquivo será a definição oficial do personagem para o sistema.

---

## 6. Provedor de geração

Criar uma interface abstrata:

```typescript
export interface CharacterAnimationProvider {
  generate(params: {
    referenceImage: string;
    prompt: string;
    negativePrompt?: string;
    duration: number;
    width: number;
    height: number;
    fps: number;
    seed?: number;
  }): Promise<CharacterAnimationResult>;
}

export interface CharacterAnimationResult {
  videoPath: string;
  provider: string;
  seed?: number;
  generationTimeMs: number;
  metadata?: Record<string, unknown>;
}
```

---

## 7. Providers

A arquitetura não deve ficar presa a um único modelo.

Implementar inicialmente suporte para:
- LTX
- WAN

Estrutura:

```text
services/
└── animation/
    ├── CharacterAnimationProvider.ts
    ├── AnimationRouter.ts
    │
    ├── providers/
    │   ├── LtxProvider.ts
    │   └── WanProvider.ts
    │
    └── rabisco/
        ├── RabiscoDirector.ts
        ├── RabiscoPromptBuilder.ts
        ├── RabiscoAssetManager.ts
        └── RabiscoAnimationCache.ts
```

Arquitetura preparada para futuramente suportar `ComfyUIProvider`.

---

## 8. Image-to-Video

O requisito mais importante é:

### IMAGEM → MOVIMENTO

Entrada:

```text
rabisco-thinking.png
```

Prompt:

```text
The character slowly raises his head
and looks toward the sky.
Very subtle movement.
```

Resultado:

```text
rabisco-looking-sky.mp4
```

O modelo deve utilizar a imagem original como referência.

---

## 9. Prompt Builder

Nunca enviar somente `Rabisco walking`.

Criar automaticamente um prompt de preservação do personagem:

```text
Animate the provided reference image.

Preserve exactly the same hand-drawn character.

The character has:
- large circular scribbled head
- two simple vertical black oval eyes
- tiny black scribbled body
- thin hand-drawn arms
- thin hand-drawn legs
- imperfect black ink outlines

Preserve:
- exact proportions
- eye shape
- head shape
- body proportions
- hand-drawn scribble style
- black ink appearance

ACTION:
The character walks slowly forward while thinking.

MOVEMENT:
Small subtle movements.
Slow natural walking cycle.
Very small head movement.

STYLE:
Minimalist hand-drawn animation.
Black ink drawing.
Off-white paper background.
No realistic rendering.

CAMERA:
Static camera.

Do not redesign the character.
```

---

## 10. Negative prompt

Quando o provider/modelo suportar negative prompt:

```text
realistic,
photorealistic,
3D,
anime,
cartoon redesign,
Pixar,
Disney,
detailed human face,
nose,
realistic mouth,
realistic skin,
colored clothing,
different character,
extra limbs,
extra fingers,
deformed body,
changing eyes,
changing proportions,
camera shake,
complex background
```

---

## 11. Biblioteca de movimentos

Criar:

```typescript
export enum RabiscoAction {
  IDLE = "idle",
  THINKING = "thinking",
  WALKING = "walking",
  SITTING = "sitting",
  LOOKING_UP = "looking_up",
  LOOKING_DOWN = "looking_down",
  WRITING = "writing",
  READING = "reading",
  DRINKING_COFFEE = "drinking_coffee",
  LISTENING_MUSIC = "listening_music",
  BREATHING = "breathing",
  SAD = "sad",
  HAPPY = "happy",
  IDEA = "idea",
  GRATITUDE = "gratitude"
}
```

---

## 12. Presets

Cada movimento deve possuir um preset.

```typescript
const RABISCO_ACTIONS = {
  thinking: {
    reference: "thinking",
    provider: "remotion",
    prompt:
      "The character remains still while thinking. Very subtle breathing and head movement."
  },

  walking: {
    reference: "front",
    provider: "ai",
    prompt:
      "The character slowly walks forward with a simple natural walking cycle."
  },

  looking_up: {
    reference: "front",
    provider: "ai",
    prompt:
      "The character slowly raises his head and looks toward the sky."
  },

  coffee: {
    reference: "sitting",
    provider: "ai",
    prompt:
      "The character slowly lifts a small coffee cup, takes a sip and lowers it."
  }
};
```

---

## 13. Animation Router

Nem toda animação deve utilizar IA.

Criar `AnimationRouter`, responsável por decidir entre Remotion e AI.

### Remotion

Usar para:
- idle
- breathing
- small head movement
- floating
- fade
- slide
- zoom
- thinking symbols
- heart
- stars
- question marks
- thought bubbles

### IA

Usar para:
- walking
- writing
- drinking coffee
- reading
- complex gestures
- looking around
- interacting with environment

---

## 14. Regra de custo

Priorizar sempre:

```text
REMOTION
```

antes de:

```text
AI VIDEO
```

Remotion é preferível porque não utiliza GPU generativa, é muito mais rápido, preserva perfeitamente o personagem, é determinístico e não possui custo por geração.

---

## 15. Duração das animações IA

Não gerar cenas enormes.

Preset inicial:

```text
3–5 segundos
```

Máximo inicial:

```text
6 segundos
```

Exemplo:

```text
Cena 12 segundos

0–4
rabisco-walking.mp4

4–8
loop

8–12
loop
```

Quando visualmente aceitável, Remotion pode repetir ou inverter discretamente o clip.

---

## 16. Cache — MUITO IMPORTANTE

Uma vez que o sistema gerar:

```text
Rabisco
+
walking
+
seed
+
configuração
```

não deve gerar novamente sem necessidade.

Criar hash:

```typescript
const cacheKey = hash({
  character: "rabisco",
  action: "walking",
  reference: referenceHash,
  prompt,
  model,
  seed
});
```

Salvar em:

```text
/cache/rabisco/
```

Exemplo:

```text
walking-a8f72.mp4
coffee-84c31.mp4
looking-up-b74cd.mp4
```

---

## 17. Biblioteca permanente

Permitir:

### Salvar como animação oficial

Se uma geração ficou excelente:

```text
walking-v1.mp4
```

o administrador poderá aprová-la.

Ela passa para:

```text
/public/characters/rabisco/animations/
```

A partir daí `walking` não precisa mais ser gerado.

---

## 18. Estratégia de reutilização

Depois de algum tempo teremos:

```text
animations/

idle.mp4
thinking.mp4
walking.mp4
walking-sad.mp4
walking-happy.mp4
coffee.mp4
writing.mp4
reading.mp4
looking-sky.mp4
looking-down.mp4
music.mp4
idea.mp4
gratitude.mp4
```

Nesse momento, a necessidade de IA começa a cair drasticamente.

---

## 19. Character Director

Criar `RabiscoDirector`.

Entrada:

```json
{
  "narration": "Talvez eu esteja tão preocupado em saber para onde estou indo que esqueço de perceber onde estou agora."
}
```

Saída:

```json
{
  "emotion": "reflection",
  "action": "walking",
  "reference": "rabisco-front",
  "animation": {
    "provider": "ai",
    "duration": 4
  },
  "thought": "Para onde eu estou indo?"
}
```

---

## 20. O LLM NÃO escolhe tecnologia

O Ollama pode escolher:
- emotion
- action
- thought

Mas NÃO deve escolher:
- LTX
- Wan
- Remotion

Isso deve ser responsabilidade do código.

Exemplo:

```text
Ollama:
action = walking

↓

AnimationRouter:

walking possui asset oficial?
    ↓ sim
usar asset

↓ não

existe cache?
    ↓ sim
usar cache

↓ não

é possível Remotion?
    ↓ sim
Remotion

↓ não

AI Provider
```

---

## 21. Ordem de resolução

Implementar exatamente esta prioridade:

```text
1. Official Animation
        ↓
2. Generated Cache
        ↓
3. Remotion Animation
        ↓
4. Local AI
        ↓
5. Fallback Static Image
```

O pipeline nunca deve quebrar porque a IA falhou.

---

## 22. Fallback

Se LTX/Wan falhar:

```text
AI FAILED
```

não cancelar o vídeo.

Utilizar:

```text
rabisco-thinking.png
```

com:
- zoom lento;
- movimento vertical;
- parallax;

no Remotion.

O vídeo continua sendo produzido.

---

## 23. Fundo

Manter o fundo definido para o Rabisco:

```text
#F4EFE4
```

ou tonalidade equivalente.

Visual:

```text
papel off-white
+
textura muito leve
+
grain
+
pequenas imperfeições
```

O fundo NÃO deve ser branco puro.

---

## 24. IA não deve gerar o fundo quando não for necessário

Preferencialmente:

```text
Rabisco
+
fundo simples
```

Posteriormente o Remotion adiciona:
- papel;
- rabiscos;
- textos;
- legendas;
- estrelas;
- corações;
- pensamentos.

Isso aumenta a consistência.

---

## 25. Modo "Generate Animation"

Adicionar na interface administrativa do personagem:

# Rabisco Animation Studio

Campos:

```text
Referência

[ Rabisco pensando ▼ ]

Ação

[ Caminhando ▼ ]

Duração

[ 4 segundos ]

Provider

[ Auto ▼ ]

Seed

[ Random ]
```

Botão:

```text
GERAR ANIMAÇÃO
```

---

## 26. Preview

Depois da geração:

```text
┌────────────────────────────┐
│                            │
│          RABISCO           │
│                            │
│            ▶               │
│                            │
└────────────────────────────┘

Provider: LTX
Duration: 4.0s
Seed: 284729
Generation: 32s
```

Ações:

```text
[ Regenerar ]
[ Aprovar ]
[ Salvar como oficial ]
[ Descartar ]
```

---

## 27. Modo personalizado

Permitir também:

```text
Movimento personalizado
```

Textarea:

```text
Rabisco caminha lentamente,
para por um instante e olha
para cima.
```

O `RabiscoPromptBuilder` transforma isso no prompt completo de preservação.

---

## 28. Geração de cenas automaticamente

Durante a produção normal do vídeo:

```text
"Talvez eu não precise saber
exatamente onde estou indo."
```

RabiscoDirector:

```json
{
  "emotion": "reflection",
  "action": "walking"
}
```

Sistema procura:

```text
walking.mp4
```

Se existir:

```text
USE
```

Se não:

```text
GENERATE
```

---

## 29. Logs

Registrar:

```text
[RABISCO]

Scene: 04
Action: walking
Emotion: reflection

Searching official asset...
NOT FOUND

Searching cache...
NOT FOUND

Remotion compatible...
NO

Generating AI animation...

Provider: LTX
Reference: rabisco-front.png
Duration: 4s

DONE

Output:
cache/rabisco/walking-8827.mp4
```

---

## 30. Configuração

`.env`:

```env
RABISCO_AI_ENABLED=true
RABISCO_AI_PROVIDER=ltx
RABISCO_AI_FALLBACK_PROVIDER=wan
RABISCO_AI_MAX_DURATION=6
RABISCO_AI_CACHE=true
```

---

## 31. Limite de concorrência

Geração de vídeo é pesada.

Criar fila específica:

```text
rabisco-animation
```

BullMQ:

```text
concurrency = 1
```

por GPU inicialmente.

Não permitir que vários renders pesados disputem a mesma GPU simultaneamente.

---

## 32. Estados

Adicionar:

```text
QUEUED
GENERATING
GENERATED
APPROVED
FAILED
```

para animações.

---

## 33. Banco

Criar modelo semelhante a:

```prisma
model CharacterAnimation {
  id String @id @default(cuid())

  character String

  action String
  emotion String?

  referenceImage String

  prompt String

  provider String

  model String?

  seed Int?

  duration Float

  filePath String?

  status String

  isOfficial Boolean @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Adequar aos padrões Prisma já utilizados no projeto.

---

## 34. Não baixar modelos automaticamente durante produção

Os modelos necessários devem ser instalados/configurados separadamente.

Ao iniciar:

```text
checkAIProviders()
```

Verificar:
- GPU disponível;
- LTX disponível;
- modelo LTX disponível;
- Wan disponível;
- modelo Wan disponível.

Se nenhum estiver disponível:

```text
AI animation unavailable
```

e utilizar Remotion.

---

## 35. Diagnóstico

Criar endpoint administrativo:

```text
/api/admin/rabisco/animation/diagnostics
```

Retorno:

```json
{
  "gpu": true,
  "providers": {
    "ltx": {
      "available": true
    },
    "wan": {
      "available": false
    }
  }
}
```

---

## 36. Consistência visual

Implementar uma validação simples após geração.

Inicialmente não precisa ser IA sofisticada.

Permitir que o administrador visualize e aprove.

Futuramente implementar:

```text
Character Consistency Score
```

para detectar quando o modelo deformou demais o Rabisco.

---

## 37. Não gerar texto dentro do AI Video

A IA de vídeo NUNCA deve gerar:
- legendas;
- logo;
- pensamentos escritos;
- frases;
- títulos;
- CTA.

Tudo isso pertence ao Remotion.

A IA gera somente:

> **personagem + movimento**

---

## 38. Legendas

Manter todos os estilos definidos para o sistema Rabisco:

```text
SIMPLE
HIGHLIGHT
HANDWRITTEN
BOX
MINIMAL
GRAPHIC
THOUGHT
SPECIAL
FINAL
```

Fonte principal:

```text
PRETO
```

sobre fundo papel/off-white.

Destaques podem utilizar o bege/amarelo suave da identidade visual.

As legendas devem permanecer clean, bonitas e com aparência editorial.

Regras:
- máximo de 2 linhas por legenda;
- aproximadamente 42 caracteres por linha;
- uma ideia por bloco;
- animação de entrada discreta;
- fade-out discreto;
- evitar bounce exagerado;
- evitar estilo genérico de legenda de TikTok;
- manter a fonte predominantemente preta.

---

## 39. Resultado desejado

Quero conseguir escrever:

> Hoje eu percebi que passo muito tempo tentando descobrir se estou no caminho certo.

E apertar:

```text
PRODUZIR
```

O sistema deve fazer:

```text
                    TEXTO
                      ↓
                   Ollama
                      ↓
                  roteiro
                      ↓
                cenas/emotions
                      ↓
               RabiscoDirector
                      ↓
          ┌───────────┴───────────┐
          ↓                       ↓
       assets                  movimento
          │                       │
          │                ┌──────┴──────┐
          │                ↓             ↓
          │            Remotion       LTX/Wan
          │                │             │
          └────────────────┴─────────────┘
                           ↓
                         TTS
                           ↓
                       Whisper
                           ↓
                       Remotion
                           ↓
                        FFmpeg
                           ↓
                    VIDEO FINAL
```

sem nenhuma intervenção manual.

---

## 40. Exemplo de vídeo

Para o pensamento:

> Hoje eu percebi que passo muito tempo tentando descobrir se estou no caminho certo.

O sistema poderá gerar:

### Cena 1 — Reflexão

Rabisco pensando.

Legenda:

> Hoje eu percebi uma coisa.

### Cena 2 — Ansiedade

Rabisco cercado por pequenos pensamentos:

> futuro  
> escolhas  
> e se?  
> será?

Legenda:

> Eu passo muito tempo tentando  
> descobrir se estou no caminho certo.

### Cena 3 — Desabafo

Rabisco sentado.

Legenda:

> Mas talvez esse seja  
> o problema.

### Cena 4 — Insight

Pequena lâmpada/rabisco aparece.

Legenda:

> Talvez eu esteja tão preocupado  
> em saber para onde estou indo...

### Cena 5 — Contemplação

Rabisco olhando para o céu.

Legenda:

> que esqueço de perceber  
> onde estou agora.

### Cena 6 — Leveza

Rabisco caminhando.

Legenda:

> Eu não preciso ter  
> todas as respostas hoje.

### Cena 7 — Final

Rabisco continua caminhando.

Legenda especial:

> **Um passo de cada vez.**

---

## 41. Implementação por fases

### FASE 1 — obrigatória

Implementar:
- `RabiscoDirector`;
- `AnimationRouter`;
- manifest do personagem;
- biblioteca de assets;
- animações simples no Remotion;
- cache;
- fallback;
- estrutura de banco;
- fila de animação.

### FASE 2 — obrigatória

Integrar **um único provider local Image-to-Video** primeiro.

Começar por LTX ou Wan, conforme qual for tecnicamente mais compatível com o hardware e ambiente atual.

**Não instalar dois modelos pesados antes de validar um.**

### FASE 3

Criar:

**Rabisco Animation Studio**

Permitir:
- selecionar referência;
- selecionar ação;
- definir duração;
- escolher provider;
- definir seed;
- gerar;
- visualizar;
- regenerar;
- aprovar;
- salvar como oficial;
- descartar.

### FASE 4

Integrar automaticamente ao pipeline completo.

### FASE 5

Adicionar:
- segundo provider;
- consistência automática;
- novas ações;
- mais expressões;
- mais props;
- geração de variações;
- biblioteca permanente de animações.

---

## 42. Regra final para o Claude Code

Antes de implementar, examine a arquitetura atual do projeto e reutilize serviços, filas BullMQ, workers, armazenamento, FFmpeg, Remotion, Prisma, logs e padrões existentes.

Não criar uma segunda arquitetura paralela desnecessariamente.

Fazer a implementação incrementalmente e manter compatibilidade com os tipos de vídeo já existentes.

O objetivo não é criar um gerador genérico de vídeo com IA.

O objetivo é criar um **motor específico para animar o personagem Rabisco de forma consistente, gratuita, local e automatizável via código**.

A geração por IA deve ser utilizada somente quando trouxer benefício real. Sempre que Remotion conseguir produzir o movimento de forma convincente, preferir Remotion.

O sistema deve ser capaz de funcionar mesmo quando o provider de IA estiver indisponível.
