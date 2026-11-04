/**
 * Reactive Lyrics — POC ponta a ponta (docs/reactive-lyrics-studio-requisitos.md §11, Fase 0):
 * áudio + letra → mapa musical (com cache) → composição Hyperframes reativa →
 * MP4 H.264/AAC com o áudio ORIGINAL, sem alteração (RF-058).
 *
 * Uso:
 *   npm run lyrics:render -w @editor-video/render-worker -- \
 *     --audio musica.wav --lyrics letra.lrc --preset NEON --format 9:16 \
 *     [--start 30 --duration 15] [--offset 120] [--mode karaoke|line] \
 *     [--intensity 70] [--reduced-motion] [--sections 0-14:verse,14-30:chorus] \
 *     [--credit "Artista — Faixa"] [--quality preview|final --rights] --out saida.mp4
 *
 * Com --project-dir <dir> só monta o projeto Hyperframes (sem render), para
 * `hyperframes preview|check|snapshot` nesse diretório.
 *
 * Render final exige --rights (declaração de autorização de uso, RF-065) e
 * letra sem erros de tempo no trecho (RF-059). Nada é publicado.
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  detectLyricFormat,
  lyricIssues,
  musicalMapSchema,
  parseLyrics,
  resolveLyrics,
  SECTION_TYPES,
  sliceForSegment,
  type MusicalMap,
} from '@editor-video/domain';
import { analyzeMusic, hashFile, inspectMedia, materializeComposition, MUSIC_ANALYSIS_VERSION, renderComposition, runProcess, validateOutput } from '@editor-video/integrations';
import { buildLyricsDataScript, hyperframesBin, LYRICS_PRESETS, type LyricsPresetId } from '@editor-video/templates';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac']);
const MAX_AUDIO_SEC = Number(process.env.LYRICS_MAX_AUDIO_SEC ?? 600);
const MAX_AUDIO_BYTES = Number(process.env.LYRICS_MAX_AUDIO_MB ?? 200) * 1024 * 1024;
const FORMATS = { '9:16': { width: 1080, height: 1920 }, '16:9': { width: 1920, height: 1080 } } as const;

/** `npm run -w` muda o diretório; caminhos relativos valem a partir de onde o comando foi digitado. */
const fromCaller = (p: string) => path.resolve(process.env.INIT_CWD ?? process.cwd(), p);

function fail(message: string): never {
  console.error(`erro: ${message}`);
  process.exit(1);
}

function parseSections(value: string | undefined, durationMs: number) {
  if (!value) return [];
  return value.split(',').map((part, i) => {
    const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?):([a-z_]+)$/.exec(part.trim());
    if (!m || !(SECTION_TYPES as readonly string[]).includes(m[3]!)) fail(`seção inválida "${part}" (ex.: 0-14:verse; tipos ${SECTION_TYPES.join(', ')})`);
    return { id: `s${i + 1}`, type: m[3] as (typeof SECTION_TYPES)[number], startMs: Math.round(Number(m[1]) * 1000), endMs: Math.min(durationMs, Math.round(Number(m[2]) * 1000)), source: 'manual' as const };
  });
}

