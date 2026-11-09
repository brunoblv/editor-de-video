# Reactive Lyrics Studio — auditoria e plano de implementação

Referências: [requisitos](reactive-lyrics-studio-requisitos.md), [instruções de implementação](claude-reactive-lyrics-implementacao.md), [estado V3](v3/implementacao.md). O resultado das etapas fica em [v3/reactive-lyrics.md](v3/reactive-lyrics.md).

## 1. Inventário reutilizável (auditoria da V3)

| Peça existente | Onde | Como o Reactive Lyrics usa |
|---|---|---|
| `VideoProject` + `TimelineRevision` + `commitPatch`/`commitDocument` (trava `FOR UPDATE`, `expectedRevisionId`, 409) | `packages/db/src/v3/projects.ts` | Projeto Lyrics é um `VideoProject` comum. Toda edição de letra, tempo e visual é uma revisão |
| Documento de timeline em frames inteiros, `rescale` racional sem drift | `packages/timeline/src/schema.ts`, `time.ts` | Letra em itens `caption` (frames), áudio em clipe `A1`, visual em item `composition` |
| Operações + checagem de bloqueio + agente sem `setLock` | `packages/timeline/src/operations.ts`, `patch.ts` | Linha validada = item bloqueado. O agente não valida nem desbloqueia |
| Compilador único prévia/final | `packages/timeline/src/compile.ts` | Ganha o trecho (`range`) para prévia segmentada e a lista de linhas de letra |
| Assets por hash, upload em streaming com limite | `packages/db/src/v3/assets.ts`, `/api/v3/assets/uploads` | Áudio MP3/WAV/FLAC e o arquivo de letra (DOCUMENT) com origem/licença |
| Jobs com lease/heartbeat/cancelamento/retry, etapas cacheadas (`runStep` + `ArtifactCache`) | `packages/db/src/v3/jobs.ts` | Análise musical = etapa do job `ANALYZE`; render = `RENDER_PREVIEW`/`RENDER_FINAL` |
| Render: composições Hyperframes cacheadas → FFmpeg → validação → hash → entrega | `apps/render-worker/src/handlers/render.ts` | Composição `reactive-lyrics` recebe dados gerados da revisão + mapa musical |
| Entregas, aprovação vinculada ao hash, publicação separada | `packages/db/src/v3/review.ts` | Entrega revisável e baixável; nada é publicado |
| Estúdio do hub (revisões, desfazer por restauração, SSE de jobs) | `apps/web/src/components/hub/studio` | Estúdio Lyrics próprio, com os mesmos padrões |
| `runProcess` (sem shell), `analyzeMusic` (Fase 0) | `packages/integrations` | Análise e render |

`ProjectKind` é o enum **legado** (`Project`, apps/worker). A V3 não tem "tipo" de projeto: o formato é definido pelo conteúdo da timeline. Por isso o Lyrics não cria valor em `ProjectKind`; cria uma tabela 1:1 `LyricsProject` com o que não pertence à timeline (áudio de origem, declaração de direitos, mapa musical, idioma).

## 2. Gaps por requisito P0 e decisão

| Gap | Decisão |
|---|---|
| Timeline sem noção de letra (status, estrofe, origem, confiança) | Extensão **opcional** do schema: `track.role = 'lyrics'`, `caption.lyric {stanza,status,source}`, `word.confidence`. Campos ausentes não mudam o hash editorial de documentos antigos |
| Sem operação para tempo de palavra, validação, offset e parâmetros de composição | Operações novas `setLyricLine`, `validateLyrics`, `shiftLyrics`, `updateCompositionParams`. `moveClip` passa a mover as palavras junto com a legenda |
| Prévia só da timeline inteira | `compileTimeline(..., { range })` corta camadas, áudio, textos e letra no trecho |
| Composição sem dados por revisão | O handler de render gera `assets/lyrics-data.js` a partir da revisão + mapa musical; a chave de cache inclui o hash dos dados |
| Efeitos calculados dentro do HTML (não testáveis) | Cálculo dos vínculos em TypeScript (`packages/domain/src/reactive.ts`), por frame, sobre a música inteira; o template só lê os valores. Mesmo valor na prévia de trecho e no final |
| Sem persistência do projeto Lyrics | Tabela `LyricsProject` (migração aditiva `20261103000000_reactive_lyrics`) |
| Mapa musical | JSON no storage (`cache/music/<sha256>-<versão>.json`), indexado pelo `ArtifactCache`; o banco guarda só a chave |
| Alinhamento automático | Interface de alinhador com erro legível quando WhisperX não está instalado; P0 usa LRC/SRT/VTT importado e ajuste manual |

## 3. Escolhas tecnológicas verificadas por POC (Etapa 0)

- **Hyperframes 0.8.190 + GSAP 3.14.2** (já fixados no `package-lock`): render determinístico confirmado na Fase 0 (MP4 H.264/AAC 1080×1920 e 1920×1080 aprovados no QA). Sem alpha: a composição é opaca e ocupa o quadro inteiro.
- **Análise em TypeScript** (FFmpeg → PCM → FFT): BPM 120 exato e batidas a 500 ms no teste sintético; sem Python obrigatório.
- **Áudio**: mux do original; perfil de loudness `none` no projeto Lyrics (sem normalização, pitch ou tempo).

## 4. Migração

`packages/db/prisma/migrations/20261103000000_reactive_lyrics/migration.sql`, somente aditiva: cria `LyricsProject` com FKs para `VideoProject` (cascade) e `Asset` (restrict). Aplicar no banco real só depois de backup (`npm run db:migrate:deploy`).

## 5. Etapas e teste de saída

| Etapa | Entrega | Teste de saída |
|---|---|---|
| 0 | POC (Fase 0) + efeitos em TS | Teste unitário: mudar graves muda escala e não brilho; mudar agudos muda brilho e não escala. Teste Hyperframes: o mesmo frame renderizado com dois mapas difere |
| 1 | Schema/ops de letra, conversão ms↔frames, `LyricsProject`, análise no job, importação | Testes de timeline (ops, bloqueio, agente), conversão sem drift, Postgres descartável |
| 2 | API + Estúdio Lyrics (waveform, letra, propriedades, revisões) | Editar tempo de palavra gera revisão persistida; 409 com revisão obsoleta; revisor sem permissão |
| 3 | Render de trecho/final via fila, QA, entrega | e2e: upload → análise → edição → prévia de trecho → MP4 9:16 e 16:9 → entrega → reabertura |
| 4 (P1) | Diretor artístico (Opus) | Não iniciado no P0 |

**Resultado (03/11/2026):** Etapas 0–3 concluídas, com os gates verificados. Números e comandos em [v3/reactive-lyrics.md](v3/reactive-lyrics.md#demonstração-03112026-windows-11-node-2217-postgres-16-descartável).

## 6. Riscos e dependências

- **Tempo de render**: ~17× tempo real em 1080p no hardware atual (Fase 0). Prévia em `draft` com escala 0,5 e trecho curto.
- **Fontes**: só as embutidas no Hyperframes (Montserrat, Inter, League Gothic, Oswald).
- **Alinhamento automático** depende de WhisperX + modelo (GPU recomendada); fora do P0.
- **Redis**: sem Redis o job fica no banco e o dispatcher reenvia; testes executam os handlers diretamente.
- **Banco real** (`docker editor-video-postgres`) não é tocado; testes usam um container Postgres descartável.
