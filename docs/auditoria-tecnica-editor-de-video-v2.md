# Auditoria Técnica --- Editor de Vídeo

## Revisão do código-fonte + foco no módulo Midnight Relaxing Sounds

**Repositório auditado:** `brunoblv/editor-de-video`\
**Pacote analisado:** `editor-de-video-main(1).zip`\
**Escopo:** arquitetura, pipeline Ambient, áudio, vídeo, storage, API,
fila, banco, segurança, consistência com a especificação e preparação
para produção.

> Esta auditoria foi feita sobre o código-fonte presente no ZIP. Foram
> analisados os arquivos TypeScript/TSX, Prisma, configuração,
> documentação e estrutura do monorepo.
>
> Também foi tentada uma instalação das dependências para executar o
> typecheck. O `npm ci` não pôde ser concluído porque o registry
> disponível retornou `404` para `zod@4.4.3`. Portanto, as conclusões
> abaixo são principalmente de análise estática do código; não estou
> classificando o projeto como "compila" sem ter conseguido executar o
> compilador.

------------------------------------------------------------------------

# 1. Resumo executivo

A impressão geral é **positiva em arquitetura**, especialmente para um
MVP.

O projeto já possui:

-   monorepo com `apps` e `packages`;
-   frontend separado do worker;
-   BullMQ + Redis;
-   PostgreSQL + Prisma;
-   FFmpeg;
-   Remotion;
-   storage abstraído;
-   pipeline Ambient dedicado;
-   conceito de presets;
-   geração procedural de áudio;
-   biblioteca local de sons;
-   preview antes do render longo;
-   Quality Check;
-   metadata;
-   License Guard.

Ou seja: **a direção arquitetural é boa e o módulo de sons relaxantes já
está muito mais avançado do que um simples protótipo.**

Entretanto, encontrei algumas inconsistências importantes entre:

1.  a especificação;
2.  a UI;
3.  a API;
4.  o worker;
5.  o banco;
6.  o comportamento real do pipeline.

As principais são:

### 🔴 Críticas

1.  **License Guard é efetivamente contornado no Quality Check.**
2.  **API de arquivos não possui autenticação/autorização e pode expor
    todo o storage.**
3.  **O pipeline de áudio longo cria arquivos WAV gigantes e reprocessa
    a trilha inteira várias vezes.**
4.  **O Quality Check não realiza várias das verificações que seu
    nome/documentação promete.**
5.  **O campo `format=shorts` é aceito, salvo e transportado, mas não
    altera a renderização.**

### 🟠 Altas

6.  **Intensidade procedural é calculada mas não aplicada ao áudio.**
7.  **Efeitos visuais `rainOverlay` e `lightFlicker` são declarados mas
    não são efetivamente aplicados ao vídeo de stock.**
8.  **O segundo vídeo pesquisado é baixado, registrado e praticamente
    não participa da composição.**
9.  **As opções `autoSearch`, `generateThumbnail`, `generateMetadata`,
    `qualityCheck` e `createVariations` são armazenadas, mas várias não
    têm efeito real.**
10. **A biblioteca de áudio possui dois caminhos de ingestão diferentes
    e um deles não executa o Sound Analyzer.**
11. **Atribuições/licenças de áudio da biblioteca não são carregadas
    para o metadata final.**
12. **`AMBIENT_MAX_RETRIES` existe na configuração, mas a fila usa valor
    fixo.**
13. **Duração de clipes do pipeline tradicional é inconsistente:
    configuração diz 60s, API cria clipes com teto de 15s.**
14. **Não há limite server-side de duração para Ambient.**
15. **As APIs parecem estar sem camada de autenticação no próprio
    projeto.**

------------------------------------------------------------------------

# 2. Arquitetura atual

A separação está boa:

``` text
apps/
  web
  worker

packages/
  core
  db
  video
```

A ideia:

``` text
Next.js
   ↓
BullMQ
   ↓
Worker
   ↓
FFmpeg / Remotion
```

é adequada.

Para o módulo Ambient, porém, o fluxo real está mais próximo de:

``` text
API
 ↓
Project
 ↓
Worker
 ├── Concept
 ├── Soundscape
 │    ├── Library
 │    ├── Synthetic Noise
 │    ├── Events
 │    └── FFmpeg
 ├── Visual
 │    ├── Pexels/Pixabay
 │    └── FFmpeg
 ├── Mux
 ├── Quality
 └── Metadata
```

