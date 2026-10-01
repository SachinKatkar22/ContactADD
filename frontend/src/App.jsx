import { useState } from 'react';

// In development, Vite proxies /api to the backend and avoids hard-coded host/port issues.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    cloud: <><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5 6 6 0 0 0 6.3 9a4.5 4.5 0 0 0 .7 9H18"/><path d="m12 12-3 3m3-3 3 3m-3-3v8"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    sync: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function escapeVCard(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function contactsToVCard(contacts) {
  return contacts.map((contact) => {
    const names = Array.isArray(contact.name) ? contact.name.filter(Boolean) : [];
    const displayName = names[0] || 'Unknown contact';
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCard(displayName)}`];
    for (const name of names) lines.push(`N:${escapeVCard(name)};;;;`);
    for (const phone of (Array.isArray(contact.tel) ? contact.tel : []).filter(Boolean)) lines.push(`TEL;TYPE=VOICE:${escapeVCard(phone)}`);
    for (const email of (Array.isArray(contact.email) ? contact.email : []).filter(Boolean)) lines.push(`EMAIL:${escapeVCard(email)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }).join('\r\n');
}

function App() {
  const [usernameInput, setUsernameInput] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [contactCount, setContactCount] = useState(null);

  const announce = (kind, message) => setNotice({ kind, message });
  const run = async (key, action) => {
    setBusy(key); setNotice(null);
    try { await action(); }
    catch (error) { announce('error', error.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(''); }
  };

  const handleLogin = (event) => {
    event.preventDefault();
    const username = usernameInput.trim();
    if (!username) return announce('error', 'Enter a username to continue.');
    return run('login', async () => {
      const data = await request('/api/login', { method: 'POST', body: JSON.stringify({ username }) });
      setCurrentUser(data.username);
      announce(data.isExpired ? 'info' : 'success', data.isExpired ? 'Your previous plan expired and stored contacts were cleared.' : 'You’re signed in.');
    });
  };

  const syncContacts = () => run('sync', async () => {
    if (!window.isSecureContext) {
      throw new Error('This page is not using a secure HTTPS connection. Open the HTTPS version of your site.');
    }
    if (window.top !== window.self) {
      throw new Error('The contact picker can only open when the app is displayed as a normal page, not inside an embedded frame.');
    }
    if (!('contacts' in navigator) || !('ContactsManager' in window) || typeof navigator.contacts?.select !== 'function') {
      throw new Error('This browser does not support web contact selection. On Android, open this page in the latest Chrome browser and tap Sync again.');
    }

    // Open the picker directly from the button tap. Waiting for getProperties()
    // first may use up the browser's short-lived user-gesture permission.
    let selected;
    try {
      selected = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
    } catch (error) {
      if (error.name === 'AbortError') { announce('info', 'Contact selection cancelled.'); return; }
      if (error.name === 'NotAllowedError') throw new Error('The browser blocked the picker. Tap Sync selected contacts again, then choose contacts in the browser dialog.');
      throw error;
    }
    if (!selected.length) { announce('info', 'No contacts selected.'); return; }
    const data = await request('/api/sync-contacts', { method: 'POST', body: JSON.stringify({ username: currentUser, contacts: selected }) });
    setContactCount(data.count); announce('success', `${data.count} contact${data.count === 1 ? '' : 's'} saved to your vault.`);
  });

  const exportContacts = () => run('export', async () => {
    const data = await request(`/api/get-contacts/${encodeURIComponent(currentUser)}`);
    if (!Array.isArray(data.contacts) || data.contacts.length === 0) { setContactCount(0); announce('info', 'Your vault is empty. Sync contacts before exporting.'); return; }
    const blob = new Blob([contactsToVCard(data.contacts)], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${currentUser.replace(/[^a-z0-9_-]/gi, '_')}_contacts.vcf`;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setContactCount(data.contacts.length); announce('success', `Exported ${data.contacts.length} contacts as a vCard file.`);
  });

  const signOut = () => { setCurrentUser(''); setContactCount(null); setNotice(null); };

  return <main className="page-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="Kinship home"><span className="brand-mark"><Icon name="user" size={19}/></span><span>kinship<span className="brand-dot">.</span></span></a><div className="topbar-note"><span className="secure-dot"/> Private by design</div></header>
    <div className="layout" id="top">
      <section className="intro"><div className="eyebrow"><span/> CONTACTS, WHEREVER YOU GO</div><h1>Your people,<br/><em>always close.</em></h1><p className="intro-copy">Keep a safe copy of your contacts and take them with you when you move to a new device.</p>
        <div className="feature-list"><div className="feature"><span className="feature-icon"><Icon name="shield"/></span><span><b>Your contacts stay yours</b><small>Sync only the contacts you choose.</small></span></div><div className="feature"><span className="feature-icon"><Icon name="sync"/></span><span><b>Move in a few taps</b><small>Export a standard vCard file for your next phone.</small></span></div></div>
        <div className="privacy-note"><Icon name="lock" size={17}/><span>Contact access is requested only when you choose to sync.</span></div>
      </section>
      <section className="panel-wrap" aria-label="Contact vault">
        {!currentUser ? <form className="panel" onSubmit={handleLogin}>
          <div className="panel-heading"><span className="step-label">YOUR VAULT</span><span className="panel-icon"><Icon name="user"/></span></div>
          <h2>Welcome back</h2><p className="panel-copy">Sign in or create a vault with your username.</p>
          <label className="field-label" htmlFor="username">Username</label><div className="input-wrap"><Icon name="user" size={18}/><input id="username" autoComplete="username" maxLength={80} value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} placeholder="e.g. alexmorgan" required/></div>
          <button className="button button-primary" type="submit" disabled={Boolean(busy)}>{busy === 'login' ? <><span className="spinner"/> Connecting…</> : <>Continue <Icon name="arrow" size={17}/></>}</button>
          <p className="form-foot"><Icon name="lock" size={15}/> Username only. This is not password-protected.</p>
        </form> : <div className="panel">
          <div className="panel-heading"><span className="step-label">YOUR VAULT</span><button className="text-button" type="button" onClick={signOut}>Sign out</button></div>
          <h2>Hi, {currentUser}</h2><p className="panel-copy">Your contact vault is ready.</p>
          <div className="vault-ready"><span className="active-check"><Icon name="check" size={16}/></span><div><b>Your vault is ready</b><small>Sync and export contacts whenever you need.</small></div></div>
          <div className="action-stack"><button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={syncContacts}>{busy === 'sync' ? <><span className="spinner"/> Opening contacts…</> : <><Icon name="cloud"/> Sync selected contacts</>}</button><button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={exportContacts}>{busy === 'export' ? <><span className="spinner"/> Preparing file…</> : <><Icon name="download"/> Export contacts (.vcf)</>}</button></div>
          <div className="vault-meta"><span>{contactCount === null ? 'Contacts are only saved when you sync.' : `${contactCount} ${contactCount === 1 ? 'contact' : 'contacts'} in latest action`}</span></div>
        </div>}
        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.kind === 'success' ? <Icon name="check" size={17}/> : <span className="notice-mark">{notice.kind === 'error' ? '!' : 'i'}</span>}<span>{notice.message}</span></div>}
        <div className="support-note">Need help? <a href="mailto:support@example.com">Contact support <Icon name="arrow" size={13}/></a></div>
      </section>
    </div>
    <footer><span>© 2026 Kinship</span><span>Made for the moments between phones.</span><span><Icon name="lock" size={13}/> Your contacts, your choice</span></footer>
  </main>;
}

export default App;
