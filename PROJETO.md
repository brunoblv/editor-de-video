# Projeto: Compilador Automático de Clipes ("Top 5")

## 1. O que é

Sistema que recebe uma lista de vídeos curtos (ex: clipes escolhidos manualmente de fontes como TikTok/YouTube) e gera automaticamente um vídeo compilado no formato "Top 5", "Top 10" etc., com cortes, contador numérico, legendas e transições, pronto pra postar em redes sociais (formato vertical 9:16).

O usuário escolhe os clipes (upload manual). O sistema não busca ou baixa conteúdo de terceiros sozinho nesta primeira versão — essa decisão fica de fora do escopo por causa dos riscos legais/ToS envolvidos em automatizar download de plataformas de terceiros (ver seção 6).

## 2. Objetivo

Reduzir o tempo de edição manual de compilações curtas, automatizando:
- Normalização dos clipes (resolução, aspect ratio, duração)
- Transcrição e legendagem automática
- Montagem com contador, texto de ranking e transições
- Renderização final em MP4 pronto pra upload

## 3. Escopo funcional (MVP)

### Entrada
- Usuário envia de 3 a 10 arquivos de vídeo (upload manual via painel).
- Usuário define: título da compilação (ex: "Top 5 momentos constrangedores"), ordem dos clipes, e opcionalmente um texto curto por clipe (legenda/contexto).

### Processamento
1. **Normalização**: cada clipe é cortado/ajustado para 9:16, duração máxima configurável por clipe (ex: 15s).
2. **Transcrição** (opcional, toggle por clipe): Whisper gera transcrição do áudio de cada clipe para legenda automática sincronizada.
3. **Composição**: intro com título da lista, tela de contagem regressiva entre clipes ("#5", "#4"...), overlay de texto (legenda ou contexto do usuário), marca d'água/branding próprio (se configurado).
4. **Renderização**: geração do MP4 final.

### Saída
- Vídeo final em MP4, formato vertical, com legendas embutidas.
- Preview antes de disponibilizar para download/postagem.

### Fora do escopo do MVP
- Download automático de vídeos de outras plataformas (TikTok, Instagram, YouTube).
- Postagem automática nas redes sociais (fase 2, se decidido seguir).
- Geração de vídeo com IA (text-to-video).

## 4. Stack técnica

- **Frontend/painel**: Next.js + TypeScript
- **Renderização de vídeo**: Remotion (composição em React, renderiza via FFmpeg por trás)
- **Transcrição**: Whisper (local via `whisper.cpp`/`faster-whisper`, ou API)
- **Fila/orquestração**: BullMQ + Redis (jobs de normalização e render rodam em worker separado, fora do runtime serverless)
- **Storage**: S3 ou Cloudflare R2 (armazenamento dos clipes originais e do vídeo final)
- **Banco de dados**: PostgreSQL + Prisma (projetos, clipes, status dos jobs, histórico)

## 5. Requisitos técnicos

- Node.js runtime com FFmpeg disponível (nativo, via `remotion` que já embute).
- Worker separado do frontend para não travar requests HTTP durante renderização (processo pode levar minutos).
- Limite de tamanho/duração de upload definido (ex: 100MB por clipe, 60s por clipe).
- Fila com retry em caso de falha de render.

## 6. Considerações legais e de risco

- Automatizar **download** de conteúdo de terceiros de plataformas como TikTok não é coberto por API oficial de forma aberta; ferramentas existem (ex: `yt-dlp`), mas reutilizar/redistribuir conteúdo de outros criadores pode violar Termos de Serviço da plataforma de origem e direitos autorais do criador original, especialmente se monetizado.
- Automatizar **postagem** em redes (Instagram/Facebook via Graph API, TikTok via Content Posting API) exige aprovação de app e conta Business/Creator; contas usadas para publicação 100% automatizada em alto volume têm risco maior de banimento/restrição.
- Recomendação: MVP com upload manual de clipes próprios ou com direito de uso, e postagem manual ou semi-automática (com revisão humana antes de publicar).

## 7. Resultados esperados

- Redução do tempo de edição de uma compilação de ~30-40 min (manual) para poucos minutos de processamento automático + tempo de escolha dos clipes.
- Output consistente em qualidade e formato, pronto para upload direto.
- Base extensível: se decidido expandir depois, a mesma engine de composição serve para outros formatos (ranking, antes/depois, compilado por tema).

## 8. Roadmap sugerido

1. **Fase 1 (MVP)**: upload manual → normalização → transcrição opcional → composição → render → download.
2. **Fase 2**: templates de composição (múltiplos estilos visuais).
3. **Fase 3**: agendamento e postagem semi-automática (com revisão antes do publish) via Ayrshare/Blotato ou APIs oficiais.
4. **Fase 4** (opcional, avaliar risco antes): integração com fontes externas, respeitando direitos de uso.

## 9. Instruções para a IA que for construir

- Seguir a stack definida na seção 4, sem introduzir dependências alternativas sem necessidade.
- Priorizar TypeScript estrito em todo o projeto.
- Separar claramente o frontend (Next.js) do worker de renderização (processo Node independente).
- Implementar como MVP incremental: primeiro o pipeline de normalização + render simples (sem legenda), depois adicionar transcrição, depois composição avançada (contador, transições).
- Não implementar download automático de plataformas de terceiros nem postagem automática nesta fase — manter como upload/export manual até decisão explícita de avançar para as fases 3/4.
