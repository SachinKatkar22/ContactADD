import { useState, useEffect } from 'react';

const API_BASE = 'https://contactadd.onrender.com';

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    cloud: <><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5 6 6 0 0 0 6.3 9a4.5 4.5 0 0 0 .7 9H18"/><path d="m12 12-3 3m3-3 3 3m-3-3v8"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <><path d="M7 17 17 7M7 7h10v10"/></>,
    sync: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>
  };
  return <svg {...common}>{paths[name]}</svg>;
}

async function request(path, options = {}, token = '') {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
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
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVCard(names[0] || 'Unknown contact')}`];
    for (const name of names) lines.push(`N:${escapeVCard(name)};;;;`);
    for (const phone of (contact.tel || []).filter(Boolean)) lines.push(`TEL;TYPE=VOICE:${escapeVCard(phone)}`);
    for (const email of (contact.email || []).filter(Boolean)) lines.push(`EMAIL:${escapeVCard(email)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }).join('\r\n');
}

function unescapeVCard(value = '') {
  return value.replace(/\\n/gi, '\n').replace(/\\([\\,;:])/g, '$1');
}

function parseVCardFile(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '').replace(/=\r?\n/g, '');
  return unfolded.split(/BEGIN:VCARD/i).slice(1).map((card) => {
    const contact = { name: [], tel: [], email: [] };
    for (const line of card.split(/\r?\n/)) {
      const match = line.match(/^(?:item\d+\.)?(FN|N|TEL|EMAIL)(?:;[^:]*)?:(.*)$/i);
      if (!match) continue;
      const [, field, raw] = match;
      const value = unescapeVCard(raw.trim());
      if (!value) continue;
      if (field.toUpperCase() === 'FN') contact.name.push(value);
      else if (field.toUpperCase() === 'N' && contact.name.length === 0) {
        const [family = '', given = '', middle = ''] = value.split(';');
        contact.name.push([given, middle, family].filter(Boolean).join(' '));
      } else if (field.toUpperCase() === 'TEL') contact.tel.push(value);
      else if (field.toUpperCase() === 'EMAIL') contact.email.push(value);
    }
    contact.name = [...new Set(contact.name)];
    contact.tel = [...new Set(contact.tel)];
    contact.email = [...new Set(contact.email)];
    return contact;
  }).filter((contact) => contact.name.length || contact.tel.length || contact.email.length);
}

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [retentionDays, setRetentionDays] = useState('7');
  const [expiresAt, setExpiresAt] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [contactCount, setContactCount] = useState(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.get('payment') === 'success') {
      setNotice({ kind: 'success', message: 'Payment successful! Your vault is now active.' });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (queryParams.get('payment') === 'failed') {
      setNotice({ kind: 'error', message: 'Payment failed or was cancelled.' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const announce = (kind, message) => setNotice({ kind, message });
  const run = async (key, action) => {
    setBusy(key); setNotice(null);
    try { await action(); }
    catch (error) { announce('error', error.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(''); }
  };

  const handleAuth = (event) => {
    event.preventDefault();
    if (authMode === 'register' && password !== confirmPassword) return announce('error', 'The passwords do not match.');
    return run('auth', async () => {
      const data = await request(`/api/${authMode === 'register' ? 'register' : 'login'}`, {
        method: 'POST', body: JSON.stringify({ username: usernameInput.trim(), password }),
      });
      const vault = await request(`/api/get-contacts/${encodeURIComponent(data.username)}`, {}, data.token);
      setCurrentUser(data.username); setSessionToken(data.token); setContactCount(vault.contacts.length); setExpiresAt(vault.expiresAt);
      setPassword(''); setConfirmPassword('');
      announce('success', authMode === 'register' ? 'Account created. Set your storage duration to begin.' : 'You’re signed in.');
    });
  };

  const toggleAuthMode = () => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setPassword(''); setConfirmPassword(''); setNotice(null); };

  const isVaultActive = expiresAt && new Date(expiresAt) > new Date();
  const totalPrice = (Number(retentionDays) || 0) * 20;

  const requireRetention = () => {
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Choose between 1 and 3650 days for contact storage.');
    return days;
  };

  const saveContacts = async (contacts) => {
    const data = await request('/api/sync-contacts', {
      method: 'POST', body: JSON.stringify({ contacts }),
    }, sessionToken);
    setContactCount(data.count); setExpiresAt(data.expiresAt);
    announce('success', `${data.count} contacts successfully saved to your active vault.`);
  };

  const syncContacts = () => run('sync', async () => {
    if (!isVaultActive) throw new Error('Your storage plan has expired. Please pay to renew.');
    if (!window.isSecureContext) throw new Error('Open the HTTPS version of this site to use phone contacts.');
    if (window.top !== window.self) throw new Error('Open this app as a normal page, not inside an embedded frame.');
    if (!('contacts' in navigator) || !('ContactsManager' in window) || typeof navigator.contacts?.select !== 'function') {
      throw new Error('This browser does not support the phone contact picker. Use Chrome on Android, or import a .vcf file containing your contacts.');
    }
    let selected;
    try { selected = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true }); }
    catch (error) {
      if (error.name === 'AbortError') { announce('info', 'Contact selection cancelled.'); return; }
      if (error.name === 'NotAllowedError') throw new Error('The browser blocked the picker. Tap Select contacts again and choose contacts in the browser dialog.');
      throw error;
    }
    if (!selected.length) { announce('info', 'No contacts selected.'); return; }
    await saveContacts(selected);
  });

  const importVCard = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return announce('error', 'That contact file is larger than 8 MB. Export a smaller set and try again.');
    return run('import', async () => {
      if (!isVaultActive) throw new Error('Your storage plan has expired. Please pay to renew.');
      const contacts = parseVCardFile(await file.text());
      if (!contacts.length) throw new Error('No contacts were found. Choose a valid .vcf contacts export.');
      await saveContacts(contacts);
    });
  };

  const exportContacts = () => run('export', async () => {
    const data = await request(`/api/get-contacts/${encodeURIComponent(currentUser)}`, {}, sessionToken);
    if (!data.contacts.length) { setContactCount(0); setExpiresAt(data.expiresAt); announce('info', 'Your vault is empty.'); return; }
    const blob = new Blob([contactsToVCard(data.contacts)], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${currentUser.replace(/[^a-z0-9_-]/gi, '_')}_contacts.vcf`;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setContactCount(data.contacts.length); setExpiresAt(data.expiresAt); announce('success', `Exported ${data.contacts.length} contacts as a vCard file.`);
  });

  const payWithPhonePe = () => run('pay', async () => {
    const days = requireRetention();
    const data = await request('/api/pay/initiate', {
      method: 'POST', body: JSON.stringify({ retentionDays: days })
    }, sessionToken);
    if (data.paymentUrl) {
      window.location.href = data.paymentUrl;
    } else {
      throw new Error('Failed to retrieve PhonePe payment URL.');
    }
  });

  const signOut = () => { setCurrentUser(''); setSessionToken(''); setContactCount(null); setExpiresAt(null); setNotice(null); };
  const expirationLabel = isVaultActive ? `Active until: ${new Date(expiresAt).toLocaleString()}` : 'Vault expired or inactive. Please pay to store contacts.';

  return <main className="page-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="Kinship home"><span className="brand-mark"><Icon name="user" size={19}/></span><span>kinship<span className="brand-dot">.</span></span></a><div className="topbar-note"><span className="secure-dot"/> Private by design</div></header>
    <div className="layout" id="top">
      <section className="intro"><div className="eyebrow"><span/> CONTACTS, WHEREVER YOU GO</div><h1>Your people,<br/><em>always close.</em></h1><p className="intro-copy">Keep a safe copy of your contacts and take them with you when you move to a new device.</p>
        <div className="feature-list"><div className="feature"><span className="feature-icon"><Icon name="shield"/></span><span><b>Your contacts stay yours</b><small>Sync only the contacts you choose.</small></span></div><div className="feature"><span className="feature-icon"><Icon name="sync"/></span><span><b>Move in a few taps</b><small>Select contacts or import a single file.</small></span></div></div>
        <div className="privacy-note"><Icon name="lock" size={17}/><span>Plans cost ₹20 per day. Days are locked during active periods.</span></div>
      </section>
      <section className="panel-wrap" aria-label="Contact vault">
        {!currentUser ? <form className="panel" onSubmit={handleAuth}>
          <div className="panel-heading"><span className="step-label">YOUR VAULT</span><span className="panel-icon"><Icon name="user"/></span></div>
          <h2>{authMode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p className="panel-copy">{authMode === 'register' ? 'Choose a username and password to get started.' : 'Sign in with your username and password.'}</p>
          <label className="field-label" htmlFor="username">Username</label><div className="input-wrap"><Icon name="user" size={18}/><input id="username" autoComplete="username" minLength={3} maxLength={40} pattern={"[A-Za-z0-9_.\\-]+"} value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} placeholder="Choose a username" required/></div>
          <label className="field-label password-label" htmlFor="password">Password</label><div className="input-wrap"><Icon name="lock" size={18}/><input id="password" type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required/></div>
          {authMode === 'register' && <><label className="field-label password-label" htmlFor="confirm-password">Confirm password</label><div className="input-wrap"><Icon name="lock" size={18}/><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" required/></div></>}
          <button className="button button-primary" type="submit" disabled={Boolean(busy)}>{busy === 'auth' ? <><span className="spinner"/> Please wait…</> : <>{authMode === 'register' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={17}/></>}</button>
          <p className="form-foot"><Icon name="lock" size={15}/> Passwords are stored as secure hashes.</p>
          <button className="auth-toggle" type="button" onClick={toggleAuthMode}>{authMode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
        </form> : <div className="panel">
          <div className="panel-heading"><span className="step-label">YOUR VAULT</span><button className="text-button" type="button" onClick={signOut}>Sign out</button></div>
          <h2>Hi, {currentUser}</h2><p className="panel-copy">Set your retention period (₹20/day) and complete payment to unlock contact storage.</p>
          
          <div className="retention-card">
            <label className="field-label" htmlFor="retention-days">Store contacts for (₹20 / day)</label>
            <div className="select-wrap">
              <input 
                id="retention-days" 
                type="number" 
                min="1" 
                max="3650" 
                step="1" 
                inputMode="numeric" 
                value={retentionDays} 
                disabled={isVaultActive || Boolean(busy)} 
                onChange={(event) => setRetentionDays(event.target.value)}
              />
              <span>days</span>
            </div>
            <p className="retention-help">
              {isVaultActive 
                ? 'Your days are locked until your current plan expires.' 
                : `Total cost: ₹${totalPrice} (${retentionDays || 0} days × ₹20)`}
            </p>
          </div>

          <div className="vault-ready">
            <span className="active-check"><Icon name={isVaultActive ? 'check' : 'lock'} size={16}/></span>
            <div>
              <b>{isVaultActive ? `${contactCount ?? 0} contacts in your vault` : 'Vault Payment Required'}</b>
              <small>{expirationLabel}</small>
            </div>
          </div>

          <div className="action-stack">
            {!isVaultActive ? (
              <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={payWithPhonePe}>
                {busy === 'pay' ? <><span className="spinner"/> Redirecting to PhonePe…</> : <><Icon name="card"/> Pay ₹{totalPrice} with PhonePe</>}
              </button>
            ) : (
              <>
                <button className="button button-primary" type="button" disabled={Boolean(busy)} onClick={syncContacts}>
                  {busy === 'sync' ? <><span className="spinner"/> Opening contacts…</> : <><Icon name="cloud"/> Select contacts</>}
                </button>
                <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => document.getElementById('vcard-import').click()}>
                  {busy === 'import' ? <><span className="spinner"/> Importing contacts…</> : <><Icon name="upload"/> Import contacts (.vcf)</>}
                </button>
                <input id="vcard-import" className="visually-hidden" type="file" accept=".vcf,text/vcard,text/x-vcard" onChange={importVCard} aria-label="Choose a vCard contacts file"/>
                <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={exportContacts}>
                  {busy === 'export' ? <><span className="spinner"/> Preparing file…</> : <><Icon name="download"/> Export contacts (.vcf)</>}
                </button>
              </>
            )}
          </div>
        </div>}
        {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.kind === 'success' ? <Icon name="check" size={17}/> : <span className="notice-mark">{notice.kind === 'error' ? '!' : 'i'}</span>}<span>{notice.message}</span></div>}
        <div className="support-note">Need help? <a href="mailto:support@example.com">Contact support <Icon name="arrow" size={13}/></a></div>
      </section>
    </div>
    <footer><span>© 2026 Kinship</span><span>Made for the moments between phones.</span><span><Icon name="lock" size={13}/> Your contacts, your choice</span></footer>
  </main>;
}

export default App;