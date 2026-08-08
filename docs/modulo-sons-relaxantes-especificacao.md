# Especificação --- Módulo de Sons Relaxantes / Ambient Videos

## 1. Objetivo

Adicionar ao sistema um módulo especializado em criar automaticamente
vídeos longos de sons relaxantes e ambientes.

``` text
Escolher conceito
→ planejar ambiente
→ pesquisar áudio e vídeo
→ validar licenças
→ baixar/catalogar assets
→ criar soundscape em camadas
→ criar visual/loop
→ mixar e masterizar
→ gerar preview
→ quality check
→ renderizar
→ thumbnail + metadata
→ READY_FOR_REVIEW
→ publicar/agendar
```

Prioridade: **qualidade sonora, atmosfera, loops imperceptíveis e
segurança de licença**.

## 2. Integração

Reutilizar módulos existentes: - Media Search - Downloader - License
Guard - FFmpeg - Remotion - Worker/Scheduler - Publishing Queue -
Analytics - biblioteca local

Novo domínio:

``` text
src/modules/ambient/
  concept-generator/
  planner/
  sound-search/
  sound-library/
  soundscape/
  visual-search/
  visual-composer/
  loop-generator/
  audio-master/
  renderer/
  quality/
  metadata/
  presets/
```

## 3. Categorias iniciais

-   chuva leve/forte
-   chuva na janela/telhado
-   tempestade
-   floresta
-   rio/cachoeira
-   oceano/ondas
-   vento
-   lareira
-   cabana
-   quarto/biblioteca/café
-   cidade à noite
-   white noise
-   pink noise
-   brown noise

Posteriormente: fantasia, medieval, cyberpunk, nave espacial etc.,
usando apenas assets próprios, licenciados ou permitidos.

## 4. Ambient Concept Generator

Pode receber um conceito manual ou inventá-lo automaticamente.

Exemplo:

``` json
{
  "title": "Rainy Cabin in the Forest",
  "environment": "cabin",
  "weather": "heavy_rain",
  "time": "night",
  "purpose": "sleep",
  "durationMinutes": 180,
  "audioLayers": ["rain", "roof_rain", "wind", "distant_thunder", "fireplace"],
  "visualQueries": ["cozy cabin rain night", "rain window cabin", "fireplace cabin"]
}
```

Combinação:

``` text
AMBIENTE + CLIMA + HORÁRIO + FINALIDADE + ELEMENTOS SONOROS
```

## 5. Presets

Criar inicialmente:

``` text
RAIN_SLEEP
COZY_FIREPLACE
FOREST_NIGHT
OCEAN_SLEEP
RAINY_CAFE
THUNDERSTORM
BROWN_NOISE
```

Cada preset define duração, sons, volumes, frequência de eventos, estilo
visual, intensidade e metadata.

## 6. Interface

Página:

``` text
/ambient
```

Campos:

``` text
Ambiente [Cabana]
Clima [Tempestade]
Horário [Noite]
Finalidade [Dormir]
Duração [3 horas]
Formato [YouTube 16:9]

☑ Chuva
☑ Lareira
☑ Vento
☑ Trovões
☐ Música

☑ Pesquisar assets automaticamente
☑ Criar variações
☑ Gerar thumbnail
☑ Gerar metadata
☑ Quality Check
```

Adicionar:

``` text
☑ Escolher conceito automaticamente
```

Botão: `GERAR AMBIENTE`.

## 7. Fontes de áudio

Providers configuráveis podem incluir: - Freesound - Wikimedia Commons -
Internet Archive - biblioteca própria

Nunca assumir que todo conteúdo de uma plataforma é livre. Cada asset
passa pelo License Guard.

## 8. Sound License Guard

Campos:

``` text
provider
sourceUrl
author
license
licenseUrl
commercialUse
modificationAllowed
attributionRequired
verified
```

Estados:

``` text
SAFE → usar
ATTRIBUTION_REQUIRED → usar + creditar
UNKNOWN → bloquear automação
REJECTED → nunca usar
```

## 9. Biblioteca local

Categorias lógicas:

``` text
rain/light
rain/heavy
rain/window
rain/roof
thunder/distant
thunder/close
fire/fireplace
wind/light
wind/strong
nature/forest
nature/river
nature/waterfall
ocean/waves
city/rain
room/ambience
noise/white
noise/pink
noise/brown
```

Modelo `SoundAsset`:

``` text
id
name
category
subcategory
provider
sourceUrl
localPath
duration
sampleRate
channels
lufs
peak
license
attribution
tags
qualityScore
loopScore
createdAt
```

## 10. Sound Analyzer

Ao importar:

``` text
download → FFprobe → análise → score → biblioteca
```

Extrair: - duração - sample rate - canais - loudness - peak -
silêncios - qualidade técnica - adequação para loop

## 11. Soundscape Generator

É o coração do módulo. Não repetir simplesmente um único MP3.

Exemplo:

``` text
RAIN BED       45%
ROOF RAIN      20%
FIREPLACE      15%
WIND            8%
THUNDER        12%
```

