# Especificação V3 — Hub de canais e edição de vídeo por IA

Data: 23/10/2026  
Repositório: https://github.com/brunoblv/editor-de-video  
Status: especificação para implementação pelo Claude Code. Nenhuma funcionalidade descrita como futura deve ser considerada já implementada.

## 1. Decisão e objetivo

Reconstruir o sistema como um hub de produção audiovisual e distribuição para múltiplos canais. Preservar os canais, suas identidades, acervos e regras editoriais existentes. A implementação antiga é referência de domínio e fonte para migração, não a arquitetura obrigatória do produto novo.

O usuário fornece um briefing, roteiro ou arquivos; o Claude Opus planeja e modifica a edição por ferramentas; o hub oferece prévia, ajustes manuais, versões, renderização e entregas para redes sociais.

Base proposta: Hyperframes da HeyGen para composições, Whisper para transcrição, FFmpeg para processamento e DaVinci Resolve Free como estação opcional de acabamento manual. O Claude Code desenvolverá o software; o agente incorporado ao produto terá integração própria pelo Claude Agent SDK. Modelo e credenciais devem ser configuráveis.

Este documento substitui as decisões de arquitetura dos documentos anteriores para a V3. README, PROJETO.md e especificações V2 continuam descrevendo o legado. Documentos editoriais dos canais permanecem referências, exceto quando conflitarem com decisões explícitas desta especificação.

## 2. Inventário confirmado no repositório

Inspeção estática da branch main em 23/10/2026. Árvore consultada: bff5ad99c1dac7633d3961a4dc6ed9bb2725b6f9. Não foram consultados banco de produção, arquivos locais externos ao Git ou credenciais; os canais realmente conectados e os volumes de dados precisam ser inventariados na migração.

| Área | Evidência | Situação observada |
|---|---|---|
| Interface/API | apps/web e README.md | Next.js, autenticação, páginas e rotas por tipo de produção |
| Processamento | apps/worker/src/index.ts | Worker BullMQ despacha cinco tipos de projeto |
| Composição | packages/video | Composições Remotion existentes |
| Dados | packages/db/prisma/schema.prisma | PostgreSQL/Prisma; Project concentra atributos específicos de diferentes módulos |
| Tipos | ProjectKind | TOP_LIST, CURIOSIDADE, AMBIENT, CHRISTIAN, RABISCO |
| Midnight | packages/core/src/midnight.ts | Marca, universos, playlists, dez receitas e variações |
| Cristão | packages/core/src/christian.ts | 42 pilares e categorias semanais; biblioteca BibleVerse no schema |
| Rabisco | packages/core/src/rabisco.ts e assets públicos | Personagem, ações, poses, expressões e arquivos de identidade |
| YouTube | YouTubeChannel e rota de publicação | Um vínculo por usuário; publicação implementada para Ambient e Cristão |
| Acervo | MediaAsset, SoundAsset, Recipe e RecipeVersion | Origem, licenças, sons, receitas e histórico de versões |

O README é mais restrito que o código atual: descreve principalmente Top List e Curiosidade e indica publicação fora do escopo, enquanto há código de YouTube. Durante a reconstrução, verificar comportamento pelo código e testes, não apenas pelo README.

Não existe no schema inspecionado uma entidade genérica Channel. Não confundir tipo de projeto com identidade de canal ou conta social.

## 3. Canais e conteúdo a preservar

| Núcleo existente | Tratamento na V3 | Conteúdo a preservar |
|---|---|---|
| Midnight Relaxing Sounds / AMBIENT | Canal com séries e receitas versionadas | Nome, tagline, pilares sleep/cozy/focus, universos, playlists, dez receitas, variações, seeds, sons e avaliações de licença |
| Canal Cristão / CHRISTIAN | Canal com pilares editoriais configuráveis | 42 pilares, programação semanal, biblioteca bíblica e traduções, uso de versículos, regras de temas sensíveis e progressão visual |
| Rabisco / RABISCO | Canal/perfil editorial inicial com personagem vinculado | Nome, tagline, pensamento original, roteiros, ações, poses, expressões, fontes e regras de animação |
| TOP_LIST | Formato reutilizável entre canais | Ordem, ranking, rótulos, trechos, marca e transcrições |
| CURIOSIDADE | Formato/série reutilizável | Tema, roteiro, narração, mídia, atribuições e legendas |

O nome comercial definitivo do Canal Cristão e o vínculo de Rabisco com outras marcas devem ser configuráveis. Não presumir que Rabisco seja automaticamente Mago da Meia-Noite. Não substituir os canais existentes por ChartFM ou CapiBusca; estes são exemplos de expansão futura, não canais encontrados nesta inspeção.

### 3.1 Midnight

