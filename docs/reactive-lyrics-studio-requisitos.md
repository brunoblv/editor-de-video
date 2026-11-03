# Reactive Lyrics Studio — Especificação de Requisitos

**Projeto:** Editor de Vídeo — módulo Reactive Lyrics Studio  
**Repositório:** https://github.com/brunoblv/editor-de-video  
**Versão da especificação:** 1.0 — 2026-11-02  
**Estado:** Proposta para implementação; não implica funcionalidade já desenvolvida.  
**Responsável pela implementação prevista:** Claude Code / Claude Opus, com revisão humana.

---

## 1. Objetivo e visão

Implementar, **dentro do editor existente**, um módulo capaz de transformar uma gravação de áudio e uma letra em um lyric video com sincronização temporal e animações que respondam ao conteúdo e às características da música.

**A experiência-alvo:** o usuário importa a música, fornece ou corrige a letra, escolhe um preset, visualiza uma composição sincronizada, ajusta a timeline e exporta um vídeo pronto para revisão/publicação.

O módulo deve combinar três subsistemas distintos:

1. **Sincronização lírica:** mapear linhas e palavras aos instantes cantados.
2. **Análise musical:** medir BPM estimado, batidas, onsets, intensidade, RMS, graves, médios, agudos e mudanças de seção.
3. **Direção artística:** transformar dados e preferências em decisões visuais coerentes, mantendo um projeto determinístico e editável.

**Princípio inegociável:** a IA ajuda a *planejar* o vídeo, mas o tempo, a montagem e a renderização são reproduzíveis; a mesma configuração, áudio, assets e versão do motor devem produzir a mesma composição.

### 1.1. Resultados esperados

- Vídeos verticais (9:16), horizontais (16:9) e, posteriormente, quadrados (1:1).
- Palavras ou linhas exibidas em sincronia com a voz; destaque karaoke por palavra.
- Tipografia, fundos, luzes, partículas, escala, opacidade e transições reativas ao áudio.
- Alternância intencional entre verso, pré-refrão, refrão, ponte, solo e encerramento quando as seções forem detectadas ou definidas manualmente.
- Revisão manual obrigatória antes de qualquer publicação, preservando os fluxos existentes.

### 1.2. Restrições de produto

- O módulo não será uma aplicação isolada.
- Não modificar ou remover canais, workflows ou templates já existentes.
- Preferir execução local e ferramentas abertas quando viável, sem inviabilizar integração opcional com modelos de IA externos.
- Não depender de APIs de letras obtidas sem autorização. A letra deve ser fornecida pelo usuário ou por fonte devidamente licenciada.
- Em caso de baixa confiança de transcrição/alinhamento, exigir correção e nunca apresentar a palavra incorreta como validada.

---

## 2. Escopo e prioridades

**P0 — MVP obrigatório:** importação, letra, análise musical, alinhamento editável, três presets reativos, timeline, preview, renderização, download e revisão.  
**P1 — Evolução:** geração orientada pelo Claude Opus, estilos por seção, presets de canal, variações e comparações.  
**P2 — Avançado:** cenários 3D, motion graphics complexos, fundos de IA, separação refinada de stems, geração em lote e telemetria editorial.

### Fora do MVP

- Publicação automática sem revisão.
- Captura de músicas/letras de plataformas sem direitos de uso.
- Geração de vocais ou recriação da voz do artista.
- Alteração do áudio original para obedecer à animação.
- Reconhecimento 100% autônomo e infalível de todas as palavras em vocais cantados.
- Dependência obrigatória do DaVinci Resolve para executar o pipeline.

---

## 3. Perfis e jornadas

**Criador de conteúdo:** produz vídeos para TikTok, Reels e Shorts, com presets rápidos.  
**Editor avançado:** ajusta palavra, efeito, keyframe, seção e saída na timeline.  
**Administrador de canal:** administra identidade visual, assets permitidos e estados de publicação.

### Jornada principal

1. Selecionar **Novo projeto > Reactive Lyrics**.
2. Importar arquivo de áudio e metadados opcionais: artista, faixa, idioma e crédito.
3. Importar letra TXT/LRC/SRT/VTT ou digitá-la; permitir projeto instrumental sem letra somente em modo visualizer explícito.
4. Verificar autorização de uso do áudio e da letra; salvar as declarações.
5. Gerar mapa musical e alinhamento, exibindo confiança e itens não alinhados.
6. Corrigir palavras/linhas, pausas e seções, se necessário.
7. Selecionar formato, preset, intensidade e tipografia.
8. Visualizar e editar o vídeo com a timeline.
9. Gerar rascunho, revisar problemas e solicitar render final.
10. Baixar MP4 e manter o projeto reeditável; eventual publicação usa fluxo de revisão já existente.