/** Mapa em cache por hash do áudio + versão do algoritmo (RF-029). */
async function loadOrAnalyze(audio: string, audioHash: string, workDir: string): Promise<{ map: MusicalMap; cached: boolean }> {
  const cacheDir = process.env.LYRICS_CACHE_DIR ?? path.join(os.homedir(), '.cache', 'editor-video', 'reactive-lyrics');
  const cacheFile = path.join(cacheDir, `${audioHash}-${MUSIC_ANALYSIS_VERSION}.json`);
  try {
    return { map: musicalMapSchema.parse(JSON.parse(await fsp.readFile(cacheFile, 'utf8'))), cached: true };
  } catch {
    // ausente ou inválido: recalcula
  }
  const map = musicalMapSchema.parse(await analyzeMusic(audio, { audioHash: `sha256:${audioHash}`, workDir }));
  await fsp.mkdir(cacheDir, { recursive: true });
  const tmp = `${cacheFile}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(map));
  await fsp.rename(tmp, cacheFile);
  return { map, cached: false };
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      audio: { type: 'string' },
      lyrics: { type: 'string' },
      preset: { type: 'string', default: 'NEON' },
      format: { type: 'string', default: '9:16' },
      start: { type: 'string', default: '0' },
      duration: { type: 'string' },
      offset: { type: 'string', default: '0' },
      mode: { type: 'string', default: 'karaoke' },
      intensity: { type: 'string', default: '70' },
      'reduced-motion': { type: 'boolean', default: false },
      'allow-flashes': { type: 'boolean', default: false },
      sections: { type: 'string' },
      credit: { type: 'string', default: '' },
      quality: { type: 'string', default: 'preview' },
      rights: { type: 'boolean', default: false },
      out: { type: 'string' },
      'project-dir': { type: 'string' },
    },
  });
  if (!args.audio || !args.lyrics || !(args.out || args['project-dir'])) fail('informe --audio, --lyrics e --out (ou --project-dir)');
  const preset = LYRICS_PRESETS[args.preset!.toUpperCase() as LyricsPresetId] ?? fail(`preset inválido; use ${Object.keys(LYRICS_PRESETS).join(', ')}`);
  const format = FORMATS[args.format as keyof typeof FORMATS] ?? fail('formato inválido; use 9:16 ou 16:9');
  const quality = args.quality === 'final' ? 'final' : 'preview';
  if (quality === 'final' && !args.rights) fail('render final exige --rights: confirme que tem autorização de uso do áudio e da letra (RF-065)');
  if (args.mode !== 'karaoke' && args.mode !== 'line') fail('--mode deve ser karaoke ou line');

  const audio = fromCaller(args.audio);
  const ext = path.extname(audio).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) fail(`formato de áudio ${ext || '(sem extensão)'} não suportado; use MP3, WAV ou FLAC`);
  const stat = await fsp.stat(audio).catch(() => fail(`áudio não encontrado: ${audio}`));
  if (stat.size > MAX_AUDIO_BYTES) fail(`áudio com ${(stat.size / 1048576).toFixed(0)} MB excede o limite de ${MAX_AUDIO_BYTES / 1048576} MB (LYRICS_MAX_AUDIO_MB)`);

  const timings: Record<string, number> = {};
  const stage = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    console.log(`[${name}]`);
    const result = await fn();
    timings[name] = Math.round(performance.now() - t0);
    return result;
  };

  const info = await stage('probe', () => inspectMedia(audio));
  if (!info.audio || !info.durationSec) fail('arquivo sem trilha de áudio decodificável');
  if (info.durationSec > MAX_AUDIO_SEC) fail(`áudio com ${info.durationSec.toFixed(0)} s excede o limite de ${MAX_AUDIO_SEC} s (LYRICS_MAX_AUDIO_SEC)`);
  console.log(`  ${info.durationSec.toFixed(2)} s, ${info.audio.sampleRate} Hz, ${info.audio.channels} canal(is), ${info.audio.codec}`);

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'reactive-lyrics-'));
  try {
    const audioHash = await stage('hash', () => hashFile(audio));
    const { map: fullMap, cached } = await stage('análise musical', () => loadOrAnalyze(audio, audioHash, workDir));
    console.log(`  ${cached ? 'cache' : 'calculado'}: BPM ${fullMap.bpmEstimate ?? 'desconhecido'}, ${fullMap.beatTimesMs.length} batidas, ${fullMap.onsets.length} onsets`);
    const map = { ...fullMap, sections: parseSections(args.sections, fullMap.durationMs) };

    const lyricsPath = fromCaller(args.lyrics);
    const lyricsText = await fsp.readFile(lyricsPath, 'utf8');
    const lyricFormat = detectLyricFormat(lyricsPath, lyricsText);
    const parsed = parseLyrics(lyricsText, lyricFormat, { durationMs: map.durationMs });
    const alignment = { ...parsed, offsetMs: parsed.offsetMs + Math.round(Number(args.offset)) };

    const startMs = Math.round(Number(args.start) * 1000);
    const durationMs = args.duration ? Math.round(Number(args.duration) * 1000) : map.durationMs - startMs;
    if (!(startMs >= 0 && durationMs > 0 && startMs < map.durationMs)) fail('trecho fora do áudio');
    const segEnd = Math.min(map.durationMs, startMs + durationMs);

    // QA da letra: erros no trecho bloqueiam o final; na prévia viram aviso (RF-059).
    const resolvedIds = new Set(resolveLyrics(alignment).filter((l) => l.endMs > startMs && l.startMs < segEnd).map((l) => l.id));
    const issues = lyricIssues(alignment, map.durationMs).filter((i) => i.code === 'UNALIGNED' || resolvedIds.has(i.lineId));
    const errors = issues.filter((i) => i.severity === 'error');
    const unvalidated = issues.filter((i) => i.code === 'NOT_VALIDATED').length;
    console.log(`  letra ${lyricFormat.toUpperCase()}: ${parsed.lines.length} linhas, offset ${alignment.offsetMs} ms, ${resolvedIds.size} no trecho`);
    for (const i of issues.filter((x) => x.code !== 'NOT_VALIDATED')) console.log(`  ${i.severity === 'error' ? 'ERRO' : 'aviso'} ${i.lineId}${i.wordId ? `/${i.wordId}` : ''}: ${i.message}`);
    if (unvalidated) console.log(`  aviso: ${unvalidated} linha(s) com tempo importado ainda não validado`);
    if (quality === 'final' && errors.length) fail(`${errors.length} erro(s) de tempo na letra; corrija antes do render final`);

    const segment = sliceForSegment(map, resolveLyrics(alignment), startMs, segEnd - startMs);
    const wordLines = segment.lines.filter((l) => l.words).length;
    if (args.mode === 'karaoke' && wordLines < segment.lines.length) {
      console.log(`  ${segment.lines.length - wordLines} linha(s) sem tempo por palavra: exibidas em modo linha (sem interpolar palavras)`);
    }
    const dataFile = path.join(workDir, 'lyrics-data.js');
    await fsp.writeFile(
      dataFile,
      buildLyricsDataScript({
        durationMs: segment.map.durationMs,
        lines: segment.lines,
        features: segment.map.features,
        onsets: segment.map.onsets,
        beatTimesMs: segment.map.beatTimesMs,
        sections: segment.map.sections.map(({ type, startMs: s, endMs: e }) => ({ type, startMs: s, endMs: e })),
        bindings: preset.bindings,
      }),
    );

    const params = {
      preset: preset.templatePreset,
      highlightMode: args.mode,
      intensity: Math.max(0, Math.min(100, Number(args.intensity))),
      reducedMotion: args['reduced-motion'],
      limitFlashes: !args['allow-flashes'],
      ...preset.palette,
      credit: args.credit,
    };
    const durationSec = segment.map.durationMs / 1000;
    if (args['project-dir']) {
      const { projectDir } = await materializeComposition({
        templateSlug: 'reactive-lyrics',
        templateVersion: 1,
        params,
        ...format,
        durationSec,
        workDir: fromCaller(args['project-dir']),
        files: { 'assets/lyrics-data.js': dataFile },
      });
      console.log(`projeto montado: ${projectDir}`);
      return;
    }
    const silent = path.join(workDir, 'video.mp4');
    await stage('render Hyperframes', () =>
      renderComposition({
        templateSlug: 'reactive-lyrics',
        templateVersion: 1,
        params,
        ...format,
        durationSec,
        quality,
        workDir,
        outputPath: silent,
        files: { 'assets/lyrics-data.js': dataFile },
        timeoutMs: 60 * 60_000,
      }),
    );

    const output = fromCaller(args.out!);
    await fsp.mkdir(path.dirname(output), { recursive: true });
    // Áudio vem do arquivo original, só recortado e codificado em AAC: sem loudnorm, pitch ou tempo.
    await stage('mux', () =>
      runProcess('ffmpeg', [
        '-nostdin', '-v', 'error', '-y',
        '-i', silent,
        '-ss', (startMs / 1000).toFixed(3), '-t', durationSec.toFixed(3), '-i', audio,
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
        '-t', durationSec.toFixed(3), '-movflags', '+faststart', output,
      ]),
    );

    const out = await inspectMedia(output);
    const report = await validateOutput(output, {
      durationSec,
      width: format.width,
      height: format.height,
      fpsNum: out.video?.fpsNum ?? 30,
      fpsDen: out.video?.fpsDen ?? 1,
      expectAudio: true,
    });
    for (const c of report.checks) if (c.status !== 'pass') console.log(`  QA ${c.status}: ${c.id} — ${c.message}`);

    // Manifesto de reprodutibilidade (RF-007, RNF-001).
    const manifest = {
      output: path.basename(output),
      createdAt: new Date().toISOString(),
      audio: { file: path.basename(audio), sha256: audioHash, durationSec: info.durationSec, rightsDeclared: args.rights },
      lyrics: { file: path.basename(lyricsPath), format: lyricFormat, offsetMs: alignment.offsetMs, issues },
      analysis: { version: MUSIC_ANALYSIS_VERSION, bpmEstimate: fullMap.bpmEstimate, cached },
      segment: { startMs, durationMs: segment.map.durationMs },
      template: { slug: 'reactive-lyrics', version: 1, preset: preset.id, params, bindings: preset.bindings },
      format: { ...format, fps: out.video ? out.video.fpsNum / out.video.fpsDen : null },
      quality,
      hyperframes: hyperframesBin().version,
      timingsMs: timings,
      qa: report.checks,
    };
    await fsp.writeFile(`${output.replace(/\.mp4$/i, '')}.manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`${report.ok ? 'pronto' : 'pronto com falhas de QA'}: ${output}`);
    console.log(`  tempos (ms): ${Object.entries(timings).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    if (!report.ok) process.exitCode = 2;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