Preservar as receitas RAINY_CABIN, FOREST_THUNDERSTORM, MIDNIGHT_OCEAN, COZY_FIREPLACE, MIDNIGHT_FOREST, RAINY_COFFEE_SHOP, WINTER_CABIN, MIDNIGHT_TRAIN, RAIN_ON_WINDOW e NIGHT_MOUNTAIN, incluindo mapeamento dos presets legados.

Suportar vídeos longos e shorts derivados. Durações editoriais de referência: sleep 6–10 horas; cozy/focus 1–3 horas; shorts 15–30 segundos. Estes são presets do canal, não limites das plataformas.

A produção longa deve usar áudio em camadas, crossfades, eventos com seed reproduzível e visuais discretos. Renderizar segmentos reutilizáveis e compor com FFmpeg; não assumir que cada frame de um vídeo de dez horas precisa passar por uma composição HTML completa. Validar emendas e continuidade do áudio.

### 3.2 Canal Cristão

Preservar seleção de versículos a partir da biblioteca local, referência e tradução; o agente cria a reflexão sem inventar escritura. Manter controle de repetição e registrar utilização por peça editorial, sem contar a distribuição da mesma peça em várias redes como conteúdo novo.

Preservar as regras editoriais existentes para saúde e sofrimento emocional e a progressão visual do personagem. Regras, pilares, CTAs e calendário deverão virar dados configuráveis, em vez de novos ramos de código a cada categoria.

### 3.3 Rabisco

Preservar personalidade, estilo visual, tipografia, pensamento original e biblioteca de ações. Há comentários e catálogos de poses com sinais de defasagem entre si: conferir os arquivos reais, transparência e resolução antes de migrar. Não tratar todo caminho declarado como arte final válida.

Recriar animações como templates Hyperframes com parâmetros de ação, emoção, posição, movimento e texto. A fidelidade deve ser comparada com uma referência visual do legado.

## 4. Modelo conceitual do produto

- Workspace: ambiente do proprietário/equipe.
- Channel: marca editorial, público, idiomas, tom e regras.
- SocialAccount: conta real em uma plataforma; possui ID externo, capacidades e credenciais.
- BrandKitVersion: identidade visual imutável usada por uma edição.
- Series: quadro ou linha editorial dentro de um canal.
- TemplateVersion: estrutura visual e narrativa com parâmetros e versão.
- RecipeVersion: receita de produção, inclusive áudio e eventos Ambient.
- VideoProject: briefing e materiais de uma peça.
- TimelineRevision: versão imutável da edição.
- Deliverable: arquivo de saída associado à revisão e ao formato.
- Publication: distribuição de uma entrega específica para uma conta específica.

Um canal pode ter várias contas sociais e séries. Um projeto pertence a um canal e pode gerar várias entregas. Uma publicação nunca aponta implicitamente para “a versão mais recente”.

## 5. Escopo e prioridades

| Etapa | Entrega |
|---|---|
| P0 — Preservação e prova técnica | Inventário, backup restaurável, mapeamento da migração, vídeo real com Hyperframes/FFmpeg/Whisper e revisão por comando |
| P1 — MVP | Canais, biblioteca, identidade, séries, agente, timeline básica, prévia, histórico, exportação e templates dos três núcleos existentes |
| P2 — Distribuição | Múltiplas contas, calendário, aprovação e YouTube; demais conectores um por vez |
| P3 — Edição ampliada | Tradução, alinhamento por palavra, montagem por texto avançada, reenquadramento assistido e pacote Resolve |
| P4 — Escala | Lotes, múltiplos workers, métricas de conteúdo e comparação de variantes |

No P0, testar também um intercâmbio mínimo com o Resolve Free para validar a viabilidade; o pacote de intercâmbio completo fica em P3.

Fora do MVP: substituir todos os recursos de um editor profissional, round-trip perfeito com Resolve, geração audiovisual paga obrigatória, publicação irrestrita em qualquer plataforma e migração automática perfeita de todas as timelines Remotion antigas.

## 6. Requisitos funcionais

