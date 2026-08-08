import { requireUser } from '@/lib/auth-guards';
import { handle, json, ApiError } from '@/lib/http';
import { getYoutubeAuthUrl, youtubeConfigured } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return handle(async () => {
    const user = await requireUser();
    if (!youtubeConfigured()) {
      throw new ApiError('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.');
    }
    const state = Buffer.from(JSON.stringify({ userId: user.id, t: Date.now() })).toString(
      'base64url',
    );
    const url = getYoutubeAuthUrl(state);
    return json({ url });
  });
}
