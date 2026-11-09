# Instruções de implementação para Claude Code — Reactive Lyrics Studio

**Status:** backlog executável, ainda não implementado.  
**Repositório:** brunoblv/editor-de-video  
**Data:** 2026-11-03  
**Documento funcional principal:** `docs/reactive-lyrics-studio-requisitos.md`  
**Fonte arquitetural prioritária:** `CLAUDE.md`, `docs/especificacao-v3-hub-editor-ia.md`, `docs/v3/implementacao.md`.

## 0. Missão do Claude Code

Implementar dentro do hub V3 existente o módulo **Reactive Lyrics Studio**, que transforma um arquivo de música e sua letra em um videoclipe de letra com:
- sincronização por linha e palavra;
- efeitos visuais realmente ligados a energia, graves, médios, agudos, batidas e transientes;
- presets visuais Neon Cinematic, Minimal Lyrics e Glitch Rock;
- edição de letra/timing, preview, revisão e exportação 9:16 e 16:9;
- persistência de projeto e retomada de jobs;
- execução local sem IA paga; Claude Opus como **diretor artístico opcional em fase posterior**, não como pré-requisito.

Não entregar apenas documentação, stubs, mockups ou simulação. Construir incrementos utilizáveis e demonstráveis, com testes e evidências reais. Trabalhar no repositório e **não remover ou reescrever sistemas anteriores**.

**Regra de escopo:** P0 será entregue primeiro; P1/P2 somente depois que o P0 tiver testes e render real. Se houver impedimento, reportar o que falta em vez de declarar pronto.

## 1. Leitura obrigatória antes de mudar código

Inspecionar código e documentação, nesta ordem:
1. `CLAUDE.md` — regras de segurança, migrações, subprocessos e patches de timeline.
2. `docs/v3/implementacao.md` — estado real, limitações e comandos.
3. `docs/especificacao-v3-hub-editor-ia.md` — conceitos de hub/canais/revisões/entregas.
4. `docs/reactive-lyrics-studio-requisitos.md` — 70 RFs, 16 RNFs, casos de aceite, dados e riscos.
5. `packages/timeline`, `packages/domain`, `packages/db`, `packages/templates`, `packages/integrations`, `apps/render-worker`, `apps/agent`, `apps/web`.

Antes de codificar, gerar em `docs/reactive-lyrics-studio-plano.md`:
- inventário dos arquivos/classes/rotas reutilizáveis;
- gaps por requisito P0;
- escolhas tecnológicas verificadas por POC;
- migrations aditivas necessárias;
- plano de implementação em etapas com teste de saída por etapa;
- riscos e dependências de ambiente e hardware.

**Não inferir a estrutura apenas pelo README.** A V3 coexiste com o legado. Distinguir `ProjectKind` legado de `VideoProject`/tipos canônicos V3 antes de criar tipo `LYRICS`.

## 2. Restrições arquiteturais inegociáveis

- A **timeline V3 é a fonte oficial de edição**. Só alterá-la através de operações/patches de `packages/timeline` com `expectedRevisionId` e `commitPatch`, conforme `CLAUDE.md`. Não gravar `documentJson` diretamente. Usar histórico de revisão e isolamento por workspace.
- Reutilizar estados, leases/heartbeat, cache, fila, autorização, entregas e revisão que já existam, sem construir um pipeline paralelo desnecessário.
- **Banco:** apenas migrations Prisma aditivas em `packages/db/prisma/migrations`; jamais `db push`, reset, wipe ou migration destrutiva no banco real. Testes SQL somente em banco descartável via `V3_TEST_DATABASE_URL`. Fazer backup antes de migração em ambiente real.
- **Subprocessos:** executar somente com o runner estruturado `runProcess`; argumentos tipados, sem shell injection e sem concatenar comandos fornecidos pelo usuário.
- **Render:** usar adaptador existente Hyperframes e avaliar ampliação; o repositório registra Hyperframes `0.8.190` e GSAP `3.14.2` fixados — conferir no package-lock antes de atualizar dependência. Não trocar a stack em massa.
- O renderizador de Hyperframes atual trata composições como mídia opaca e o preview do estúdio não é totalmente em tempo real. A solução inicial pode usar preview segmentado/renderizado. NÃO prometer sobreposição com alpha ou realtime sem validação.
- O contrato atual de timeline trabalha em **frames inteiros** e sourceTimebase racional. Se análise/alinhamento usarem milissegundos, criar conversores explícitos com arredondamento testado e sem drift. Nunca introduzir segundos float como tempo canônico da timeline.
- O plano artístico pode configurar efeitos, mas não pode sobrescrever letra/timestamps aprovados, destravar objetos ou executar código arbitrário.
- Áudio final deve partir do original, com processamento/mux documentados, sem mudar pitch ou velocidade automaticamente.
- Render final não implica autorização para publicar. Preservar aprovação vinculada à entrega/revisão.
- Registrar a origem e autorização de áudio, letra, fontes e imagens. Não buscar letras, músicas ou vídeos de fontes não licenciadas.

