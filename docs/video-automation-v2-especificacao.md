# Especificação --- Automação Autônoma de Vídeos Curtos (V2)

## 1. Visão geral

Construir uma aplicação que execute praticamente todo o ciclo de
produção de vídeos curtos sem intervenção manual:

``` text
Descobrir assunto
      ↓
Planejar vídeo
      ↓
Pesquisar mídia reutilizável
      ↓
Validar fonte/licença
      ↓
Baixar assets
      ↓
Criar roteiro
      ↓
Selecionar cenas
      ↓
Gerar narração (opcional)
      ↓
Gerar legendas
      ↓
Editar automaticamente
      ↓
Controle de qualidade
      ↓
Gerar título/descrição
      ↓
Exportar
      ↓
Publicar/agendar
      ↓
Coletar métricas
      ↓
Usar resultados nas próximas produções
```

A prioridade é **qualidade**, não volume. A primeira versão deve
conseguir produzir poucos vídeos, mas com resultado suficientemente bom
para serem publicados.

------------------------------------------------------------------------

# 2. Princípios

1.  Não depender de ferramentas SaaS pagas para produzir o vídeo.
2.  Priorizar software open source e execução local/VPS.
3.  Usar somente mídia cuja licença/termos permitam o uso pretendido.
4.  Registrar a procedência e a licença de cada asset.
5.  Nunca publicar automaticamente um asset cuja licença esteja
    indefinida.
6.  Separar descoberta, criação, renderização e publicação em módulos.
7.  Permitir revisão manual, mesmo quando o modo automático estiver
    habilitado.
8.  Guardar métricas para aprender quais formatos funcionam melhor.
9.  Começar pequeno: uma máquina, um worker e poucos vídeos por dia.
10. Ter templates visuais consistentes para que os vídeos não pareçam
    montagens aleatórias.

------------------------------------------------------------------------

# 3. Stack sugerida

## Aplicação

-   Next.js
-   TypeScript
-   Node.js
-   SQLite inicialmente
-   Prisma opcional

## Processamento

-   FFmpeg
-   FFprobe
-   yt-dlp somente para fontes e conteúdos cujo download/uso seja
    permitido
-   Whisper / faster-whisper
-   OpenCV opcional
-   Remotion opcional para templates visuais mais sofisticados

## IA local

O sistema deve permitir conectar um LLM local via:

-   Ollama

Modelos podem ser configuráveis pelo administrador.

O LLM será utilizado principalmente para:

-   ideias
-   roteiro
-   seleção semântica
-   títulos
-   descrições
-   avaliação do vídeo

A aplicação não deve depender obrigatoriamente de uma API paga de IA.

------------------------------------------------------------------------

# 4. Modos de funcionamento

## Automático

O sistema escolhe assunto, pesquisa mídia, produz, renderiza e envia
para publicação.

## Aprovação antes da publicação

Tudo é automático até o vídeo final.

Status:

``` text
READY_FOR_REVIEW
```

O usuário assiste e escolhe:

``` text
PUBLICAR
REFAZER
DESCARTAR
```

Este deve ser o modo padrão durante os testes.

## Manual assistido

O usuário informa apenas:

``` text
"curiosidades sobre espaço"
```

O restante é automático.

------------------------------------------------------------------------

# 5. Trend Finder

Responsável por descobrir assuntos potencialmente interessantes.

Inicialmente não precisa ser extremamente sofisticado.

Fontes possíveis:

-   Google Trends
-   Reddit
-   feeds RSS
-   notícias
-   Wikimedia
-   YouTube para identificação de tendências, sem assumir direito de
    reutilização do conteúdo encontrado
-   fontes configuráveis

Exemplo de saída:

``` json
{
  "topic": "buracos negros",
  "category": "space",
  "score": 82,
  "reason": "assunto aparecendo em múltiplas fontes"
}
```

------------------------------------------------------------------------

# 6. Topic Scoring

Cada assunto recebe uma pontuação.

Exemplo:

``` text
trend_score
media_availability
visual_potential
originality
evergreen_score
```

Resultado:

``` text
TOTAL = 0-100
```

O sistema escolhe assuntos acima de um limite configurável.

