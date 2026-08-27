/**
 * Seed inicial da biblioteca bíblica local (docs/Cristão/projeto.md §10).
 *
 * IMPORTANTE: os textos abaixo seguem a tradição de tradução Almeida (ARC),
 * cuja redação de referência é de domínio público no Brasil. Antes de usar
 * em produção, confirme a licença da edição/tradução exata que for adotada
 * (ex.: se trocar para NVI/NTLH, ambas são protegidas por direitos autorais
 * e exigem licenciamento da Sociedade Bíblica correspondente).
 */
export type BibleVerseSeed = {
  book: string;
  chapter: number;
  verse: string;
  text: string;
  translation: string;
  themes: string[];
};

export const BIBLE_SEED: BibleVerseSeed[] = [
  { book: 'Isaías', chapter: 41, verse: '10', translation: 'ARC', themes: ['medo', 'ansiedade', 'forca'],
    text: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo, e te sustento com a destra da minha justiça.' },
  { book: 'Filipenses', chapter: 4, verse: '6-7', translation: 'ARC', themes: ['ansiedade', 'oracao'],
    text: 'Não estejais inquietos por coisa alguma; antes as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplica, com ações de graças. E a paz de Deus, que excede todo o entendimento, guardará os vossos corações e os vossos sentimentos em Cristo Jesus.' },
  { book: 'Salmos', chapter: 23, verse: '1', translation: 'ARC', themes: ['fe', 'descanso'],
    text: 'O Senhor é o meu pastor; nada me faltará.' },
  { book: 'Salmos', chapter: 34, verse: '18', translation: 'ARC', themes: ['luto', 'solidao'],
    text: 'Perto está o Senhor dos que têm o coração quebrantado, e salva os contritos de espírito.' },
  { book: 'Mateus', chapter: 11, verse: '28', translation: 'ARC', themes: ['descanso', 'forca'],
    text: 'Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.' },
  { book: 'Jeremias', chapter: 29, verse: '11', translation: 'ARC', themes: ['esperanca', 'proposito'],
    text: 'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o Senhor; pensamentos de paz, e não de mal, para vos dar o fim que esperais.' },
  { book: 'Romanos', chapter: 8, verse: '28', translation: 'ARC', themes: ['esperanca', 'proposito'],
    text: 'E sabemos que todas as coisas contribuem juntamente para o bem daqueles que amam a Deus, daqueles que são chamados segundo o seu propósito.' },
  { book: 'Salmos', chapter: 46, verse: '1', translation: 'ARC', themes: ['forca', 'medo'],
    text: 'Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.' },
  { book: 'Provérbios', chapter: 3, verse: '5-6', translation: 'ARC', themes: ['fe', 'mudancas', 'recomeco'],
    text: 'Confia no Senhor de todo o teu coração, e não te estribes no teu próprio entendimento. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.' },
  { book: 'Isaías', chapter: 40, verse: '31', translation: 'ARC', themes: ['forca', 'paciencia'],
    text: 'Mas os que esperam no Senhor renovarão as forças, subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.' },
  { book: 'Salmos', chapter: 147, verse: '3', translation: 'ARC', themes: ['luto', 'autoestima'],
    text: 'Sara os quebrantados de coração, e liga-lhes as feridas.' },
  { book: 'Efésios', chapter: 4, verse: '32', translation: 'ARC', themes: ['perdao', 'relacionamentos'],
    text: 'Antes sede uns para com os outros benignos, misericordiosos, perdoando-vos uns aos outros, como também Deus vos perdoou em Cristo.' },
  { book: '2 Coríntios', chapter: 5, verse: '17', translation: 'ARC', themes: ['recomeco', 'proposito'],
    text: 'Assim que, se alguém está em Cristo, nova criatura é; as coisas velhas já passaram; eis que tudo se fez novo.' },
  { book: 'Salmos', chapter: 27, verse: '1', translation: 'ARC', themes: ['medo', 'fe'],
    text: 'O Senhor é a minha luz e a minha salvação; a quem temerei? O Senhor é a força da minha vida; de quem me recearei?' },
  { book: 'Filipenses', chapter: 4, verse: '13', translation: 'ARC', themes: ['forca', 'trabalho'],
    text: 'Posso todas as coisas em Cristo que me fortalece.' },
  { book: 'Salmos', chapter: 55, verse: '22', translation: 'ARC', themes: ['ansiedade', 'trabalho'],
    text: 'Lança a tua carga sobre o Senhor, e ele te susterá; nunca permitirá que o justo seja abalado.' },
  { book: 'Tiago', chapter: 1, verse: '2-3', translation: 'ARC', themes: ['fracasso', 'paciencia'],
    text: 'Meus irmãos, tende grande gozo quando cairdes em várias tentações, sabendo que a prova da vossa fé produz a paciência.' },
  { book: '1 Pedro', chapter: 5, verse: '7', translation: 'ARC', themes: ['ansiedade', 'oracao'],
    text: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.' },
  { book: 'Salmos', chapter: 30, verse: '5', translation: 'ARC', themes: ['esperanca', 'luto'],
    text: 'Porque um momento dura a sua ira, mas a sua benevolência é para toda a vida; o choro pode durar uma noite, mas a alegria vem pela manhã.' },
  { book: 'Deuteronômio', chapter: 31, verse: '6', translation: 'ARC', themes: ['medo', 'solidao'],
    text: 'Esforça-te, e tem bom ânimo; não temas, nem tremas diante deles; porque o Senhor teu Deus é o que vai contigo; não te deixará, nem te desamparará.' },
  { book: 'João', chapter: 14, verse: '27', translation: 'ARC', themes: ['ansiedade', 'medo'],
    text: 'Deixo-vos a paz, a minha paz vos dou; não vo-la dou como o mundo a dá. Não se turbe o vosso coração, nem se atemorize.' },
  { book: 'Salmos', chapter: 139, verse: '14', translation: 'ARC', themes: ['autoestima'],
    text: 'Eu te louvarei, porque de um modo assombroso, e tão maravilhoso fui feito; maravilhosas são as tuas obras, e a minha alma o sabe muito bem.' },
  { book: 'Provérbios', chapter: 17, verse: '17', translation: 'ARC', themes: ['familia', 'relacionamentos'],
    text: 'Em todo o tempo ama o amigo; e para a angústia nasceu o irmão.' },
  { book: 'Josué', chapter: 1, verse: '9', translation: 'ARC', themes: ['medo', 'recomeco'],
    text: 'Não to mandei eu? Esforça-te, e tem bom ânimo; não pasmes, nem te espantes; porque o Senhor teu Deus é contigo, por onde quer que andares.' },
  { book: 'Salmos', chapter: 118, verse: '24', translation: 'ARC', themes: ['gratidao', 'geral'],
    text: 'Este é o dia que fez o Senhor; regozijemo-nos e alegremo-nos nele.' },
  { book: '1 Tessalonicenses', chapter: 5, verse: '18', translation: 'ARC', themes: ['gratidao'],
    text: 'Em tudo dai graças, porque esta é a vontade de Deus em Cristo Jesus para convosco.' },
  { book: 'Provérbios', chapter: 16, verse: '3', translation: 'ARC', themes: ['trabalho', 'proposito'],
    text: 'Confia ao Senhor as tuas obras, e teus pensamentos serão bem-sucedidos.' },
  { book: 'Romanos', chapter: 12, verse: '2', translation: 'ARC', themes: ['recomeco', 'proposito'],
    text: 'E não vos conformeis com este mundo, mas transformai-vos pela renovação da vossa mente, para que experimenteis qual seja a boa, agradável, e perfeita vontade de Deus.' },
  { book: 'Salmos', chapter: 34, verse: '4', translation: 'ARC', themes: ['medo', 'ansiedade'],
    text: 'Busquei ao Senhor, e ele me respondeu, e me livrou de todos os meus temores.' },
  { book: 'Lamentações', chapter: 3, verse: '22-23', translation: 'ARC', themes: ['esperanca', 'gratidao'],
    text: 'As misericórdias do Senhor são a causa de não sermos consumidos, porque as suas misericórdias não têm fim; novas são cada manhã; grande é a tua fidelidade.' },
  { book: 'Gênesis', chapter: 50, verse: '20', translation: 'ARC', themes: ['rejeicao', 'proposito'],
    text: 'Vós, na verdade, intentastes o mal contra mim, porém Deus o intentou para o bem, para fazer o que se vê neste dia, para conservar muita gente com vida.' },
];

/**
 * Nomes de livros bíblicos usados na biblioteca local — fonte única de verdade
 * (evita duplicar a lista em apps/worker/src/voice/pronunciation.ts). Ordenado
 * do mais longo para o mais curto para casar "1 Tessalonicenses" antes de uma
 * eventual sobreposição de prefixo em regex.
 */
export const BIBLE_BOOK_NAMES: string[] = Array.from(
  new Set(BIBLE_SEED.map((entry) => entry.book)),
).sort((a, b) => b.length - a.length);