Isso é funcional, mas ainda existe bastante lógica dentro de arquivos
muito grandes, principalmente:

``` text
apps/worker/src/ambient/soundscape.ts
apps/worker/src/ambient/pipeline.ts
```

`soundscape.ts` tem mais de 750 linhas e concentra descoberta de assets,
síntese, eventos, mixagem e masterização.

**Recomendação:** dividir depois da estabilização funcional:

``` text
ambient/
  soundscape/
    layers.ts
    library.ts
    synth.ts
    events.ts
    mixer.ts
    master.ts
```

Não faria essa refatoração antes de corrigir os problemas P0.

------------------------------------------------------------------------

# 3. 🔴 P0 --- License Guard é contornado no pipeline

## Evidência

Em:

``` text
apps/worker/src/ambient/pipeline.ts
```

o Quality Check recebe:

``` ts
licenseSafe: true,
```

nas linhas próximas de 301 e 352.

Isso significa que o pipeline informa ao Quality Check que a licença é
segura independentemente dos assets efetivamente usados.

Ao mesmo tempo, a especificação exige:

``` text
Licença:
- revalidar todos os assets
```

e o projeto possui:

``` text
apps/worker/src/ambient/license-guard.ts
```

mas ele não é usado para validar o conjunto final do pipeline visual.

## Problema

O código pode produzir:

``` text
stock visual
+
library audio
```

e o Quality Check recebe:

``` text
licenseSafe = true
```

mesmo que algum asset esteja:

``` text
UNKNOWN
REJECTED
```

ou simplesmente não tenha sido validado naquele momento.

## Correção

Criar:

``` ts
validateProjectLicenses(projectId)
```

que percorra:

``` text
SoundAsset
MediaAsset
generated assets
```

e retorne:

``` ts
{
  safe: boolean,
  assets: [...],
  attributionRequired: [...],
  blocked: [...]
}
```

O Quality Check deve receber esse resultado real.

------------------------------------------------------------------------

# 4. 🔴 P0 --- API de arquivos sem autenticação

Arquivo:

``` text
apps/web/src/app/api/files/[...key]/route.ts
```

O endpoint aceita uma key de storage e retorna o arquivo.

Não existe autenticação/autorização nesse route handler.

O mesmo ocorre nos demais endpoints da API: não há camada de
autenticação explícita no código analisado.

## Impacto

Se o Next.js estiver exposto publicamente, alguém pode tentar acessar:

``` text
projects/<id>/source/...
projects/<id>/output/...
projects/<id>/ambient/...
library/sounds/...
```

A proteção contra path traversal é boa:

``` ts
assertSafeKey()
```

mas isso protege **o caminho**, não **quem pode acessar o arquivo**.

## Correção

Criar uma camada:

``` text
auth/
  requireUser()
  requireProjectAccess()
```

e aplicar no mínimo em:

``` text
/api/files/*
/api/projects/*
/api/ambient/*
```

Se o sistema for exclusivamente local/trusted LAN, isso pode ser
conscientemente adiado, mas deve ser uma decisão explícita.

------------------------------------------------------------------------

# 5. 🔴 P0 --- Arquivos WAV gigantes no pipeline longo

Este é provavelmente o maior problema de performance encontrado.

Em:

``` text
apps/worker/src/ambient/soundscape.ts
```

o pipeline cria:

``` text
beds-mix.wav
mix-batch-0.wav
mix-batch-1.wav
mix-batch-2.wav
...
```

Cada arquivo é PCM:

``` text
48 kHz
stereo
pcm_s16le
```

Um áudio PCM stereo 48 kHz / 16-bit ocupa aproximadamente:

``` text
192 KB/s
≈ 11.5 MB/min
≈ 691 MB/h
≈ 5.5 GB / 8h
≈ 6.9 GB / 10h
```

E o problema não é apenas o tamanho.

`mixEventsInBatches()` reprocessa o áudio completo para cada lote de
eventos.

Portanto, um vídeo de 8--10 horas pode causar:

``` text
beds-mix.wav
      ↓
mix-batch-0.wav
      ↓
mix-batch-1.wav
      ↓
mix-batch-2.wav
      ↓
...
```

Cada etapa percorre novamente horas de áudio.

## Impacto

-   alto consumo de disco;
-   alto I/O;
-   processamento muito lento;
-   risco de encher o disco;
-   múltiplos renders podem derrubar o servidor.

## Correção recomendada

