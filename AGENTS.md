# Editor de vídeo — instruções para o Codex

- A V3 (hub de canais + edição por IA) segue `docs/especificacao-v3-hub-editor-ia.md`. Estado real, comandos e limitações: `docs/v3/implementacao.md`.
- README, PROJETO.md e as especificações V2 descrevem o **legado**, que continua rodando em paralelo (`apps/worker`, `packages/video`, rotas antigas do `apps/web`). Não remova código legado sem aceite da migração.
- Timeline é a fonte oficial: altere-a só por operações de `packages/timeline` via `commitPatch` (com `expectedRevisionId`). Nunca escreva `documentJson` direto.
- Banco: só migrações aditivas em `packages/db/prisma/migrations`. Nunca `db push`/reset sobre o banco real.
- Subprocessos só por `runProcess` (argumentos estruturados, sem shell).

## Comandos

```bash
npm run build:packages        # compila core, timeline, domain, templates, integrations, db
npm run test:v3               # testes V3 (FFmpeg/Hyperframes reais)
npm run dev:v3                # web + render-worker + agente
npm run typecheck
```

Testes de Postgres/e2e exigem `V3_TEST_DATABASE_URL` apontando para um banco descartável já migrado.
