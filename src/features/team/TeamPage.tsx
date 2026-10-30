import { useState } from 'react';
import { run } from '../../app/actions';
import { useLookups } from '../../app/derived';
import { useAppState, useStore } from '../../app/store';
import { isDone, isOverdue } from '../../domain/planning';
import { nowStamp, PERMISSION_LABEL, Permission, ROLE_LABEL, ROLE_PERMISSIONS, ROLES, uid } from '../../domain/reference';
import type { Role, TeamMember } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { Badge, Button, Field, IconButton, MemberTag, Select, Toggle, memberDisplayName } from '../../ui/kit';
import { ui } from '../../ui/uiStore';

const SWATCHES = ['#1F63D0', '#0F8A7A', '#7048E8', '#B45F06', '#C2416B', '#3B4A6B', '#2F8F4E', '#6B7280'];

function MemberBody({ member, close }: { member: TeamMember; close: (v?: unknown) => void }) {
  const [m, setM] = useState(member);
  const [error, setError] = useState<string | null>(null);
  const store = useStore();
  const save = async () => {
    if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/i.test(m.code.trim())) return setError('Identifiant attendu au format ORG-01 (lettres, chiffres, tirets).');
    try { await store.saveMember(m); close(true); } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible.'); }
  };
  return (
    <form className="dlg-body" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <h2 className="dlg-title">{member.rev ? `Modifier ${memberDisplayName(member)}` : 'Nouveau membre'}</h2>
      <p className="dlg-text">Utilisez des identifiants fonctionnels (ORG-01, TECH-01…) plutôt que des noms de personnes.</p>
      <div className="form-grid">
        <Field label="Identifiant" error={error}><input value={m.code} onChange={(e) => setM({ ...m, code: e.target.value.toUpperCase() })} autoFocus required /></Field>
        <Field label="Fonction"><input value={m.label} onChange={(e) => setM({ ...m, label: e.target.value })} placeholder="ex. Coordination des formations" /></Field>
        <Field label="Type"><Select value={m.kind} onChange={(v) => setM({ ...m, kind: v })} ariaLabel="Type" options={[{ value: 'personne', label: 'Personne' }, { value: 'equipe', label: 'Équipe' }]} /></Field>
        <Field label="Rôle"><Select value={m.role} onChange={(v) => setM({ ...m, role: v as Role })} ariaLabel="Rôle" options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
        <div className="field field-wide"><span className="field-label">Couleur</span>
          <div className="swatches">{SWATCHES.map((c) => <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={m.color === c} className={m.color === c ? 'is-on' : ''} style={{ background: c }} onClick={() => setM({ ...m, color: c })} />)}</div>
        </div>
        <div className="field field-wide"><Toggle checked={m.active} onChange={(v) => setM({ ...m, active: v })} label="Actif (proposé dans les assignations)" /></div>
      </div>
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(false)}>Annuler</button>
        <button type="submit" className="btn btn-primary">Enregistrer</button>
      </div>
    </form>
  );
}

function DeleteMemberBody({ member, count, others, close }: { member: TeamMember; count: number; others: TeamMember[]; close: (v?: unknown) => void }) {
  const [to, setTo] = useState('');
  return (
    <div className="dlg-body">
      <h2 className="dlg-title">Supprimer {memberDisplayName(member)} ?</h2>
      <p className="dlg-text">{count ? `${count} tâche(s) ou événement(s) lui sont attribués. Choisissez qui les reprend.` : 'Aucune attribution en cours.'}</p>
      {count ? <Select value={to} onChange={setTo} ariaLabel="Réassigner à" options={[{ value: '', label: 'Laisser sans responsable' }, ...others.map((o) => ({ value: o.id, label: `${memberDisplayName(o)}` }))]} /> : null}
      <div className="dlg-actions">
        <button type="button" className="btn btn-ghost" onClick={() => close(undefined)}>Annuler</button>
        <button type="button" className="btn btn-danger" onClick={() => close({ to })}>Supprimer</button>
      </div>
    </div>
  );
}

export function DemoUserSwitch() {
  const store = useStore();
  const me = useAppState((s) => s.settings.currentUserId);
  const { activeTeam, memberById } = useLookups();
  const current = memberById.get(me ?? '');
  return (
    <div className="demo-user">
      <Field label="Profil de travail" hint={current ? `Rôle affiché : ${ROLE_LABEL[current.role]}. Aucune authentification : ce sélecteur n’est pas une sécurité.` : 'Aucun utilisateur : droits administrateur par défaut.'}>
        <Select value={me ?? ''} onChange={(v) => void run(() => store.updateSettings({ currentUserId: v || null }, { asUserSwitch: true }), 'Profil de travail changé')} ariaLabel="Profil de travail"
          options={[{ value: '', label: 'Aucun' }, ...activeTeam.map((m) => ({ value: m.id, label: `${memberDisplayName(m)} — ${ROLE_LABEL[m.role]}` }))]} />
      </Field>
    </div>
  );
}