---

## 4. Requisitos funcionais

A evidência de aceite descrita em cada requisito deverá ser verificável em teste automatizado, integração ou teste de usuário.

### 4.1. Gestão de projetos e mídia

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-001 | P0 | Disponibilizar o tipo de projeto `LYRICS` na criação e no domínio. | Novo projeto aparece na listagem, persiste e abre sem afetar tipos anteriores. |
| RF-002 | P0 | Permitir upload de MP3, WAV e FLAC. | O sistema detecta mídia inválida, duração, canais e taxa de amostragem; falhas têm erro legível. |
| RF-003 | P0 | Gerar uma versão de análise separada da gravação original. | Pré-processamento não sobrescreve o original; o áudio final é proveniente do arquivo original. |
| RF-004 | P0 | Aceitar metadados e idioma manual ou detectado. | Metadados são editáveis e salvos. |
| RF-005 | P0 | Permitir retomar projeto interrompido e reaproveitar etapas já concluídas. | Reabertura mantém assets, letra, timestamps, preset e decisões de edição. |
| RF-006 | P0 | Exibir progresso por estágio e erros recuperáveis. | Interface distingue fila, análise, alinhamento, composição, preview, render e revisão. |
| RF-007 | P0 | Salvar o vínculo entre assets, seus hashes, origem e permissões. | Edição e exportação exibem metadados do material utilizado. |
| RF-008 | P1 | Permitir versões/duplicação do projeto e presets de canal. | Duplicar não altera a versão original. |

### 4.2. Letra e alinhamento

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-009 | P0 | Importar texto livre e legendas TXT, LRC, SRT e VTT. | Preservar ordem, quebras de linha, pontuação e Unicode. |
| RF-010 | P0 | Oferecer transcrição assistida opcional com Whisper/faster-whisper. | Exibir resultado como sugestão que requer validação. |
| RF-011 | P0 | Alinhar texto fornecido ao áudio com timestamps por palavra, usando ferramenta compatível, como WhisperX. | Cada palavra alinhada tem início/fim/confiança ou estado `UNALIGNED`. |
| RF-012 | P0 | Suportar alinhamento por linha quando palavra a palavra não for confiável. | Usuário consegue finalizar vídeo sem tempos falsos ou interpolação escondida. |
| RF-013 | P0 | Permitir edição do texto, deslocamento e duração de palavras/linhas. | Ajustes são salvos e reproduzidos na prévia e na exportação. |
| RF-014 | P0 | Exibir waveform e cursor musical sincronizado ao texto. | Buscar um instante na timeline atualiza áudio, linha e destaque. |
| RF-015 | P0 | Indicar trechos de baixa confiança, canto sobreposto e silêncio. | Trechos problemáticos não recebem estado de `VALIDATED` automaticamente. |
| RF-016 | P0 | Oferecer deslocamento global do alinhamento (offset). | Deslocar +200 ms move todas as palavras sem modificar suas durações relativas. |
| RF-017 | P0 | Suportar repetições de refrão e múltiplas ocorrências da mesma frase. | Cada ocorrência possui identificador e intervalo próprios. |
| RF-018 | P1 | Importar/exportar alinhamentos em LRC/SRT e JSON interno. | Exportação e reimportação preservam o tempo dentro da resolução definida. |
| RF-019 | P2 | Permitir alinhamento por sílaba em idiomas/modelos compatíveis. | O modo avisa quando não houver suporte confiável. |

### 4.3. Análise e mapa musical

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-020 | P0 | Calcular BPM estimado, pulsos e instantes de batida. | Mapa inclui `beatTimesMs`; BPM desconhecido permanece desconhecido. |
| RF-021 | P0 | Medir envelope RMS e intensidade normalizada ao longo da música. | Série temporal utiliza eixo de tempo comum à timeline. |
| RF-022 | P0 | Medir energia em bandas graves, médias e agudas. | As três bandas podem controlar propriedades independentes. |
| RF-023 | P0 | Detectar onsets/transientes para disparos curtos. | Efeitos podem reagir a transientes sem depender apenas de BPM fixo. |
| RF-024 | P0 | Permitir calibrar sensibilidade, suavização e intensidade por banda. | Mudanças geram resultado previsível sem modificar o áudio. |
| RF-025 | P0 | Permitir marcar manualmente seções musicais em intervalos. | A edição prevalece sobre qualquer sugestão automática. |
| RF-026 | P1 | Sugerir seções (intro, verso, pré-refrão, refrão, ponte, solo, outro). | Sugestões são editáveis e nunca tratadas como verdades absolutas. |
| RF-027 | P1 | Detectar alterações de dinâmica e pontos de maior impacto musical. | UI mostra marcadores de impacto e suas intensidades relativas. |
| RF-028 | P0 | Gerar `MusicalMap` versionado e independente de renderer. | Mesmo mapa alimenta visualização e render final; esquema validado. |
| RF-029 | P0 | Armazenar informações de análise em cache por hash e versão do algoritmo. | Mudar só cor/fonte não executa a análise novamente. |