------------------------------------------------------------------------

# 7. Content Planner

Depois de escolher o assunto, o sistema decide qual vídeo produzir.

Exemplo:

``` text
Tema:
Buracos negros

Formato:
Curiosidade

Duração:
35 segundos

Estrutura:
Hook
Explicação
Curiosidade surpreendente
Conclusão
CTA
```

------------------------------------------------------------------------

# 8. Roteiro

O Script Generator produz:

``` text
HOOK
BODY
PAYOFF
CTA
```

Exemplo conceitual:

``` text
0-3s   Hook
3-12s  Contexto
12-28s Desenvolvimento
28-34s Payoff
34-38s CTA
```

O roteiro também deve gerar uma lista de necessidades visuais.

Exemplo:

``` json
[
  {
    "query": "black hole space",
    "start": 0,
    "end": 5
  },
  {
    "query": "galaxy stars",
    "start": 5,
    "end": 11
  }
]
```

Isso é essencial para pesquisar cenas adequadas automaticamente.

------------------------------------------------------------------------

# 9. Media Search Engine

Criar uma interface única:

``` ts
searchMedia(query, options)
```

Cada fonte implementa um adapter.

Exemplo:

``` text
providers/
  pexels.ts
  pixabay.ts
  wikimedia.ts
  archive.ts
  nasa.ts
```

------------------------------------------------------------------------

# 10. Fontes de mídia

Prioridade inicial:

## Pexels

Boa fonte para:

-   natureza
-   pessoas
-   cidades
-   tecnologia
-   lifestyle
-   B-roll

## Pixabay

Complementar ao Pexels.

## Wikimedia Commons

Muito útil para:

-   história
-   ciência
-   personalidades históricas
-   lugares
-   documentos
-   imagens

A licença deve ser analisada asset por asset.

## Internet Archive

Útil para:

-   filmes antigos
-   material histórico
-   arquivos públicos

O sistema não deve assumir que tudo no Archive está em domínio público.

## NASA e acervos governamentais

Úteis principalmente para ciência e espaço.

O sistema deve armazenar a origem e verificar as condições aplicáveis ao
asset.

------------------------------------------------------------------------

# 11. License Guard

Módulo obrigatório.

Cada asset terá:

``` text
source
source_url
author
license
license_url
attribution_required
commercial_use
modification_allowed
verified
```

Estados:

``` text
SAFE
ATTRIBUTION_REQUIRED
UNKNOWN
REJECTED
```

Regra:

``` text
UNKNOWN → não usar automaticamente
REJECTED → nunca usar
```

------------------------------------------------------------------------

# 12. Media Ranking

Uma pesquisa pode retornar dezenas de assets.

O sistema deve escolher os melhores usando:

``` text
resolução
orientação
duração
relevância
movimento
qualidade visual
compatibilidade com 9:16
ausência de watermark
```

Pontuação:

``` text
media_score = 0-100
```

------------------------------------------------------------------------

# 13. Downloader

Responsabilidades:

-   baixar asset
-   gerar hash
-   evitar download duplicado
-   validar arquivo
-   normalizar container
-   armazenar metadata

Estrutura:

``` text
/storage
    /media
        /original
        /proxy
        /thumbnails

    /projects

    /exports

    /cache
```

------------------------------------------------------------------------

# 14. Biblioteca local

Todo asset aprovado passa a fazer parte da biblioteca.

Assim:

``` text
Pesquisa
   ↓
Biblioteca local
   ↓
se não encontrar
   ↓
Fontes externas
```

Isso reduz downloads e acelera produções futuras.

------------------------------------------------------------------------

# 15. Scene Analyzer

O sistema analisa os vídeos baixados.

Extrair:

``` text
duração
resolução
FPS
mudanças de cena
movimento
frames representativos
```

Pode utilizar:

-   FFmpeg
-   FFprobe
-   OpenCV

------------------------------------------------------------------------

# 16. Seleção automática de cenas

O vídeo final não deve simplesmente usar um único vídeo de fundo.

Exemplo:

``` text
0-4s    cena A
4-8s    cena B
8-12s   cena C
12-17s  cena D
```

