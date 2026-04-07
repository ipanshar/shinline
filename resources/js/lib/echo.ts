import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher: typeof Pusher;
  }
}

window.Pusher = Pusher;

const reverbScheme = import.meta.env.VITE_REVERB_SCHEME || 'http';
const reverbHost = import.meta.env.VITE_REVERB_HOST || window.location.hostname;
const reverbPort = Number(import.meta.env.VITE_REVERB_PORT || (reverbScheme === 'https' ? 443 : 8080));
const useTls = reverbScheme === 'https';

const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: reverbHost,
  wsPort: reverbPort,
  wssPort: reverbPort,
  forceTLS: useTls,
  enabledTransports: ['ws', 'wss'],
  authEndpoint: '/broadcasting/auth',
});

export default echo;
