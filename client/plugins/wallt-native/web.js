import { WebPlugin } from '@capacitor/core';

export class WalltNativeWeb extends WebPlugin {
  async playStartupSound() {
    return { started: false };
  }
}