Para render longo:

``` text
Soundscape Timeline
       ↓
FFmpeg filter graph
       ↓
AAC master 256k
```

evitando WAV intermediário longo.

Melhor ainda:

``` text
Timeline
 ↓
chunked rendering
 ↓
audio chunks
 ↓
concat/remux
```

ou um único filter graph quando o número de eventos permitir.

**Nunca manter vários masters PCM de horas no storage temporário.**

------------------------------------------------------------------------

# 6. 🔴 P0 --- Dupla compressão AAC

Para durações acima de 120 segundos:

``` text
soundscape
 ↓
AAC 256k
 ↓
audio-master.m4a
```

Depois:

``` text
audio-master.m4a
 ↓
muxAmbient
 ↓
AAC 192k
 ↓
final.mp4
```

Ou seja:

``` text
AAC 256k
→ AAC 192k
```

Isso é uma segunda compressão com perdas.

## Correção

Uma das opções:

### Opção A

Gerar master AAC 256k e copiar:

``` text
-c:a copy
```

para o MP4 final.

### Opção B

Manter PCM até o mux, mas somente para previews/arquivos curtos.

Para 8--10 horas, a opção A é muito mais eficiente.

------------------------------------------------------------------------

# 7. 🔴 P0 --- `shorts` não funciona

A API aceita:

``` ts
format: 'youtube' | 'shorts'
```

O conceito também possui:

``` ts
format?: 'youtube' | 'shorts'
```

Mas o visual usa:

``` ts
config.ambient.width
config.ambient.height
```

que por padrão são:

``` text
1920x1080
```

Não existe caminho real para:

``` text
1080x1920
```

## Resultado

O usuário pode escolher:

``` text
Shorts
```

e receber:

``` text
16:9
```

## Correção

O formato deve determinar uma configuração de render:

``` ts
getAmbientRenderProfile(format)
```

Exemplo:

``` text
youtube
  1920x1080
  30fps

shorts
  1080x1920
  30fps
```

------------------------------------------------------------------------

# 8. 🟠 Intensidade procedural é calculada mas não utilizada

A função:

``` text
intensitySegments()
```

gera:

``` text
0–15 min → intensidade 0.8
15–30 min → intensidade 1.0
...
```

e o resultado é salvo em:

``` ts
intensitySegments
```

porém não existe aplicação desses valores ao áudio.

## Portanto

A timeline afirma:

``` text
intensity = variável
```

mas o áudio permanece com volumes estáticos.

Isso contradiz diretamente a especificação:

``` text
A intensidade deve mudar lentamente.
```

## Correção

O volume das layers deve ser controlado por envelopes:

``` text
volume(t) = baseVolume × intensity(t)
```

No FFmpeg:

``` text
volume automation
```

ou geração por segmentos com crossfade.

------------------------------------------------------------------------

# 9. 🟠 Efeitos visuais declarados, mas não aplicados

Em:

``` text
apps/worker/src/ambient/visual.ts
```

o timeline declara:

``` ts
effects: {
  slowZoom: true,
  rainOverlay,
  lightFlicker,
}
```

Mas quando existe stock visual, o filtro efetivamente usado é
basicamente:

``` text
scale
crop
zoompan
fps
format
```

O `rainOverlay` não é aplicado sobre o stock.

O `lightFlicker` também não é aplicado.

## Problema

O metadata diz:

``` text
rainOverlay: true
lightFlicker: true
```

mas o vídeo não necessariamente possui esses efeitos.

## Correção

Criar um filtro composto real:

``` text
stock
 ↓
color/effect
 ↓
rain overlay opcional
 ↓
light flicker opcional
 ↓
slow zoom
```

------------------------------------------------------------------------

# 10. 🟠 Segundo vídeo pesquisado é baixado, mas não usado

O código:

``` ts
for (const [index, query] of queries.slice(0, 2).entries())
```

pesquisa até dois vídeos.

Mas:

``` ts
if (!primaryPath) primaryPath = rawPath;
```

apenas o primeiro vira `primaryPath`.

O segundo:

``` text
é pesquisado
é baixado
é registrado
```

mas não entra na composição principal.

## Impacto

Desperdício de:

-   API;
-   bandwidth;
-   storage temporário;
-   processamento.

## Correção

Ou:

### A

Usar apenas uma query.

### B

Montar:

``` text
clip A
crossfade
clip B
crossfade
clip A
...
```

