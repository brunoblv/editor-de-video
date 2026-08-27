import { config } from '@editor-video/core';

console.log('clientId:', JSON.stringify(config.youtube.clientId));
console.log('redirectUri:', JSON.stringify(config.youtube.redirectUri));

const params = new URLSearchParams({
  client_id: config.youtube.clientId,
  redirect_uri: config.youtube.redirectUri,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/youtube.upload',
  access_type: 'offline',
  prompt: 'consent',
  state: 'test',
});
console.log('full url:', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