O Scene Selector relaciona cada frase do roteiro com uma mídia.

------------------------------------------------------------------------

# 17. Ritmo de edição

Configuração inicial:

``` text
troca visual a cada 2-5 segundos
```

O intervalo deve variar para evitar aparência mecânica.

O sistema pode acelerar as trocas durante o hook.

------------------------------------------------------------------------

# 18. Reenquadramento 9:16

Saída principal:

``` text
1080x1920
```

O sistema deve:

1.  detectar orientação;
2.  fazer crop quando possível;
3.  preservar o objeto principal;
4.  usar fundo desfocado quando crop destruir a composição.

------------------------------------------------------------------------

# 19. Narração

Deve ser opcional.

Pipeline:

``` text
roteiro
 ↓
TTS local
 ↓
WAV
 ↓
normalização
```

Engines possíveis:

-   Piper
-   Kokoro

Permitir diferentes vozes por template/canal.

------------------------------------------------------------------------

# 20. Legendas

Pipeline:

``` text
áudio final
 ↓
Whisper/faster-whisper
 ↓
timestamps
 ↓
legendas
```

Preferir sincronização por palavra quando possível.

------------------------------------------------------------------------

# 21. Estilo das legendas

Templates configuráveis.

Exemplo:

``` text
máximo 2 linhas
palavra atual destacada
posição segura
fonte grande
alto contraste
```

Evitar legendas excessivamente próximas das áreas cobertas pela
interface das plataformas.

------------------------------------------------------------------------

# 22. Video Composer

Responsável por montar a timeline.

Entrada:

``` text
script
voice
clips
captions
music
template
```

Saída:

``` text
timeline.json
```

Exemplo:

``` json
{
  "duration": 36,
  "scenes": [],
  "captions": [],
  "audio": [],
  "effects": []
}
```

------------------------------------------------------------------------

# 23. FFmpeg Renderer

O FFmpeg será responsável pela renderização principal.

Operações:

-   trim
-   crop
-   scale
-   concat
-   zoom
-   blur
-   fade
-   overlays
-   subtitles
-   mixagem
-   normalização

------------------------------------------------------------------------

# 24. Remotion

Opcional.

Usar quando for necessário:

-   animações
-   cards
-   títulos
-   indicadores
-   transições próprias
-   identidade visual mais sofisticada

FFmpeg continua responsável pelo processamento pesado.

------------------------------------------------------------------------

# 25. Música

Usar somente biblioteca com direitos compatíveis.

O sistema deverá registrar:

``` text
track
source
license
attribution
```

Também deve ser possível gerar vídeo sem música.

A música deve ficar abaixo da narração e passar por normalização.

------------------------------------------------------------------------

# 26. Templates

O MVP deve ter inicialmente 3 templates.

## Curiosidade

``` text
Hook forte
Narração
B-roll
Legenda dinâmica
CTA
```

## História

``` text
Hook
Contexto
Progressão
Plot/payoff
```

## Visual

``` text
Pouca narração
Cenas fortes
Texto curto
Música
```

------------------------------------------------------------------------

# 27. Hook Engine

O começo deve receber tratamento especial.

Primeiros segundos:

-   texto maior
-   cortes mais rápidos
-   frase que gera curiosidade
-   visual de impacto

O sistema deve gerar mais de um hook e selecionar o melhor.

------------------------------------------------------------------------

# 28. Quality Control

Antes da publicação, executar validações automáticas.

## Técnico

Verificar:

``` text
arquivo válido
1080x1920
áudio presente
duração permitida
sem frames pretos longos
sem silêncio excessivo
legendas dentro da tela
```

## Conteúdo

Verificar:

``` text
hook compreensível
roteiro coerente
cenas relacionadas
repetições
CTA
```

## Licença

Verificar novamente todos os assets.

------------------------------------------------------------------------

# 29. Quality Score

Gerar:

``` text
Visual:        87
Hook:          91
Legendas:      94
Áudio:         88
Ritmo:         82
Licenças:     100

TOTAL:         90
```

Configuração:

``` text
qualityThreshold = 80
```

Se:

``` text
score < 80
```

o vídeo volta automaticamente para nova geração.

------------------------------------------------------------------------

