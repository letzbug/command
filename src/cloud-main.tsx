import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App, ErrorBoundary } from './app/App';
import { registerStore } from './app/actions';
import { AppStore, StoreContext } from './app/store';
import { createCloudRestStore, cloudLogin, restoreCloudSession, cloudLogout, CloudSession } from './data/supabase/cloudRestStore';
import { ui } from './ui/uiStore';
import { CloudUserAdmin } from './features/admin/CloudUserAdmin';
import { useState } from 'react';

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);
function showLogin(message = '') {
  root.render(<div style={{ maxWidth: 430, margin: '9vh auto', padding: 32, border: '1px solid #d8dfec', borderRadius: 18, background: 'white', color: '#142340', boxShadow: '0 12px 40px #0d264015', fontFamily: 'system-ui' }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: '#49617f' }}>UniPop</div>
    <h1 style={{ margin: '4px 0 8px' }}>COMMAND</h1>
    <p style={{ color: '#53637a', marginBottom: 25 }}>Connexion sécurisée</p>
    <form onSubmit={async ev => {
      ev.preventDefault();
      const f = ev.currentTarget;
      const email = (f.elements.namedItem('email') as HTMLInputElement).value.trim();
      const password = (f.elements.namedItem('password') as HTMLInputElement).value;
      const remember = (f.elements.namedItem('remember') as HTMLInputElement).checked;
      const status = f.querySelector('[role=status]') as HTMLElement;
      const button = f.querySelector('button[type=submit]') as HTMLButtonElement;
      button.disabled = true; status.textContent = 'Connexion…';
      try { await enter(await cloudLogin(email, password, remember)); }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); button.disabled = false; }
    }} style={{ display: 'grid', gap: 13 }}>
      <label>E-mail<input type="email" name="email" autoComplete="username" required style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 11, marginTop: 5 }}/></label>
      <label>Mot de passe<input type="password" name="password" autoComplete="current-password" required style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 11, marginTop: 5 }}/></label>
      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" name="remember"/> Rester connecté sur cet appareil privé</label>
      <button type="submit" style={{ background: '#1f63d0', color: 'white', padding: 13, border: 0, borderRadius: 8, fontWeight: 700 }}>Se connecter</button>
      <p role="status" aria-live="polite" style={{ margin: 0, color: '#a22323', fontSize: 13 }}>{message}</p>
    </form>
    <small style={{ color: '#758297' }}>UniPop COMMAND · accès réservé.</small>
  </div>);
}
function CloudWorkspace({ session, store }: { session: CloudSession; store: AppStore }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const isAdmin = store.getState().team.some(m => m.id === session.memberId && m.active && m.role === 'administrateur');
  return <StoreContext.Provider value={store}>
    <App />
    {isAdmin && <button type="button" onClick={() => setAdminOpen(true)}
      style={{ position: 'fixed', right: 15, bottom: 65, zIndex: 9999, background: '#1f63d0', color: '#fff', padding: '10px 15px', borderRadius: 9, border: 0, cursor: 'pointer' }}>Utilisateurs</button>}
    {adminOpen && <CloudUserAdmin session={session} onClose={() => setAdminOpen(false)} />}
    <button type="button" onClick={async () => { await cloudLogout(session); window.location.reload(); }}
      style={{ position: 'fixed', right: 15, bottom: 15, zIndex: 9999, background: '#12203a', color: '#fff', padding: '10px 15px', borderRadius: 9, border: 0, boxShadow: '0 2px 12px #0004', cursor: 'pointer' }}>Déconnexion</button>
  </StoreContext.Provider>;
}
async function enter(session: CloudSession) {
  const repo = createCloudRestStore(session);
  const store = new AppStore(repo);
  registerStore(store);
  ui.syncFromHash();
  // Do not start the app if data cannot be loaded: fail closed.
  await store.init();
  if (store.getState().fatal) throw new Error(`Erreur Supabase : ${store.getState().fatal}`);
  root.render(<StrictMode><ErrorBoundary><CloudWorkspace session={session} store={store} /></ErrorBoundary></StrictMode>);
  ui.toast('COMMAND Cloud connecté.', 'success');
}
showLogin();
restoreCloudSession().then(async session => {
  if (!session) return;
  try { await enter(session); } catch { showLogin('Session indisponible. Veuillez vous reconnecter.'); }
}).catch(() => showLogin('Veuillez vous reconnecter.'));