**Regra de interpretação:** BPM, seções e características emocionais são estimativas; músicas com tempo variável, rubato, silêncio, mudanças bruscas ou batidas ambíguas exigem correção manual.

### 4.4. Composição visual reativa

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-030 | P0 | Implementar três presets: `NEON`, `MINIMAL` e `GLITCH_ROCK`. | Cada preset gera composição diferente, mas respeita o mesmo alinhamento. |
| RF-031 | P0 | Destacar palavra ativa; suportar modo linha e modo karaoke. | Destaque usa timestamps corrigidos, não estimativa baseada apenas em batida. |
| RF-032 | P0 | Vincular graves a escala, agudos a brilho, amplitude a opacidade e onsets a efeitos curtos. | Cada vínculo pode ser habilitado/desabilitado e ajustado. |
| RF-033 | P0 | Suportar animações de entrada, permanência e saída de texto. | Texto não desaparece entre frames nem ultrapassa intervalo da cena. |
| RF-034 | P0 | Oferecer personalização de fonte, cor, posição, sombra, contorno e fundo. | Configuração persiste e tem preview. |
| RF-035 | P0 | Respeitar áreas seguras de 9:16 e 16:9, incluindo UI de redes sociais. | Testes de layout não cortam letra em dimensões suportadas. |
| RF-036 | P0 | Permitir controlar intensidade global de 0 a 100 e overrides por camada. | Em 0, todos os efeitos reativos opcionais cessam. |
| RF-037 | P0 | Oferecer modo de movimentos reduzidos, com limitação de flash. | Preset acessível não usa estrobos por padrão; há opção de restringir flashes rápidos. |
| RF-038 | P1 | Aplicar diferentes regras visuais por seção musical. | Refrão e verso podem ter presets/intensidades distintos. |
| RF-039 | P1 | Permitir fundo estático, vídeo próprio ou mídia licenciada. | Fonte, licença e validade de uso são registradas por asset. |
| RF-040 | P2 | Adicionar partículas avançadas, câmeras virtuais, máscaras e cenas 3D. | Efeitos respeitam orçamento de performance e projeto editável. |

### 4.5. Direção artística com agente de IA

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-041 | P1 | Integrar geração opcional de plano artístico com agente Claude Opus. | Se o serviço estiver indisponível, o projeto ainda renderiza via regras locais. |
| RF-042 | P1 | Gerar plano JSON estruturado com seções, cores, tipografia, efeitos e justificativas. | Validar JSON com contrato Zod antes de aplicar. |
| RF-043 | P1 | Não permitir que o agente altere timestamps validados nem a letra sem aprovação explícita. | Testes rejeitam mudanças temporais não autorizadas. |
| RF-044 | P1 | Limitar a IA a presets, propriedades e transições suportadas; não executar código arbitrário. | Plano fora do esquema é rejeitado ou reparado com diagnóstico. |
| RF-045 | P1 | Exibir propostas e alterações da IA para aprovação, desfazer e refazer. | Aplicação de sugestão cria revisão recuperável. |
| RF-046 | P2 | Gerar alternativas A/B de composição para uma mesma faixa. | Versões compartilham áudio e mapa musical, mas não sobrescrevem outras versões. |

### 4.6. Editor e pré-visualização

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-047 | P0 | Disponibilizar timeline com trilhas de áudio, letra, efeitos e seções. | Usuário consegue selecionar e alterar eventos independentemente. |
| RF-048 | P0 | Implementar play, pause, seek, zoom e seleção de intervalo. | UI e preview mantêm a posição compartilhada do playhead. |
| RF-049 | P0 | Permitir prévia de resolução reduzida e geração rápida de trechos. | Usuário pode revisar um segmento sem renderizar a música completa. |
| RF-050 | P0 | Suportar undo/redo de edições de letra e parâmetros visuais. | Pelo menos operações textuais e de timeline relevantes são reversíveis. |
| RF-051 | P0 | Exibir indicadores de áudio, letras não alinhadas e áreas inseguras. | UI identifica erros antes da exportação. |
| RF-052 | P1 | Permitir editar keyframes/curvas de efeitos e overrides por trecho. | Resultado final corresponde aos valores vistos no editor. |
| RF-053 | P1 | Permitir prévia lado a lado de presets e versões. | Mudanças não reexecutam transcrição/análise sem necessidade. |
| RF-054 | P1 | Salvar presets pessoais e identidade de canal. | Configurações podem ser reaplicadas a projetos futuros. |

