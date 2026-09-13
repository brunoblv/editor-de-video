import { useEffect } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

/**
 * Patrick Hand (Google Fonts, licença OFL — ver public/fonts/OFL-PatrickHand.txt).
 * Baixada uma vez e servida localmente via `public/` (Remotion bundleia e serve
 * sozinho, sem depender de rede externa durante o render — ao contrário de
 * `@remotion/google-fonts`, que busca em fonts.gstatic.com a cada carregamento).
 */
export const PATRICK_HAND_FONT_FAMILY = 'Patrick Hand';

let loadingPromise: Promise<void> | null = null;

function loadPatrickHand(): Promise<void> {
  if (!loadingPromise) {
    const font = new FontFace(PATRICK_HAND_FONT_FAMILY, `url(${staticFile('fonts/PatrickHand-Regular.woff2')})`, {
      weight: '400',
      style: 'normal',
    });
    loadingPromise = font.load().then((loaded) => {
      // lib.dom.d.ts não tipa FontFaceSet.add (existe em todo browser real).
      (document.fonts as unknown as { add(font: FontFace): void }).add(loaded);
    });
  }
  return loadingPromise;
}

/**
 * Garante que a Patrick Hand está carregada antes do Remotion capturar o
 * frame — `@font-face`/`FontFace.load()` é assíncrono, e sem isso os primeiros
 * frames renderizariam com a fonte de fallback (FOUT) até o carregamento
 * terminar, criando o mesmo "troca de fonte no meio do vídeo" que já
 * aconteceu antes por outro motivo (SpecialCard com fonte hardcoded).
 */
export function usePatrickHandFont(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handle = delayRender('Carregando fonte Patrick Hand');
    loadPatrickHand()
      .then(() => continueRender(handle))
      .catch((err: unknown) => cancelRender(err instanceof Error ? err : new Error(String(err))));
  }, [enabled]);
}
