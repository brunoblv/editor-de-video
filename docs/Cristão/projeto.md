# Especificação — Canal Cristão Automatizado

## 1. Objetivo do projeto

Construir uma plataforma totalmente automatizada para criação, renderização, gerenciamento e publicação de conteúdo cristão no:

* YouTube Shorts
* YouTube vídeos longos
* Instagram Reels
* Instagram vídeos/feed, quando aplicável

O sistema deve funcionar continuamente em um servidor/VPS, utilizando tarefas agendadas.

O objetivo é criar um canal com identidade visual própria, conteúdo emocionalmente acolhedor e alta variedade de formatos, evitando repetição excessiva.

A geração de conteúdo deve utilizar Gemini para criação de roteiros, reflexões, títulos, descrições e metadados.

A geração dos vídeos deve ser feita programaticamente, preferencialmente com Remotion + FFmpeg.

---

# 2. Conceito da marca

O canal deve ter uma identidade visual baseada em uma metáfora:

> Um personagem inicialmente quase sem cor, sem detalhes e visualmente "vazio" vai gradualmente ganhando forma, luz e cores conforme a mensagem avança.

A evolução representa:

* acolhimento
* esperança
* fé
* transformação
* paz
* proximidade com Deus
* superação de momentos difíceis

O personagem não deve necessariamente ser uma pessoa realista.

Preferência:

* personagem humano abstrato
* silhueta
* formas orgânicas
* rosto minimalista
* aparência cinematográfica
* inicialmente dessaturado
* iluminação baixa
* progressivamente mais luminoso
* cores surgindo de maneira orgânica

Não transformar todos os vídeos em uma cópia visual idêntica.

O personagem deve possuir diferentes estados visuais.

Exemplo:

Estado 0:

* cinza
* pouco contraste
* quase sem identidade

Estado 1:

* pequenos pontos de luz

Estado 2:

* detalhes começam a aparecer

Estado 3:

* cores suaves

Estado 4:

* iluminação quente

Estado 5:

* personagem completamente formado e iluminado

O sistema deve permitir configurar a "progressão espiritual/visual" do personagem ao longo dos episódios.

---

# 3. Estratégia de conteúdo

Criar um sistema de "Content Pillars".

Os pilares iniciais devem ser:

1. Versículo do Dia
2. Salmo do Dia
3. Oração para uma situação específica
4. Reflexão para momentos difíceis
5. Mensagem de esperança
6. Mensagem de bom dia
7. Mensagem de boa noite
8. Palavra para quem está desanimado
9. Palavra para quem está esperando algo
10. Palavra para quem está passando por mudanças
11. Reflexão sobre ansiedade
12. Reflexão sobre medo
13. Reflexão sobre solidão
14. Reflexão sobre perdão
15. Reflexão sobre recomeços
16. Reflexão sobre propósito
17. Reflexão sobre paciência
18. Reflexão sobre gratidão
19. Reflexão sobre família
20. Reflexão sobre relacionamentos
21. Reflexão sobre trabalho
22. Reflexão sobre fracasso
23. Reflexão sobre rejeição
24. Reflexão sobre luto
25. Reflexão sobre autoestima
26. Reflexão sobre esperança
27. "Se você está vendo isso, talvez precise ouvir..."
28. "Uma mensagem para você que..."
29. Pequenas histórias com ensinamento
30. Parábolas e ensinamentos bíblicos
31. Personagens bíblicos e suas dificuldades
32. "O que podemos aprender com..."
33. Perguntas para reflexão
34. Minuto de oração
35. Oração antes de dormir
36. Oração para começar o dia
37. Oração pela família
38. Oração pelos filhos
39. Oração por proteção
40. Oração por sabedoria
41. Oração por força
42. Oração para momentos de incerteza

O sistema deve conseguir adicionar novos pilares futuramente sem alteração estrutural do código.

---

# 4. Conteúdo semanal

O sistema deve possuir um "Content Planner".

Ele deve distribuir automaticamente os temas durante a semana.

Exemplo:

SEGUNDA

* emprego
* recomeço
* motivação

TERÇA

* ansiedade
* medo
* confiança

QUARTA