### 4.7. Renderização, QA e saída

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-055 | P0 | Renderizar com adapter Hyperframes usando composição HTML/GSAP e mapa pré-computado. | Worker executa render de início a fim com saída reproduzível. |
| RF-056 | P0 | Manter compatibilidade com o domínio de timeline/render existente; suportar outro adapter (como Remotion) se necessário. | Escolha de motor não exige refazer importação, letra ou análise. |
| RF-057 | P0 | Exportar MP4 H.264 com áudio AAC e proporções 9:16/16:9. | Arquivo final abre em player comum; metadados correspondem à configuração. |
| RF-058 | P0 | Preservar o áudio original como fonte de mixagem final, sem alterações automáticas de pitch/tempo. | Comparação de duração e escuta de controle não encontra deslocamento perceptível. |
| RF-059 | P0 | Fazer QA técnico pré-exportação: asset ausente, fonte ausente, letra fora da tela, intervalos inválidos e áudio cortado. | Erro bloqueante impede conclusão silenciosa. |
| RF-060 | P0 | Enviar vídeo ao estado de revisão humano, sem publicar automaticamente. | O resultado é acessível para aprovar, refazer ou descartar. |
| RF-061 | P0 | Controlar fila, timeout, cancelamento, tentativas e retomada. | Falha não cria vídeos duplicados nem projeto permanentemente preso. |
| RF-062 | P1 | Oferecer presets de 720p/1080p e 24/30/60 fps conforme capacidade. | Configuração aparece no job e no arquivo final; indisponibilidades são informadas. |
| RF-063 | P1 | Permitir exportar projeto/timeline intermediários para reedição. | Assets e metadados necessários ao reuso são identificáveis. |
| RF-064 | P2 | Criar opção de integração com DaVinci Resolve por formato intermediário compatível. | Exportação é validada em versão-alvo, sem alegar compatibilidade nativa inexistente. |

### 4.8. Segurança e direitos

| ID | Pri. | Requisito | Critério mínimo de aceite |
|---|---|---|---|
| RF-065 | P0 | Registrar a declaração de direitos/autorização de uso de áudio e letra. | Usuário precisa confirmar antes de gerar versão para publicação. |
| RF-066 | P0 | Não realizar downloads automáticos de gravações/letras protegidas a partir de fontes não autorizadas. | Não existe workflow de captura sem fonte/licença verificáveis. |
| RF-067 | P0 | Isolar arquivos enviados por usuário/projeto e sanitizar nomes. | Upload não permite percorrer diretórios nem executar conteúdo arbitrário. |
| RF-068 | P0 | Aplicar limites configuráveis de tamanho, duração e processamento. | Rejeições explicam o limite e não deixam job pendurado. |
| RF-069 | P0 | Manter logs de execução sem vazar tokens, credenciais ou letra em logs de erro desnecessários. | Testes/log review comprovam tratamento de segredos. |
| RF-070 | P1 | Documentar retenção e exclusão de originais, stems temporários, mapas, previews e renders. | Exclusão segue política e não afeta outros projetos. |

---

## 5. Presets de lançamento

### PRESET-01 — Neon Cinematic

- Fundo escuro, tipografia com brilho moderado, gradientes azul/roxo.
- Graves: pulsação suave da escala (padrão contido).
- Agudos: halo luminoso; onsets: partículas ocasionais.
- Refrão: brilho e movimento mais presentes.
- Versos: menor intensidade, prioridade para legibilidade.

### PRESET-02 — Minimal Lyrics

- Fundo neutro e tipografia forte, com transições suaves.
- Palavra ativa muda cor/peso/opacidade, sem efeitos excessivos.
- Ênfase em leitura clara, inclusive em telas pequenas.
- Indicado para clipes informativos, pop acústico e baladas.

### PRESET-03 — Glitch Rock

- Tipografia condensada ou pesada; textura e cortes controlados.
- Transientes fortes acionam microglitches e tremor.
- Refrões podem aumentar escala, deslocamento e contraste.
- Limites de efeitos evitam cortes de texto e flashes agressivos.

**Parâmetros comuns:** intensidade, sensibilidades por banda, decay, smoothing, limite de escala, limite de brilho, contraste, duração de entrada/saída, fonte, posicionamento, safe zones, cores, redução de movimentos.

---

## 6. Contratos de dados propostos

**Nota:** contratos abaixo são conceituais. Antes de implementar, avaliar e reutilizar os tipos, eventos e schemas já existentes em `packages/timeline`, `packages/domain` e `packages/db`.

