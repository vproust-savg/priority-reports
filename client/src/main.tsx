// ═══════════════════════════════════════════════════════════════
// FILE: client/src/main.tsx
// PURPOSE: React entry point. Renders App into the DOM root.
// USED BY: index.html
// ═══════════════════════════════════════════════════════════════

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
