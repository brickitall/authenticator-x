import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tailwind.css';
import { I18nProvider } from '../i18n/react.js';
import { startI18n } from '../i18n/runtime.js';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

// The language first, so nothing paints in English and then changes.
await startI18n();

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
