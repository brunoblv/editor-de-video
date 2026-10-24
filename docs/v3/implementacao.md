# V3 — Estado da implementação

Referência: [especificação V3](../especificacao-v3-hub-editor-ia.md). Branch `v3`, a partir de `main@dc700f0`.
O legado (apps/worker, packages/video, rotas antigas do web) continua intacto e funcionando em paralelo.

## Estrutura nova

| Caminho | Papel |
|---|---|
| `packages/timeline` | Documento de timeline versionado (zod), tempos inteiros em timebase racional, operações de domínio, patch com `expectedRevisionId` e bloqueios, variantes 9:16/16:9, compilador único prévia/final (`/compile`), mapeamento original↔edição, diff de revisões |
| `packages/domain` | Máquinas de estado (projeto/job/entrega/publicação), aprovação vinculada por impressão digital, chave de idempotência e decisão de retry de publicação, chaves de cache, papéis, canais preservados como dados, planejador da migração, contratos das ferramentas do agente |
| `packages/templates` | Templates Hyperframes (Midnight, Cristão, Rabisco) com variáveis declaradas; Hyperframes `0.8.190` e GSAP `3.14.2` fixados |
| `packages/integrations` | FFmpeg/ffprobe por argumentos estruturados, hash por streaming, proxy, cenas, frames, render do plano, validação técnica/loudness, Ambient longo por segmento + verificação de emendas, Whisper (whisper.cpp / faster-whisper), adaptador Hyperframes em sandbox, pacote Resolve (EDL + SRT + manifesto) |
| `packages/db` (`/v3`) | Modelos V3 aditivos no Prisma, migrações versionadas, serviços com autorização por workspace, commit atômico de revisões (`SELECT … FOR UPDATE`), jobs com lease/heartbeat/cancelamento, etapas cacheadas, aprovação/publicação, AgentRun, executor da migração |
| `apps/render-worker` | Consome filas separadas (análise, prévia, render curto, render longo); composição → FFmpeg → validação → hash → entrega |
| `apps/agent` | Serviço HTTP com Claude Agent SDK (`@anthropic-ai/claude-agent-sdk@0.3.310`), modelo configurável (padrão `claude-opus-5-5`), só ferramentas do hub (sem shell/arquivos/web), orçamento por execução |
| `apps/web` `/api/v3/*`, `/hub/*` | API do hub (§13) e interface: Visão geral, Canais, Projetos/Estúdio, Biblioteca, Calendário, Fila, Configurações |
| `workers/media/transcribe.py` | faster-whisper (candidato; comparar no hardware real) |

## Como rodar

```bash
npm install
npm run build:packages
# Banco: BACKUP restaurável antes (§18.2). O banco atual foi criado com db push:
npm run migrate:baseline -w @editor-video/db   # marca o schema legado como aplicado (uma vez)
npm run db:migrate:deploy                      # aplica a migração V3 (somente aditiva)
npm run dev:v3                                 # web + render-worker + agente
```

Abra `/hub`. No primeiro acesso cada usuário ganha um workspace com os três canais preservados.

## Testes

```bash
npm run test:v3                      # unitários + integração FFmpeg/Hyperframes reais
V3_TEST_DATABASE_URL=postgresql://…  # banco DESCARTÁVEL migrado — habilita testes de Postgres e e2e
npm test -w @editor-video/render-worker
```

Executado nesta entrega (Windows 11, Node 22.17, FFmpeg do winget, Postgres 17 embarcado descartável):

| Suíte | Resultado |
|---|---|
| timeline (22) | ok — aritmética temporal, validação, AC-04/05/06/07/08, split NTSC, mapeamento |
| domain (15) | ok — AC-10, AC-11, AC-09, AC-02/14, papéis, planejamento AC-01 |
| integrations FFmpeg (4) | ok — inspeção/hash/proxy, render prévia/final 16:9 e 9:16 com textos/legendas validado, pacote Resolve, Ambient 45 s por loop com emendas verificadas (AC-13) |
| integrations Hyperframes (3) | ok — render MP4 real do template de versículo (~27 s) |
| db Postgres (4) | ok — canais semeados, conflito concorrente real (só um vence), restauração preserva histórico, migração aplicada 2× sem duplicar (AC-01), isolamento (AC-12) |
| agent tools (5) | ok — bloqueio/desbloqueio negado ao agente, conflito, escopo, validação de template, outro usuário |
| render-worker e2e (1) | ok — mídia real → composição Hyperframes → render 16:9 e 9:16 → validação → entrega READY com sha256 |
| web | `next build` ok; smoke HTTP: login, canais, projeto, upload por streaming, patch obsoleto → 409, render → 202, páginas `/hub/*` → 200, API anônima → 401 |

## Não verificado / limitações conhecidas

- **Agente com o modelo real não foi executado**: não há `ANTHROPIC_API_KEY` configurada e o uso tem custo. As ferramentas foram testadas sem o modelo. Primeiro passo ao configurar: `GET http://127.0.0.1:4100/health` e um comando simples no estúdio.
- **Banco real não foi tocado**: nenhuma migração/migração de dados rodou contra o banco do `docker-compose`. Fazer backup, `--dry-run` e conferir o relatório antes do `--apply`.
- **Redis/BullMQ**: o fluxo foi testado com Redis indisponível (job fica QUEUED no banco; o dispatcher do worker reenvia). O consumo real via BullMQ não foi exercitado nesta máquina.
- **Publicação social (Marco 4)**: domínio pronto (aprovação vinculada, chave de idempotência, UNKNOWN → reconciliação, agenda pausada), mas o **publish-worker e o conector YouTube reconstruído não foram implementados**. Não há publicação automática na V3; a entrega pode ser baixada para postagem manual.
- **Worker remoto via HTTPS**: lease/heartbeat/`claimNextJob` existem no banco; os endpoints HTTP e a transferência de arquivos para um worker em outra máquina ainda não.
- **Composições Hyperframes são opacas**: entram como clipe em tela cheia (com opacidade). Sobreposição com transparência (alpha) depende de validar o formato de saída com alpha da versão fixada.
- **Ducking** (`duckUnderTrackId`) está no schema mas não é aplicado pelo render.
- **Player do estúdio** mostra a última prévia renderizada (não há composição em tempo real no navegador); a interface indica quando a prévia está desatualizada.
- **Resolve**: EDL CMX3600 + SRT gerados e testados por formato; abrir na instalação do Resolve Free do usuário (AC-15) ainda precisa ser feito manualmente.
- **Rabisco**: os PNGs declarados não foram conferidos (transparência/resolução) — `CharacterProfile.assetsVerified=false`. O template exige a arte como asset (`$file:assets/character.png`).
- **TTS (RF-21), tradução, alinhamento por palavra, lotes e métricas** (P1+/P3/P4) não foram implementados.

## Decisões pendentes (§22) — não preenchidas com dados presumidos

Nome comercial do Canal Cristão (canal semeado com `nameConfirmed=false`), vínculo do Rabisco com outras marcas (`linkedBrand=null`), canais/contas reais do banco, hardware do worker, versão do Resolve, orçamento do agente, retenção de vídeos longos.
