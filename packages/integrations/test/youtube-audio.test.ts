/**
 * Busca/áudio do YouTube (yt-dlp). Os testes de rede só rodam com
 * LYRICS_NETWORK_TEST=1 (dependem do YouTube e do yt-dlp instalados).
 */
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { downloadYoutubeAudio, inspectMedia, isYoutubeVideoId, parseYoutubeSearchOutput, searchYoutube, youtubeWatchUrl } from '../src/index.js';

const network = process.env.LYRICS_NETWORK_TEST === '1';

describe('YouTube (yt-dlp)', () => {
  it('lê a saída da busca e ignora canais, playlists e lixo', () => {
    const out = [
      JSON.stringify({ id: 'jNQXAC9IVRw', title: 'Me at the zoo', channel: 'jawed', duration: 19, thumbnails: [{ url: 'a' }, { url: 'b' }] }),
      JSON.stringify({ id: 'UC4QobU6STFB0P71PMvOGN5A', title: 'canal' }),
      'WARNING: algo',
      JSON.stringify({ id: 'abcdefghijk', title: 'Ao vivo', uploader: 'x', live_status: 'is_live' }),
      '{quebrado',
    ].join('\n');
    const results = parseYoutubeSearchOutput(out);
    assert.deepEqual(results.map((r) => [r.videoId, r.channel, r.durationSec, r.thumbnail, r.live]), [
      ['jNQXAC9IVRw', 'jawed', 19, 'b', false],
      ['abcdefghijk', 'x', null, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', true],
    ]);
  });

  it('só aceita ID de vídeo; nada de URL ou argumento vindo do cliente', () => {
    assert.ok(isYoutubeVideoId('jNQXAC9IVRw'));
    for (const bad of ['--exec=calc', 'https://evil', '../../etc/pas', 'jNQXAC9IVR', 'jNQXAC9IVRw2']) assert.equal(isYoutubeVideoId(bad), false, bad);
    assert.throws(() => youtubeWatchUrl('--exec=calc'));
    assert.equal(youtubeWatchUrl('jNQXAC9IVRw'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  });

  it('busca e baixa o áudio de um vídeo curto', { skip: !network, timeout: 300_000 }, async () => {
    const results = await searchYoutube('me at the zoo jawed', { limit: 5 });
    assert.ok(results.some((r) => r.videoId === 'jNQXAC9IVRw'), 'resultado esperado na busca');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ev-yt-'));
    await assert.rejects(downloadYoutubeAudio('jNQXAC9IVRw', { outDir: dir, maxDurationSec: 5 }), /limite/);
    const { file, info } = await downloadYoutubeAudio('jNQXAC9IVRw', { outDir: dir, maxDurationSec: 600 });
    assert.equal(info.channel, 'jawed');
    const media = await inspectMedia(file);
    assert.equal(media.audio?.codec, 'flac');
    assert.ok(Math.abs((media.durationSec ?? 0) - 19) < 1.5);
  });
});