A opção B é melhor para diversidade visual.

------------------------------------------------------------------------

# 11. 🟠 Fallback visual é chamado de Ken Burns sem ser Ken Burns

Quando não há stock:

``` ts
strategy: 'kenburns'
```

mas o fallback é uma cor sólida com:

``` text
noise
brightness
contrast
```

Não existe zoom/pan.

## Correção

Trocar para:

``` text
strategy: 'synthetic'
```

ou implementar realmente:

``` text
Ken Burns
```

sobre uma imagem gerada/local.

------------------------------------------------------------------------

# 12. 🟠 Quality Check é mais um score heurístico do que QA real

O módulo possui bons nomes:

``` text
audioQuality
loopQuality
atmosphere
visualQuality
licenseSafety
```

mas muitas dessas métricas não são realmente medidas.

Por exemplo:

``` ts
let loopQuality = 88;
```

e:

``` ts
let atmosphere = 85;
```

Depois são aplicados pequenos bônus/descontos.

Não existe análise real de:

-   loop audível;
-   transição;
-   black frame;
-   silêncio inesperado;
-   repetição perceptível;
-   waveform;
-   continuidade de energia;
-   qualidade de imagem além da resolução.

## Correção

Transformar o Quality Check em verificações reais:

``` text
Audio
 ├── duration
 ├── loudness
 ├── peak
 ├── clipping
 ├── silence
 ├── channel layout
 └── discontinuities

Video
 ├── duration
 ├── resolution
 ├── FPS
 ├── black frames
 ├── frozen frames
 └── codec

Loop
 ├── RMS difference at boundary
 ├── spectral difference
 └── visual boundary difference

License
 ├── all audio assets
 └── all visual assets
```

O score pode continuar existindo, mas deve ser consequência de medições
reais.

------------------------------------------------------------------------

# 13. 🟠 Opções da UI que não têm efeito

A API armazena:

``` text
autoSearch
generateThumbnail
generateMetadata
qualityCheck
createVariations
```

em:

``` text
ambientConfigJson
```

Porém, no worker:

-   `generateThumbnail` não é respeitado;
-   `generateMetadata` não é respeitado;
-   `qualityCheck` não é respeitado;
-   `createVariations` não é implementado;
-   `autoSearch` não altera o fluxo de busca.

## Resultado

A interface promete funcionalidades que não existem.

Isso é uma inconsistência UX importante.

## Correção

Ou implementar cada flag, ou remover temporariamente as opções da UI.

Minha preferência:

``` text
Fase 1:
remover opções sem implementação.

Fase 2:
reintroduzir quando estiverem funcionando.
```

------------------------------------------------------------------------

# 14. 🟠 Biblioteca de áudio tem dois caminhos de ingestão

Existe:

``` text
apps/worker/src/ambient/sound-analyzer.ts
```

que executa:

``` text
FFprobe
License Guard
loudness
quality score
loop score
```

Porém a API:

``` text
apps/web/src/app/api/ambient/library/route.ts
```

faz upload diretamente e cria:

``` ts
durationSec: 0,
qualityScore: 70,
loopScore: 70,
```

sem passar pelo analyzer.

## Resultado

Um asset enviado pelo painel pode ficar com:

``` text
duration = 0
quality = 70
loop = 70
```

mesmo que seja ruim.

Isso contradiz a especificação:

``` text
download → FFprobe → análise → score → biblioteca
```

## Correção

Criar um único serviço:

``` text
SoundAssetImporter
```

e fazer tanto:

``` text
upload
```

quanto:

``` text
import externo
```

passarem pelo mesmo fluxo.

------------------------------------------------------------------------

# 15. 🟠 Metadata não inclui corretamente créditos de áudio

`buildMetadata()` coleta atribuições de:

``` text
visualTimeline.clips
```

mas não coleta atribuições dos `SoundAsset`.

Isso é particularmente perigoso porque o áudio pode ter:

``` text
ATTRIBUTION_REQUIRED
```

e o sistema gerar uma descrição sem o crédito correspondente.

Além disso, `AmbientAudioLayer` não carrega:

``` text
sourceUrl
author
license
attribution
licenseUrl
```

## Correção

Expandir o contrato:

``` ts
AmbientAudioLayer {
  assetId
  provider
  sourceUrl
  author
  license
  attribution
  attributionRequired
}
```

ou obter essas informações diretamente do banco ao gerar metadata.

------------------------------------------------------------------------