## 3. História principal P0 — pronta para aceitar

**Como usuário do editor**, quero importar uma música que posso usar, fornecer a letra, sincronizá-la, aplicar animações que reagem ao som, editar o resultado e exportar um lyric video sem reconstruir tudo manualmente.

**Cenário demonstrável P0:** música de teste autorizada de ~30 segundos, com 8–12 linhas de letra original, batidas contrastantes e trechos com graves/agudos. O sistema:
1. cria um projeto no hub e registra o áudio e a letra;
2. analisa música e expõe beats/energia/3 bandas/onsets;
3. alinha a letra quando houver provider disponível ou permite alinhar manualmente;
4. destaca palavras/linhas conforme os timestamps editados;
5. renderiza 3 presets com efeitos visualmente distintos e realmente dirigidos pelo MusicalMap;
6. permite reproduzir prévia de trecho, ajustar e gerar novamente;
7. exporta MP4 H.264/AAC 9:16 e 16:9;
8. gera entrega revisável/baixável, sem publicar;
9. mantém o trabalho após fechar e reabrir o projeto.

**Não considerar automático aquilo que depende de revisão humana**: áudio cantado exige letra correta; se não houver confiança suficiente, indicar `UNALIGNED` e oferecer ajuste.

## 4. Backlog implementável por incrementos

### Etapa 0 — Prova técnica e riscos (obrigatória)

- Criar POC isolada e testável com 10–15 s de áudio permitido, letra fornecida e mapa artificial/real.
- Verificar que `@hyperframes/producer` consegue renderizar texto/movimentos do GSAP por tempo determinado e produzir MP4 válido no ambiente do worker.
- Aplicar dois sinais reativos distintos: pulso por grave/RMS e flash moderado ou brilho por onset/agudos; saída deve depender do mapa e reproduzir-se após seek.
- Comprovar que áudio importado é muxado com duração correta, não com alteração de velocidade.
- Documentar benchmarks aproximados, versão de renderer, limitações de alpha, consumo de RAM e diferenças entre preview/final.
- Só depois decidir o adapter concreto e registrar evidências em `docs/reactive-lyrics-studio-plano.md`.

**Gate 0:** um vídeo de POC verificável e teste que demonstra alteração de efeito quando o MusicalMap muda. Se falhar Hyperframes, propor adapter compatível já previsto no hub em vez de declarar o recurso impossível.

### Etapa 1 — Domínio, storage e análise

Implementar:
- extensão V3 para projeto com formato Reactive Lyrics, mantendo canais genéricos;
- cadastro de áudio MP3/WAV/FLAC, metadados e hash do arquivo, com proteção de upload;
- letras em TXT/LRC/SRT/VTT; edição de Unicode/idiomas; não sobrescrever texto validado;
- pipeline offline `ffprobe/FFmpeg + librosa` ou equivalente para waveform, envelope RMS, beats, onset e espectro em bandas bass/mid/treble;
- `MusicalMap v1`, schema Zod, versionamento e cache por SHA256 da fonte + versão do analisador;
- importação/alinhamento `LyricAlignment v1`: linhas, palavras, início/fim, estado/confiança, repetição de frases; ajustes manuais;
- adapter opcional Whisper/faster-whisper e alinhador por palavra (ex.: WhisperX), configurável e com erro legível na ausência de binários/modelos;
- separação opcional de stems SOMENTE se demonstrado ganho real e custo aceitável; não bloquear MVP.