export function TeamPage() {
  const store = useStore();
  const tasks = useAppState((s) => s.tasks);
  const events = useAppState((s) => s.events);
  const today = useAppState((s) => s.today);
  const { team } = useLookups();
  const canManage = store.can('team.manage');
  const load = team.map((m) => {
    const open = tasks.filter((t) => t.assigneeId === m.id && !isDone(t));
    return { m, open: open.length, late: open.filter((t) => isOverdue(t, today)).length, events: events.filter((e) => e.ownerId === m.id && !e.archived).length };
  });
  const max = Math.max(1, ...load.map((l) => l.open));
  const edit = async (m?: TeamMember) => {
    const stamp = nowStamp();
    const member = m ?? { id: uid('mbr'), createdAt: stamp, updatedAt: stamp, rev: 0, code: '', label: '', kind: 'personne' as const, role: 'collaborateur' as Role, color: SWATCHES[0], active: true };
    const ok = await ui.openDialog<boolean>((close) => <MemberBody member={member} close={close} />, 'md');
    if (ok) ui.toast(m ? 'Membre mis à jour' : 'Membre ajouté', 'success');
  };
  const remove = async (m: TeamMember) => {
    const count = tasks.filter((t) => t.assigneeId === m.id).length + events.filter((e) => e.ownerId === m.id).length;
    const r = await ui.openDialog<{ to: string }>((close) => <DeleteMemberBody member={m} count={count} others={team.filter((x) => x.id !== m.id && x.active)} close={close} />, 'md');
    if (r) await run(() => store.deleteMember(m.id, r.to || null), `${memberDisplayName(m)} supprimé`);
  };
  const perms = Object.keys(PERMISSION_LABEL) as Permission[];
  return (
    <div className="page team">
      <div className="team-head">
        <DemoUserSwitch />
        <Button variant="primary" icon="plus" disabled={!canManage} onClick={() => void edit()}>Ajouter un membre</Button>
      </div>
      <section>
        <h3 className="list-head">Membres et charge actuelle<span>{team.length}</span></h3>
        <div className="members">
          {load.map(({ m, open, late, events: ev }) => (
            <div key={m.id} className={`member ${m.active ? '' : 'is-inactive'}`}>
              <MemberTag member={m} />
              <span className="member-label">{memberDisplayName(m)}{m.kind === 'equipe' ? <Badge>Équipe</Badge> : null}{!m.active ? <Badge>Inactif</Badge> : null}</span>
              <span className="member-role">{ROLE_LABEL[m.role]}</span>
              <span className="member-load" title={`${open} tâche(s) ouverte(s)`}>
                <span className="load-bar"><span style={{ width: `${(open / max) * 100}%` }} /><span className="load-late" style={{ width: `${(late / max) * 100}%` }} /></span>
                <span>{open} ouverte{open > 1 ? 's' : ''}{late ? `, ${late} en retard` : ''}{ev ? `, ${ev} événement${ev > 1 ? 's' : ''}` : ''}</span>
              </span>
              <span className="member-actions">
                <IconButton icon="tasks" label={`Tâches de ${memberDisplayName(m)}`} onClick={() => { ui.set({ taskView: 'toutes' }); ui.go('taches'); ui.toast(`Filtrez par ${memberDisplayName(m)} dans la liste des tâches.`, 'info'); }} />
                <IconButton icon="edit" label={`Modifier ${memberDisplayName(m)}`} disabled={!canManage} onClick={() => void edit(m)} />
                <IconButton icon="trash" label={`Supprimer ${memberDisplayName(m)}`} disabled={!canManage} onClick={() => void remove(m)} />
              </span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="list-head">Rôles et autorisations</h3>
        <div className="perm-table" role="table" aria-label="Autorisations par rôle">
          <div className="perm-row perm-head" role="row"><span role="columnheader">Action</span>{ROLES.map((r) => <span key={r} role="columnheader">{ROLE_LABEL[r]}</span>)}</div>
          {perms.map((p) => (
            <div key={p} className="perm-row" role="row">
              <span role="cell">{PERMISSION_LABEL[p]}</span>
              {ROLES.map((r) => <span key={r} role="cell" className={ROLE_PERMISSIONS[r].includes(p) ? 'yes' : 'no'}>{ROLE_PERMISSIONS[r].includes(p) ? <Icon name="check" size={16} /> : <span aria-label="non">–</span>}</span>)}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
