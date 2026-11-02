import { fileUrl, type MediaAsset } from './shared';

export function MediaThumb({ asset }: { asset: MediaAsset }) {
  if (asset.kind === 'IMAGE') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="media-thumb" src={fileUrl(asset)} alt="" loading="lazy" />;
  }
  if (asset.kind === 'VIDEO') {
    return <video className="media-thumb" src={`${fileUrl(asset)}#t=0.5`} preload="metadata" muted playsInline />;
  }
  return <div className="media-thumb">Áudio</div>;
}