* família
* relacionamentos
* perdão

QUINTA

* doenças
* força
* esperança

SEXTA

* dinheiro
* trabalho
* decisões

SÁBADO

* descanso
* gratidão
* família

DOMINGO

* fé
* oração
* Salmos
* reflexão espiritual

Isso deve ser apenas uma configuração inicial.

O administrador deve conseguir alterar os temas.

---

# 5. Conteúdo sensível / saúde

O sistema deve possuir regras rígidas para conteúdo envolvendo:

* depressão
* ansiedade
* doenças
* transtornos
* suicídio
* automutilação
* medicamentos
* tratamentos médicos

Nunca apresentar oração ou fé como substituto de tratamento médico ou psicológico.

Quando apropriado, incluir orientação semelhante a:

"Se você está passando por uma situação de saúde, procure também ajuda profissional. A fé pode caminhar junto com o cuidado médico."

Nunca afirmar:

"Ore e você será curado."

Nunca diagnosticar.

Nunca recomendar medicamentos.

Nunca desencorajar tratamento profissional.

Para temas envolvendo depressão ou sofrimento intenso, o texto deve ser acolhedor e incentivar busca de ajuda profissional quando necessário.

---

# 6. Gerador de conteúdo com Gemini

Utilizar Gemini API.

Preferir respostas estruturadas em JSON utilizando schema.

O Gemini deve retornar um objeto estruturado, por exemplo:

{
"contentType": "verse_reflection",
"theme": "esperança",
"title": "...",
"hook": "...",
"script": "...",
"reflection": "...",
"verse": {
"book": "Isaías",
"chapter": 41,
"verse": "10",
"text": "..."
},
"cta": "...",
"description": "...",
"hashtags": [],
"visualPrompt": "...",
"visualMood": "...",
"voiceMood": "...",
"durationTarget": 45,
"safetyNotes": []
}

Não aceitar texto livre como única saída.

Validar o JSON antes de salvar.

A documentação atual do Gemini recomenda Structured Outputs para respostas que precisam seguir um schema previsível.

---

# 7. Pipeline de geração

Pipeline principal:

CONTENT PLANNER
↓
seleciona tipo
↓
seleciona tema
↓
verifica conteúdo já publicado
↓
Gemini
↓
validação
↓
safety checker
↓
seleção de mídia
↓
TTS
↓
geração de legendas
↓
Remotion
↓
FFmpeg
↓
thumbnail
↓
metadata
↓
fila de publicação
↓
YouTube
↓
Instagram
↓
registro de publicação
↓
analytics

Nenhum vídeo deve ser publicado diretamente após a geração.

Deve existir uma fila.

---

# 8. Banco de dados

Utilizar PostgreSQL ou MariaDB.

Criar pelo menos as seguintes entidades.

## Content

* id
* type
* category
* theme
* title
* hook
* script
* reflection
* cta
* description
* hashtags
* status
* createdAt
* publishedAt

## BibleVerse

* id
* book
* chapter
* verse
* text
* translation
* firstUsedAt
* lastUsedAt
* usageCount

## ContentVerse

* contentId
* verseId

## Topic

* id
* name
* category
* active
* priority
* lastUsedAt

## MediaAsset

* id
* provider
* externalId
* type
* url
* localPath
* query
* theme
* license
* attribution
* usageCount

## Voice

* id
* provider
* voiceId
* language
* gender
* style
* active

## Render

* id
* contentId
* format
* resolution
* status
* path
* duration
* createdAt

## Publication

* id
* contentId
* platform
* platformVideoId
* status
* scheduledAt
* publishedAt
* error

## Analytics

* id
* publicationId
* views
* likes
* comments
* shares
* retention
* collectedAt

## CharacterState

* id
* contentId
* visualState
* colorLevel
* lightLevel
* detailLevel
* seed

---

# 9. Controle de versículos

Esta parte é obrigatória.

O sistema nunca deve simplesmente pedir:

"Escolha um versículo."

Ele deve primeiro consultar o banco.

Exemplo:

SELECT verses not used recently

Criar regras de repetição.

Um versículo não deve aparecer novamente até que:

* todos os versículos disponíveis tenham sido utilizados; ou
* tenha passado um período mínimo configurável.

Configuração:

VERSE_REUSE_DAYS=180

O sistema deve registrar:

* versículo
* tradução
* data de publicação
* tipo de conteúdo
* plataforma
* vídeo relacionado

Também impedir repetição simultânea em Shorts e Reels.

---

# 10. Biblioteca bíblica

Não depender exclusivamente do Gemini para inventar ou reproduzir textos bíblicos.

Manter uma biblioteca local de versículos.

O Gemini deve receber:

* referência
* texto oficial armazenado
* contexto

e criar a reflexão em torno dele.

Isso reduz risco de:

* versículo inexistente
* referência errada
* texto alterado
* atribuição incorreta

---

# 11. Tipos de vídeo

O sistema deve produzir três formatos principais.

## SHORT / REEL

Formato:

1080x1920

Duração:

15–90 segundos

Uso:

* YouTube Shorts
* Instagram Reels

## VÍDEO NORMAL

Formato:

1920x1080

Duração:

2–10 minutos

Uso:

* YouTube

## VÍDEO VERTICAL LONGO

Formato:

1080x1920

Duração:

até o limite configurado

Uso futuro:

* Instagram
* YouTube

---

# 12. Templates visuais

Criar templates diferentes para cada categoria.

Não produzir simplesmente:

imagem + texto + voz.

Cada categoria deve ter linguagem visual própria.

## Versículo do Dia

Visual:

* contemplativo
* amanhecer
* natureza
* personagem surgindo
* luz gradual

## Oração

Visual:

* noite
* luz suave
* personagem em posição contemplativa
* partículas
* iluminação quente

## Reflexão psicológica

Visual:

* mais minimalista
* personagem caminhando
* ambiente abstrato
* tons inicialmente frios
* cores surgindo conforme a reflexão avança

## Salmo

Visual:

* cinematográfico
* paisagens
* montanhas
* céu
* água
* luz

## Mensagem de esperança

Visual:

* transição do escuro para o claro
* personagem ganhando forma
* movimento de câmera

---

# 13. Sistema visual do personagem

Criar um componente central:

CharacterScene

Ele deve receber:

{
"colorLevel": 0.0,
"lightLevel": 0.0,
"detailLevel": 0.0,
"emotion": "sad",
"pose": "standing",
"environment": "dark_room",
"particles": true
}

O personagem deve poder mudar automaticamente durante o vídeo.

Exemplo:

0–20%:

* quase completamente cinza
* iluminação mínima

20–50%:

* pequenas cores aparecem
* partículas

50–80%:

* rosto e detalhes mais definidos
* luz aumentando

80–100%:

* cores completas
* ambiente mais luminoso

Isso deve variar conforme o conteúdo.

---

# 14. Evolução do personagem entre vídeos

Criar também uma progressão global.

Exemplo:

Episódios 1–10:

* personagem quase sem cor

11–20:

* pequenos detalhes

21–30:

* cores suaves

31–40:

* iluminação maior

41–50:

* personagem totalmente formado

Isso cria uma narrativa silenciosa acompanhando o canal.

O sistema deve armazenar o estado global atual.

Porém, não deixar o sistema preso a uma única progressão.

Criar "arcos".

Exemplo:

ARC 01 — Descoberta
ARC 02 — Acolhimento
ARC 03 — Esperança
ARC 04 — Transformação
ARC 05 — Propósito

---

# 15. Fundo automático

O fundo deve ser escolhido automaticamente conforme:

* tema
* emoção
* categoria
* intensidade
* horário
* estado do personagem

Utilizar prioritariamente bibliotecas gratuitas/licenciadas.

Uma integração recomendada é Pexels.

A API do Pexels oferece acesso programático a fotos e vídeos e possui busca por orientação, inclusive portrait, adequada para Shorts/Reels.

Criar Media Provider:

interface MediaProvider {
search(query, options)
download(asset)
getMetadata(asset)
}

Implementar inicialmente:

PexelsProvider

Deixar arquitetura preparada para:

* Pixabay
* Unsplash
* biblioteca local
* geração procedural
* outros providers

Nunca depender de um único fornecedor.

