/**
 * Shim: a implementação real vive em @editor-video/db (packages/db/src/youtube.ts)
 * — precisa do prisma pra armazenar/renovar tokens, e assim fica reutilizável
 * pelo worker também (publicação agendada, geração em lote do Canal Cristão).
 */
export {
  youtubeConfigured,
  getYoutubeAuthUrl,
  exchangeCode,
  getValidAccessToken,
  fetchMyChannel,
  ensureMidnightPlaylists,
  uploadVideoResumable,
  setThumbnail,
  addToPlaylist,
} from '@editor-video/db';