### 6.1. MusicalMap v1

~~~json
{
  "schemaVersion": 1,
  "audioAssetId": "asset-original",
  "audioHash": "sha256:...",
  "durationMs": 30000,
  "analysisVersion": "1.0.0",
  "bpmEstimate": 120,
  "beatTimesMs": [500, 1000, 1500],
  "onsets": [{"timeMs": 500, "strength": 0.92}],
  "features": {
    "sampleIntervalMs": 20,
    "rms": [0.12, 0.20, 0.43],
    "bass": [0.22, 0.65, 0.91],
    "mids": [0.33, 0.41, 0.58],
    "treble": [0.10, 0.24, 0.61]
  },
  "sections": [
    {"id": "s1", "type": "verse", "startMs": 0, "endMs": 14000, "source": "manual"},
    {"id": "s2", "type": "chorus", "startMs": 14000, "endMs": 30000, "source": "suggestion"}
  ]
}
~~~

**Nota de implementação:** as séries acima estão abreviadas e são ilustrativas. Em uso real devem ter comprimentos consistentes com a duração e intervalo, ou ser representadas por pontos com timestamps explícitos; validar cardinalidade no schema. Preferir armazenamento compacto de séries grandes sem perder rastreabilidade.

### 6.2. LyricAlignment v1

~~~json
{
  "schemaVersion": 1,
  "language": "pt",
  "lines": [
    {
      "id": "line-1",
      "text": "A luz se acende",
      "startMs": 1520,
      "endMs": 3180,
      "status": "VALIDATED",
      "words": [
        {"id": "w1", "text": "A", "startMs": 1520, "endMs": 1660, "confidence": 0.95},
        {"id": "w2", "text": "luz", "startMs": 1680, "endMs": 2140, "confidence": 0.87},
        {"id": "w3", "text": "se", "startMs": 2160, "endMs": 2350, "confidence": 0.88},
        {"id": "w4", "text": "acende", "startMs": 2370, "endMs": 3180, "confidence": 0.90}
      ]
    }
  ]
}
~~~

A frase acima é exemplo original, não trecho identificado de uma música comercial.

### 6.3. ArtisticPlan v1

Campos mínimos: `schemaVersion`, `presetId`, `globalConfig`, `sceneOverrides[]`, `effectBindings[]`, `timelineVersion`, `assets[]`. Cada `effectBinding` define `source` (bass/mids/treble/rms/onset/beat), `target` (scale/glow/opacity/position/particles), `threshold`, `gain`, `smoothing`, `clamp` e `enabled`.

Os três contratos devem ser **validados com Zod**, conter versão explícita, permitir migração e nunca depender do nome de uma ferramenta externa.

### 6.4. Modelo de persistência sugerido

- `Project.kind = LYRICS` no enum existente (ou extensão compatível com a arquitetura V3).
- `LyricProjectConfig`: relação com projeto, formato, preset, configuração e revisão.
- `LyricAsset`: áudio original, texto de origem, stems e renderizações, com hash e licença.
- `LyricAlignment`: linhas/palavras, confiança, validação e revisão.
- `MusicalAnalysis`: mapa musical, versão, checksum e caminho de storage.
- `ArtisticPlan`: versão aprovada, dados da composição e parâmetros.
- `LyricRenderJob`: status, engine, duração, progresso, logs, erro e artefatos.

**Evitar** armazenar séries longas de análise dentro de colunas JSON sem política de volume. Guardar metadados no PostgreSQL e objetos volumosos no storage existente; respeitar chaves e convenções atuais.

---

## 7. Arquitetura e integração ao monorepo

A organização deverá aproveitar os módulos já presentes na árvore atual do projeto:

| Área existente | Responsabilidade de integração |
|---|---|
| `apps/web` | Fluxo de projeto, upload, correção da letra, preview e editor visual |
| `apps/agent` | Opus opcional para propostas de direção artística, com saída validada |
| `apps/render-worker` | Orquestração de jobs, processamento, validação e render |
| `packages/timeline` | Modelo independente de renderer: eventos, camadas, cues, keyframes |
| `packages/domain` | Regras de projeto, estados, permissões e validação |
| `packages/integrations` | Adapters para analisadores, alinhadores e Hyperframes |
| `packages/templates` | Presets Reactive Lyrics e parametrização |
| `packages/db` | Prisma, migrations e persistência |
| `packages/video` | Composições Remotion existentes, quando reutilizáveis |
| `packages/core` | Configuração, storage, filas e contratos comuns existentes |

### 7.1. Fluxo do worker

~~~text
Importação + verificação de direitos
     |
Validação do arquivo / normalização para análise
     |
Análise musical (Librosa/FFmpeg)
     |                       Importar letra --> Alinhamento --> revisão quando necessário
     |                       /