---

# 16. Busca inteligente de mídia

O Gemini deve gerar:

visualPrompt

Exemplo:

"lonely person sitting beside a window during rain, cinematic, soft light, emotional"

O sistema transforma isso em queries apropriadas para a biblioteca.

Exemplo:

[
"rain window",
"lonely person window",
"dark room rain",
"rain night cinematic"
]

Baixar várias opções.

Criar ranking automático.

Critérios:

* orientação correta
* resolução
* duração
* relevância
* movimento
* qualidade
* uso anterior
* compatibilidade emocional

Evitar reutilizar sempre o mesmo vídeo.

---

# 17. TTS

Criar uma camada abstrata:

TTSProvider

Implementar inicialmente um provider gratuito/local.

Exemplos possíveis:

* Edge TTS
* Kokoro
* Piper

Deixar possibilidade de adicionar posteriormente:

* Gemini TTS
* ElevenLabs
* Google Cloud
* Azure

A voz deve ser escolhida conforme o tipo de conteúdo.

Exemplo:

VERSÍCULO:
voz calma e contemplativa

ORAÇÃO:
voz suave e acolhedora

REFLEXÃO:
voz próxima e humana

MENSAGEM MOTIVACIONAL:
voz mais firme

SALMO:
voz profunda e pausada

---

# 18. Direção de voz

Não usar a mesma velocidade para tudo.

Configurar:

* speed
* pitch
* pauses
* emphasis
* volume
* emotion

O texto deve ser preparado para TTS.

Adicionar pausas naturais.

Exemplo:

"Talvez hoje você esteja cansado...

e ninguém saiba disso.

Mas respire.

Você não precisa resolver tudo hoje."

---

# 19. Legendas

Todos os vídeos devem possuir legendas.

Criar sistema automático de captions sincronizadas com o áudio.

Preferência:

palavras/frases aparecendo progressivamente.

Evitar legendas gigantes ocupando toda a tela.

Criar estilos:

* minimal
* cinematic
* emphasis
* verse
* prayer

Palavras importantes podem receber destaque visual.

---

# 20. CTA

Todos os vídeos devem possuir CTA.

Mas NÃO utilizar sempre a mesma frase.

Criar biblioteca de CTAs.

Exemplos:

"Se essa mensagem falou com você, compartilhe com alguém."

"Se essa palavra fez sentido para você, deixe seu like."

"Se quiser receber uma mensagem como essa todos os dias, siga o perfil."

"Inscreva-se para acompanhar as próximas mensagens."

"Envie este vídeo para alguém que precisa ouvir isso hoje."

O Gemini deve escolher a CTA conforme o conteúdo.

Não colocar 4 CTAs diferentes no mesmo vídeo.

Preferir uma CTA natural.

---

# 21. CTA específica por plataforma

YouTube:

* curtir
* inscrever-se
* comentar
* compartilhar

Instagram:

* curtir
* seguir
* compartilhar
* salvar
* enviar para alguém

O sistema deve gerar metadata diferente para cada plataforma.

---

# 22. YouTube

Implementar YouTube Data API.

O sistema deve:

* autenticar via OAuth
* fazer upload
* definir título
* descrição
* tags
* categoria
* privacidade
* horário de publicação
* thumbnail
* playlist

A API oficial permite upload por `videos.insert` e definição dos metadados do vídeo.

IMPORTANTE:

Projetos de API não verificados possuem atualmente uma restrição importante para uploads: vídeos enviados por determinados projetos não verificados podem ficar privados até que o projeto passe pela auditoria exigida pelo YouTube. Isso deve ser documentado no setup do projeto.

Implementar retry para upload.

Utilizar upload resumable.

---

# 23. Instagram

Criar InstagramProvider.

Responsabilidades:

* autenticação
* criação de container
* publicação de Reel
* publicação de conteúdo suportado
* descrição
* hashtags
* status
* tratamento de erros

Não acoplar o restante do sistema ao Instagram.

Interface:

SocialProvider {
publish()
schedule()
getStatus()
getAnalytics()
}

---

# 24. Agendamento

Criar Scheduler.

Exemplo:

06:30 — Versículo do Dia
08:30 — Reflexão
12:00 — Oração
15:00 — Mensagem
18:30 — Salmo
21:30 — Mensagem de Boa Noite

Não publicar necessariamente tudo todos os dias.

Criar regras de frequência.

Exemplo:

Versículo:
diário

Salmo:
3x semana

Oração:
diário

Reflexão:
4x semana

Mensagem psicológica:
3x semana

Vídeo longo:
2x semana

O sistema deve distribuir automaticamente.

---

# 25. Content Queue

Criar fila:

GENERATED
↓
VALIDATED
↓
MEDIA_READY
↓
AUDIO_READY
↓
RENDERING
↓
RENDERED
↓
QA
↓
SCHEDULED
↓
PUBLISHED
↓
ANALYZED

Nenhum estágio deve depender de intervenção manual.

Se um estágio falhar:

FAILED

Registrar:

* erro
* stack trace
* timestamp
* tentativa
* conteúdo
* provider

Implementar retry com backoff.

---

# 26. QA automático

Antes de publicar:

1. arquivo existe?
2. vídeo abre?
3. duração correta?
4. resolução correta?
5. áudio existe?
6. volume adequado?
7. legenda existe?
8. texto não saiu da tela?
9. CTA existe?
10. thumbnail existe?
11. conteúdo passou pelo safety checker?
12. versículo está correto?
13. vídeo não é duplicado?
14. mídia está disponível/licenciada?
15. metadata está preenchida?

Se qualquer requisito crítico falhar:

não publicar.

---

# 27. Detecção de conteúdo repetido

Criar sistema de similarity.

Comparar:

* título
* roteiro
* hook
* tema
* versículo
* thumbnail
* mídia
* estrutura

Criar hash do conteúdo.

Também criar embedding futuramente.

Objetivo:

impedir que o canal publique:

"Deus está com você"

"Deus nunca te abandonou"

"Deus está ao seu lado"

durante 3 dias seguidos com textos praticamente iguais.

---

# 28. Rotação de temas

Criar regras para evitar repetição.

Exemplo:

Não repetir o mesmo:

* tema
* versículo
* hook
* estrutura
* voz
* fundo
* CTA

dentro de determinada janela.

Configurações:

THEME_REUSE_DAYS
VERSE_REUSE_DAYS
HOOK_REUSE_DAYS
MEDIA_REUSE_DAYS
CTA_REUSE_DAYS

---

# 29. Geração de títulos

O Gemini deve gerar múltiplas opções.

Exemplo:

1. "Se você está cansado, ouça isso"
2. "Uma palavra para quem está sem forças"
3. "Talvez você precisasse ouvir isso hoje"

O sistema escolhe baseado no tipo de conteúdo.

Para YouTube longo, gerar títulos mais pesquisáveis.

Para Shorts/Reels, priorizar hooks emocionais.

---

# 30. Thumbnail

Criar thumbnail automaticamente.

Nunca depender somente de um frame aleatório.

Criar composição:

* personagem
* fundo
* iluminação
* frase curta

Exemplo:

"VOCÊ NÃO ESTÁ SOZINHO"

Poucas palavras.

Texto grande.

Alto contraste.

---

# 31. Conteúdo longo

Não limitar o sistema a Shorts.

Criar vídeos de 3–10 minutos.

Exemplos:

"Uma oração para quando você não sabe o que fazer"

"5 versículos para momentos de ansiedade"

"Como manter a esperança em tempos difíceis"

"Salmo 23 — reflexão e oração"

"Quando parece que Deus está em silêncio"

Estrutura:

HOOK
↓
INTRO
↓
CONTEXT
↓
REFLECTION
↓
BIBLE / EXAMPLE
↓
APPLICATION
↓
PRAYER
↓
CTA

---

# 32. Shorts derivados de vídeos longos

Criar sistema de repurposing.

Vídeo longo:

"Quando parece que Deus está em silêncio"

Gerar automaticamente:

Short 1:
"Você sente que Deus está em silêncio?"

Short 2:
"Talvez o silêncio não seja abandono."

Short 3:
"Uma oração para quando você não entende o que está acontecendo."