# 16. 🟠 `AMBIENT_MAX_RETRIES` não controla a fila

Configuração:

``` text
AMBIENT_MAX_RETRIES
```

existe.

Mas a fila usa:

``` ts
defaultJobOptions: {
  attempts: 2
}
```

Portanto:

``` text
AMBIENT_MAX_RETRIES=5
```

não altera o comportamento.

## Correção

Centralizar:

``` ts
attempts: config.ambient.maxRetries + 1
```

ou renomear a variável para refletir corretamente o significado.

------------------------------------------------------------------------

# 17. 🟠 Duração de clipes tradicional inconsistente

Configuração:

``` text
CURIOSIDADE_MAX_DURATION_SEC = 50
MAX_CLIP_DURATION_SEC = 60
```

mas o endpoint de upload cria:

``` ts
maxDurationSec: 15
```

hardcoded.

Enquanto a UI apresenta o limite global:

``` text
60s
```

## Resultado

A UI pode dizer:

``` text
limite: 60s
```

mas o registro do clip nasce com:

``` text
maxDurationSec: 15
```

## Correção

Nunca usar:

``` ts
maxDurationSec: 15
```

hardcoded.

Usar:

``` ts
config.limits.maxClipDurationSec
```

ou deixar o usuário definir o valor.

------------------------------------------------------------------------

# 18. 🟠 API não limita duração do Ambient

O endpoint aceita:

``` ts
durationMinutes > 0
```

sem máximo.

Portanto:

``` json
{
  "durationMinutes": 100000
}
```

pode chegar ao worker.

O worker calcula:

``` ts
fullSec = durationMinutes * 60
```

## Impacto

É um risco de:

-   consumo de CPU;
-   consumo de disco;
-   jobs absurdamente longos;
-   DoS acidental;
-   lock/queue ocupados por muito tempo.

## Correção

Definir:

``` text
AMBIENT_MAX_DURATION_MIN=600
```

por exemplo.

E validar:

``` text
1 <= duration <= max
```

na API e novamente no worker.

Nunca confiar apenas na UI.

------------------------------------------------------------------------

# 19. 🟠 `format` deveria ser parte do perfil de render

Hoje:

``` text
concept.format
```

é apenas metadata.

Ele deveria determinar:

``` text
width
height
fps
bitrate
thumbnail
```

Criar:

``` ts
AmbientRenderProfile
```

por exemplo:

``` ts
{
  youtube: {
    width: 1920,
    height: 1080,
    fps: 30
  },

  shorts: {
    width: 1080,
    height: 1920,
    fps: 30
  }
}
```

------------------------------------------------------------------------

# 20. 🟠 Visual stock não é registrado como `MediaAsset`

O banco possui:

``` text
MediaAsset
```

para mídia.

Mas `AmbientProjectAsset` possui:

``` text
assetId → SoundAsset
```

e não possui relação com `MediaAsset`.

Assim, visual Ambient fica basicamente armazenado no:

``` text
visualTimelineJson
```

Isso dificulta:

-   auditoria;
-   rastreabilidade;
-   licença;
-   reuso;
-   analytics;
-   remoção;
-   catálogo;
-   revalidação.

## Correção

Criar relação polimórfica explícita ou, preferencialmente, separar:

``` text
AmbientAudioAssetUsage
AmbientVisualAssetUsage
```

ou adicionar uma entidade comum:

``` text
ProjectAsset
```

------------------------------------------------------------------------

# 21. 🟠 `AmbientProjectAsset` mistura tipos diferentes

Atualmente:

``` text
type = audio | visual
```

mas o modelo só possui relação com:

``` text
SoundAsset
```

Isso é um sinal de modelagem incompleta.

Recomendação:

``` text
AmbientAudioUsage
AmbientVisualUsage
```

ou:

``` text
Asset
 ├── SoundAsset
 └── MediaAsset
```

com uma camada comum de licença.

------------------------------------------------------------------------

# 22. 🟡 Download de mídia externa sem limite de tamanho

`downloadFile()` usa:

``` ts
fetch(url)
```

e faz streaming direto para disco.

Não existe:

``` text
Content-Length limit
stream byte limit
timeout
```

## Impacto

Se um provider devolver um arquivo inesperadamente grande, o worker pode
consumir muito disco.

## Correção

Adicionar:

``` text
DOWNLOAD_MAX_BYTES
DOWNLOAD_TIMEOUT_MS
```

e abort controller.