# 30. Auto Retry

Exemplo:

``` text
Render
 ↓
Quality = 71
 ↓
Reprovado
 ↓
Trocar cenas
 ↓
Novo render
 ↓
Quality = 86
 ↓
Aprovado
```

Limitar tentativas para evitar loop infinito.

------------------------------------------------------------------------

# 31. Metadata Generator

Gerar automaticamente:

``` text
title
description
hashtags
keywords
caption
```

Manter versões específicas por plataforma.

------------------------------------------------------------------------

# 32. Thumbnail / Cover

Gerar frame de capa automaticamente.

Opções:

``` text
melhor frame
+
texto curto
```

Salvar separadamente:

``` text
cover.jpg
```

------------------------------------------------------------------------

# 33. Publishing Queue

Tabela:

``` text
publications
```

Campos:

``` text
id
project_id
platform
account
scheduled_at
status
remote_id
remote_url
published_at
error
```

Estados:

``` text
DRAFT
READY
WAITING_APPROVAL
SCHEDULED
PUBLISHING
PUBLISHED
FAILED
```

------------------------------------------------------------------------

# 34. Publicadores

Criar adapters:

``` text
publishers/
  youtube.ts
  instagram.ts
  facebook.ts
  tiktok.ts
```

A disponibilidade de publicação automática depende das APIs, permissões
e políticas atuais de cada plataforma.

O sistema não deve depender do publicador para produzir o vídeo: se uma
API não estiver disponível, o arquivo continua pronto para upload
manual.

------------------------------------------------------------------------

# 35. Analytics

Após publicação, registrar quando disponível:

``` text
views
likes
comments
shares
watch_time
average_view_duration
retention
followers_generated
```

------------------------------------------------------------------------

# 36. Feedback Loop

As métricas devem influenciar futuras decisões.

Exemplo:

``` text
vídeos de espaço
retenção média: 78%

vídeos de história
retenção média: 51%
```

O Topic Scorer passa a favorecer espaço.

Também analisar:

``` text
duração
template
hook
velocidade de cortes
voz
categoria
horário
```

------------------------------------------------------------------------

# 37. Banco de dados

Entidades principais:

``` text
Topic
Trend
Project
Script
MediaAsset
MediaLicense
Scene
Voiceover
Caption
Render
QualityCheck
Publication
Metric
Template
Setting
```

------------------------------------------------------------------------

# 38. Project

Exemplo:

``` text
Project

id
topic
category
template
status
script
duration
quality_score
created_at
rendered_at
published_at
```

------------------------------------------------------------------------

# 39. Máquina de estados

``` text
DISCOVERED
    ↓
PLANNING
    ↓
SEARCHING_MEDIA
    ↓
DOWNLOADING
    ↓
SCRIPTING
    ↓
COMPOSING
    ↓
RENDERING
    ↓
QUALITY_CHECK
    ↓
READY_FOR_REVIEW
    ↓
SCHEDULED
    ↓
PUBLISHED
```

Erros:

``` text
FAILED
LICENSE_BLOCKED
NO_MEDIA
QUALITY_REJECTED
```

------------------------------------------------------------------------

# 40. Worker

No começo não é necessário Redis/RabbitMQ.

Criar um worker Node:

``` text
worker.ts
```

Loop:

``` text
buscar próximo job
executar
salvar status
aguardar
```

Somente um job pesado de renderização por vez inicialmente.

------------------------------------------------------------------------

# 41. Scheduler

Pode utilizar cron.

Exemplo:

``` text
08:00 descobrir tendências
08:10 criar projeto
08:15 pesquisar mídia
08:30 produzir
09:00 renderizar
09:10 quality check
```

No período inicial, parar em:

``` text
READY_FOR_REVIEW
```

------------------------------------------------------------------------

# 42. Painel

## Dashboard

Mostrar:

``` text
Vídeos produzidos
Aguardando revisão
Publicados
Falhas
Views
Qualidade média
```

## Projetos

Cards:

``` text
thumbnail
tema
status
quality score
duração
```

## Revisão

Player + informações:

``` text
tema
roteiro
assets
fontes
licenças
quality score
```

Botões:

