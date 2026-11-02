/**
 * Pacote de intercâmbio para DaVinci Resolve Free (§16 / RF-19).
 *
 * Conteúdo: EDL CMX3600 por trilha (cortes e ordem), SRT das legendas,
 * mídias usadas com nomes portáveis, MP4 de referência e manifest.json com
 * hashes, timebase e a lista do que foi ACHATADO ou não representado.
 * Não promete equivalência de efeitos nem retorno editável perfeito.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  formatTimecode,
  timelineRate,
  toSeconds,
  type TimelineDocument,
} from '@editor-video/timeline';

export type ResolveLimitation = { itemId: string; kind: string; reason: string };

export type ResolvePackageManifest = {
  format: 'editor-video-resolve-package';
  version: 1;
  projectId: string;
  revisionId: string;
  timebase: { fpsNumerator: number; fpsDenominator: number; dropFrame: false };
  resolution: { width: number; height: number };
  referenceVideo: string | null;
  edls: string[];
  subtitles: string[];
  media: Array<{ assetId: string; file: string; sha256: string; reel: string }>;
  limitations: ResolveLimitation[];
  instructions: string[];
};

/** Reel de até 8 caracteres alfanuméricos, estável por asset. */
export function reelName(assetId: string, index: number): string {
  const base = assetId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'AX';
  return `${base}${String(index).padStart(3, '0')}`.slice(0, 8);
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
}

export type EdlBuild = { edl: string; limitations: ResolveLimitation[] };