| ID | Requisito | Aceite objetivo |
|---|---|---|
| RF-01 | Cadastrar e editar canais, séries e identidade | Alterar um canal não modifica projetos de outro canal |
| RF-02 | Importar canais e configurações legadas | Relatório concilia registros e aponta itens sem destino |
| RF-03 | Biblioteca de vídeos, imagens, sons, fontes e personagens | Metadados, hash, origem, tags e licença recuperáveis |
| RF-04 | Criar projeto por briefing, roteiro, template ou arquivos | Projeto registra canal, objetivo, duração e formatos |
| RF-05 | Inspecionar mídia e gerar proxies | Player usa proxy e exportação usa original |
| RF-06 | Transcrever e revisar | Correção de texto não corta a mídia |
| RF-07 | Analisar cenas e frames | Agente recebe evidências visuais com timestamps |
| RF-08 | Editar por conversa | Comando produz plano, patch validado e nova revisão |
| RF-09 | Ajustar manualmente a edição | Cortes, ordem, crop, escala, texto, volume, fades e legendas |
| RF-10 | Bloquear elementos | Agente não altera item bloqueado sem desbloqueio explícito |
| RF-11 | Prévia e comparação | Identifica revisão exibida e permite comparar/restaurar |
| RF-12 | Renderizar e acompanhar | Estado por etapa, progresso, cancelamento e retry controlado |
| RF-13 | Criar variantes | 9:16 e 16:9 com enquadramentos independentes |
| RF-14 | Exportar entregas | MP4, capa, metadados e legendas quando aplicável |
| RF-15 | Preservar receitas específicas | Midnight, Cristão e Rabisco mantêm seus parâmetros de domínio |
| RF-16 | Gerenciar contas sociais | Conta e destino visíveis antes de qualquer publicação |
| RF-17 | Aprovar e agendar | Aprovação vinculada ao hash da entrega e metadados |
| RF-18 | Publicar sem duplicação em retry | Estado remoto conciliado após timeout; retomada não cria novo upload cegamente |
| RF-19 | Acabamento no Resolve | Pacote documenta o que é editável e o que foi achatado |
| RF-20 | Registrar custos e execução | Modelo, tokens quando disponíveis, duração, versão e falhas por AgentRun |
| RF-21 | Produzir conteúdo narrado | Adaptador TTS por canal com voz, idioma e parâmetros suportados |
| RF-22 | Operar com falhas externas | Exportação manual disponível mesmo sem integração social |

Conteúdos sem fala, como Ambient, não exigem transcrição ou legenda artificial. Para música, aceitar letras revisadas e alinhamento manual; a transcrição automática não é fonte definitiva.

## 7. Fluxo de produção e estados

Fluxo: briefing → materiais → inspeção/transcrição/análise → plano de edição → timeline → prévia → revisão → render final → validação → aprovação da entrega → distribuição.

Separar os estados:

| Objeto | Estados propostos |
|---|---|
| Projeto | DRAFT, EDITING, IN_REVIEW, APPROVED, ARCHIVED |
| Job | QUEUED, RUNNING, SUCCEEDED, FAILED, CANCEL_REQUESTED, CANCELLED |
| Entrega | PENDING, RENDERING, VALIDATING, READY, FAILED, SUPERSEDED |
| Publicação | DRAFT, APPROVED, SCHEDULED, UPLOADING, PROCESSING_REMOTE, PUBLISHED, FAILED, UNKNOWN, CANCELLED |

Uma falha de job não apaga a revisão ou arquivos já válidos. Finalizar render não autoriza publicação. Nova edição cria outra entrega e exige aprovação; não altera silenciosamente uma publicação já agendada. Alterações de capa, destino, privacidade ou texto também invalidam a aprovação correspondente.

O fluxo legado que associa scheduledAt à publicação após render deve ser substituído por uma publicação explícita. Migrar agendamentos como pausados/pendentes de revisão para evitar disparos durante a transição.

## 8. Timeline como fonte oficial

Documento JSON validado por schema versionado. Tempos inteiros na timebase declarada; fps racional, por exemplo 30000/1001. Intervalos são [in, out), com final exclusivo. Não acumular floats para posição de cortes. Mapear o tempo do original, da edição e das legendas.

Campos mínimos:

| Grupo | Campos |
|---|---|
| Identificação | schemaVersion, projectId, revisionId, parentRevisionId |
| Vídeo | width, height, fpsNumerator, fpsDenominator, durationFrames |
| Referências | assetId, hash, sourceTimebase, brandKitVersionId, templateVersionId |
| Trilhas | id, type, order, muted, locked |
| Clipes | id, assetId, sourceIn, sourceOut, timelineStart, duration, playbackRate |
| Transformação | position, scale, crop, rotation, opacity, keyframes |
| Áudio | gain, fades, pan, ducking quando aplicável |
| Texto/legenda | conteúdo, idioma, intervalos, estilo, fonte e área segura |
| Composição | template, versão e parâmetros validados |
| Origem | autor humano/agente, comando e plano |
| Saída | presetVersion, formato, política de cor e áudio |

Operações de domínio: insertClip, trimClip, moveClip, removeClip, updateText, updateTransform, updateAudio e updateCaptions. Não expor alterações arbitrárias no banco ao agente.

Cada patch inclui expectedRevisionId. Em conflito, rejeitar com indicação da revisão atual; recalcular antes de reaplicar. Validar referências, duração, limites de fonte, IDs únicos, intervalos e bloqueios antes do commit atômico.

Restaurar uma versão cria nova revisão apontando para o conteúdo anterior, preservando auditoria. Templates e identidades ficam fixados na revisão; atualizar o catálogo não muda vídeos antigos.

