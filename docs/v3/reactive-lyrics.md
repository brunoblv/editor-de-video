# Reactive Lyrics Studio — estado, operação e evidências

Referências: [requisitos](../reactive-lyrics-studio-requisitos.md), [instruções de implementação](../claude-reactive-lyrics-implementacao.md), [auditoria e plano](../reactive-lyrics-studio-plano.md).

Entrega: **P0 (Etapas 0–3)**. A Etapa 4 (Opus como diretor artístico, P1) não foi iniciada.

## Decisões do usuário (04/11/2026)

Estas decisões mudam regras da especificação original:

- **Áudio do YouTube**: qualquer vídeo pode ser buscado e baixado (yt-dlp). A especificação dizia "não buscar músicas de fontes não licenciadas", e a especificação V2 limitava o yt-dlp a conteúdo permitido. O download exige declaração de direitos. O asset registra `provider: youtube`, `sourceUrl`, canal, licença informada pelo YouTube e quem declarou. A interface avisa que baixar contraria os termos do YouTube e que música comercial pode gerar reivindicação ou strike.
- **Letra automática**: só por transcrição local (faster-whisper) do próprio áudio. Não se usam APIs de letra de terceiros. A letra transcrita entra como sugestão (`source: asr`, `SUGGESTED`/`LOW_CONFIDENCE`) e nunca validada. O upload de letra continua e tem prioridade.

## Como funciona

Um projeto Reactive Lyrics é um `VideoProject` comum da V3. A timeline guarda:

| Trilha | Conteúdo |
|---|---|
| `A1` | A música (clipe do áudio original, só o trecho escolhido) |
| `V1` | Composição `reactive-lyrics@1` (item `lyrics-fx`) com preset, cores, intensidade, seções e vínculos |
| `L1` (`role: 'lyrics'`) | Uma legenda por linha da letra, com estado (`UNALIGNED`, `SUGGESTED`, `LOW_CONFIDENCE`, `VALIDATED`), estrofe, origem e palavras em frames |

- Toda edição (tempo de palavra, texto, offset, validação, visual) é uma **revisão** por `commitPatch` com `expectedRevisionId`. Revisão obsoleta → 409, nada é sobrescrito.
- **Validar** uma linha a bloqueia. O agente não valida, não desbloqueia e não altera linha validada.
- A tabela `LyricsProject` guarda o que não é edição: áudio de origem, arquivo de letra (asset `DOCUMENT`, para proveniência), idioma, **declaração de direitos** e a chave do **mapa musical** no storage.
- **Análise musical**: etapa `music` do job `ANALYZE`. O JSON fica em `cache/music/<sha256>-<versão>.json`; o mesmo áudio com a mesma versão não é reanalisado.
- **Efeitos**: calculados em TypeScript, por frame (`computeReactiveFrames`), sobre a música inteira no grid do mapa. O template só lê os valores. A prévia de um trecho dá exatamente os mesmos valores do render completo naquele instante.
- **Render**: o compilador único aceita um trecho (`range`). O handler gera `assets/lyrics-data.js` a partir da revisão e do mapa, e renderiza só a janela no fps da timeline. O FFmpeg monta a imagem com o áudio original (perfil de loudness `none`: sem normalização, pitch ou tempo), valida, calcula o hash e cria a entrega.
- **Regras de render**:
  - prévia exige o mapa musical;
  - final exige direitos declarados e nenhuma linha `UNALIGNED` ou além do áudio no trecho;
  - render final não publica nada; a aprovação continua na aba Revisão.

### Vínculos e presets

`effectBindingSchema` tem:
- `source` ∈ bass, mids, treble, rms, onset, beat;
- `target` ∈ scale, glow, opacity, translate, particles, glitch;
- `gain`, `threshold`, `smoothingMs`, `cooldownMs`, `clampMin`, `clampMax`, `enabled`.

