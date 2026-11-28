import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/noto-sans-thai-looped/thai-400.css';
import '@fontsource/noto-sans-thai-looped/thai-500.css';
import '@fontsource/noto-sans-thai-looped/thai-600.css';
import '@fontsource/noto-sans-thai-looped/thai-700.css';
import '@fontsource/noto-sans-thai-looped/latin-400.css';
import '@fontsource/noto-sans-thai-looped/latin-500.css';
import '@fontsource/noto-sans-thai-looped/latin-600.css';
import '@fontsource/noto-sans-thai-looped/latin-700.css';
import '@fontsource/noto-sans-thai/thai-400.css';
import '@fontsource/noto-sans-thai/thai-500.css';
import '@fontsource/noto-sans-thai/thai-600.css';
import '@fontsource/noto-sans-thai/thai-700.css';
import '@fontsource/noto-sans-thai/latin-400.css';
import '@fontsource/noto-sans-thai/latin-500.css';
import '@fontsource/noto-sans-thai/latin-600.css';
import '@fontsource/noto-sans-thai/latin-700.css';
import 'katex/dist/katex.min.css';
import './style.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