Prévia e render final consomem o mesmo documento e compilador. Diferenças permitidas: resolução, bitrate e proxies; nunca decisões editoriais diferentes.

## 9. Claude Code e agente Opus

Claude Code é a ferramenta de desenvolvimento. Na prova técnica também poderá operar o pipeline por CLI. Para a conversa dentro do hub, implementar serviço separado com Claude Agent SDK e modelo Opus configurável. Não presumir que a assinatura pessoal do Claude Code cubra automaticamente o uso incorporado ao produto.

Contexto por execução: briefing, canal, identidade, regras da série, inventário, transcrição, frames, timeline atual, elementos bloqueados, saídas e orçamento.

| Contrato a implementar | Entrada principal | Saída |
|---|---|---|
| inspect_media | assetId | metadados e diagnósticos |
| transcribe_media | assetId, idioma, configuração | transcriptId |
| detect_scenes | assetId, parâmetros | intervalos de cenas |
| extract_frames | assetId, timestamps | frames com referência temporal |
| create_edit_plan | projectId, briefing | plano estruturado |
| apply_timeline_patch | projectId, expectedRevisionId, operações | nova revisão ou conflito |
| generate_composition | templateVersionId, parâmetros | composição e dependências |
| render_preview | revisionId, preset | jobId |
| validate_output | deliverableId | relatório |
| render_final | revisionId, preset | jobId |
| export_resolve_package | revisionId, perfil | pacote e limitações |
| prepare_publication | deliverableId, accountId | rascunho de publicação |

Estes nomes são contratos internos propostos, não APIs prontas dos fornecedores.

O agente deve explicar brevemente o que alterou e oferecer prévia. Exemplos: “Encurte a abertura para dois segundos”; “Troque o segundo trecho mantendo a trilha”; “Suba as legendas”; “Crie uma versão de 20 segundos”.

Executar composições geradas em ambiente isolado, com diretório por projeto, limites de CPU/memória/tempo, dependências fixadas e acesso de rede restrito. Não disponibilizar tokens sociais, banco inteiro ou shell irrestrito ao código gerado. Texto de mídia e transcrições são conteúdo, não instruções administrativas.

## 10. Arquitetura proposta

| Camada | Decisão |
|---|---|
| Web | Next.js + TypeScript; estúdio e painel responsivos |
| API | NestJS como serviço de domínio proposto; extração gradual das rotas existentes |
| Banco | PostgreSQL + Prisma com migrações versionadas |
| Orquestração | Redis + BullMQ; tarefas de mídia fora de requisições HTTP |
| Agente | Serviço Node com Claude Agent SDK |
| Mídia | Worker Python para Whisper e análise; FFmpeg/ffprobe por argumentos estruturados |
| Composição | Worker Node com adaptador Hyperframes |
| Publicação | Worker e credenciais próprios, separado de render e agente |
| Arquivos | Abstração de storage; disco local inicialmente, compatível com S3 na evolução |
| Progresso | SSE; WebSocket apenas se colaboração simultânea justificar |
| Resolve | Exportador de intercâmbio e importador de entrega final |

Organização sugerida: apps/web, apps/api, apps/agent, apps/render-worker, apps/publish-worker, workers/media, packages/domain, packages/timeline, packages/templates, packages/db e packages/integrations. Esta é a estrutura de destino; não exige mover todo o legado antes de provar o pipeline.

A VPS pode hospedar interface/API/banco/agenda. Render e transcrição podem rodar em máquina local dedicada. Nesse cenário, o worker local busca tarefas por HTTPS autenticado, com lease, heartbeat e upload de resultados; Redis não deve ficar exposto à internet. Um dispatcher no servidor faz a ponte com BullMQ. Começar com implantação em uma máquina se isso simplificar a prova técnica.

Registrar versões exatas das ferramentas e hardware na prova. Escolher CPU/GPU, modelo Whisper e concorrência por benchmark; não fixar requisitos de hardware com base apenas em estimativa.

## 11. Processamento, cache e qualidade

1. Upload com limites configuráveis, verificação de tipo e espaço disponível.
2. Hash do original e registro imutável.
3. Inspeção de codecs, resolução, orientação, duração, fps e áudio.
4. Proxy e normalização temporal quando necessário, preservando vínculo com original.
5. Transcrição/análise apenas nas etapas pertinentes.
6. Compilação da timeline e render.
7. Validação técnica e revisão visual.
8. Publicação atômica do arquivo concluído.

Cache deve considerar hash do asset, parâmetros, modelo, revisão e versão do pipeline. Alterar só um título não deve repetir transcrição. Etapas idempotentes registram artefatos concluídos; retry recomeça na etapa necessária.

Filas separadas para análise, prévia, render curto, render longo e publicação. Priorizar prévias para que um Ambient longo não bloqueie o estúdio. Cancelamento encerra subprocessos e remove apenas temporários daquela tentativa.