``` text
PUBLICAR
REFAZER
EDITAR
DESCARTAR
```

## Biblioteca

Pesquisar assets locais.

Filtros:

``` text
fonte
licença
categoria
orientação
resolução
```

## Configurações

``` text
idioma
duração
fontes
templates
voz
quantidade por dia
quality threshold
plataformas
```

------------------------------------------------------------------------

# 43. Página de transparência de mídia

Para cada vídeo, permitir visualizar:

``` text
Asset 1
Pexels
Autor: ...
Licença: ...
URL original: ...

Asset 2
Wikimedia Commons
Autor: ...
Licença: CC BY ...
Atribuição: necessária
```

Isso facilita auditoria e atribuições.

------------------------------------------------------------------------

# 44. Estrutura sugerida

``` text
src/

  app/

  modules/

    trends/
    planner/
    scripts/
    media-search/
    licenses/
    downloader/
    analyzer/
    scene-selector/
    voice/
    captions/
    composer/
    renderer/
    quality/
    metadata/
    publishing/
    analytics/

  providers/

    media/
      pexels.ts
      pixabay.ts
      wikimedia.ts
      archive.ts
      nasa.ts

    publishers/
      youtube.ts
      instagram.ts
      facebook.ts
      tiktok.ts

  lib/

    ffmpeg/
    whisper/
    ollama/

  workers/

    video-worker.ts

  storage/

    media/
    projects/
    exports/
```

------------------------------------------------------------------------

# 45. Configuração

Arquivo:

``` text
config/video-engine.json
```

Exemplo:

``` json
{
  "language": "pt-BR",
  "resolution": "1080x1920",
  "minDuration": 25,
  "maxDuration": 50,
  "qualityThreshold": 80,
  "maxRetries": 2,
  "approvalRequired": true,
  "videosPerDay": 1
}
```

------------------------------------------------------------------------

# 46. MVP V2 --- Escopo realista

Apesar de a arquitetura prever muita coisa, implementar primeiro:

### Fase 1

``` text
Tema definido pelo usuário
→ roteiro
→ busca Pexels/Pixabay
→ download
→ seleção de cenas
→ TTS
→ legendas
→ FFmpeg
→ vídeo
```

### Fase 2

Adicionar:

``` text
Wikimedia
Internet Archive
NASA
License Guard
Quality Check
```

### Fase 3

Adicionar:

``` text
Trend Finder
escolha automática de tema
templates
hooks alternativos
auto retry
```

### Fase 4

Adicionar:

``` text
publicação
analytics
feedback loop
```

------------------------------------------------------------------------

# 47. Primeiro teste recomendado

Criar somente o template:

``` text
CURIOSIDADE
```

Tema de teste:

``` text
curiosidades sobre o espaço
```

Pipeline:

``` text
LLM local
   ↓
roteiro de 30-40s
   ↓
5-8 pesquisas visuais
   ↓
Pexels/Pixabay/Wikimedia/NASA
   ↓
seleção de 8-12 clips
   ↓
Kokoro/Piper
   ↓
Whisper
   ↓
legendas
   ↓
FFmpeg
   ↓
1080x1920
   ↓
quality check
   ↓
READY_FOR_REVIEW
```

Se esse único pipeline produzir consistentemente vídeos bons, expandir
para outros nichos.

------------------------------------------------------------------------

# 48. Critério de sucesso inicial

A V2 é considerada validada quando o sistema conseguir:

1.  receber ou descobrir um tema;
2.  produzir roteiro coerente;
3.  encontrar automaticamente mídia legalmente utilizável;
4.  registrar fonte/licença;
5.  montar cenas relacionadas ao roteiro;
6.  gerar narração e legendas;
7.  produzir vídeo vertical com boa aparência;
8.  passar no quality check;
9.  chegar em `READY_FOR_REVIEW` sem edição manual;
10. permitir que o usuário assista e considere o vídeo publicável.

O objetivo inicial **não é produzir 100 vídeos por dia**.

O objetivo é chegar ao ponto em que:

> o sistema produz sozinho um vídeo que você realmente publicaria.

Depois disso, escala, publicação automática e otimização por métricas
passam a fazer sentido.