------------------------------------------------------------------------

# 23. 🟡 `SoundAsset` selecionado apenas por `licenseVerdict`

A consulta:

``` text
SAFE
ATTRIBUTION_REQUIRED
```

é boa.

Mas para produção comercial eu também verificaria:

``` text
commercialUse = true
modificationAllowed = true
verified = true
```

O fato de o banco conter:

``` text
licenseVerdict = SAFE
```

não deveria ser a única fonte de verdade.

------------------------------------------------------------------------

# 24. 🟡 Seed não é suficiente para garantir determinismo total

A arquitetura utiliza seed, o que é excelente.

Mas existem operações que dependem de:

``` text
database ordering
```

e seleção dinâmica de assets.

Se a biblioteca mudar entre dois renders com o mesmo seed, o projeto
pode gerar outro resultado.

Para garantir reprodutibilidade:

``` text
seed
+
asset IDs escolhidos
+
version da receita
+
versão do pipeline
```

devem ser persistidos.

Recomendação:

``` text
pipelineVersion
recipeVersion
resolvedAssetsJson
```

------------------------------------------------------------------------

# 25. 🟡 Falta versionamento de receita/pipeline

O conceito atual é salvo:

``` text
conceptJson
```

mas não há:

``` text
recipeVersion
pipelineVersion
```

Isso será importante quando o motor mudar.

Exemplo:

``` text
Rain Engine v1
Rain Engine v2
```

Um projeto antigo deve continuar reproduzível.

Adicionar:

``` text
pipelineVersion: "ambient-1.0"
recipeVersion: "rain-sleep-1"
```

------------------------------------------------------------------------

# 26. 🟡 Estado de projeto ainda pode ser mais preciso

Os estados atuais são:

``` text
DRAFT
QUEUED
PROCESSING
WAITING_PREVIEW_APPROVAL
READY
READY_FOR_REVIEW
FAILED
```

Para Ambient, a especificação propõe:

``` text
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

O projeto já possui `stage`, então não é obrigatório transformar tudo em
enum.

Minha recomendação:

``` text
status = estado macro
stage = etapa detalhada
```

Exemplo:

``` text
status = PROCESSING
stage = BUILDING_SOUNDSCAPE
```

Isso evita explosão do enum.

------------------------------------------------------------------------

# 27. 🟡 Concorrência/race condition nas APIs de render

A API faz:

``` text
SELECT project
 ↓
verifica status
 ↓
UPDATE status = QUEUED
 ↓
QUEUE.ADD
```

Duas requisições simultâneas podem fazer:

``` text
request A → SELECT
request B → SELECT

A → UPDATE
B → UPDATE

A → QUEUE
B → QUEUE
```

Resultado:

``` text
dois jobs para o mesmo projeto
```

## Correção

Usar:

-   transação;
-   lock lógico;
-   update condicional;
-   job ID determinístico;
-   ou combinação dessas estratégias.

------------------------------------------------------------------------

# 28. 🟡 Job ID pode ser melhor

Atualmente:

``` ts
project:${id}:${Date.now()}
```

permite múltiplos jobs do mesmo projeto.

Para rerenders isso pode ser necessário, mas é melhor ter um conceito
de:

``` text
renderAttemptId
```

persistido no banco.

Exemplo:

``` text
projectId
jobId
attempt
mode
createdAt
```

Isso melhora auditoria.

------------------------------------------------------------------------

# 29. 🟡 Preview e render longo usam estratégias diferentes de duração

O preview usa:

``` text
previewDurationSec
```

e o render:

``` text
durationMinutes
```

Isso é correto.

Mas o visual master continua sendo aproximadamente:

``` text
45 segundos
```

independentemente do formato.

A estratégia é boa, porém precisa ser explicitamente documentada como:

``` text
visual master
```

e não como timeline visual completa.

------------------------------------------------------------------------

# 30. 🟢 Ponto positivo --- storage abstraction

`packages/core/src/storage.ts` está bem encaminhado.

A interface:

``` text
put
toLocalPath
createReadStream
exists
size
delete
deletePrefix
```

é adequada.

Também há proteção contra:

``` text
path traversal
absolute paths
```

Isso é uma boa base para posteriormente implementar:

``` text
Local
R2
S3
```

------------------------------------------------------------------------

# 31. 🟢 Ponto positivo --- separação de worker

A decisão de manter:

``` text
Next.js
```

separado do:

``` text
Worker Node
```

é correta para renderização de vídeo.

Especialmente para vídeos de:

``` text
3h
8h
10h
```

isso será essencial.

------------------------------------------------------------------------

# 32. 🟢 Ponto positivo --- preview antes do render longo

Esse fluxo é muito bom:

``` text
Criar
 ↓
