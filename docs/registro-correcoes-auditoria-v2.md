# Registro de correções — Auditoria técnica V2

Documento vivo. Cada etapa do plano é registrada aqui ao ser concluída.

**Fonte:** [auditoria-tecnica-editor-de-video-v2.md](./auditoria-tecnica-editor-de-video-v2.md)  
**Plano:** execução por etapas (0 → 5)  
**Escopo:** P0 + P1 + P2 + Recipe + auth de usuário (Auth.js)

---

## Resumo do status

| Etapa | Nome | Status | Concluída em |
|-------|------|--------|--------------|
| 0 | Auth de usuário | concluída | 2026-08-07 |
| 1 | Segurança e integridade | concluída | 2026-08-07 |
| 2 | Áudio longo e intensidade | concluída | 2026-08-07 |
| 3 | Visual | concluída | 2026-08-07 |
| 4 | Quality Check + flags UI | concluída | 2026-08-07 |
| 5 | Recipes e modelagem | concluída (parcial: sem split de soundscape) | 2026-08-07 |

---

## Etapa 0 — Auth de usuário

**Status:** concluída

### O que foi feito
- Modelos `User`, `Account`, `Session`, `VerificationToken` + `Project.userId`
- Auth.js v5 (Credentials) com JWT; páginas `/login` e `/register`
- `requireUser` / `requireProjectAccess` / `requireStorageKeyAccess`
- Middleware protegendo rotas de app e APIs
- Ownership em todas as rotas de projects/ambient/clips/files
- Env: `AUTH_SECRET`, `NEXTAUTH_URL` no `.env.example`

### Arquivos alterados
- `packages/db/prisma/schema.prisma`
- `apps/web/src/auth.ts`, `middleware.ts`, `lib/auth-guards.ts`
- `apps/web/src/app/api/auth/**`, `login/page.tsx`, `register/page.tsx`
- Todas as rotas em `apps/web/src/app/api/**`
- `apps/web/src/app/layout.tsx`, `page.tsx`, `ambient/page.tsx`, `projects/[id]/page.tsx`
- `.env.example`

### Aceite
- [x] Login / register funcionam
- [x] APIs retornam 401 sem sessão
- [x] Arquivo de outro usuário retorna 403

---

## Etapa 1 — Segurança e integridade

**Status:** concluída

### O que foi feito
- `validateProjectLicenses(projectId)` — QC não recebe mais `licenseSafe: true` hardcoded
- `AMBIENT_MAX_DURATION_MIN` (600) + validação API/worker
- Limite de download externo em `download.ts`
- Upload da library enfileira `analyze-sound` → `reanalyzeSoundAsset`
- Metadata com créditos de áudio + visual; stock → `MediaAsset`
- Fila usa `config.ambient.maxRetries`
- Clip `maxDurationSec` alinhado à config (60s)

### Arquivos alterados
- `apps/worker/src/ambient/license-guard.ts`, `pipeline.ts`, `metadata.ts`, `sound-analyzer.ts`
- `apps/worker/src/v2/download.ts`, `apps/worker/src/index.ts`
- `packages/core/src/config.ts`, `queue.ts`
- `apps/web/src/app/api/ambient/route.ts`, `library/route.ts`, `lib/queue.ts`
- `apps/web/src/app/api/projects/[id]/clips/route.ts`

### Aceite
- [x] QC recebe license real
- [x] `durationMinutes > 600` rejeitado
- [x] Download externo aborta acima do teto
- [x] Upload da library passa pelo Sound Analyzer (job)
- [x] Metadata inclui atribuições de áudio
- [x] Fila usa `AMBIENT_MAX_RETRIES`
- [x] Clip tradicional usa `maxClipDurationSec` da config

---

## Etapa 2 — Áudio longo e intensidade

**Status:** concluída

### O que foi feito
- Masters longos (>120s): chunks AAC de 10 min + concat (sem WAV full-duration)
- Eventos misturados por janela (não reescreve a trilha PCM inteira várias vezes)
- `muxAmbient` usa `-c:a copy` quando o master já é AAC/m4a
- `intensitySegments` aplicados como volume por chunk/janela

### Arquivos alterados
- `apps/worker/src/ambient/soundscape.ts`
- `apps/worker/src/ambient/visual.ts` (`muxAmbient`)

### Aceite
- [x] Render longo sem vários GB de WAV intermediário
- [x] Mux com `-c:a copy` quando master já é AAC
- [x] Intensidade aplicada no mix

---

## Etapa 3 — Visual

**Status:** concluída

### O que foi feito
- `getAmbientRenderProfile(format)` — YouTube 1920×1080 / Shorts 1080×1920
- `format` propagado do `ambientConfigJson` → concept → visual
- `rainOverlay` e `lightFlicker` no filtro do stock
- Crossfade A↔B quando há 2 clips
- Fallback `strategy: 'synthetic'`
- Stock registrado como `MediaAsset`

### Arquivos alterados
- `apps/worker/src/ambient/render-profile.ts` (novo)
- `apps/worker/src/ambient/visual.ts`, `pipeline.ts`
- `packages/core/src/types.ts`

### Aceite
- [x] Shorts renderiza 1080×1920
- [x] Efeitos aplicados no stock
- [x] Dois clips entram no loop (crossfade)
- [x] Fallback marcado como `synthetic`

---

## Etapa 4 — Quality Check + flags UI

**Status:** concluída

### O que foi feito
- QC com medições reais: duração, clipping/peak, silêncio, black frames, resolução
- Flags `generateThumbnail` / `generateMetadata` / `qualityCheck` / `autoSearch` respeitadas
- Removido `createVariations` da UI
- Race guard atômico (`updateMany`) no enqueue Ambient e Top List
- Job IDs `ambient:...` / `project:...`

### Arquivos alterados
- `apps/worker/src/ambient/quality.ts`, `pipeline.ts`
- `apps/web/src/components/AmbientForm.tsx`
- `apps/web/src/app/api/ambient/[id]/run/route.ts`
- `apps/web/src/app/api/projects/[id]/render/route.ts`

### Aceite
- [x] Score derivado de medições reais
- [x] Flags UI coerentes com o worker
- [x] Double enqueue rejeitado
- [x] Fluxo preview → aprovação → render mantido

---

## Etapa 5 — Recipes e modelagem

**Status:** concluída (parcial)

### O que foi feito
- Models `Recipe` + `RecipeVersion`
- `Project.recipeId`, `recipeVersion`, `pipelineVersion`
- Seed automático dos presets (`ensureRecipesSeeded`)
- Selection de SoundAsset prioriza `verified`
- Tipos `SOUND_LIBRARY` / `SOUND_SYNTH` / `VISUAL_STOCK` / `VISUAL_SYNTH`
- **Não feito:** split estrutural de `soundscape.ts` (adiado de propósito até estabilizar)

### Arquivos alterados
- `packages/db/prisma/schema.prisma`
- `apps/worker/src/ambient/recipes.ts` (novo)
- `apps/worker/src/ambient/pipeline.ts`, `soundscape.ts`

### Aceite
- [x] Preset vira RecipeVersion
- [x] Projeto grava recipe + pipelineVersion + seed
- [x] Selection de áudio considera license + verified
- [ ] soundscape dividido em módulos (adiado)

---

## Histórico cronológico

| Data | Etapa | Nota |
|------|-------|------|
| 2026-08-07 | — | Plano e este registro criados. |
| 2026-08-07 | 0–5 | Implementação das correções da auditoria V2 (exceto split de soundscape). |