MusicalMap + LyricAlignment validados
     |
Configuração de preset / plano artístico opcional
     |
Compilação para timeline canônica
     |
Adapter Hyperframes (ou alternativa compatível)
     |
Preview segmentado --> QA --> MP4 final
     |
READY_FOR_REVIEW
~~~

### 7.2. Ferramentas e fronteiras

- **FFmpeg/ffprobe:** validação, probe, áudio de análise e mux/encoding.
- **Librosa (Python):** extração offline de batidas/onsets/RMS e características de frequência.
- **Whisper/faster-whisper:** transcrição como *sugestão*, não fonte única de verdade.
- **WhisperX / alinhador compatível:** timestamps por palavra a partir do texto correto; canto pode exigir revisão.
- **Demucs ou equivalente (opcional):** isolamento de vocal quando melhorar alinhamento; fazer avaliação de manutenção/licenças antes de fixar dependência.
- **Hyperframes + GSAP:** render de HTML/timelines, priorizando `@hyperframes/producer` para integração Node, sujeito a prova de conceito e compatibilidade.
- **Remotion:** adapter alternativo ou apoio a componentes já existentes.
- **Claude Opus:** direção artística e classificação de seções como sugestão, não renderizador de frames.
- **DaVinci Resolve Free:** ferramenta opcional para edição manual após exportação, fora do caminho crítico do MVP.

**Importante para Hyperframes:** construir timelines sincronicamente, registrar timelines de GSAP conforme o runtime, usar mecanismos de seek determinístico, esperar o carregamento dos assets, evitar `Math.random()` sem seed e não criar efeitos dependentes do tempo real da reprodução. Confirmar os requisitos exatos da versão escolhida na documentação oficial antes da implementação.

Fontes técnicas iniciais:  
- https://hyperframes.app/docs/3-guides/2-prompting  
- https://hyperframes.app/docs/5-packages/producer  
- https://librosa.org/doc/main/api/generated/librosa.beat.beat_track.html

### 7.3. Estratégia de precisão

- Relógio canônico por `timeMs` inteiro; composições traduzem tempo para frame conforme FPS configurado.
- Para uma animação reativa, o valor é consultado no `MusicalMap` por instante, com interpolação/smoothing definidos.
- A letra é dirigida pelo `LyricAlignment`, nunca por pulso musical isolado.
- Não executar análise de áudio frame a frame dentro de componentes de render.
- Se `offset` ou pontos corrigidos mudarem, invalidar somente composições e previews afetados; se o áudio mudar, invalidar análise e alinhamento.
- Garantir ausência de `NaN`, tempos negativos, intervalos invertidos ou valores de efeito fora de limites.

---

## 8. Interface de usuário

### Tela A — Criar lyric video

- Importar faixa/arquivo e inserir metadados.
- Importar letra ou habilitar transcrição assistida.
- Definir idioma e formato.
- Declaração de autorização de uso.
- Botão **Analisar música**.

### Tela B — Sincronizar letra

- Waveform da música e linhas de letra em duas colunas.
- Realce da palavra atual e barra de confiança.
- Ferramentas: play/pause, seek, loop, alterar início/fim, offset global, validar linha, validar tudo.
- Marcadores de trechos não alinhados, seção musical e picos.

### Tela C — Design e edição

- Preview com seleção de formato.
- Barra lateral com presets, cores, fontes, intensidade, sensibilidade e redução de movimento.
- Timeline com camadas: áudio, letra, seções, fundo, partículas/efeitos.
- Operações: duplicar cena, editar override, undo/redo, salvar preset, resetar.
- Controles de preview de trecho e render final.

### Tela D — Revisão

- Preview MP4 final.
- Relatório de QA e eventuais alertas.
- Botões **Aprovar**, **Refazer**, **Descartar** e **Baixar**.
- Publicação/agendamento apenas quando integrações existentes estiverem configuradas e autorizado.

---

## 9. Requisitos não funcionais