| Preset | Vínculos | Visual |
|---|---|---|
| **Cinematic Atmospheric** (principal, padrão do formulário) | graves→microzoom do cenário e pulso leve da letra, agudos→brilho do cenário e da letra, transientes→poeira de luz | Cenas de tela inteira, letra branca em maiúsculas por fragmentos. Ver [abaixo](#preset-cinematic-atmospheric) |
| Neon Cinematic | graves→escala, agudos→brilho, energia→fundo, transientes→partículas | Montserrat com brilho neon |
| Minimal Lyrics | graves→escala (sutil), energia→fundo | Inter, barra de progresso, fundo claro |
| Glitch Rock | graves→escala, transientes→tremor e glitch (RGB + barras), agudos→brilho, energia→fundo | League Gothic em caixa alta |

Limites de legibilidade:
- cada alvo tem teto por preset (`TARGET_LIMITS`);
- intensidade 0 desliga tudo;
- movimento reduzido remove escala, tremor, partículas e glitch e corta o brilho pela metade;
- o limite de flashes (ligado por padrão) mantém efeitos de impacto em no máximo 3 por segundo.

Seções manuais (refrão ×1,25, verso ×0,8; no Cinematic, ponte ×0,6; o Minimal ignora) ficam no parâmetro `sections`.

Alvos novos (todos os presets aceitam; só o Cinematic os usa por padrão): `bgZoom` (microzoom do cenário) e `brightness` (brilho do cenário). `textAudioReactivity` e `backgroundAudioReactivity` (0–100) escalam separadamente os alvos da letra e do cenário, além da intensidade global.

### Preset Cinematic Atmospheric

Referência visual: [reactive-lyrics-referencia-cinematic.md](../reactive-lyrics-referencia-cinematic.md). Os outros três presets continuam iguais: o template só entra no ramo novo com `preset: cinematic`.

**O que é calculado no domínio** (`packages/domain/src/lyrics-cinematic.ts`, sem navegador):

- **Fragmentos** (`groupLyricWords`):
  - nunca cruzam a linha da letra;
  - quebram na pontuação e em pausas maiores que 0,6 s;
  - oração longa vira pedaços equilibrados (5 palavras com máximo 4 dão 3+2, nunca 4+1);
  - os tempos das palavras não são alterados.
- **Modos de exibição**: `word` (uma palavra por vez), `phrase` (fragmentos) e `hybrid` (padrão). O híbrido mostra palavra a palavra quando a duração mediana das palavras da oração passa de 650 ms (canto lento) e usa fragmentos no canto rápido.
- **Destaque**: no máximo um por fragmento, em linha própria e maior (`emphasisScale`, 1–2×, padrão 1,4×). Entra por dois caminhos:
  - a palavra está na lista `emphasisWords` (sem diferenciar acento nem caixa);
  - com `autoEmphasis`, é uma **nota sustentada**: a palavra que dura ≥ 1,8× a mediana da linha e ≥ 550 ms.
- **Linha sem tempo por palavra**: aparece inteira, no intervalo da linha. Nenhuma palavra é interpolada.
- **Cenas** (`planScenes`), sobre a lista `scenes` (JSON). Sem lista, usa atmosferas procedurais em rodízio:
  - `by_phrase` (padrão): corta 250 ms antes do início de uma linha (ou após pausa > 1,2 s), com cena mínima de `minSceneSec` (6 s) e sem deixar cena curta no fim;
  - `by_section`: corta nos limites das seções; sem seções, cai em `by_phrase`;
  - `manual`: cada cena começa no `startMs` (ms da música) e vai até a próxima ou até o `endMs`;
  - `ai_suggested`: heurística determinística sobre o mapa musical. Pontua os inícios de frase pela mudança de energia (RMS + graves, 2 s antes/depois) e pelas seções, e escolhe cerca de uma cena a cada 8 s. **Não usa LLM**: o diretor artístico por IA (Etapa 4) continua no backlog.

**No template:**

- Cenário:
  - imagem com `object-fit: cover`;
  - ou atmosfera procedural em CSS (`ocean`, `rose_moon`, `fog_city`, `cosmos`, `ember`, `storm`), sem mídia de terceiros;
  - troca com dissolve de 0,8 s ou corte (`sceneTransition`).
- `backgroundMotion`:
  - `slow_zoom`: 1,03↔1,11, alternando o sentido;
  - `pan`: ±2,5 %;
  - `parallax_if_available`: as camadas das atmosferas se movem por profundidade; imagens não têm camadas e usam zoom lento;
  - `none`.
  - O movimento reduzido desliga tudo isso.
- Vinheta radial atrás da linha do texto, mais escurecimento das bordas (`contrastOverlayStrength`, 0–100). Não há tarja nem caixa.
- Letra:
  - Montserrat, branca, em maiúsculas (`uppercase`), centralizada na área segura;
  - o fragmento encolhe por inteiro até caber (largura ≤ 94 %, altura ≤ 55 %) e mantém a proporção do destaque;
  - cada palavra entra no **seu início validado** com `textTransition` (`blur` padrão, `fade`, `scale`, `slide`), em `textTransitionFrames`, nunca mais longa que a própria palavra;
  - o fragmento sai antes do próximo entrar; uma pausa longa deixa só o cenário.
- Sem barras de espectro, equalizador ou ondas.

**Parâmetros da composição** (todos validados pelo template e revisionados por `updateCompositionParams`): `lyricDisplayMode`, `maxWordsPerGroup` (1–8), `maxLines` (1–3), `uppercase`, `emphasisWords`, `autoEmphasis`, `emphasisScale`, `textTransition`, `textTransitionFrames` (2–30), `sceneChangePolicy`, `minSceneSec`, `sceneTransition`, `backgroundMotion`, `backgroundAudioReactivity`, `textAudioReactivity`, `contrastOverlayStrength` e `scenes`.

**Cenas com imagem:**

- Formato da entrada: `{"file":"assets/scenes/<nome>.jpg|png|webp","label":"…"}`. O asset vem do parâmetro `$file:assets/scenes/<nome>.jpg` = assetId, o mesmo mecanismo dos outros templates.
- `assertCompositionParams` recusa:
  - cena sem `$file:` correspondente;
  - caminho fora de `assets/scenes/`;
  - imagem e atmosfera na mesma entrada;
  - política manual sem nenhum `startMs`.
- No estúdio (aba Visual, preset Cinematic), o upload de imagem exige a **licença** (vai para o asset junto com autor e tag `lyrics-scene`).
- Remover a cena manda `"$file:…": null`. O `updateCompositionParams` agora **remove a chave quando o valor é `null`**.

**Limitações:**

- Fundo em vídeo ainda não é aceito nas cenas; só imagens.
- Não há geração de fundo por IA.
- Não há catálogo de mídia licenciada: as atmosferas procedurais fazem esse papel.
- Linhas cantadas ao mesmo tempo: o fragmento anterior sai quando o seguinte começa, e as palavras dele que ainda não entraram não aparecem.
- A comparação visual com o MP4 de referência não foi feita: o arquivo não está no workspace.

## Operação

### Pré-requisitos

- Node 22, FFmpeg/ffprobe no PATH e Chrome do Hyperframes (baixado pelo próprio Hyperframes 0.8.190).
- Postgres com a migração `20261103000000_reactive_lyrics` (somente aditiva). No banco real, **faça backup antes**:
  ```bash
  npm run db:migrate:deploy
  ```
  Sem a migração, projetos comuns continuam abrindo (a leitura de `LyricsProject` tolera a tabela ausente), mas o Lyrics não funciona.
- Redis + `render-worker` rodando para análise, transcrição e render (`npm run dev:v3`). Sem Redis o job fica no banco e o dispatcher reenvia.
- **YouTube**: `yt-dlp` no PATH (ou `YTDLP_BIN`). Testado com 2026.08.19; a busca não precisa de chave de API.
- **Letra automática**: faster-whisper num ambiente Python isolado. O worker o encontra sozinho em `~/.cache/editor-video/whisper-venv`:
  ```bash
  python -m venv ~/.cache/editor-video/whisper-venv
  ~/.cache/editor-video/whisper-venv/Scripts/python -m pip install -r workers/media/requirements.txt   # Linux/macOS: bin/python
  ```
  - Modelo: `LYRICS_WHISPER_MODEL` (padrão `small`, ~460 MB baixados do Hugging Face no primeiro uso; `base` é mais rápido e erra mais). Outro Python: `LYRICS_PYTHON_BIN`.
  - O áudio é decodificado pelo FFmpeg dentro do script, porque o PyAV 19 quebra o decodificador embutido do faster-whisper.
- Nenhuma IA paga, GPU ou chave de API é necessária.

### No hub

1. **Projetos → Novo Reactive Lyrics**: canal, título, música, letra, trecho, formatos (9:16 e/ou 16:9), preset, crédito e declaração de direitos.
   - **Música por arquivo**: MP3/WAV/FLAC, até 600 s e 200 MB.
   - **Música pelo YouTube**: aba "Buscar no YouTube" → digite → escolha → o vídeo toca no player oficial → **Marcar início** / **Marcar fim** → marque a declaração → "Baixar áudio e usar este trecho". O trecho marcado preenche início e duração.
   - **Letra**: arquivo TXT/LRC/SRT/VTT ou colada. Sem letra, marque "Transcrever automaticamente": o projeto nasce com a letra vazia e o job `TRANSCRIBE` a preenche com o Whisper.
2. O estúdio abre e a análise musical entra na fila (chip "Analisando música" → "Análise ok · 120 BPM").
3. **Letra**: no cartão "Letra automática", **Transcrever a letra** roda o Whisper no trecho; **Aplicar transcrição** troca as linhas não validadas (as validadas ficam). Ouça o **áudio original** e ajuste as linhas:
   - arrastar blocos e bordas na waveform;
   - campos de início/fim com ±1 frame;
   - atalhos <kbd>I</kbd> (início), <kbd>O</kbd> (fim) e <kbd>T</kbd> (toque por palavra);
   - offset global, edição de palavras, validar, reimportar.

   <kbd>Shift</kbd>+arrastar na waveform marca um loop.
4. **Visual**: preset, destaque, intensidade, ganho/suavização de cada vínculo, movimento reduzido, flashes, cores, posição, crédito e seções. "Salvar visual" grava uma revisão.
5. **Prévia do trecho** (loop ou 8 s a partir do playhead) ou da música inteira; aparece em "Prévia renderizada".
6. **Render → Exportar 9:16 / 16:9**: MP4 H.264/AAC; baixe em Entregas.
7. Reabrir o projeto mostra a última revisão, o mapa e as entregas.

### Linha de comando (sem banco)

Usa a mesma timeline e os mesmos dados de composição do hub:

```bash
npm run build:packages
npm run lyrics:render -w @editor-video/render-worker -- \
  --audio musica.wav --lyrics letra.lrc --preset GLITCH_ROCK --format 9:16 \
  --start 30 --duration 15 --sections 0-14:verse,14-30:chorus --out saida.mp4
```

- Presets: `CINEMATIC_ATMOSPHERIC_LYRICS`, `NEON_CINEMATIC`, `MINIMAL_LYRICS`, `GLITCH_ROCK` (os nomes curtos `CINEMATIC`, `NEON`, `MINIMAL` e `GLITCH` também valem).
- Cinematic: `--scene` (repetível) recebe uma imagem JPG/PNG/WebP ou uma atmosfera. Os outros controles são `--display word|phrase|hybrid`, `--emphasis "mar,coração"`, `--policy by_phrase|by_section|ai_suggested`, `--motion slow_zoom|pan|parallax_if_available|none` e `--transition blur|fade|scale|slide`. Exemplo:
  ```bash
  npm run lyrics:render -w @editor-video/render-worker -- --audio musica.wav --lyrics letra.lrc \
    --preset CINEMATIC --format 9:16 --scene mar.jpg --scene rose_moon --scene cidade.jpg --emphasis "mar" --out saida.mp4
  ```
- `--quality final` exige `--rights`. Ao lado do MP4 sai `<nome>.manifest.json` com hashes, versões, parâmetros, plano e QA.

### API

| Rota | Uso |
|---|---|
| `GET/POST /api/v3/lyrics/projects` | Presets e limites / criar projeto |
| `GET /api/v3/projects/:id/lyrics` | Estado: direitos, análise, trecho, QA da letra |
| `GET /api/v3/projects/:id/lyrics/map` | Mapa musical recortado no trecho |
| `POST /api/v3/projects/:id/lyrics/import` | Reimportar letra (preserva linhas validadas) |
| `POST /api/v3/projects/:id/lyrics/rights` | Declarar ou retirar direitos |
| `POST /api/v3/projects/:id/lyrics/analyze` | Analisar de novo |
| `GET /api/v3/lyrics/youtube?q=` | Busca no YouTube (yt-dlp, até 12 resultados) |
| `POST /api/v3/lyrics/youtube` | `{ videoId, rights: { declared: true, note } }` → baixa o áudio (FLAC) e registra o asset com a origem |
| `POST /api/v3/projects/:id/lyrics/transcribe` | Enfileira a transcrição (Whisper) do trecho |
| `POST /api/v3/projects/:id/lyrics/transcript` | Aplica a última transcrição sobre as linhas não validadas |
| `POST /api/v3/revisions/:id/renders` | Agora aceita `range: { startFrame, endFrame }` (prévia de trecho) |
| `POST /api/v3/assets/uploads?analyze=0` | Upload sem a análise genérica (o Lyrics enfileira a própria) |

## Testes

| Suíte | O que cobre |
|---|---|
| `packages/timeline/test/lyrics.test.ts` (15) | Conversão ms↔frames sem drift (inclusive 29,97 fps), importação para frames, ops de letra, bloqueio por validação, agente proibido, offset, moveClip com palavras, parâmetros de composição, QA, compilação da letra e do trecho |
| `packages/domain/test/reactive.test.ts` (9) | Graves mudam a escala e não o brilho; agudos mudam o brilho e não a escala; intensidade 0; movimento reduzido; ≤ 3 flashes/s; determinismo; trecho igual ao completo; seções; validação de vínculos; montagem A1/V1/L1; escape do script de dados |
| `packages/db/test/lyrics.integration.test.ts` | Postgres real: criação, análise, mapa, prévia de trecho, edição de palavra como revisão, 409, revisor sem edição, parâmetros validados, reimportação preservando linha validada, agente bloqueado, regras do final |
| `packages/domain/test/cinematic.test.ts` (10) | Fragmentos equilibrados sem mudar tempos; pontuação e pausa; destaque por lista e por nota sustentada; híbrido; linha sem tempo; cenas por frase (duração mínima, várias frases, corte antes da frase), seção, manual e sugerida pelo mapa (determinística); validação de cenas e `$file:`; microzoom por graves e brilho por agudos; reação individual de letra e cenário; intensidade 0; a reação não muda os fragmentos |
| `apps/render-worker/test/reactive-lyrics.test.ts` | Hyperframes real: mesma entrada → frame idêntico; mapa alterado → frame diferente. Cinematic: idem, e com intensidade 0 mapas diferentes dão o mesmo frame |
| `packages/integrations/test/youtube-audio.test.ts` | Leitura da busca do yt-dlp; só ID de 11 caracteres (sem URL nem argumento do cliente). Com `LYRICS_NETWORK_TEST=1`: busca e download reais com limite de duração |
| `apps/render-worker/test/lyrics-youtube.test.ts` | Com `LYRICS_NETWORK_TEST=1` e o banco: download recusado sem declaração, asset com origem, projeto com letra automática, jobs ANALYZE + TRANSCRIBE pelos handlers, linhas `asr` com confiança, reaplicação preservando a linha validada |
| `apps/render-worker/test/lyrics-e2e.test.ts` | Upload → análise (handler) → edição → prévia completa e de trecho comparadas → finais 16:9 e 9:16 com ffprobe → palavra acende no frame editado → reabertura |

```bash
docker run -d --name ev-lyrics-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=ev_test -p 55433:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
DATABASE_URL=postgresql://test:test@localhost:55433/ev_test npx prisma migrate deploy   # em packages/db
export V3_TEST_DATABASE_URL=postgresql://test:test@localhost:55433/ev_test
npm run test:v3 && npm test -w @editor-video/render-worker
LYRICS_E2E_SEC=30 LYRICS_E2E_KEEP_DIR=./gate3 npm test -w @editor-video/render-worker   # evidência de 30 s
```

## Demonstração (03/11/2026, Windows 11, Node 22.17, Postgres 16 descartável)

Faixa sintética original de 32 s (bumbo a 120 BPM, chimbal no contratempo, graves mais fortes na segunda metade) e LRC original com uma palavra a cada 2 s. Trecho de 30 s, preset Minimal, formatos 16:9 + 9:16. A primeira palavra foi editada para 3 frames depois.

| Etapa | Tempo |
|---|---|
| Análise musical (32 s de áudio) | 2,2 s |
| Prévia completa 960×540, 30 s | 70 s |
| Prévia de trecho, 2 s | 25 s |
| Final 1920×1080, 30 s | 209 s (~7× tempo real) |
| Final 1080×1920, 30 s | 183 s |

- ffprobe dos finais: H.264 1920×1080 e 1080×1920 a 30 fps, AAC, vídeo e áudio com 30,000 s.
- BPM estimado 120.
- A palavra editada acende **exatamente no frame 15**: o destaque passa de 50 px para 4128 px entre os frames 14 e 15.
- A prévia de trecho tem a mesma imagem da prévia completa nos frames comparados.
- Gate 0: mesmo mapa → 0,00% de pixels diferentes; mapa com graves, agudos e energia altos → 93% dos pixels diferentes.

## Limitações conhecidas

- **Letra transcrita erra.** No teste real ("Me at the zoo", modelo `base`) o Whisper ouviu "punks" em vez de "trunks" e "one of" em vez de "in front of". Em música cantada com instrumental o erro é maior. Por isso a letra entra sempre como sugestão, com confiança por palavra.
- **Não há alinhamento forçado de letra enviada.** O Whisper transcreve; ele não alinha uma letra que você já tem. Para letra enviada, os tempos vêm de LRC/SRT/VTT ou da sincronização manual. O WhisperX segue no backlog.
- **YouTube**: depende do yt-dlp acompanhar as mudanças do site (atualize com `yt-dlp -U`). Vídeos ao vivo e acima de 600 s são recusados. O download é síncrono na requisição (~7 s para 19 s de áudio).
- **TXT** entra como rascunho `UNALIGNED` distribuído no trecho; o final só libera depois de sincronizar.
- **Render** ~7× tempo real em 1080p neste hardware; prévias em metade da resolução. Não há fallback automático para 720p.
- **Player do estúdio**: não há composição em tempo real no navegador. O estúdio toca o áudio original com a letra destacada ao vivo; o visual reativo só aparece na prévia renderizada.
- **Seções** são manuais; a sugestão automática (RF-026) é P1.
- Linhas consecutivas no mesmo espaço: a entrada da próxima espera a saída da anterior (~0,16 s no Glitch).
- O `hyperframes snapshot` 0.8.190 ignora `variables.json` (usa os padrões).
- **Não testado**: banco real (a migração não foi aplicada nele), Redis/BullMQ real com o worker separado e música comercial real. O `next build` não foi rodado, porque o servidor de desenvolvimento estava ativo sobre o mesmo `.next`; as páginas e rotas novas compilaram no `next dev` (`/hub/projetos` 200; rotas da API respondendo).

## Próximo backlog

1. Alinhamento forçado (WhisperX) da letra enviada sobre o áudio, com `LOW_CONFIDENCE` por palavra.
2. Etapa 4: `ArtisticPlan` versionado pelo agente (paleta e intensidade por seção), aplicado por patch e com aprovação.
3. Sugestão de seções a partir do mapa (RF-026); fundos próprios ou licenciados (RF-039).
4. QA de layout no render (o template encolhe a letra para caber, mas não reporta).
5. Benchmark de 3 min e fallback 720p em hardware limitado.