Preview
 ↓
Aprovar
 ↓
Render longo
```

Deve ser mantido.

É particularmente importante para o canal, pois permite verificar:

-   volume;
-   equilíbrio das camadas;
-   atmosfera;
-   imagem;
-   intensidade;
-   eventos.

antes de gastar horas de processamento.

------------------------------------------------------------------------

# 33. 🟢 Ponto positivo --- presets

Os presets:

``` text
RAIN_SLEEP
COZY_FIREPLACE
FOREST_NIGHT
OCEAN_SLEEP
RAINY_CAFE
THUNDERSTORM
BROWN_NOISE
```

são uma ótima decisão.

Eles devem evoluir para uma verdadeira:

``` text
Recipe
```

com versão.

------------------------------------------------------------------------

# 34. 🟢 Ponto positivo --- fallback sintético

A possibilidade de gerar:

``` text
rain
wind
brown noise
pink noise
```

localmente é excelente.

Isso reduz:

-   dependência de providers;
-   problemas de licença;
-   custo;
-   indisponibilidade de APIs.

Para o Midnight Relaxing Sounds, eu faria o motor privilegiar:

``` text
Local licensed library
        ↓
Synthetic
        ↓
External search
```

e não o contrário.

------------------------------------------------------------------------

# 35. Arquitetura recomendada após correções

A arquitetura alvo deveria ser:

``` text
                         PROJECT
                            │
                            ▼
                         RECIPE
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
        AUDIO ENGINE                 VISUAL ENGINE
             │                             │
      ┌──────┴──────┐               ┌─────┴─────┐
      ▼             ▼               ▼           ▼
   Library       Synthetic        Library      Synthetic
      │             │               │           │
      └──────┬──────┘               └─────┬─────┘
             ▼                            ▼
        Audio Timeline              Visual Timeline
             │                            │
             └────────────┬───────────────┘
                          ▼
                    RENDER SPEC
                          │
                          ▼
                     FFmpeg/Mux
                          │
                          ▼
                    QUALITY CHECK
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
          FAIL                      PASS
             │                         │
             ▼                         ▼
          RETRY                 READY_FOR_REVIEW
                                       │
                                       ▼
                                    PUBLISH
```

------------------------------------------------------------------------

# 36. Estrutura de código recomendada

Depois dos P0/P1:

``` text
apps/worker/src/ambient/

  concept/
    generator.ts

  audio/
    layers.ts
    library.ts
    synth.ts
    events.ts
    mixer.ts
    master.ts

  visual/
    search.ts
    composer.ts
    effects.ts
    loop.ts

  licensing/
    guard.ts
    validator.ts

  quality/
    audio.ts
    video.ts
    loop.ts
    license.ts
    index.ts

  metadata/
    builder.ts

  pipeline/
    preview.ts
    render.ts
    index.ts

  presets/
    index.ts
