import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App, ErrorBoundary } from './app/App';
import { registerStore } from './app/actions';
import { AppStore, StoreContext } from './app/store';
import { ENV } from './config';
import type { DataStore } from './data/contracts';
import { createIndexedDbStore } from './data/local/indexedDbStore';
import { createMemoryStore } from './data/memory/memoryStore';
import { ui } from './ui/uiStore';

async function boot() {
  ui.syncFromHash();
  let repo: DataStore;
  let volatile = false;
  try {
    repo = await createIndexedDbStore();
  } catch {
    // Private browsing or blocked storage: keep working, but say so.
    repo = createMemoryStore();
    volatile = true;
  }
  const store = new AppStore(repo);
  registerStore(store);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <StoreContext.Provider value={store}>
          <App />
        </StoreContext.Provider>
      </ErrorBoundary>
    </StrictMode>,
  );
  await store.init();
  if (volatile) ui.toast('Stockage local indisponible dans ce navigateur : les modifications ne seront pas conservées après fermeture.', 'warning');

  // Optional PWA: only for the deployed build, never inside the claude.ai viewer.
  const framed = !!(globalThis as { claude?: unknown }).claude;
  if (ENV.MODE === 'production' && !framed && 'serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA is optional */ });
  }
}

void boot();
