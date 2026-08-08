import { LicenseVerdict } from '@editor-video/db';
import type { LicenseVerdict as LicenseVerdictType } from '@prisma/client';

export function evaluateLicense(input: {
  provider: string;
  license?: string | null;
}): {
  verdict: LicenseVerdictType;
  commercialUse: boolean;
  modificationAllowed: boolean;
  attributionRequired: boolean;
  verified: boolean;
  reason: string;
} {
  const license = (input.license ?? '').trim().toLowerCase();
  const provider = input.provider.trim().toLowerCase();

  if (provider === 'synthetic' || provider === 'noise' || provider === 'local-generated') {
    return {
      verdict: LicenseVerdict.SAFE,
      commercialUse: true,
      modificationAllowed: true,
      attributionRequired: false,
      verified: true,
      reason: 'Áudio sintético.',
    };
  }

  if (!license) {
    return {
      verdict: LicenseVerdict.UNKNOWN,
      commercialUse: false,
      modificationAllowed: false,
      attributionRequired: true,
      verified: false,
      reason: 'Licença ausente.',
    };
  }

  if (['all rights reserved', 'copyright', 'forbidden'].some((x) => license.includes(x))) {
    return {
      verdict: LicenseVerdict.REJECTED,
      commercialUse: false,
      modificationAllowed: false,
      attributionRequired: true,
      verified: true,
      reason: `Licença rejeitada: ${input.license}`,
    };
  }

  if (
    ['pexels license', 'pixabay license', 'cc0', 'public domain', 'synthetic', 'generated'].some(
      (x) => license.includes(x),
    )
  ) {
    return {
      verdict: LicenseVerdict.SAFE,
      commercialUse: true,
      modificationAllowed: true,
      attributionRequired: false,
      verified: true,
      reason: `Licença segura: ${input.license}`,
    };
  }

  if (['cc by', 'cc-by', 'attribution'].some((x) => license.includes(x))) {
    return {
      verdict: LicenseVerdict.ATTRIBUTION_REQUIRED,
      commercialUse: true,
      modificationAllowed: true,
      attributionRequired: true,
      verified: true,
      reason: `Atribuição necessária: ${input.license}`,
    };
  }

  return {
    verdict: LicenseVerdict.UNKNOWN,
    commercialUse: false,
    modificationAllowed: false,
    attributionRequired: true,
    verified: false,
    reason: `Licença desconhecida: ${input.license}`,
  };
}
