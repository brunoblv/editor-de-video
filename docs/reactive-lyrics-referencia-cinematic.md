# Reactive Lyrics — referência visual: Cinematic Atmospheric Lyrics

**Status:** direção artística de referência para implementação. **Origem:** vídeo MP4 fornecido pelo usuário no chat em 2026-11-06. O arquivo não está incluído no repositório. **Documentos relacionados:** [requisitos](reactive-lyrics-studio-requisitos.md), [instruções de implementação](claude-reactive-lyrics-implementacao.md). **Estado da implementação:** [docs/v3/reactive-lyrics.md](v3/reactive-lyrics.md#preset-cinematic-atmospheric).

## 1. Observação do exemplo

Vídeo vertical de aproximadamente 59,7 s (arquivo de referência 512×1108 a 30 fps). A referência mistura letras centralizadas em primeiro plano com imagens/cenas atmosféricas e sombrias. Aparecem ambientes como oceano e rochas, lua rosa e água refletiva, cidades envoltas em névoa, céu dramático, planetas e reflexos luminosos.

As palavras são predominantemente brancas, em fonte sans-serif com peso médio/alto, sem tarjas. O texto surge como uma palavra ou poucos termos por vez, às vezes em várias linhas. Palavras de maior importância emocional ganham tamanho/peso visual superior. A tela mantém área de respiro, contraste e leitura.

A paisagem geralmente permanece por mais de uma palavra; mudanças de cena acompanham frases, passagens ou energia musical, não necessariamente cada pulso ou palavra.

Não replicar marcas d'água, créditos do TikTok, telas finais do CapCut, logotipos ou conteúdo de terceiros. O objetivo é reproduzir a linguagem visual, não copiar frames/mídias/letras protegidas.

## 2. Novo preset principal: CINEMATIC_ATMOSPHERIC_LYRICS

Este preset se torna o estilo visual prioritário para testes e demonstrações do Reactive Lyrics Studio, sem apagar os presets NEON, MINIMAL e GLITCH_ROCK já especificados.

### Visual

- Fundo cinematográfico de tela inteira, podendo ser vídeo do usuário, imagem estática animada ou cena gerada/licenciada.
- Paleta normalmente escura com acentos ciano/azul, rosa-magenta, vermelho queimado e dourado; contrastes coerentes com cada trecho.
- Camada opcional de vinheta/gradiente atrás da região do texto para preservar legibilidade, mas sem blocos ou tarjas opacas.
- Movimento sutil de câmera (push-in, parallax, pan lento) e movimentos ambientais (reflexos, partículas, água, névoa), desde que o recurso exista/tenha sido validado.
- Letras preferencialmente brancas e em maiúsculas, fonte sans-serif legível (fallback com licença adequada), alinhamento central.
- Formato primário 9:16, safe zone para TikTok/Reels; suporte 16:9 por reenquadramento.

### Letra em primeiro plano

- Mostrar um fragmento curto de texto por vez, geralmente 1–5 palavras, configurável.
- Preservar sequência e significado da frase; não segmentar mecanicamente por quantidade fixa se isso tornar a leitura ruim.
- Palavra ativa acompanha a voz usando timestamps validados; não usar beat como substituto da temporização vocal.
- Palavra de maior impacto pode usar escala maior (ex.: 1,2–1,6× do corpo normal; limites ajustáveis), peso maior, espaçamento/movimento diferenciado.
- Suportar composição de 1–3 linhas com palavras de tamanhos diferentes no mesmo bloco.
- Entrada/saída sutil (fade, scale, slide pequeno ou blur controlado); transições curtas para acompanhar canto rápido.
- A animação de palavras deve responder à interpretação vocal e à música, sem comprometer leitura.
- Pausas sem vocal podem deixar a tela apenas com cenário, evitando texto permanente desnecessário.

### Reação musical

- Batidas graves podem disparar microzoom/pulso de cenário e/ou tipografia com suavização e limite.
- Agudos podem modificar brilho/reflexo; onsets podem disparar partículas pontuais e transições discretas.
- Intensidade global e individual ajustável, com modo reduzido para evitar flashes, fadiga visual e sobrecarga.
- Refrão admite maior impacto; versos sustentam composição mais limpa; pontes podem desacelerar movimento.
- Não usar barras de espectro, equalizador gráfico ou ondas decorativas por padrão: a reatividade é percebida na composição inteira, não por um visualizador explícito.

### Direção de cenas

- Uma mesma cena pode durar várias palavras ou frases.
- Trocar cenários por intervalos musicais, mudanças de frase, transições emocionais ou seções detectadas e validadas.
- O sistema não deve trocar fundo em toda palavra nem estabelecer corte fixo de 2 segundos.
- Gerar planejamento de cenas por seção/frase musical, com duração editável, aproveitamento de assets e transições suaves ou cortes sincronizados.
- Disponibilizar biblioteca/catálogos opcionais por atmosfera (oceano, cosmos, chuva, névoa, natureza, arquitetura, paisagens surrealistas). Apenas assets com direitos de uso adequados.

## 3. Controles adicionais necessários

- `lyricDisplayMode`: WORD, PHRASE, HYBRID.
- `maxWordsPerGroup`, `maxLines`, `uppercase`, `emphasisWords` e `emphasisScale`.
- `textTransition`: FADE, SCALE, SLIDE, BLUR e duração em frames.
- `sceneChangePolicy`: BY_PHRASE, BY_SECTION, MANUAL, AI_SUGGESTED.
- `backgroundMotion`: NONE, SLOW_ZOOM, PAN, PARALLAX_IF_AVAILABLE.
- `backgroundAudioReactivity`, `textAudioReactivity`, `contrastOverlayStrength`.
- `sceneAssets[]` com IDs e intervalos; edição por timeline V3 e revisões imutáveis.

## 4. Critérios de aceite visuais

- Exportar exemplo 9:16 de pelo menos 20–30 s com imagens de fundo autorizadas, 3 ou mais cenas atmosféricas e trechos de letra original fornecida.
- Pelo menos um trecho mostra uma palavra em tamanho superior às vizinhas, com mudança de composição e sincronização correta.
- A mesma cena permanece em tela durante mais de uma palavra e pode durar mais de uma frase.
- Palavra ativa acompanha o alinhamento validado; a reatividade de graves/agudos altera sutilmente texto/cena sem modificar início/fim de palavras.
- A tela permanece legível e sem caixas intrusivas; safe zones não cortam palavras.
- Não inserir marcas d'água de aplicativos/plataformas, créditos originais ou cards finais não solicitados.
- Ao reduzir intensidade para zero, os movimentos reativos param, mas as transições essenciais de letra e a composição permanecem funcionais.
- Testar abertura/revisão/alteração de cenários e render idêntico da mesma revisão, pelo fluxo do hub V3.

## 5. Instrução de implementação para Claude Code

Ao executar `docs/claude-reactive-lyrics-implementacao.md`, tratar CINEMATIC_ATMOSPHERIC_LYRICS como quarto preset e preset principal de referência. Priorizar a fidelidade a estes atributos observados antes de expandir efeitos complexos. Manter compatibilidade com os três presets anteriores.

Não pressupor que a geração de fundos por IA é obrigatória para o MVP: permitir upload, biblioteca de mídia licenciada e movimentos sutis aplicados a imagens fixas. O arquivo anexado no chat não está automaticamente disponível dentro do checkout do Claude; este documento descreve o comportamento a reproduzir. Solicitar o arquivo de referência no workspace somente se for necessária comparação visual direta ou testes de similaridade.
