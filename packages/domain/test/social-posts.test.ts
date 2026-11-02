import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertTransition, buildAdditionalChannelSeeds, buildChannelSeeds, SOCIAL_POST_TRANSITIONS, socialPostInputSchema, socialPostIssues } from '../src/index.js';

const base = { title: null, caption: 'Legenda', platforms: [], mediaKinds: [] };

describe('posts da agenda', () => {
  it('exige rede e mídia conforme o destino', () => {
    assert.deepEqual(socialPostIssues(base), ['Escolha ao menos uma rede.']);
    assert.deepEqual(socialPostIssues({ ...base, platforms: ['FACEBOOK'] }), []);
    assert.match(socialPostIssues({ ...base, platforms: ['INSTAGRAM'] }).join(), /precisa de mídia/);
    assert.deepEqual(socialPostIssues({ ...base, platforms: ['INSTAGRAM'], mediaKinds: ['IMAGE', 'VIDEO'] }), []);
  });

  it('respeita o limite de legenda da rede escolhida', () => {
    const caption = 'x'.repeat(2201);
    assert.match(socialPostIssues({ ...base, caption, platforms: ['INSTAGRAM'], mediaKinds: ['IMAGE'] }).join(), /Instagram: legenda com 2201/);
    assert.deepEqual(socialPostIssues({ ...base, caption, platforms: ['FACEBOOK'] }), []);
  });

  it('YouTube pede um vídeo e título; TikTok não mistura vídeo com imagem', () => {
    assert.equal(socialPostIssues({ ...base, platforms: ['YOUTUBE'], mediaKinds: ['IMAGE'] }).length, 2);
    assert.deepEqual(socialPostIssues({ ...base, title: 'Título', platforms: ['YOUTUBE'], mediaKinds: ['VIDEO'] }), []);
    assert.match(socialPostIssues({ ...base, platforms: ['TIKTOK'], mediaKinds: ['VIDEO', 'IMAGE'] }).join(), /TikTok/);
    assert.deepEqual(socialPostIssues({ ...base, platforms: ['TIKTOK'], mediaKinds: ['IMAGE', 'IMAGE'] }), []);
  });

  it('entrada remove duplicatas preservando a ordem da mídia', () => {
    const input = socialPostInputSchema.parse({ platforms: ['TIKTOK', 'TIKTOK'], assetIds: ['b', 'a', 'b'] });
    assert.deepEqual(input.platforms, ['TIKTOK']);
    assert.deepEqual(input.assetIds, ['b', 'a']);
    assert.throws(() => socialPostInputSchema.parse({ platforms: ['ORKUT'] }));
  });

  it('post cancelado não volta e rascunho não vira postado direto', () => {
    assert.throws(() => assertTransition('Post', SOCIAL_POST_TRANSITIONS, 'CANCELLED', 'DRAFT'));
    assert.throws(() => assertTransition('Post', SOCIAL_POST_TRANSITIONS, 'DRAFT', 'POSTED'));
    assertTransition('Post', SOCIAL_POST_TRANSITIONS, 'POSTED', 'SCHEDULED');
  });

  it('Mago da Meia-Noite é canal próprio, sem vínculo presumido e fora dos canais do legado', () => {
    const [mago] = buildAdditionalChannelSeeds();
    assert.equal(mago?.slug, 'mago-da-meia-noite');
    assert.equal(mago?.linkedBrand, null);
    assert.ok(!buildChannelSeeds().some((c) => c.slug === mago?.slug));
  });

  it('série Arquétipos usa o template próprio do Mago', () => {
    const [mago] = buildAdditionalChannelSeeds();
    assert.equal(mago?.series[0]?.slug, 'arquetipos');
    assert.equal(mago?.series[0]?.config.template, mago?.templates[0]?.slug);
  });
});