/** EDL de uma trilha de vídeo ou áudio. Tempos em frames da timeline (NDF). */
export function buildEdl(
  doc: TimelineDocument,
  trackId: string,
  media: Map<string, { reel: string; file: string }>,
  title: string,
): EdlBuild {
  const fps = timelineRate(doc);
  const track = doc.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Trilha ${trackId} não existe`);
  const channel = track.type === 'audio' ? 'AA' : 'V';
  const limitations: ResolveLimitation[] = [];
  const lines = [`TITLE: ${title}`, 'FCM: NON-DROP FRAME', ''];
  let event = 1;
  const nominalFps = { num: Math.round(fps.num / fps.den), den: 1 };

  for (const item of [...track.items].sort((a, b) => a.timelineStart - b.timelineStart)) {
    if (item.kind !== 'clip') {
      limitations.push({ itemId: item.id, kind: item.kind, reason: 'Não representável em EDL; renderizar como clipe ou recriar no Resolve.' });
      continue;
    }
    const asset = doc.assets[item.assetId];
    const m = media.get(item.assetId);
    if (!asset || !m) continue;
    const srcIn = Math.round(toSeconds(item.sourceIn, asset.sourceTimebase) * nominalFps.num);
    const srcOut = asset.kind === 'image'
      ? srcIn + item.duration
      : Math.round(toSeconds(item.sourceOut, asset.sourceTimebase) * nominalFps.num);
    const recIn = item.timelineStart;
    const recOut = item.timelineStart + item.duration;
    const ev = String(event++).padStart(3, '0');
    lines.push(
      `${ev}  ${m.reel.padEnd(8)} ${channel.padEnd(5)} C        ${formatTimecode(srcIn, nominalFps)} ${formatTimecode(srcOut, nominalFps)} ${formatTimecode(recIn, fps)} ${formatTimecode(recOut, fps)}`,
    );
    lines.push(`* FROM CLIP NAME: ${m.file}`);
    const speed = item.playbackRate.num / item.playbackRate.den;
    if (speed !== 1) {
      lines.push(`M2   ${m.reel.padEnd(8)} ${(nominalFps.num * speed).toFixed(1).padStart(6)} ${formatTimecode(srcIn, nominalFps)}`);
      limitations.push({ itemId: item.id, kind: 'speed', reason: `Velocidade ${speed}x exportada como M2; conferir no Resolve.` });
    }
    lines.push('');
    const t = item.transform;
    if (t.crop || t.scale !== 1 || t.positionX !== 0.5 || t.positionY !== 0.5 || t.rotation !== 0 || t.opacity !== 1 || t.keyframes.length > 0) {
      limitations.push({ itemId: item.id, kind: 'transform', reason: 'Crop/escala/posição/opacidade não vão na EDL; usar a referência MP4 para reproduzir.' });
    }
    if (item.audio.gainDb !== 0 || item.audio.fadeInFrames > 0 || item.audio.fadeOutFrames > 0 || item.audio.pan !== 0) {
      limitations.push({ itemId: item.id, kind: 'audio', reason: 'Ganho, fades e pan não vão na EDL; reajustar no Fairlight.' });
    }
  }
  if (doc.variants.some((v) => Object.keys(v.transforms).length > 0)) {
    limitations.push({ itemId: '*', kind: 'variant', reason: 'Enquadramentos por variante (9:16 etc.) não são exportados; exportar um pacote por variante.' });
  }
  return { edl: `${lines.join('\r\n')}\r\n`, limitations };
}

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function buildSrt(doc: TimelineDocument, trackId: string): string {
  const fps = timelineRate(doc);
  const track = doc.tracks.find((t) => t.id === trackId);
  if (!track) return '';
  const items = track.items.filter((i) => i.kind === 'caption').sort((a, b) => a.timelineStart - b.timelineStart);
  return items
    .map((item, i) => {
      const text = item.kind === 'caption' ? item.text : '';
      return `${i + 1}\r\n${srtTime(toSeconds(item.timelineStart, fps))} --> ${srtTime(toSeconds(item.timelineStart + item.duration, fps))}\r\n${text}\r\n`;
    })
    .join('\r\n');
}

export type ResolveExportInput = {
  doc: TimelineDocument;
  outDir: string;
  /** Resolve o caminho local do ORIGINAL de cada asset (nunca proxy). */
  resolveOriginal: (assetId: string) => Promise<{ path: string; originalName: string }>;
  /** MP4 de referência da mesma revisão, se já renderizado. */
  referenceVideoPath?: string | null;
  copyMedia?: boolean;
};

export async function exportResolvePackage(input: ResolveExportInput): Promise<ResolvePackageManifest> {
  const { doc, outDir } = input;
  await fsp.mkdir(path.join(outDir, 'media'), { recursive: true });
  const usedAssetIds = new Set(doc.tracks.flatMap((t) => t.items.flatMap((i) => (i.kind === 'clip' ? [i.assetId] : []))));
  const media = new Map<string, { reel: string; file: string }>();
  const manifestMedia: ResolvePackageManifest['media'] = [];
  let index = 1;
  for (const assetId of usedAssetIds) {
    const asset = doc.assets[assetId];
    if (!asset) continue;
    const original = await input.resolveOriginal(assetId);
    const file = `media/${safeFileName(`${assetId}_${original.originalName}`)}`;
    if (input.copyMedia !== false) await fsp.copyFile(original.path, path.join(outDir, file));
    const reel = reelName(assetId, index++);
    media.set(assetId, { reel, file: path.basename(file) });
    manifestMedia.push({ assetId, file, sha256: asset.hash, reel });
  }

  const limitations: ResolveLimitation[] = [];
  const edls: string[] = [];
  const subtitles: string[] = [];
  for (const track of doc.tracks) {
    if (track.type === 'video' || track.type === 'audio') {
      const { edl, limitations: l } = buildEdl(doc, track.id, media, `${doc.projectId} ${track.id}`);
      const name = `${track.id}.edl`;
      await fsp.writeFile(path.join(outDir, name), edl, 'utf8');
      edls.push(name);
      limitations.push(...l);
    } else if (track.type === 'caption' && track.items.length > 0) {
      const name = `${track.id}.srt`;
      await fsp.writeFile(path.join(outDir, name), buildSrt(doc, track.id), 'utf8');
      subtitles.push(name);
    } else if (track.type === 'text') {
      for (const item of track.items) {
        limitations.push({ itemId: item.id, kind: item.kind, reason: 'Título/composição achatado na referência MP4; recriar no Resolve se precisar editar.' });
      }
    }
  }

  let referenceVideo: string | null = null;
  if (input.referenceVideoPath) {
    referenceVideo = 'reference.mp4';
    await fsp.copyFile(input.referenceVideoPath, path.join(outDir, referenceVideo));
  }

  const manifest: ResolvePackageManifest = {
    format: 'editor-video-resolve-package',
    version: 1,
    projectId: doc.projectId,
    revisionId: doc.revisionId,
    timebase: { fpsNumerator: doc.video.fpsNumerator, fpsDenominator: doc.video.fpsDenominator, dropFrame: false },
    resolution: { width: doc.video.width, height: doc.video.height },
    referenceVideo,
    edls,
    subtitles,
    media: manifestMedia,
    limitations,
    instructions: [
      `Crie um projeto no Resolve com ${doc.video.width}x${doc.video.height} e ${doc.video.fpsNumerator}/${doc.video.fpsDenominator} fps (timecode non-drop).`,
      'Importe a pasta media/ no Media Pool.',
      'File > Import > Timeline > selecione V1.edl (e as demais EDLs); desmarque "automatically import source clips".',
      'Se pedir relink, aponte para a pasta media/ (nomes de arquivo indicados em FROM CLIP NAME).',
      'Importe as legendas .srt na trilha de subtitle e use reference.mp4 para conferir títulos e enquadramentos achatados.',
      'Exporte o resultado e reenvie ao hub como nova entrega de origem externa (exige nova aprovação).',
    ],
  };
  await fsp.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await fsp.writeFile(
    path.join(outDir, 'LEIA-ME.txt'),
    [...manifest.instructions.map((s, i) => `${i + 1}. ${s}`), '', 'Elementos achatados ou não representados:', ...limitations.map((l) => `- ${l.itemId} (${l.kind}): ${l.reason}`)].join('\r\n'),
    'utf8',
  );
  return manifest;
}