Validação: arquivo decodificável; duração esperada com tolerância documentada; dimensões/fps corretos; áudio presente quando esperado; sincronismo; fontes resolvidas; legendas dentro dos intervalos; clipping; imagens ausentes. Preto e silêncio intencionais não devem ser rejeitados sem contexto.

Saída inicial proposta: MP4 H.264/AAC, pixel format compatível e faststart. Fixar presets após teste. Registrar métricas de loudness/peak e usar perfis próprios por canal; Ambient e fala não devem receber necessariamente a mesma normalização.

Arquivos longos devem usar streaming/chunks, BigInt para tamanho em bytes e limites explícitos. Evitar carregar um vídeo de várias horas inteiro em memória, como ocorre na leitura do arquivo na rota legada de publicação inspecionada.

## 12. Modelo de dados proposto

| Entidade | Responsabilidade e vínculos |
|---|---|
| Workspace / Membership | Proprietário, editor e revisor; isolamento de acesso |
| Channel | Workspace, slug, nome, idioma, regras e estado ativo |
| SocialAccount | Canal, plataforma, externalId, capacidades e referência segura às credenciais |
| BrandKitVersion | Logo, cores, fontes e estilos imutáveis |
| Series / TemplateVersion | Canal, estrutura editorial, parâmetros e versão |
| Asset / AssetUsage | Origem, hash, storage, licença e vínculos com revisões |
| TranscriptVersion | Texto, idioma, segmentos/palavras e asset original |
| VideoProject / TimelineRevision | Briefing, revisão atual e histórico |
| AgentRun | Comando, modelo, ferramentas, consumo e resultado |
| RenderJob / JobStep | Estado, lease, tentativas e artefatos intermediários |
| Deliverable / ReviewApproval | Revisão, formato, hash e decisão do revisor |
| Publication / PublicationAttempt | Destino, agenda, metadados, estado e ID remoto |
| RecipeVersion / CharacterProfile | Regras de produção específicas dos canais |
| BibleVerse / VerseUsage | Texto, tradução e uso editorial |
| LegacyMapping / MigrationRun | Origem/destino e conciliação da migração |

Remover o limite conceitual de um YouTubeChannel por usuário. A unicidade de contas deve considerar workspace, plataforma e ID externo, com associação editorial explícita. Não duplicar credenciais por projeto.

## 13. API do hub

Contratos propostos, sujeitos a OpenAPI na implementação:

| Endpoint | Finalidade |
|---|---|
| GET/POST /channels | Listar/criar canais |
| GET/PATCH /channels/:id | Identidade e configurações |
| POST /assets/uploads | Iniciar upload |
| POST /assets/:id/analyze | Enfileirar inspeção |
| POST /projects | Criar projeto |
| GET /projects/:id | Estado e revisão atual |
| POST /projects/:id/agent-runs | Executar comando de edição |
| POST /projects/:id/revisions | Aplicar patch com expectedRevisionId |
| POST /revisions/:id/renders | Solicitar prévia/final |
| GET /jobs/:id/events | Progresso por SSE |
| POST /jobs/:id/cancel | Solicitar cancelamento |
| POST /deliverables/:id/approvals | Aprovar entrega e metadados |
| POST /publications | Criar distribuição |
| POST /publications/:id/schedule | Agendar versão aprovada |
| POST /revisions/:id/resolve-export | Exportar intercâmbio |

Respostas assíncronas retornam jobId, não mantêm a conexão aguardando render. Usar validação de payload, autorização por workspace/canal, paginação e idempotency key nas operações repetíveis. Erros devem distinguir conflito, limite, dependência ausente, falha transitória e dados inválidos.

## 14. Interface e experiência de uso

### 14.1 Navegação

Menu principal: Visão geral, Canais, Projetos, Biblioteca, Calendário, Fila e Configurações. Seletor de canal persistente com opção “Todos os canais”. A interface deve exibir nome/ícone do canal nos projetos e antes de publicar.

Visão geral: continuar edição, entregas aguardando revisão, erros acionáveis, próximos agendamentos e capacidade do worker. Evitar painel com métricas vazias que ainda não existem.

Página do canal: Identidade, Séries, Templates, Contas, Biblioteca vinculada e Regras editoriais. Configuração de conta social separada da escolha do formato de vídeo.

### 14.2 Estúdio

| Região | Conteúdo |
|---|---|
| Barra superior | Canal, projeto, revisão, salvamento, desfazer/refazer, prévia e exportação |
| Painel esquerdo | Abas Mídias, Cenas, Transcrição e Templates |
| Centro | Player, timecode, proporção, zoom e guias de área segura |
| Painel direito | Abas Conversa com Opus e Propriedades da seleção |
| Rodapé | Timeline com trilhas de vídeo, áudio, texto e legendas |

