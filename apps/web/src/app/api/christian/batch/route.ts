import type { NextRequest } from 'next/server';
import { config } from '@editor-video/core/server';
import { prisma, ProjectKind, ProjectStatus, selectDistinctPillars } from '@editor-video/db';
import { requireUser } from '@/lib/auth-guards';
import { renderQueue } from '@/lib/queue';
import { ApiError, handle, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Horários sugeridos: manhã (comute/ginástica), almoço, meio da tarde, noite (relaxar). */
const DEFAULT_TIMES = ['10:00', '12:00', '15:00', '20:00'];
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH = 12;

interface BatchBody {
  times?: unknown;
  /** "YYYY-MM-DD" — quando ausente, usa hoje (empurrando pra amanhã horários já passados). */
  date?: unknown;
  watermark?: unknown;
}

/** Horário numa data específica. Sem data explícita, horários já passados hoje viram amanhã. */
function scheduleFor(time: string, now: Date, explicitDate: string | null): Date {
  const [hours, minutes] = time.split(':').map(Number);

  if (explicitDate) {
    const [year, month, day] = explicitDate.split('-').map(Number);
    return new Date(year!, month! - 1, day!, hours!, minutes!, 0, 0);
  }

  const candidate = new Date(now);
  candidate.setHours(hours!, minutes!, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/**
 * Gera N projetos do Canal Cristão de uma vez, com pilares distintos entre si,
 * cada um agendado pra um horário — o worker publica sozinho no YouTube na
 * hora certa assim que o render terminar (ver runChristianPipeline).
 */
export async function POST(request: NextRequest): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as BatchBody;

    const timesRaw = Array.isArray(body.times)
      ? body.times.filter((t): t is string => typeof t === 'string')
      : [];
    const times = (timesRaw.length > 0 ? timesRaw : DEFAULT_TIMES).map((t) => t.trim());

    if (times.length === 0 || times.length > MAX_BATCH) {
      throw new ApiError(`Informe entre 1 e ${MAX_BATCH} horários.`);
    }
    for (const time of times) {
      if (!TIME_RE.test(time)) {
        throw new ApiError(`Horário inválido: "${time}". Use o formato HH:MM.`);
      }
    }

    const dateRaw = typeof body.date === 'string' ? body.date.trim() : '';
    if (dateRaw && !DATE_RE.test(dateRaw)) {
      throw new ApiError('Data inválida. Use o formato AAAA-MM-DD.');
    }
    const explicitDate = dateRaw || null;

    const watermarkRaw = typeof body.watermark === 'string' ? body.watermark.trim() : '';
    const watermark = watermarkRaw || config.christian.youtubeHandle || null;

    const now = new Date();
    const pillars = await selectDistinctPillars(times.length, now);

    const created = [];
    for (let i = 0; i < times.length; i++) {
      const scheduledAt = scheduleFor(times[i]!, now, explicitDate);
      if (scheduledAt.getTime() <= now.getTime()) {
        throw new ApiError(
          `O horário ${times[i]} em ${explicitDate ?? 'hoje'} já passou. Escolha uma data/horário futuro.`,
        );
      }
      const pillar = pillars[i]!;

      const project = await prisma.project.create({
        data: {
          kind: ProjectKind.CHRISTIAN,
          title: pillar.label,
          pillar: pillar.id,
          watermark,
          userId: user.id,
          scheduledAt,
          status: ProjectStatus.QUEUED,
          progress: 0,
          stage: 'Na fila',
        },
      });

      await renderQueue.add(
        'render-project',
        { projectId: project.id },
        { jobId: `project-${project.id}-${Date.now()}`, attempts: config.ambient.maxRetries },
      );

      created.push(project);
    }

    return json({ projects: created }, 201);
  });
}