Assim um vídeo longo pode gerar vários conteúdos derivados.

---

# 33. Analytics

Depois da publicação, coletar:

* views
* likes
* comentários
* compartilhamentos quando disponível
* duração
* retenção quando disponível
* CTR quando disponível
* inscritos/seguidores gerados quando disponível

Criar tabela de desempenho.

---

# 34. IA de aprendizado

Depois de acumular dados, o sistema deve analisar:

Quais temas performam melhor?

Quais hooks performam melhor?

Quais durações?

Quais vozes?

Quais horários?

Quais estilos visuais?

Quais CTAs?

Quais categorias?

Exemplo:

"Mensagens sobre recomeço têm 38% mais visualizações que a média."

O sistema pode aumentar automaticamente a frequência de temas vencedores, mas respeitando limites para não saturar o canal.

---

# 35. Painel administrativo

Criar dashboard web.

Stack sugerida:

Next.js
TypeScript
Tailwind
Prisma
PostgreSQL/MariaDB

Dashboard:

## Visão geral

* vídeos hoje
* vídeos publicados
* próximos vídeos
* falhas
* views
* likes
* melhor conteúdo
* pior conteúdo

## Conteúdo

Lista:

* título
* categoria
* status
* data
* plataforma
* views

## Fila

Visualização Kanban:

IDEA
GENERATING
GENERATED
RENDERING
READY
SCHEDULED
PUBLISHED
FAILED

## Configurações

* frequência
* horários
* vozes
* providers
* temas
* CTAs
* duração
* cores
* personagem
* progressão visual

---

# 36. Modo manual

Mesmo sendo automático, permitir:

"Gerar conteúdo agora"

Selecionar:

* categoria
* tema
* duração
* plataforma

E gerar imediatamente.

Também permitir:

* regenerar roteiro
* regenerar voz
* trocar mídia
* rerenderizar
* editar CTA
* cancelar publicação

---

# 37. Modo automático completo

Criar um botão:

AUTOMATION ENABLED

Quando ligado:

O sistema sozinho deve:

1. verificar calendário
2. identificar conteúdo necessário
3. gerar conteúdo
4. validar
5. buscar mídia
6. gerar TTS
7. criar legenda
8. renderizar
9. fazer QA
10. criar thumbnail
11. colocar na fila
12. publicar
13. coletar analytics
14. analisar performance
15. ajustar futuras gerações

---

# 38. Segurança

Nunca colocar API keys no código.

Utilizar `.env`.

Exemplo:

GEMINI_API_KEY=
PEXELS_API_KEY=

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

INSTAGRAM_ACCESS_TOKEN=

DATABASE_URL=

TTS_PROVIDER=

Todos os tokens devem ser armazenados com segurança.

---

# 39. Estrutura sugerida

```text
christian-channel/
│
├── apps/
│   ├── web/
│   └── worker/
│
├── packages/
│   ├── content/
│   ├── ai/
│   ├── tts/
│   ├── media/
│   ├── renderer/
│   ├── social/
│   ├── bible/
│   └── analytics/
│
├── remotion/
│   ├── compositions/
│   ├── components/
│   ├── characters/
│   ├── backgrounds/
│   ├── captions/
│   └── transitions/
│
├── prisma/
│   └── schema.prisma
│
├── scripts/
│
├── storage/
│   ├── audio/
│   ├── media/
│   ├── renders/
│   └── thumbnails/
│
└── docker/
```

---

# 40. Worker

O worker deve ser responsável pelas tarefas pesadas.

Não executar renderização diretamente dentro do processo web.

Worker:

* geração
* download
* TTS
* renderização
* FFmpeg
* upload
* analytics

Utilizar fila.

Pode utilizar:

* BullMQ
* Redis

---

# 41. Observabilidade

Criar logs estruturados.

Exemplo:

[CONTENT] generating content
[CONTENT] generated successfully
[MEDIA] searching Pexels
[TTS] generating audio
[RENDER] rendering 1080x1920
[QA] passed
[YOUTUBE] uploading
[INSTAGRAM] publishing
[ANALYTICS] collecting

Dashboard deve mostrar erros.

---

# 42. Controle de custos

Criar contador de uso:

* chamadas Gemini
* TTS
* mídia
* armazenamento
* renderizações
* uploads

Dashboard:

"Estimated monthly cost"

O sistema deve priorizar recursos gratuitos quando disponíveis.

Pexels possui API gratuita e permite uso comercial de fotos e vídeos conforme sua licença/termos, mas o projeto deve respeitar as regras de uso e atribuição aplicáveis ao conteúdo/API.

---

# 43. Prompt mestre do Gemini

Criar um sistema de prompts versionado.

Nunca colocar um prompt gigante espalhado pelo código.

Criar:

prompts/

content/
verse-reflection.ts
prayer.ts
salmo.ts
psychology-reflection.ts
morning.ts
night.ts

safety/
health.ts
mental-health.ts

metadata/
youtube.ts
instagram.ts

Cada prompt deve possuir versão.

Exemplo:

PROMPT_VERSION=1.2

Isso permitirá comparar posteriormente qual prompt gera melhor desempenho.

---

# 44. Regras editoriais

O canal deve:

* ser acolhedor
* nunca ser agressivo
* não explorar medo para gerar clique
* não prometer milagres
* não afirmar que problemas médicos podem ser resolvidos apenas pela fé
* não transformar sofrimento em culpa
* não dizer que uma pessoa está sofrendo porque "não tem fé suficiente"
* não usar Deus como ameaça
* não usar títulos manipulativos excessivamente
* incentivar esperança
* incentivar busca de ajuda profissional quando necessário

---

# 45. Ideias adicionais de conteúdo

Adicionar futuramente:

### "Se Deus pudesse te responder"

Formato de reflexão imaginativa.

### "Uma coisa que você precisa lembrar hoje"

Mensagem curta.

### "Para quem está esperando uma resposta"

Reflexão.

### "Antes de dormir, faça esta oração"

Oração noturna.

### "Pare por 30 segundos"

Vídeo contemplativo.

### "Respire e leia isso"

Mensagem curta com pausas.

### "3 coisas para lembrar quando tudo parece dar errado"

Formato de lista.

### "O que a Bíblia ensina sobre..."

Tema específico.

### "Uma oração de 1 minuto"

Formato recorrente.

### "Você não precisa ter todas as respostas"

Reflexão psicológica.

### "Quando ninguém entende o que você sente"

Acolhimento.

### "Comece novamente"

Recomeço.

### "Não tome uma decisão no pior momento"

Reflexão.

### "O que fazer quando você perdeu a esperança?"

Reflexão + oração.

### "Carta para alguém que está cansado"

Formato storytelling.

### "Se hoje foi um dia difícil..."

Mensagem noturna.

---

# 46. Formato especial: personagem

Criar uma série narrativa permanente.

Nome interno:

THE JOURNEY

Cada vídeo representa uma pequena evolução.

Exemplo:

EP001:
personagem quase invisível.

EP010:
primeiro ponto de luz.

EP020:
primeira cor.

EP030:
personagem começa a caminhar.

EP040:
ambiente começa a florescer.

EP050:
personagem encontra outros elementos.

EP100:
personagem completamente iluminado.

A evolução não precisa ser explicitamente explicada ao público.

Ela deve ser percebida visualmente.

---

# 47. Elementos recorrentes

Criar "easter eggs" visuais.

Exemplos:

* pequena luz que aparece em todos os vídeos
* pássaro distante
* árvore
* caminho
* estrela
* janela
* banco
* vela
* água
* flores

Esses elementos podem evoluir junto com o personagem.

Isso cria identidade e incentiva pessoas a acompanharem a série.

---

# 48. Sistema de arcos narrativos

O sistema deve saber em qual arco está.

Exemplo:

ARC 1:
"Quando tudo parece escuro"

ARC 2:
"Encontrando esperança"

ARC 3:
"Aprendendo a confiar"

ARC 4:
"Recomeçando"

ARC 5:
"Florescendo"

O conteúdo individual continua funcionando sozinho.

Mas quem acompanha vários vídeos percebe uma história maior.

---

# 49. Música

Adicionar camada opcional de música de fundo.

A música deve ser:

* instrumental
* sem copyright problemático
* volume baixo
* adequada ao humor

Criar MusicProvider.

Metadados:

* mood
* tempo
* intensity
* duration
* license

Ducking automático:

voz:
100%

música:
10–18%

Durante pausas da voz:

música pode aumentar levemente.

---

# 50. Renderização

Utilizar Remotion para composição.

Utilizar FFmpeg para:

* concatenação
* normalização
* encoding
* áudio
* muxing
* thumbnails
* formatos finais

Criar presets:

SHORT_1080x1920
REEL_1080x1920
YOUTUBE_1080p
YOUTUBE_4K

Não renderizar 4K por padrão.

---

# 51. Primeiro MVP

Não tentar implementar tudo simultaneamente.

### FASE 1

Implementar:

* banco
* Gemini
* biblioteca de versículos
* controle de repetição
* TTS
* Pexels
* Remotion
* legendas
* personagem
* renderização vertical
* YouTube upload
* scheduler

Resultado:

O sistema consegue gerar e publicar automaticamente um Short por dia.

### FASE 2

Adicionar:

* Instagram
* vídeos longos
* thumbnails
* dashboard
* múltiplos tipos de conteúdo
* fila

### FASE 3

Adicionar:

* analytics
* aprendizado
* repurposing
* progressão do personagem
* arcos narrativos

### FASE 4

Adicionar:

* geração de múltiplos vídeos por dia
* otimização automática
* testes A/B
* múltiplos canais
* internacionalização

---

# 52. Critério de sucesso do MVP

Ao executar:

```bash
npm run generate:daily
```

o sistema deve ser capaz de:

1. selecionar um conteúdo ainda não utilizado
2. consultar a biblioteca bíblica quando necessário
3. gerar roteiro com Gemini
4. validar conteúdo
5. escolher mídia
6. gerar TTS
7. gerar legendas
8. criar personagem/cenário
9. renderizar vídeo
10. executar QA
11. gerar thumbnail
12. gerar metadata
13. adicionar à fila
14. publicar no YouTube
15. registrar o ID da publicação
16. registrar tudo no banco

Nenhuma etapa deve exigir intervenção humana.

---

# 53. Princípio fundamental

O sistema não deve ser simplesmente:

"IA → vídeo → YouTube".

Ele deve ser:

```text
             CONTENT ENGINE
                   │
       ┌───────────┴───────────┐
       │                       │
   BIBLE ENGINE           PSYCHOLOGY
       │                       │
       └───────────┬───────────┘
                   │
              GEMINI AI
                   │
            SAFETY CHECK
                   │
          ┌────────┴────────┐
          │                 │
       VISUAL             AUDIO
       ENGINE             ENGINE
          │                 │
          └────────┬────────┘
                   │
               REMOTION
                   │
               FFMPEG
                   │
                  QA
                   │
              CONTENT QUEUE
                   │
          ┌────────┴────────┐
          │                 │
       YOUTUBE          INSTAGRAM
          │                 │
          └────────┬────────┘
                   │
               ANALYTICS
                   │
                   ▼
             LEARNING LOOP
                   │
                   └──────► CONTENT ENGINE
```

A plataforma deve ser construída para **produzir, publicar, medir e aprender**, e não somente para gerar vídeos.

---

# 54. Requisito final para Claude Code

Antes de começar a escrever código:

1. analisar toda esta especificação;
2. propor arquitetura;
3. identificar dependências;
4. identificar APIs necessárias;
5. definir schema do banco;
6. definir estrutura de pastas;
7. definir variáveis `.env`;
8. definir jobs/cron;
9. definir estados da fila;
10. definir interfaces dos providers;
11. definir estratégia de retry;
12. definir estratégia de armazenamento;
13. definir estratégia de renderização;
14. definir estratégia de publicação;
15. identificar riscos técnicos.

Depois disso, implementar em etapas.

Não criar uma aplicação monolítica impossível de manter.

Separar claramente:

AI
CONTENT
BIBLE
TTS
MEDIA
RENDER
SOCIAL
ANALYTICS
QUEUE
DATABASE

Cada módulo deve possuir interfaces claras para que providers possam ser substituídos futuramente.