| ID | Tema | Exigência |
|---|---|---|
| RNF-001 | Determinismo | Mesmo projeto, assets, engine e versão do mapa produzem frames equivalentes; fixar seeds e versões. |
| RNF-002 | Sincronismo | Não acumular drift entre áudio e eventos visuais; tolerância-alvo de até **1 frame** para eventos temporizados em render validado. |
| RNF-003 | Precisão lírica | Alinhamento automático pode falhar em canto; interface deve suportar ajuste até precisão visual satisfatória, com meta operacional de **até 100 ms** em amostras validadas manualmente. |
| RNF-004 | Integridade | Preservar original; saída não altera pitch/tempo por padrão e não corta áudio sem instrução. |
| RNF-005 | Performance | Usar pré-processamento e cache. Medir tempo de análise/render em faixas de 30 s e 3 min; não prometer tempo fixo sem benchmark de hardware. |
| RNF-006 | Filas | Jobs persistentes e idempotentes, com cancelamento, retry limitado e recuperação de crash. |
| RNF-007 | Observabilidade | Logs por projeto/job; tempo por estágio, versão do algoritmo, erro recuperável e métricas de uso de recursos. |
| RNF-008 | Compatibilidade | Não regredir fluxos existentes; migrar banco de forma compatível e executar testes atuais. |
| RNF-009 | Portabilidade | Documentar execução local, Windows+WSL/Linux e opções CPU/GPU; execução sem GPU quando viável. |
| RNF-010 | Segurança | Validar uploads, isolar temporários, limitar recursos e não executar conteúdo enviado como código. |
| RNF-011 | Licenças | Registrar autorização/atribuição, impedir publicação automática sem validação. |
| RNF-012 | Acessibilidade | Texto legível, contraste configurável, presets de movimento reduzido e evitar flashes intensos por padrão. |
| RNF-013 | Manutenção | Adapters isolados e contratos versionados, sem acoplamento direto de IA ao renderer. |
| RNF-014 | Exportabilidade | MP4 compatível com plataformas comuns, bitrate/fps/resolução documentados; proporções testadas. |
| RNF-015 | Testabilidade | Testes unitários, integração e snapshots/frames de regressão visual. |
| RNF-016 | Custos | Modo sem IA paga deve continuar funcional; expor dependências externas e custos opcionais. |

As metas RNF-002/RNF-003 são **critérios propostos a validar em homologação**, não garantias de reconhecimento automático para todas as músicas.

---

## 10. Cenários de aceite de ponta a ponta

### CA-01 — Importação e projeto

**Dado** arquivo WAV válido de 30 s e letra TXT, **quando** criar projeto `LYRICS`, **então** original, metadados e status são persistidos, o job é enfileirado, e outros tipos de projeto continuam funcionando.

### CA-02 — Alinhamento com correção

**Dado** palavra com alinhamento incorreto, **quando** usuário arrasta início/fim na waveform e valida a linha, **então** a nova posição persiste e aparece igualmente em preview e MP4.

### CA-03 — Reação às bandas

**Dado** mapa com graves e agudos conhecidos, **quando** ativar pulso por graves e brilho por agudos, **então** os efeitos seguem valores do mapa com limites configurados e são reproduzíveis após seek.

### CA-04 — Sem IA

**Dado** agente Claude indisponível, **quando** selecionar preset Minimal e renderizar, **então** fluxo termina sem depender do agente.

### CA-05 — Falha e retomada

**Dado** worker interrompido após a análise, **quando** reiniciado, **então** retoma a partir de artefatos íntegros sem duplicar trabalho ou publicações.

### CA-06 — QA

**Dado** linha ultrapassando a área segura, **quando** solicitar exportação final, **então** o sistema apresenta alerta; se o problema for bloqueante, não conclui silenciosamente.

### CA-07 — Segurança editorial

**Dado** projeto sem declaração de direito de uso, **quando** tentar publicar, **então** a publicação é bloqueada e o sistema explica o requisito.

### CA-08 — Determinismo

**Dado** plano, arquivo, versão do renderizador e seed iguais, **quando** renderizar o mesmo trecho duas vezes, **então** keyframes/posições/efeitos e frames de teste coincidem dentro da tolerância definida.

### CA-09 — Formatos

**Dado** um mesmo projeto, **quando** exportar 9:16 e 16:9, **então** a letra se mantém visível em safe zones e o áudio permanece sincronizado.

### CA-10 — Regressão

**Dado** monorepo atual, **quando** executar testes de domínio, timeline, integrações, banco, agentes e render, **então** módulos anteriores não apresentam regressões decorrentes do novo tipo.

---

## 11. Backlog de implementação para Claude Code

### Fase 0 — Auditoria e prova de conceito

- Auditar schemas de timeline e estado de projetos atuais, além do pipeline V3.
- Confirmar como a versão atual do Hyperframes opera no ambiente do projeto.
- POC: 10–15 s de áudio + letra editada + dois efeitos reativos + seek e exportação.
- Medir drift, consumo de CPU/RAM e comportamento em rendering offline.
- Definir se Hyperframes será adapter principal com Remotion como fallback.
- Decidir limites de upload e processamento após testes no hardware real.

**Saída:** decisão arquitetural, riscos e um vídeo de POC reproduzível.

### Fase 1 — Núcleo do MVP