**Gate 1:** testes de formatos, invalidação de cache, tempo/ordem de palavras, erros de mídia, música sem batida forte e retomar projeto.

### Etapa 2 — Timeline e UI

Implementar páginas/componentes integrados ao hub:
- `Novo projeto > Reactive Lyrics` com áudio, letra, idioma, direitos e resolução;
- visualizador de waveform e marcadores musicais;
- painel de letra com linha/palavra ativa e `UNALIGNED`, arraste de início/fim, offset global, edição e validação;
- controles de reprodução, seek, loop de trecho e zoom de timeline;
- propriedades visuais: cor, fonte, destaque karaoke, posição, brilho, reatividade, suavização, intensidade 0–100 e modo movimento reduzido;
- safe zones para 9:16 e 16:9;
- ações de revisão/undo/redo aproveitando revisões V3.

**Gate 2:** editar o tempo da palavra e confirmar que a alteração aparece em revisão persistida sem modificar o áudio; testes de permissões e conflitos 409 com `expectedRevisionId`.

### Etapa 3 — Composição e render final

Implementar e testar:
- três templates `NEON_CINEMATIC`, `MINIMAL_LYRICS`, `GLITCH_ROCK`;
- bindings declarativos `bass->scale`, `treble->glow`, `rms->opacity`, `onset->particle/glitch` com ganho, clamp, suavização e cooldown;
- transições de letra por palavra e por linha (entrada, destaque, saída);
- escala, cor, opacidade e brilho sempre com limites para legibilidade; presets sem flashes perigosos por padrão;
- pipeline determinístico, sem depender da reprodução de áudio em tempo real, relógio de parede ou aleatoriedade sem seed;
- preview de fragmento e render final via fila/worker; transcodificação e mux com FFmpeg; QA técnico e checks de duração;
- MP4 H.264/AAC, saída 1080x1920 e 1920x1080; permitir fallback 720p em hardware limitado;
- status e progressos reais, cancelamento, retry idempotente e entrega vinculada à revisão aprovada;
- download, e retorno à edição para refazer.

**Gate 3:** vídeo real de 30 s com letra sincronizada; duas resoluções; testes que comparam frames-alvo em forte/fraco, ausência de drift >1 frame em eventos editados, áudio com duração correta, projeto reaberto e preview consistente com render.

### Etapa 4 — Claude Opus como diretor artístico (P1, após gates P0)

- Usar `apps/agent` e ferramentas já autorizadas para receber mapa, seções, letra validada e preferências.
- Criar ArtisticPlan versionado com JSON/Zod; limitar escolhas a templates, camadas, faixas de intensidade e efeitos suportados.
- Propor alterações por patch V3, respeitar locks, permissões e histórico.
- Sugerir paleta/estilo por verso/pré-refrão/refrão/ponte; permitir aceitar/rejeitar.
- Manter fallback sem chave de API; não executar prompts criativos nem consumo pago sem configuração deliberada.
- Exibir modelo, tokens/custos quando disponíveis e proveniência do plano.

**Gate 4:** plano de IA validado e aplicado sob aprovação, nenhum texto ou tempo aprovado alterado indevidamente, e render continua possível sem agente.

## 5. Contratos e comportamento

### MusicalMap

Campos necessários: schemaVersion, analysisVersion, audioSha256, durationUnits + timebase ou fonte em ms com conversão testada, bpmEstimate opcional, beats, onsets, curvas RMS/bass/mid/treble normalizadas e marcos de seção. No JSON abreviado do documento funcional há séries ilustrativas; a implementação deve validar cardinalidade, unidades e timestamps, não copiar números de exemplo.

### LyricAlignment

Campos: schemaVersion, idioma, linhas, palavras, start/end, confidence opcional, source `manual/forced_alignment/asr`, status `UNALIGNED/SUGGESTED/VALIDATED`, offsets/revisão. Uma palavra fora do intervalo de sua linha ou com tempo invertido é inválida.

### ReactiveEffectBinding