```

Não é necessário fazer essa reorganização agora. Primeiro corrigir
comportamento.

------------------------------------------------------------------------

# 37. Ordem de implementação recomendada

## Sprint 1 --- Segurança e integridade

### P0

1.  Autenticação/autorização.
2.  License validation real.
3.  Limite de duração Ambient.
4.  Limite de download externo.
5.  Unificar importação de SoundAsset.
6.  Corrigir metadata/attribution.

------------------------------------------------------------------------

## Sprint 2 --- Áudio

### P0/P1

1.  Eliminar WAVs gigantes.
2.  Evitar reprocessamento de toda a trilha por batch.
3.  Evitar dupla compressão AAC.
4.  Implementar intensidade real.
5.  Melhorar eventos.
6.  Persistir assets resolvidos.

------------------------------------------------------------------------

## Sprint 3 --- Visual

### P1

1.  Implementar realmente `rainOverlay`.
2.  Implementar `lightFlicker`.
3.  Usar o segundo clip.
4.  Corrigir fallback `kenburns`.
5.  Implementar perfil YouTube/Shorts.

------------------------------------------------------------------------

## Sprint 4 --- Quality Check

### P1

Implementar:

``` text
audio duration
audio loudness
audio clipping
audio silence
video duration
video resolution
video FPS
black frames
frozen frames
loop boundary
license validation
```

------------------------------------------------------------------------

## Sprint 5 --- Recipes

Criar:

``` text
Recipe
RecipeVersion
PipelineVersion
```

E transformar:

``` text
RAIN_SLEEP
```

em uma receita versionada.

------------------------------------------------------------------------

# 38. Modelo de receita recomendado

``` json
{
  "id": "RAIN_SLEEP",
  "version": 1,

  "concept": {
    "environment": "cabin",
    "weather": "heavy_rain",
    "time": "night",
    "purpose": "sleep"
  },

  "audio": {
    "layers": [
      {
        "kind": "rain",
        "volume": 0.45
      },
      {
        "kind": "roof_rain",
        "volume": 0.20
      },
      {
        "kind": "fireplace",
        "volume": 0.15
      },
      {
        "kind": "wind",
        "volume": 0.08
      },
      {
        "kind": "distant_thunder",
        "volume": 0.12
      }
    ]
  },

  "visual": {
    "queries": [
      "cozy cabin rain night",
      "rain window cabin",
      "fireplace cabin"
    ],

    "effects": {
      "slowZoom": true,
      "rainOverlay": true,
      "lightFlicker": true
    }
  },

  "master": {
    "profile": "sleep"
  }
}
```

------------------------------------------------------------------------

# 39. Primeiro objetivo prático

Antes de pensar em:

``` text
Analytics
Publishing
Shorts
Feedback Loop
IA
```

eu faria o sistema gerar perfeitamente:

``` text
Rainy Cabin at Night
```

com:

``` text
60 minutos
```

e depois:

``` text
3 horas
```

e finalmente:

``` text
8 horas
```

O teste de 8 horas é importante porque é justamente onde a arquitetura
atual de áudio pode apresentar problemas graves de I/O e armazenamento.

------------------------------------------------------------------------

# 40. Critério para considerar o módulo "pronto"

O módulo Ambient deve ser considerado tecnicamente pronto quando:

``` text
[✓] conceito
[✓] recipe
[✓] assets
[✓] license
[✓] audio layers
[✓] procedural events
[✓] intensity automation
[✓] visual loop
[✓] preview
[✓] quality check real
[✓] metadata
[✓] thumbnail
[✓] render longo
[✓] storage
[✓] retry
[✓] reproducibility
```

e especialmente:

``` text
8h render
```

não consumir dezenas de GB de WAV intermediário nem reprocessar a trilha
completa repetidamente.

------------------------------------------------------------------------

# 41. Conclusão

O projeto está em uma posição **bem melhor do que a primeira auditoria
superficial indicava**.

O módulo de sons relaxantes não é apenas uma ideia: existe uma
implementação funcional com:

-   presets;
-   geração procedural;
-   biblioteca;
-   eventos;
-   visual;
-   preview;
-   render;
-   quality;
-   metadata;
-   licença.

A principal questão agora não é reconstruir o módulo.

É **endurecer e profissionalizar a implementação existente**.

Minha recomendação é **não começar uma grande refatoração estrutural
ainda**.

Primeiro corrigir:

``` text
1. License Guard
2. Storage/API security
3. Long-audio architecture
4. Format
5. Intensity
6. Visual effects
7. Quality Check
8. Metadata/attribution
9. UI flags
10. Asset ingestion
```

Depois disso, aí sim vale separar `soundscape.ts` e `pipeline.ts` em
módulos menores.

### Minha avaliação

  Área                                        Avaliação
  ----------------------------------------- -----------
  Arquitetura geral                                8/10
  Separação Web/Worker                             9/10
  Modelo de presets                                8/10
  Conceito do Ambient                              9/10
  Áudio procedural                                 8/10
  Eficiência de áudio longo                        4/10
  Visual                                           6/10
  Quality Check                                    5/10
  Licenciamento                                    4/10
  Segurança da API                                 4/10
  Persistência/modelagem                           7/10
  Preparação para produção                         5/10
  Potencial para Midnight Relaxing Sounds      **9/10**

**O potencial é excelente. A base deve ser aproveitada, não
descartada.**

O próximo passo técnico que eu recomendo é transformar os itens acima em
um **Plano de Refatoração V2**, já organizado em tarefas pequenas e
independentes, com **arquivo → alteração → motivo → risco → teste de
aceitação**. Isso pode virar diretamente o prompt de execução do Claude
Code.