Tipos: - Base Layer - Texture Layer - Environment Layer - Event Layer

## 12. Timeline procedural

Eventos devem ocorrer em momentos não previsíveis:

``` text
00:43 thunder_distant_03
01:27 wind_gust_01
02:11 thunder_distant_07
03:04 rain_intensity_up
04:32 wood_crack_02
```

Usar `randomSeed` para permitir reprodução exata.

``` json
{
  "seed": 438293,
  "duration": 10800,
  "layers": [],
  "events": []
}
```

## 13. Variações

A intensidade deve mudar lentamente:

``` text
0-15 min   chuva média
15-24 min  chuva forte
24-35 min  chuva média
35-40 min  vento aumenta
40-60 min  chuva leve/média
```

Usar crossfade para todas as transições.

Anti-repetição:

``` text
evitar: A A A A A
preferir: A B A C B D
```

## 14. Eventos sonoros

Configuração:

``` json
{
  "type": "thunder",
  "minInterval": 45,
  "maxInterval": 240,
  "probability": 0.65
}
```

Também permitir: - volumeRange - panRange - NEAR / MEDIUM / DISTANT -
filtros/reverb conforme distância

## 15. Campo estéreo

Movimentação sutil:

``` text
rain → center/wide
fireplace → slightly left
wind → moving
thunder → variable
```

Nada exagerado em presets de sono.

## 16. Audio Master

Pipeline:

``` text
mix → EQ → limiter → normalização → master.wav
```

Evitar clipping, picos agressivos e mudanças bruscas.

Perfis:

``` text
SLEEP → dinâmica baixa
RELAX → dinâmica moderada
STUDY → estável e pouco distrativo
IMMERSIVE → maior espacialidade/eventos
```

## 17. Noise Generator

Gerar localmente: - white noise - pink noise - brown noise

Permitir combinações:

``` text
brown noise + rain
```

Não requer asset externo.

## 18. Visual Search

Reutilizar providers aprovados, por exemplo: - Pexels - Pixabay -
Wikimedia Commons - Internet Archive

O Planner gera queries como:

``` text
cozy cabin rain window night
```

Ranking por: - qualidade - resolução - estabilidade - composição -
capacidade de loop - ausência de watermark - relevância - licença

## 19. Estratégias visuais

Suportar:

### Vídeo contínuo

Sequência de vídeos adequados.

### Loop cinematográfico

Vídeo curto transformado em loop discreto.

### Imagem animada

Aplicar: - zoom lento - pan - parallax opcional - partículas - rain
overlay - light flicker

### Cena composta

Exemplo:

``` text
cabana + chuva + janela + luz + partículas
```

## 20. Visual Loop Generator

Técnicas: - crossfade - frame blending - slow zoom - crop animation -
overlays independentes - ping-pong somente quando não parecer artificial

Adicionar variações extremamente sutis:

``` text
zoom 100% → 104%
brightness ±2%
fog variation
rain variation
light flicker
```

## 21. Formatos

YouTube longo:

``` text
1920x1080
16:9
30 min / 1h / 2h / 3h / 8h / 10h
```

Shorts/Reels/TikTok:

``` text
1080x1920
9:16
15-60s
```

## 22. Renderização eficiente

Não renderizar efeitos complexos novamente por 8-10 horas se não for
necessário.

``` text
Visual Master curto
       +
Audio Master
       ↓
loop/concat eficiente
       ↓
mux final
```

Evitar re-encoding desnecessário.

Pipeline:

``` text
AmbientProject
→ Soundscape Timeline
→ Audio Master
→ Visual Master
→ Loop/Extend
→ Mux
→ Final MP4
```

## 23. Preview obrigatório

Antes de renderizar horas de vídeo:

``` text
preview.mp4
30-60 segundos
```

Ações:

``` text
APROVAR
REGERAR ÁUDIO
REGERAR VISUAL
REGERAR TUDO
```

## 24. Quality Check

Áudio: - clipping - silêncio inesperado - transições - loops audíveis -
picos - duração

Visual: - resolução - black frames - cortes ruins - loop perceptível -
watermark

Licença: - revalidar todos os assets

Score:

``` text
Audio Quality       94
Loop Quality        91
Atmosphere          88
Visual Quality      90
License Safety     100
TOTAL               93
```

Abaixo do threshold → `AUTO_RETRY`.

## 25. Thumbnail

Gerar automaticamente a partir do ambiente.

Texto opcional:

``` text
RAINY CABIN
3 HOURS

DEEP SLEEP
RAIN SOUNDS
```

Preparar estrutura para múltiplas versões no futuro.

## 26. Metadata

Gerar: - title - description - tags - hashtags - attributions

Créditos obrigatórios devem entrar automaticamente na descrição.

## 27. Banco

### AmbientProject

``` text
id
concept
environment
weather
timeOfDay
purpose
duration
preset
status
seed
audioTimelineJson
visualTimelineJson
qualityScore
previewPath
outputPath
createdAt
renderedAt
publishedAt
```

