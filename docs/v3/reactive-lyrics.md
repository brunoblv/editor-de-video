# Reactive Lyrics — estado da implementação

Referência: [requisitos](../reactive-lyrics-studio-requisitos.md). Esta entrega cobre a **Fase 0 (§11): auditoria + prova de conceito**. Nada de banco, UI ou fila foi alterado, e os fluxos existentes não foram tocados.

## O que existe

| Peça | Onde | Requisitos |
|---|---|---|
| Contratos Zod `MusicalMap` v1 e `LyricAlignment` v1, vínculo de efeito (`effectBindingSchema`) | `packages/domain/src/lyrics.ts` | RF-028, §6 |
| Importação TXT, LRC (incl. `[offset]`, refrão com vários tempos e LRC estendido `<mm:ss.xx>` por palavra), SRT e VTT (incl. tempos inline) | idem, `parseLyrics` | RF-009, RF-017 |
| Offset global não destrutivo, QA de tempos (`lyricIssues`), resolução para composição sem interpolar palavras, recorte de trecho | idem | RF-012, RF-015, RF-016, RF-049, RF-059 |
| Analisador musical em TypeScript: FFmpeg → PCM mono 22,05 kHz → RMS, graves/médios/agudos, onsets (fluxo espectral em bandas log), BPM (autocorrelação, prior 120) e batidas (DP de Ellis) | `packages/integrations/src/music-analysis.ts` | RF-020..RF-023 |
| Presets `NEON`, `MINIMAL`, `GLITCH_ROCK` (paleta + vínculos) | `packages/templates/src/lyrics-presets.ts` | RF-030, §5 |
| Template Hyperframes `reactive-lyrics@1` | `packages/templates/compositions/reactive-lyrics/` | RF-031..RF-037 |
| Script ponta a ponta com cache de análise, QA e manifesto | `apps/render-worker/src/render-lyrics.ts` | RF-003, RF-007, RF-029, RF-057, RF-058, RF-065 |

### Como o template funciona

- Letra, séries do mapa e vínculos entram por `assets/lyrics-data.js` (JSON atribuído a `window.__LYRICS__`), carregado de forma síncrona para a timeline GSAP ser montada sem espera.
- Destaque vem dos tempos da letra, nunca da batida. Linha sem tempo para todas as palavras acende inteira (modo linha).
- Reatividade: um tween cobre a duração e, a cada seek, lê o mapa no instante (interpolação linear e suavização causal pré-calculada). Partículas e barras de glitch usam PRNG com semente. Não há `Math.random()` nem relógio real.
- Áreas seguras: no 9:16, 15% no topo, 25% embaixo e 14% à direita (interface das redes); no 16:9, 7–14%. A letra quebra em até 3 linhas e encolhe se não couber.
- Intensidade 0 desliga todo efeito reativo. `reducedMotion` remove escala, tremor e partículas. `limitFlashes` (padrão) limita efeitos de impacto a 3 por segundo.
- Refrão ×1,25 e verso ×0,8 na intensidade (Neon e Glitch) quando há seções.
- Fontes embutidas no Hyperframes (Montserrat, Inter, League Gothic), sem depender das fontes do sistema.

## Como rodar

```bash
npm run build:packages
npm run lyrics:render -w @editor-video/render-worker -- \
  --audio musica.wav --lyrics letra.lrc --preset NEON --format 9:16 \
  --start 30 --duration 15 --sections 0-14:verse,14-30:chorus --out saida.mp4
```

- `--quality final` exige `--rights` (declaração de autorização) e letra sem erros de tempo no trecho. O padrão é a prévia (`draft`).
- `--offset <ms>`, `--mode karaoke|line`, `--intensity 0-100`, `--reduced-motion`, `--allow-flashes`, `--credit`.
- `--project-dir <dir>` só monta o projeto Hyperframes, para `hyperframes preview|check` nesse diretório. O `snapshot` do Hyperframes 0.8.190 usa os valores padrão das variáveis, não o `variables.json`.
- Limites: `LYRICS_MAX_AUDIO_SEC` (600) e `LYRICS_MAX_AUDIO_MB` (200). O cache fica em `LYRICS_CACHE_DIR`, com padrão `~/.cache/editor-video/reactive-lyrics`, e a chave é `<sha256>-<versão do algoritmo>`.
- Ao lado do MP4 sai `<nome>.manifest.json` com hashes, versões, parâmetros, vínculos, problemas da letra, tempos por etapa e QA.

## Testes

- `npm test -w @editor-video/domain`: parsers (TXT/LRC/LRC estendido/SRT/VTT), offset, QA de tempos, schema do mapa, interpolação e recorte.
- `npm test -w @editor-video/integrations`: `music-analysis.test.ts` gera uma faixa sintética no FFmpeg (bumbo a 120 BPM + chimbal no contratempo) e confere BPM, batidas a 500 ms em fase com o bumbo, separação grave/agudo, determinismo e silêncio (BPM null, sem NaN). `hyperframes.test.ts` valida parâmetros e o arquivo exigido do template.

## Decisões da Fase 0 (a confirmar)

1. **Hyperframes como adaptador principal.** O seek determinístico funcionou com a timeline síncrona. Remotion fica como alternativa, porque o template consome só `LyricsCompositionData`.
2. **Análise em TypeScript em vez de Librosa.** Não exige Python, é determinística e já entrega o contrato `MusicalMap`. Librosa pode entrar depois como outro analisador com o mesmo contrato e outra `analysisVersion`, se a qualidade em músicas reais pedir.
3. **Alinhamento automático (WhisperX/faster-whisper) ainda não existe.** Nesta máquina o Python 3.13 não tem `faster_whisper` nem `whisperx`. Hoje os tempos vêm de LRC/SRT/VTT. TXT importa sem tempo e não renderiza linhas (fica bloqueado no QA).

## Pendente (Fase 1+)

- Tipo de projeto `LYRICS` e modelos Prisma (migração aditiva), jobs na fila do render-worker com cancelamento/retomada, upload pelo hub.
- Telas A–D (criação, sincronização com waveform, design/timeline e revisão), undo/redo, validação manual de linhas (`VALIDATED`).
- Alinhador WhisperX como serviço Python via `runProcess`, transcrição assistida.
- Sugestão de seções (RF-026), plano artístico pelo agente (P1), fundos próprios/licenciados (RF-039).
- QA de layout no render (hoje o template encolhe a letra para caber, mas não reporta).
- Benchmark de 30 s e 3 min no hardware real (RNF-005) e medição de drift em músicas reais.