`source` ∈ {bass, mids, treble, rms, onset, beat}; `target` ∈ {scale, glow, opacity, translate, particles, glitch}; `gain`, `threshold`, `smoothingMs`, `cooldownMs`, `clampMin`, `clampMax`, `enabled`. Os valores de efeito devem ser computados no instante/frame solicitado, com seed quando aplicável.

### RenderManifest

Projeto, revisão V3, hashes dos arquivos, versões da análise/adapter/template, formato, fps, duração, preset/efeitos, output, QA e identificadores de job/deliverable. Garantir rastreabilidade e reprodutibilidade, sem armazenar segredos.

**Preferir tipos e serviços existentes** a modelos novos. Se houver lacuna no schema de caption/composition do timeline V3, propor extensões backwards-compatible em vez de duplicar modelo de timeline. Não adicionar colunas JSON gigantes para pontos de áudio: usar objetos de storage com metadados em banco.

## 6. Requisitos de qualidade e segurança

**Critérios verificáveis**
- Sincronização: eventos da letra exibidos dentro de 1 frame da posição renderizada especificada; a exatidão do reconhecimento de fala não é garantida sem validação humana.
- Efeito de grave/agudo: resultados de frames devem mudar quando alterar artificialmente a banda correspondente e não mudar quando a alteração não afeta o binding.
- Determinismo: duas renderizações com a mesma revisão/versões/seed têm posições e valores reativos equivalentes.
- Segurança: upload de nome/path malicioso não atravessa storage nem executa instrução, schemas rejeitam argumentos inválidos.
- Direitos: áudio e letra devem ter declaração de autorização antes de liberar distribuição.
- UX: fonte legível, destaque visível, safe zones sem texto cortado, modo movimentos reduzidos.
- Operacional: cache por etapa, retentativas e cancelamento idempotente, mensagens de erro úteis, sem travar outros canais.
- Sem dependência obrigatória de Claude, GPU, músicas comerciais ou publicação automática.

**Testes exigidos**
- unitários: cálculo de eventos, suavização, clamp, alinhamento, conversão ms/frames, parser TXT/LRC/SRT/VTT, schemas;
- integração: adapter de análise, Hyperframes real, FFmpeg, storage, patch/revisão, banco descartável;
- e2e: upload → análise → alinhamento/edição → preview → MP4 9:16/16:9 → entrega → reabertura;
- regressão: `npm run build:packages`, `npm run test:v3`, `npm run typecheck` e suíte do render-worker; documentar testes que não rodarem e o motivo.

Manter assets sintéticos/originais curtos para fixtures, evitando commits de músicas protegidas.

## 7. Definição de concluído (P0)

NÃO declarar MVP pronto sem:
1. tela funcional no hub;
2. importação de MP3/WAV/FLAC e letra TXT/LRC/SRT/VTT;
3. mapa musical verificável e edição de timestamps;
4. três presets visualmente distintos respondendo de verdade aos sinais;
5. preview de trecho consistente com output;
6. arquivos MP4 H.264/AAC 9:16 e 16:9 verificáveis por ffprobe;
7. projeto persistido, revisões V3, jobs com retry e QA;
8. testes unitários e e2e, sem regressão nos canais existentes;
9. manual de operação e dependências;
10. demonstração documentada (arquivo de teste gerado, parâmetros, resultados e comandos).

## 8. Como proceder e reportar

**Faça implementação real**, não apenas uma proposta genérica. Trabalhe em incrementos pequenos, valide cada gate, registre commits objetivos. Não peça decisão estética para iniciar: use presets descritos. Se um componente exigir credencial externa, GPU ou download de modelo, implemente fallback/configuração e informe a dependência.

A cada etapa apresentar:
- arquivos alterados e finalidade;
- comandos executados e resultados reais;
- evidência do gate (vídeo/frames/ffprobe/saída);
- bugs remanescentes e plano da próxima etapa.

Relatório final: requisitos P0 atendidos/não atendidos com IDs, links/paths de artefatos, migrations, instruções de execução, custos e limitações. Evite afirmar que testou hardware, banco real, serviço remoto ou geração de IA quando não foi possível executá-los.

**Comece agora pela auditoria da V3 e pela Etapa 0. Depois continue pelas demais etapas P0 dentro da mesma execução enquanto houver condições de validar com segurança.**
