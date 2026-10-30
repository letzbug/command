import { useEffect, useState } from 'react';
import { CLOUD_URL, CLOUD_PUBLISHABLE_KEY, CloudSession, cloudRefresh } from '../../data/supabase/cloudRestStore';
type User = { id: string; userId: string; email: string; label: string; role: string; active: boolean; code: string };
const options = [
  ['administrateur', 'Administrateur'],
  ['coordinateur', 'Coordinateur'],
  ['collaborateur', 'Collaborateur'],
  ['lecture_seule', 'Lecture seule'],
];
export function CloudUserAdmin({ session, onClose }: { session: CloudSession; onClose: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('collaborateur');
  async function call(action: string, data: Record<string, unknown> = {}) {
    if (Date.now() > session.expiresAt - 60000) await cloudRefresh(session);
    const res = await fetch(`${CLOUD_URL}/functions/v1/dynamic-function`, {
      method: 'POST',
      headers: { apikey: CLOUD_PUBLISHABLE_KEY, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    return json;
  }
  async function refresh() {
    setLoading(true); setNotice('');
    try { setUsers((await call('list')).users); }
    catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function invite(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setNotice('');
    try {
      await call('invite', { email: email.trim(), label: label.trim(), role });
      setNotice('Invitation envoyée.'); setEmail(''); setLabel('');
      await refresh();
    } catch (err) { setNotice(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }
  async function change(u: User, patch: Partial<User>) {
    if (patch.active === false && !confirm(`Désactiver ${u.label} ?`)) return;
    setLoading(true); setNotice('');
    try { await call('change', { memberId: u.id, role: patch.role ?? u.role, active: patch.active ?? u.active }); await refresh(); }
    catch (err) { setNotice(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }
  const inputStyle: React.CSSProperties = { padding: 10, borderRadius: 8, border: '1px solid #cad3df', width: '100%', boxSizing: 'border-box' };
  return <div role="dialog" aria-modal="true" aria-label="Gestion des utilisateurs"
    style={{ position: 'fixed', inset: 0, zIndex: 10001, background: '#101f36b9', overflow: 'auto', padding: '3vh 14px' }}>
    <div style={{ maxWidth: 800, margin: 'auto', background: 'white', borderRadius: 18, padding: 25, boxShadow: '0 20px 60px #0004' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h2 style={{ margin: 0 }}>Gestion des utilisateurs</h2><small>UniPop COMMAND Cloud · 10 utilisateurs prévus, extensible</small></div>
        <button type="button" onClick={onClose}>Fermer ✕</button>
      </header>
      <p style={{ color: '#526174' }}>Inviter un collègue et lui attribuer un rôle. Aucun mot de passe n'est visible ni conservé par COMMAND.</p>
      <form onSubmit={invite} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '18px 0' }}>
        <label>Nom affiché<input style={inputStyle} required value={label} onChange={e => setLabel(e.target.value)} maxLength={120}/></label>
        <label>E-mail<input style={inputStyle} type="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
        <label>Rôle<select style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <button type="submit" disabled={loading} style={{ background: '#1f63d0', color: 'white', border: 0, borderRadius: 8, alignSelf: 'end', padding: 12 }}>Inviter</button>
      </form>
      {notice && <p role="status">{notice}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Utilisateur','Rôle','Accès',''].map(x => <th key={x} style={{ textAlign: 'left', padding: 9 }}>{x}</th>)}</tr></thead>
          <tbody>{users.map(u => <tr key={u.id} style={{ borderTop: '1px solid #e3e7ed' }}>
            <td style={{ padding: 9 }}><b>{u.label}</b><small style={{ display: 'block', color: '#64748b' }}>{u.email}</small></td>
            <td style={{ padding: 9 }}><select disabled={loading || u.userId === session.userId} value={u.role} onChange={e => void change(u, { role: e.target.value })}>{options.map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></td>
            <td style={{ padding: 9 }}>{u.active ? 'Actif' : 'Désactivé'}</td>
            <td style={{ padding: 9 }}><button disabled={loading || u.userId === session.userId} type="button" onClick={() => void change(u, { active: !u.active })}>{u.active ? 'Désactiver' : 'Réactiver'}</button></td>
          </tr>)}</tbody></table>
      </div>
      <p style={{ fontSize: 12, color: '#64748b' }}>La gestion est protégée côté serveur. Le service e-mail Supabase peut limiter le nombre d'invitations envoyées par heure.</p>
    </div>
  </div>;
}