- Adicionar tipo de projeto e modelos de persistência.
- Criar upload/probe/storage e pipeline de análise musical.
- Criar importação e edição de letras com alinhamento e confidence flags.
- Implementar `MusicalMap`, `LyricAlignment` e contratos Zod.
- Criar estados de job, cache, retry, logs e recuperação.

**Saída:** projeto que analisa música e exibe uma timeline sincronizada.

### Fase 2 — Composição e UI

- Implementar 3 presets e controles de frequência/efeito.
- Construir preview, waveform, playhead, editor de letras e propriedades.
- Integrar Hyperframes ao worker e render MP4.
- Habilitar QA, revisão e download em 9:16/16:9.

**Saída:** MVP utilizável sem Claude Opus.

### Fase 3 — Inteligência artística (P1)

- Planejador do Claude Opus com contrato ArtisticPlan.
- Aplicação sob aprovação e controles de desfazer.
- Overrides por seção, estilos por canal e presets salvos.
- Testes de aderência e fallback sem IA.

### Fase 4 — Efeitos e produção avançada (P2)

- Visuals complexos, fundos, camadas avançadas e animação de câmera.
- Separação opcional de stems, testes A/B, renders em lote e integração editorial.

---

## 12. Definição de pronto (DoD) do MVP

A fase MVP estará pronta somente quando:

- [ ] Criar, reabrir e editar projetos `LYRICS` sem quebrar fluxos existentes.
- [ ] Importar os três formatos mínimos de áudio e quatro formatos de letra.
- [ ] Produzir `MusicalMap` e `LyricAlignment` versionados.
- [ ] Corrigir e validar tempos da letra manualmente.
- [ ] Controlar reação visual a graves, agudos, amplitude e onsets.
- [ ] Renderizar com três presets distintos.
- [ ] Visualizar timeline com seek sem divergência relevante entre preview/render.
- [ ] Exportar MP4 H.264/AAC em 9:16 e 16:9.
- [ ] Fazer QA de duração, alinhamento, layout, recursos e áudio.
- [ ] Cancelar, retomar e diagnosticar jobs.
- [ ] Aplicar controles de direitos e segurança.
- [ ] Enviar ao fluxo de revisão humana.
- [ ] Executar testes novos e suíte de regressão existente.
- [ ] Documentar instalação, dependências, configuração, limitações e exemplos.

---

## 13. Riscos e decisões a validar

| Risco | Tratamento |
|---|---|
| Canto, coro e reverb prejudicam reconhecimento de palavras. | Preferir letra correta fornecida; alinhamento assistido, confiança explícita e correção manual. |
| BPM pode ser ambíguo (half/double time), variável ou ausente. | Representar beats reais; oferecer edição; não assumir 4/4 ou BPM constante. |
| Plugins/renderers podem ter limitações de seek ou performance. | POC de Hyperframes antes de acoplar o pipeline completo; adapter substituível. |
| Música inteira pode consumir muito storage/RAM em análise e render. | Cache, séries compactas, segmentação, limites e limpeza de temporários. |
| Legendas podem ficar ilegíveis com efeitos fortes. | Limites por preset, safe zones, presets reduzidos e QA de legibilidade. |
| Direitos autorais de música/letra/visuais. | Declaração explícita, registro de licença, sem captura automática não autorizada. |
| IA inventar palavras ou transições sem suporte. | Plano fechado/validado, aprovação e renderer determinístico. |

### Decisões de arquitetura obrigatórias antes do código definitivo

1. Contrato de timeline canônico reutilizado da V3.
2. Modelo de persistência e esquema de invalidação/cache.
3. Adapter Hyperframes e sua compatibilidade real com seek/áudio.
4. Serviço Python integrado via processo/worker para Librosa e alinhamento.
5. Hardware de homologação e limites de tamanho/duração.
6. Estratégia para validação da letra e para direitos/licenças.

---

## 14. Instrução de execução para o agente

**Claude Code deverá:**

1. Ler este documento e inspecionar o código atual antes de editar.
2. Implementar **P0 primeiro**, em fases pequenas com testes por etapa.
3. Preferir estender a arquitetura V3, não criar subsistema duplicado.
4. Registrar alterações de schema, migrations e instruções de ambiente.
5. Incluir POC funcional antes de decidir por Hyperframes como único motor.
6. Não introduzir cobrança/serviço externo obrigatório.
7. Não considerar implementação concluída até passar nos critérios da seção 12.
8. Entregar resumo de mudanças, testes, limitações e próximo backlog.

**Critério de sucesso de produto:** a pessoa importa um áudio autorizado e sua letra, ajusta poucos pontos de sincronização, seleciona um preset e exporta um lyric video com palavras sincronizadas e efeitos verdadeiramente reativos à música, sem necessidade de editar manualmente todo o videoclipe.