Painéis redimensionáveis e recolhíveis. Player como centro visual, fundo neutro, miniaturas legíveis e ações primárias consistentes. Estados de seleção e foco não dependem só de cor.

Clicar em frase navega ao instante; “Corrigir texto” e “Remover trecho do vídeo” são ações distintas. Seleção de cena delimita o pedido ao agente. Exibir elementos bloqueados, alterações propostas e revisão exibida. Alterar formato abre ajustes próprios de enquadramento; não esticar automaticamente o vídeo.

Timeline MVP: selecionar, mover, aparar, dividir, excluir, ordenar camadas, ajustar volume e editar texto. Keyframes complexos e ferramentas profissionais ficam para evolução. Autosave com indicador e proteção contra sobrescrita concorrente.

### 14.3 Revisão e calendário

Tela de revisão com player, comentários por instante, comparação, pendências técnicas, revisão/hash e aprovação. Preview não equivale a entrega final aprovada.

Calendário por dia/semana/mês, filtros por canal/plataforma/status, timezone America/Sao_Paulo por padrão e armazenamento UTC. Arrastar agendamento exige nova validação de disponibilidade/capacidades; qualquer falha deve ser visível.

Cada cartão mostra conta de destino, formato, capa, horário e estado. Oferecer pacote para postagem manual quando a integração não comportar a ação.

### 14.4 Acessibilidade e responsividade

Navegação por teclado, labels acessíveis, contraste suficiente, foco visível, atalhos documentados e textos de erro próximos à ação. Em telas pequenas, priorizar acompanhar jobs, revisar e aprovar; edição detalhada usa painéis alternados, sem comprimir quatro colunas. Confirmar operações destrutivas; edição reversível usa desfazer.

Estados obrigatórios: vazio com ação inicial, carregamento, upload interrompido, worker offline, conta desconectada, erro recuperável e conclusão com próximo passo.

## 15. Integrações e ferramentas complementares

| Ferramenta | Papel | Prioridade |
|---|---|---|
| Hyperframes | Composições HTML e animação por código | P0 |
| FFmpeg/ffprobe | Cortes, conversões, mixagem, inspeção e montagem | P0 |
| Whisper | Transcrição base | P0 |
| faster-whisper | Candidato a execução mais eficiente; comparar no hardware real | P0/P1 |
| PySceneDetect | Candidato para detectar cortes e selecionar frames | P1 |
| WhisperX | Candidato para alinhamento por palavra | P3 |
| OpenTimelineIO | Candidato a camada de intercâmbio; validar adapters e formatos | P3 |
| Piper / Gemini TTS | Adaptadores com referências no legado; validar compatibilidade e qualidade | P1 |
| ElevenLabs | Voz opcional, com custo explícito e revisão | Futuro |
| Pexels / Pixabay | Fontes de mídia já referenciadas no projeto | P1 |
| Remotion legado | Referência e renderização histórica quando necessária | Transição |

Não introduzir todos os provedores no primeiro ciclo. Antes de adicionar dependência, conferir documentação oficial, licença, versões, custo e disponibilidade de modelos.

Hyperframes é o motor principal proposto, condicionado à prova com mídia real. A integração deve encapsular comandos e formatos da versão fixada, sem espalhar detalhes do fornecedor pelo domínio.

Tradução para português é etapa própria, com texto original preservado e revisão humana. O modo de tradução do Whisper não deve ser presumido como tradutor para qualquer idioma.

## 16. DaVinci Resolve Free

O pipeline automático não depende de scripting do Resolve Free. A versão, sistema operacional e capacidades da instalação do usuário ainda precisam ser verificados. A afirmação anterior da conversa sobre uma versão específica do Resolve não é adotada como requisito técnico confirmado.

Fluxo: exportar mídias usadas + referência MP4 + timeline de intercâmbio + manifesto; importar manualmente no Resolve; finalizar; exportar; reenviar ao hub como nova entrega com origem externa e nova aprovação.

Testar o formato aceito pela instalação (XML/EDL ou outro compatível) com cortes, áudio e timebase. O exportador deve fornecer caminhos portáveis e relink. Animações HTML, títulos e efeitos podem precisar ser renderizados como clipes; listar o que foi achatado. Não prometer equivalência de efeitos ou retorno editável perfeito.

## 17. Distribuição social

Priorizar YouTube porque existe implementação a estudar. Reconstruir o conector para múltiplas contas, publicação em worker, uploads retomáveis e registro persistente de tentativas. A existência do código legado não confirma conexão ativa nem publicação funcionando em produção.

Instagram/Facebook, TikTok e demais plataformas entram por adaptadores com matriz de capacidades: formato, tamanho, duração, capa, agendamento, privacidade e estado de processamento. Validar limites e permissões na documentação oficial durante a implementação.

