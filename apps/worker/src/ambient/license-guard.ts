import { LicenseVerdict, prisma } from '@editor-video/db';
import type { LicenseVerdict as LicenseVerdictType } from '@prisma/client';

export type LicenseInput = {
  provider: string;
  sourceUrl?: string | null;
  author?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  commercialUse?: boolean;
  modificationAllowed?: boolean;
  attributionRequired?: boolean;
  verified?: boolean;
};

export type LicenseDecision = {
  verdict: LicenseVerdictType;
  commercialUse: boolean;
  modificationAllowed: boolean;
  attributionRequired: boolean;
  verified: boolean;
  reason: string;
};

const SAFE_LICENSES = [
  'pexels license',
  'pixabay license',
  'cc0',
  'public domain',
  'creative commons 0',
  'synthetic',
  'generated',
];

const ATTRIBUTION_LICENSES = [
  'cc by',
  'cc-by',
  'creative commons attribution',
  'attribution',
];

const REJECTED_LICENSES = [
  'all rights reserved',
  'copyright',
  'forbidden',
  'rejected',
];

export function evaluateLicense(input: LicenseInput): LicenseDecision {
  const license = (input.license ?? '').trim().toLowerCase();
  const provider = input.provider.trim().toLowerCase();

  if (provider === 'synthetic' || provider === 'noise' || provider === 'local-generated') {
    return {
      verdict: LicenseVerdict.SAFE,
      commercialUse: true,
      modificationAllowed: true,
      attributionRequired: false,
      verified: true,
      reason: 'Áudio sintético gerado localmente.',
    };
  }

  if (!license) {
    return {
      verdict: LicenseVerdict.UNKNOWN,
      commercialUse: false,
      modificationAllowed: false,
      attributionRequired: true,
      verified: false,
      reason: 'Licença ausente — bloqueado para automação.',
    };
  }

  if (REJECTED_LICENSES.some((item) => license.includes(item))) {
    return {
      verdict: LicenseVerdict.REJECTED,
      commercialUse: false,
      modificationAllowed: false,
      attributionRequired: true,
      verified: true,
      reason: `Licença rejeitada: ${input.license}`,
    };
  }

  if (SAFE_LICENSES.some((item) => license.includes(item))) {
    return {
      verdict: LicenseVerdict.SAFE,
      commercialUse: true,
      modificationAllowed: true,
      attributionRequired: false,
      verified: true,
      reason: `Licença segura: ${input.license}`,
    };
  }

  if (ATTRIBUTION_LICENSES.some((item) => license.includes(item))) {
    return {
      verdict: LicenseVerdict.ATTRIBUTION_REQUIRED,
      commercialUse: true,
      modificationAllowed: true,
      attributionRequired: true,
      verified: true,
      reason: `Uso permitido com atribuição: ${input.license}`,
    };
  }

  return {
    verdict: LicenseVerdict.UNKNOWN,
    commercialUse: Boolean(input.commercialUse),
    modificationAllowed: Boolean(input.modificationAllowed),
    attributionRequired: true,
    verified: false,
    reason: `Licença desconhecida (${input.license}) — bloqueada.`,
  };
}

export function assertUsable(decision: LicenseDecision): void {
  if (
    decision.verdict === LicenseVerdict.UNKNOWN ||
    decision.verdict === LicenseVerdict.REJECTED
  ) {
    throw new Error(`License Guard bloqueou o asset: ${decision.reason}`);
  }
}

export type ProjectLicenseAsset = {
  id: string;
  kind: 'sound' | 'media' | 'synthetic';
  name: string;
  verdict: LicenseVerdictType;
  attribution?: string | null;
};

export type ProjectLicenseReport = {
  safe: boolean;
  assets: ProjectLicenseAsset[];
  attributionRequired: ProjectLicenseAsset[];
  blocked: ProjectLicenseAsset[];
};

/** Revalida licenças de todos os assets ligados ao projeto Ambient. */
export async function validateProjectLicenses(
  projectId: string,
): Promise<ProjectLicenseReport> {
  const [usages, mediaAssets] = await Promise.all([
    prisma.ambientProjectAsset.findMany({
      where: { projectId },
      include: { soundAsset: true },
    }),
    prisma.mediaAsset.findMany({ where: { projectId } }),
  ]);

  const assets: ProjectLicenseAsset[] = [];

  for (const usage of usages) {
    if (usage.soundAsset) {
      const sa = usage.soundAsset;
      assets.push({
        id: sa.id,
        kind: 'sound',
        name: sa.name,
        verdict: sa.licenseVerdict,
        attribution: sa.attribution,
      });
      continue;
    }
    if (usage.type.startsWith('SOUND_SYNTH') || usage.type === 'synthetic') {
      assets.push({
        id: usage.id,
        kind: 'synthetic',
        name: usage.layer ?? usage.type,
        verdict: LicenseVerdict.SAFE,
      });
    }
  }

  for (const media of mediaAssets) {
    const decision = evaluateLicense({
      provider: media.provider,
      sourceUrl: media.sourceUrl,
      author: media.author,
      license: media.license,
    });
    assets.push({
      id: media.id,
      kind: 'media',
      name: media.query || media.provider,
      verdict: decision.verdict,
      attribution: media.author,
    });
  }

  const blocked = assets.filter(
    (a) => a.verdict === LicenseVerdict.UNKNOWN || a.verdict === LicenseVerdict.REJECTED,
  );
  const attributionRequired = assets.filter(
    (a) => a.verdict === LicenseVerdict.ATTRIBUTION_REQUIRED,
  );

  return {
    safe: blocked.length === 0,
    assets,
    attributionRequired,
    blocked,
  };
}

