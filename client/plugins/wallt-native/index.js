import { registerPlugin } from '@capacitor/core';

export const WalltNative = registerPlugin('WalltNative', {
  web: () => import('./web.js').then(({ WalltNativeWeb }) => new WalltNativeWeb()),
});
