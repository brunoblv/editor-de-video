/**
 * Pilares de conteúdo do Canal Cristão (docs/Cristão/projeto.md §3).
 * Dados puros (sem Node), compartilhados entre o worker (planner/pipeline) e
 * o web (validação da API, formulário). Adicionar um pilar novo é só um item
 * nesta lista — nunca exige mudança estrutural no pipeline ou no schema.
 */
export type Pillar = {
  id: string;
  label: string;
  /** Categoria usada pelo Content Planner semanal (docs/Cristão/projeto.md §4). */
  category: string;
  /** Precisa citar um versículo da biblioteca local. */
  needsVerse: boolean;
  /** Tema sensível (saúde/emocional) — aciona regras extras do safety checker. */
  sensitive: boolean;
};

export const PILLARS: Pillar[] = [
  { id: 'verse_of_day', label: 'Versículo do Dia', category: 'fe', needsVerse: true, sensitive: false },
  { id: 'psalm_of_day', label: 'Salmo do Dia', category: 'fe', needsVerse: true, sensitive: false },
  { id: 'prayer_situation', label: 'Oração para uma situação específica', category: 'oracao', needsVerse: false, sensitive: false },
  { id: 'reflection_hard_moments', label: 'Reflexão para momentos difíceis', category: 'forca', needsVerse: true, sensitive: true },
  { id: 'hope_message', label: 'Mensagem de esperança', category: 'esperanca', needsVerse: true, sensitive: false },
  { id: 'good_morning', label: 'Mensagem de bom dia', category: 'geral', needsVerse: false, sensitive: false },
  { id: 'good_night', label: 'Mensagem de boa noite', category: 'descanso', needsVerse: false, sensitive: false },
  { id: 'word_discouraged', label: 'Palavra para quem está desanimado', category: 'forca', needsVerse: true, sensitive: true },
  { id: 'word_waiting', label: 'Palavra para quem está esperando algo', category: 'esperanca', needsVerse: true, sensitive: false },
  { id: 'word_changes', label: 'Palavra para quem está passando por mudanças', category: 'recomeco', needsVerse: true, sensitive: false },
  { id: 'reflection_anxiety', label: 'Reflexão sobre ansiedade', category: 'ansiedade', needsVerse: true, sensitive: true },
  { id: 'reflection_fear', label: 'Reflexão sobre medo', category: 'medo', needsVerse: true, sensitive: true },
  { id: 'reflection_loneliness', label: 'Reflexão sobre solidão', category: 'solidao', needsVerse: true, sensitive: true },
  { id: 'reflection_forgiveness', label: 'Reflexão sobre perdão', category: 'perdao', needsVerse: true, sensitive: false },
  { id: 'reflection_new_beginnings', label: 'Reflexão sobre recomeços', category: 'recomeco', needsVerse: true, sensitive: false },
  { id: 'reflection_purpose', label: 'Reflexão sobre propósito', category: 'proposito', needsVerse: true, sensitive: false },
  { id: 'reflection_patience', label: 'Reflexão sobre paciência', category: 'paciencia', needsVerse: true, sensitive: false },
  { id: 'reflection_gratitude', label: 'Reflexão sobre gratidão', category: 'gratidao', needsVerse: true, sensitive: false },
  { id: 'reflection_family', label: 'Reflexão sobre família', category: 'familia', needsVerse: true, sensitive: false },
  { id: 'reflection_relationships', label: 'Reflexão sobre relacionamentos', category: 'relacionamentos', needsVerse: true, sensitive: false },
  { id: 'reflection_work', label: 'Reflexão sobre trabalho', category: 'trabalho', needsVerse: true, sensitive: false },
  { id: 'reflection_failure', label: 'Reflexão sobre fracasso', category: 'fracasso', needsVerse: true, sensitive: false },
  { id: 'reflection_rejection', label: 'Reflexão sobre rejeição', category: 'rejeicao', needsVerse: true, sensitive: true },
  { id: 'reflection_grief', label: 'Reflexão sobre luto', category: 'luto', needsVerse: true, sensitive: true },
  { id: 'reflection_self_esteem', label: 'Reflexão sobre autoestima', category: 'autoestima', needsVerse: true, sensitive: true },
  { id: 'reflection_hope', label: 'Reflexão sobre esperança', category: 'esperanca', needsVerse: true, sensitive: false },
  { id: 'maybe_you_need_to_hear', label: 'Se você está vendo isso, talvez precise ouvir...', category: 'geral', needsVerse: false, sensitive: false },
  { id: 'message_for_you_who', label: 'Uma mensagem para você que...', category: 'geral', needsVerse: false, sensitive: false },
  { id: 'short_story_lesson', label: 'Pequenas histórias com ensinamento', category: 'fe', needsVerse: false, sensitive: false },
  { id: 'parable_teaching', label: 'Parábolas e ensinamentos bíblicos', category: 'fe', needsVerse: true, sensitive: false },
  { id: 'bible_character', label: 'Personagens bíblicos e suas dificuldades', category: 'fe', needsVerse: true, sensitive: false },
  { id: 'what_can_we_learn', label: 'O que podemos aprender com...', category: 'fe', needsVerse: false, sensitive: false },
  { id: 'reflection_questions', label: 'Perguntas para reflexão', category: 'geral', needsVerse: false, sensitive: false },
  { id: 'prayer_minute', label: 'Minuto de oração', category: 'oracao', needsVerse: false, sensitive: false },
  { id: 'prayer_before_sleep', label: 'Oração antes de dormir', category: 'descanso', needsVerse: false, sensitive: false },
  { id: 'prayer_start_day', label: 'Oração para começar o dia', category: 'geral', needsVerse: false, sensitive: false },
  { id: 'prayer_family', label: 'Oração pela família', category: 'familia', needsVerse: false, sensitive: false },
  { id: 'prayer_children', label: 'Oração pelos filhos', category: 'familia', needsVerse: false, sensitive: false },
  { id: 'prayer_protection', label: 'Oração por proteção', category: 'oracao', needsVerse: false, sensitive: false },
  { id: 'prayer_wisdom', label: 'Oração por sabedoria', category: 'oracao', needsVerse: false, sensitive: false },
  { id: 'prayer_strength', label: 'Oração por força', category: 'forca', needsVerse: false, sensitive: false },
  { id: 'prayer_uncertainty', label: 'Oração para momentos de incerteza', category: 'oracao', needsVerse: false, sensitive: false },
];

export function findPillar(id: string): Pillar | undefined {
  return PILLARS.find((pillar) => pillar.id === id);
}

/** Categorias priorizadas por dia da semana (docs/Cristão/projeto.md §4). Configurável. */
export const WEEKDAY_CATEGORIES: Record<number, string[]> = {
  0: ['fe', 'oracao', 'geral'], // domingo
  1: ['trabalho', 'recomeco', 'forca'], // segunda
  2: ['ansiedade', 'medo', 'forca'], // terça
  3: ['familia', 'relacionamentos', 'perdao'], // quarta
  4: ['forca', 'esperanca'], // quinta
  5: ['trabalho', 'proposito'], // sexta
  6: ['descanso', 'gratidao', 'familia'], // sábado
};
