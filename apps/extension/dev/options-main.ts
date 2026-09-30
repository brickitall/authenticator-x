import { resetDevStorage, setRegisteringBackground } from './chrome-stub.js';

setRegisteringBackground(true);
await import('../src/background/index.js');
setRegisteringBackground(false);

await import('../src/options/main.js');

document.getElementById('reset')?.addEventListener('click', resetDevStorage);