Tokens cifrados em repouso; refresh no servidor; escopos mínimos; revogação e reconexão disponíveis. Nunca enviar tokens ao agente ou front-end.

Uma chave de publicação deve representar entrega, conta e intenção de distribuição. Após timeout com resultado incerto, marcar UNKNOWN e reconciliar sessão/ID remoto antes de repetir. O sistema não pode garantir exatamente uma publicação só com retry local.

## 18. Migração e reconstrução segura

1. Identificar branch/commit de referência e produzir inventário do banco, storage, canais reais, contas e agendamentos.
2. Fazer backup de banco e arquivos e testar restauração antes de qualquer mudança destrutiva.
3. Desenvolver V3 isolada, com migrations incrementais. Não usar reset ou db push destrutivo sobre produção.
4. Criar workspace e preservar usuários/permissões. Registros sem userId entram em pendência de associação, nunca em acesso público.
5. Criar canais a partir do inventário e migrar configurações editoriais com IDs estáveis.
6. Migrar assets por hash, mantendo origem, licença e referências; validar arquivos ausentes.
7. Migrar receitas, personagens, fontes, versículos e histórico de uso.
8. Associar projetos a canais por mapeamento explícito. TOP_LIST/CURIOSIDADE sem contexto ficam pendentes, sem atribuição arbitrária.
9. Migrar saídas antigas como entregas históricas e guardar JSON legado. Converter edição só onde houver transformação testada; caso contrário, marcar projeto como legado somente leitura.
10. Migrar contas sociais preservando IDs externos; cifrar tokens via rotina administrativa sem registrá-los em logs. Reconectar se necessário.
11. Importar publicações anteriores e IDs remotos para evitar duplicações. Pausar agendamentos na transição.
12. Executar dry-run, conciliar contagens e hashes e validar amostras dos três núcleos.
13. Fazer corte controlado, impedir processamento simultâneo pelo legado e V3 e manter rollback documentado.
14. Retirar código legado somente após aceite da migração, referências visuais e entregas de teste.

| Origem | Destino |
|---|---|
| Project.kind | Formato/série; canal por mapeamento |
| Project.*Json | Configuração tipada ou snapshot histórico |
| Clip / MediaAsset / SoundAsset | Asset, uso e edição quando conversível |
| Recipe / RecipeVersion | Receitas versionadas preservadas |
| BibleVerse | Biblioteca com tradução e histórico de utilização |
| outputKey / previewKey | Deliverable histórico e prévia |
| youtubeVideoId / youtubeShortId | Publicações históricas |
| YouTubeChannel | SocialAccount vinculada explicitamente |
| Assets de Rabisco e fontes | Biblioteca e CharacterProfile/BrandKitVersion |

Scripts devem ser idempotentes com LegacyMapping e relatório de erros. Rollback envolve banco e arquivos, não apenas git revert. Não apagar originais, histórico ou canais para simplificar o novo schema.

## 19. Requisitos não funcionais

- Isolamento por workspace e autorização em todas as referências de arquivos, projetos e contas.
- Logs estruturados com projectId/jobId/runId e sem segredos.
- Limites por upload, espaço em disco, duração e orçamento do agente.
- Medir latência de prévia, tempo de render, memória, fila e falhas; definir metas após benchmark P0.
- Manter tarefas concluídas e resultados parciais consistentes após reinício.
- Validação de caminhos e execução de subprocessos sem interpolação livre de shell.
- Original imutável e limpeza de cache com política de retenção; não excluir assets referenciados.
- Backups periódicos com teste de restauração.
- Dependências e templates fixados por versão; registrar ambiente para reproduzir a renderização.
- Fila e status persistidos; worker offline não deixa interface indefinidamente em “processando”.
- Histórico editorial por canal para reduzir repetição e rastrear fontes.

## 20. Plano de implementação para o Claude Code

### Marco 0 — Descoberta e proteção

Entregar inventário do domínio, mapa de dados, relatório de assets faltantes e roteiro de backup/restore. Confirmar instalação Resolve, hardware, versões e disponibilidade dos provedores. Não iniciar reescrita removendo o projeto atual.

### Marco 1 — Prova vertical

Um vídeo de 30–60 segundos com mídia real, composição Hyperframes, transcrição quando aplicável, timeline persistida e comando de revisão. Gerar 9:16 e 16:9. Registrar consumo e comparar prévia/final. Testar intercâmbio mínimo no Resolve e um segmento Ambient em loop.

### Marco 2 — Núcleo e migração

Schema novo, canais, identidade, biblioteca, revisões, storage e dry-run da migração. Validar todos os núcleos e o acesso por usuário antes de migrar dados reais.

### Marco 3 — Estúdio e agente

Editor básico, transcrição revisável, conversa Opus, bloqueios, desfazer, prévia, fila e exportação. Implementar templates Midnight, Cristão e Rabisco no motor novo.

### Marco 4 — Distribuição

