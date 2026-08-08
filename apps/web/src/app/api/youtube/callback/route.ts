import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@editor-video/db';
import { requireUser } from '@/lib/auth-guards';
import {
  ensureMidnightPlaylists,
  exchangeCode,
  fetchMyChannel,
} from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const user = await requireUser();
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');
    if (error) {
      return NextResponse.redirect(
        new URL(`/ambient/youtube?error=${encodeURIComponent(error)}`, request.url),
      );
    }
    if (!code) {
      return NextResponse.redirect(new URL('/ambient/youtube?error=missing_code', request.url));
    }

    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Reutiliza refresh existente se o Google não reenviar.
      const existing = await prisma.youTubeChannel.findUnique({ where: { userId: user.id } });
      if (!existing?.refreshToken) {
        return NextResponse.redirect(
          new URL('/ambient/youtube?error=missing_refresh_token', request.url),
        );
      }
      tokens.refresh_token = existing.refreshToken;
    }

    const channel = await fetchMyChannel(tokens.access_token);
    const playlistMap = await ensureMidnightPlaylists(tokens.access_token);

    await prisma.youTubeChannel.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        channelId: channel.id,
        channelTitle: channel.title,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
        playlistMapJson: playlistMap as unknown as Prisma.InputJsonValue,
      },
      update: {
        channelId: channel.id,
        channelTitle: channel.title,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
        playlistMapJson: playlistMap as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.redirect(new URL('/ambient/youtube?connected=1', request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'oauth_failed';
    return NextResponse.redirect(
      new URL(`/ambient/youtube?error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
