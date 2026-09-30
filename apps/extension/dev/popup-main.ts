import { resetDevStorage, setRegisteringBackground } from './chrome-stub.js';

// The service worker must be evaluated first so its message listener is in
// place before any page code sends to it.
setRegisteringBackground(true);
await import('../src/background/index.js');
setRegisteringBackground(false);

await import('../src/popup/main.js');

document.getElementById('reset')?.addEventListener('click', resetDevStorage);