Contas múltiplas, aprovação vinculada, agenda e YouTube em worker. Exercitar interrupção de upload e reconciliação. Adicionar outras redes somente após validar o primeiro conector.

### Marco 5 — Ampliação

Tradução, alinhamento por palavra, pacote Resolve completo, lotes e analytics.

Em cada marco: registrar mudanças, testes e limitações; atualizar README para refletir o comportamento real. Não declarar integração concluída com apenas mocks. Adicionar futuramente instruções CLAUDE.md que apontem para esta especificação e para os comandos efetivamente existentes.

## 21. Critérios de aceite e testes

| ID | Cenário verificável |
|---|---|
| AC-01 | Dry-run e migração real conciliam canais, receitas, assets e histórico; executar duas vezes não duplica dados |
| AC-02 | Midnight, Cristão e Rabisco aparecem como configurações próprias; Top List e Curiosidade são reutilizáveis |
| AC-03 | Geração de MP4 válido a partir de mídia real sem intervenção no código |
| AC-04 | Comando sobre um elemento altera somente o escopo solicitado e respeita bloqueios |
| AC-05 | Correção ortográfica não altera cortes; remover trecho exige operação editorial distinta |
| AC-06 | Patch concorrente com revisão antiga é rejeitado e não sobrescreve edição manual |
| AC-07 | 9:16 e 16:9 preservam decisões editoriais e possuem crop independente |
| AC-08 | Restaurar revisão não apaga histórico; hashes dos originais permanecem iguais |
| AC-09 | Falha/reinício retoma etapas concluídas sem transcrever novamente sem necessidade |
| AC-10 | Nova entrega ou mudança de metadados impede reutilizar aprovação anterior indevidamente |
| AC-11 | Timeout de publicação não dispara segundo upload sem reconciliação |
| AC-12 | Usuário não acessa assets/projetos/contas de outro workspace |
| AC-13 | Render Ambient longo tem emendas verificadas, tamanho suportado e consumo de memória limitado |
| AC-14 | Cristão usa texto/referência da biblioteca; Rabisco preserva identidade; Midnight preserva receitas |
| AC-15 | Pacote Resolve abre na versão Free testada, relinka mídia e documenta elementos achatados |
| AC-16 | Worker offline, conta expirada e mídia ausente apresentam estado e ação claros |
| AC-17 | Backup é restaurável e rollback não ativa duas filas de publicação |
| AC-18 | Custos do agente e duração de jobs ficam associados ao projeto |

Testes unitários para cálculo temporal, validação de patches e idempotência; integração para migração/storage/filas; ponta a ponta para criar → revisar → renderizar → exportar. Usar amostras reais dos canais em validação visual e audiovisual. Publicação de teste exige conta e destino explicitamente configurados para teste.

## 22. Decisões pendentes que não bloqueiam a documentação

- Nome comercial final do Canal Cristão e relação editorial de Rabisco com outras marcas.
- Quais canais e contas existem no banco real, além das configurações no código.
- Hardware do worker e edição/versão instalada do Resolve.
- Modelo Opus, autenticação e orçamento para agente incorporado.
- Versão Hyperframes validada e estratégia de render de composições longas.
- Necessidade de manter editor legado disponível para projetos históricos.
- Política de retenção e capacidade de armazenamento para vídeos longos.

Resolver esses pontos na descoberta; não preencher com dados presumidos.

## 23. Referências

### Repositório e domínio legado

- [README](../README.md)
- [Projeto inicial](../PROJETO.md)
- [Schema Prisma](../packages/db/prisma/schema.prisma)
- [Despacho dos pipelines](../apps/worker/src/index.ts)
- [Catálogo Midnight](../packages/core/src/midnight.ts)
- [Estratégia Midnight](estrategia-midnight-relaxing-sounds.md)
- [Pilares Cristãos](../packages/core/src/christian.ts)
- [Especificação Cristã](Cristão/projeto.md)
- [Identidade Rabisco](../packages/core/src/rabisco.ts)
- [Documento Rabisco](../RABISCO.md)
- [Publicação YouTube legada](../apps/web/src/app/api/youtube/publish/[id]/route.ts)

### Documentação técnica

Consultadas em 23/10/2026 para os papéis gerais: [Hyperframes](https://github.com/heygen-com/hyperframes), [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) e [Whisper](https://github.com/openai/whisper).

Fontes oficiais a validar na prova técnica: [FFmpeg](https://ffmpeg.org/documentation.html), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [WhisperX](https://github.com/m-bain/whisperX), [PySceneDetect](https://github.com/Breakthrough/PySceneDetect), [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) e [suporte Blackmagic Design](https://www.blackmagicdesign.com/support/).

Esta especificação define o comportamento desejado. APIs, versões, licenças e compatibilidade devem ser verificadas e fixadas na implementação.