### AmbientProjectAsset

``` text
id
projectId
assetId
type
layer
startTime
endTime
volume
metadataJson
```

## 28. Estados

``` text
DRAFT
PLANNING
SEARCHING_ASSETS
DOWNLOADING
BUILDING_SOUNDSCAPE
BUILDING_VISUAL
GENERATING_PREVIEW
WAITING_PREVIEW_APPROVAL
RENDERING
QUALITY_CHECK
READY_FOR_REVIEW
SCHEDULED
PUBLISHED
FAILED
```

## 29. Worker

Jobs:

``` text
AMBIENT_PLAN
AMBIENT_SEARCH
AMBIENT_DOWNLOAD
AMBIENT_SOUND_BUILD
AMBIENT_VISUAL_BUILD
AMBIENT_PREVIEW
AMBIENT_RENDER
AMBIENT_QUALITY
AMBIENT_METADATA
AMBIENT_PUBLISH
```

## 30. Dashboard

Mostrar: - projetos - renderizando - aguardando preview - prontos -
publicados - falhas

Cards: - thumbnail - conceito - duração - preset - status - quality
score

## 31. Biblioteca de sons

Página:

``` text
/ambient/library
```

Mostrar nome, categoria, duração, provider, licença, quality score e
loop score.

Permitir ouvir preview e filtrar por categoria.

Antes de buscar externamente:

``` text
Planner → Local Library → encontrou?
                      ↙       ↘
                    SIM       NÃO
                    usar    pesquisar
```

## 32. Diversidade

Criar fingerprint por projeto:

``` text
environment
weather
time
audioCombination
visualAsset
```

Evitar repetir combinações recentes.

## 33. Analytics

Quando disponíveis, armazenar: - views - watch time - average view
duration - CTR - likes - comments - subscribers - returning viewers

Para ambient videos, priorizar CTR, duração média, watch time total e
returning viewers.

## 34. Feedback Loop

O desempenho influencia novos conceitos.

Exemplo:

``` text
Rain + Cabin + Night → retenção alta
Ocean + Day → retenção baixa
```

Favorecer combinações melhores sem simplesmente duplicar vídeos.

## 35. Shorts derivados

Após produzir o vídeo longo:

``` text
3h YouTube
   ↓
Short Generator
   ↓
30s vertical
   ↓
Short / Reel / TikTok
```

Usar a mesma identidade visual.

## 36. Configurações

``` text
defaultDuration
defaultPurpose
qualityThreshold
maxRetries
previewDuration
autoConcept
autoSearch
autoPublish
videosPerWeek
preferredProviders
```

Durante os testes:

``` text
autoPublish = false
```

Parar em `READY_FOR_REVIEW`.

## 37. Plano de implementação

### Fase 1 --- Rain Engine

Apenas:

``` text
Rain
Rain + Thunder
Rain + Fireplace
```

Fluxo:

``` text
conceito
→ biblioteca/search
→ soundscape
→ visual
→ preview
→ render
```

### Fase 2

Adicionar:

``` text
forest
ocean
wind
city
noise
```

### Fase 3

Adicionar: - Concept Generator automático - Thumbnail - Metadata -
Publishing

### Fase 4

Adicionar: - Analytics - Feedback Loop - Short Generator

## 38. Primeiro teste

Projeto:

``` text
Rainy Cabin at Night
Duration: 60 minutos
Purpose: Sleep
Visual: Cabin / Window / Night
```

Soundscape:

``` text
Rain Base        45%
Roof Rain        20%
Fireplace        15%
Wind              8%
Distant Thunder  12%
```

Eventos: - trovão distante - vento - estalos de madeira - mudanças
suaves na chuva

Primeiro gerar preview de 60 segundos. Após aprovação, renderizar 60
minutos. Só depois testar 3h, 8h ou 10h.

## 39. Critério de sucesso

O módulo é validado quando consegue sozinho:

1.  escolher ou receber um conceito;
2.  localizar assets adequados;
3.  verificar e registrar licenças;
4.  montar soundscape em múltiplas camadas;
5.  evitar loops sonoros perceptíveis;
6.  produzir cenário visual agradável;
7.  gerar preview;
8.  passar no Quality Check;
9.  renderizar vídeo longo;
10. gerar thumbnail e metadata;
11. chegar em `READY_FOR_REVIEW`;
12. produzir algo que pareça um ambiente deliberadamente criado, e não
    apenas um MP3 repetido sobre uma imagem.

## 40. Prioridade técnica

``` text
1. Qualidade do áudio
2. Loops imperceptíveis
3. Atmosfera coerente
4. Segurança das licenças
5. Qualidade visual
6. Thumbnail
7. Metadata
8. Publicação automática
```

O principal diferencial deve ser o **Soundscape Generator**: um motor
procedural de ambientes audiovisuais que reutiliza uma biblioteca segura
de assets para produzir ambientes variados e consistentes
automaticamente.
