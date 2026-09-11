# Assets do Rabisco

Estado atual (por arquivo em `actions/`):

- `thinking.png`, `sitting.png`, `walking.png` — arte real, gerada via IA
  (Nano Banana 2, a partir da folha de referência oficial do personagem) e
  com o fundo tratado para transparência real (canal alpha), não apenas
  visual. Qualidade suficiente para uso, mas ainda não é a arte oficial
  final desenhada à mão — trocar quando o design definitivo estiver pronto.
- `coffee.png`, `learning.png`, `music.png`, `reading.png`, `sharing.png`,
  `sky.png`, `writing.png` — ainda **placeholders de 1x1 pixel transparente**
  (ficam invisíveis no vídeo; o pipeline não quebra, só não mostra o
  personagem nessas cenas). Gerar/adicionar as poses restantes segue o mesmo
  processo: ver histórico do projeto ou `RABISCO.md` §3 na raiz do repo para
  a lista completa e requisitos técnicos (fundo transparente, mínimo
  ~1200x1600px, personagem centralizado).

`base/rabisco-base.png` é só referência de design, não é usado em render.

Nota técnica: se for gerar novas poses via um modelo de imagem que "desenha"
o fundo xadrez de transparência em vez de emitir alpha real (isso aconteceu
na primeira leva), rode uma remoção de fundo dedicada (ex.: `remove_background`
da Higgsfield, ou o script de limiarização por proximidade de cor usado para
corrigir os 3 arquivos atuais) antes de salvar o PNG final — não confie no
canal alpha sem checar com `magick identify -verbose` (`Alpha: min/max`).
