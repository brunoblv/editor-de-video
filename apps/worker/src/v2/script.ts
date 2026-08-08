import { config } from '@editor-video/core';

export type VisualNeed = {
  query: string;
  startSec: number;
  endSec: number;
  text: string;
};

export type GeneratedScript = {
  title: string;
  hook: string;
  body: string;
  payoff: string;
  cta: string;
  narration: string;
  visualNeeds: VisualNeed[];
};

interface OllamaChatResponse {
  message?: { content?: string };
  response?: string;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('O LLM não retornou JSON válido para o roteiro.');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeScript(raw: unknown, topic: string): GeneratedScript {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Roteiro inválido retornado pelo LLM.');
  }
  const obj = raw as Record<string, unknown>;
  const hook = asString(obj.hook);
  const body = asString(obj.body);
  const payoff = asString(obj.payoff);
  const cta = asString(obj.cta);
  const narration =
    asString(obj.narration) || [hook, body, payoff, cta].filter(Boolean).join(' ');

  if (!narration || narration.length < 40) {
    throw new Error('Roteiro gerado sem narração suficiente. Tente outro tema ou modelo.');
  }

  const visualRaw = Array.isArray(obj.visualNeeds) ? obj.visualNeeds : [];
  const visualNeeds: VisualNeed[] = visualRaw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const query = asString(row.query);
      if (!query) return null;
      const startSec = Number(row.startSec);
      const endSec = Number(row.endSec);
      return {
        query,
        startSec: Number.isFinite(startSec) ? startSec : index * 5,
        endSec: Number.isFinite(endSec) ? endSec : index * 5 + 5,
        text: asString(row.text) || query,
      };
    })
    .filter((item): item is VisualNeed => item !== null);

  const targetQueries = config.curiosidade.visualQueries;
  while (visualNeeds.length < Math.min(4, targetQueries)) {
    visualNeeds.push({
      query: `${topic} cinematic b-roll`,
      startSec: visualNeeds.length * 5,
      endSec: visualNeeds.length * 5 + 5,
      text: topic,
    });
  }

  return {
    title: asString(obj.title) || topic.slice(0, 80),
    hook: hook || narration.slice(0, 80),
    body,
    payoff,
    cta: cta || 'Siga para mais curiosidades.',
    narration,
    visualNeeds: visualNeeds.slice(0, targetQueries),
  };
}

/** Gera roteiro Curiosidade via Ollama (JSON). */
export async function generateScript(topic: string): Promise<GeneratedScript> {
  const min = config.curiosidade.minDurationSec;
  const max = config.curiosidade.maxDurationSec;
  const queries = config.curiosidade.visualQueries;

  const system = `Você é um roteirista de vídeos curtos verticais em português do Brasil.
Responda SOMENTE com JSON válido (sem markdown), no formato:
{
  "title": "string curta",
  "hook": "frase de gancho 0-3s",
  "body": "desenvolvimento",
  "payoff": "curiosidade surpreendente",
  "cta": "chamada para ação",
  "narration": "texto completo a ser narrado em voz alta, fluido, 30-40s",
  "visualNeeds": [
    { "query": "english stock video search query", "startSec": 0, "endSec": 5, "text": "trecho correspondente" }
  ]
}
Regras:
- Duração alvo da narração: ${min}-${max} segundos.
- visualNeeds: ${queries} itens com queries em inglês boas para Pexels/Pixabay.
- Tom: curiosidade, claro, sem enrolação.`;

  const user = `Tema: ${topic}`;

  const url = `${config.ollama.baseUrl.replace(/\/$/, '')}/api/chat`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    throw new Error(
      `Não foi possível conectar ao Ollama em ${config.ollama.baseUrl}. Está rodando? (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Ollama respondeu ${response.status}. Modelo "${config.ollama.model}" disponível? ${bodyText.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as OllamaChatResponse;
  const content = payload.message?.content ?? payload.response ?? '';
  return normalizeScript(extractJson(content), topic);
}
