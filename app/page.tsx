"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Bell, FileText, LayoutDashboard, Menu, Plane, Plus, Search, Settings,
  Trash2, Users, X, Eye, Paperclip,
} from 'lucide-react';
import {
  AdminSession, createAdminAccount, deleteFromSupabase, fetchFromSupabase, hasSupabaseConfig, saveToSupabase,
  signInAdmin, updateSupabase,
} from '../lib/supabase';

type Section = 'Overview' | 'Work Visas' | 'Blogs' | 'Submissions' | 'Settings';
type Visa = { id: string | number; country?: string; title?: string; visa_title?: string; status?: string };
type Blog = { id: string | number; title: string; category?: string; status?: string };
type Submission = {
  id: string | number;
  tracking_id?: string;
  customer_name?: string;
  name?: string;
  phone?: string;
  email?: string;
  nid?: string;
  date_of_birth?: string;
  education?: string;
  experience_years?: string;
  has_passport?: boolean;
  country?: string;
  visa?: string;
  visa_title?: string;
  documents?: Record<string, unknown> | unknown[];
  status?: string;
  created_at?: string;
};

export default function Dashboard() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [section, setSection] = useState<Section>('Overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [visas, setVisas] = useState<Visa[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  useEffect(() => {
    try { setSession(JSON.parse(sessionStorage.getItem('visabd_admin_session') ?? 'null')); }
    catch { setSession(null); }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    setLoading(true);
    Promise.allSettled([
      fetchFromSupabase<Visa>('work_visas', '?select=*&order=created_at.desc', session?.access_token),
      fetchFromSupabase<Blog>('blogs', '?select=*&order=created_at.desc', session?.access_token),
      fetchFromSupabase<Submission>('submissions', '?select=*&order=created_at.desc', session?.access_token),
    ]).then(([visa, blog, submission]) => {
      if (visa.status === 'fulfilled') setVisas(visa.value);
      if (blog.status === 'fulfilled') setBlogs(blog.value);
      if (submission.status === 'fulfilled') setSubmissions(submission.value);
      const failed = [visa, blog, submission].find((result) =>
        result.status === 'rejected' && String(result.reason).includes('does not exist')
      );
      if (failed) setMessage('Supabase is connected, but required VisaBD tables have not been created yet.');
    }).finally(() => setLoading(false));
  }, [session?.access_token]);

  const adminName = session?.user?.full_name || 'Administrator';
  const adminEmail = session?.user?.email || '';
  const adminInitials = adminName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AD';

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthLoading(true);
    setAuthError('');
    try {
      const nextSession = await signInAdmin(String(form.get('email')).trim(), String(form.get('password')));
      sessionStorage.setItem('visabd_admin_session', JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setAuthLoading(false);
    }

  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    const confirmPassword = String(form.get('confirmPassword'));
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const result = await createAdminAccount(
        String(form.get('fullName')).trim(),
        String(form.get('email')).trim(),
        password,
      );
      setAuthMode('login');
      setAuthError('');
      setAuthSuccess(result.linkedExistingAuthUser
        ? 'Existing Supabase Auth account linked as administrator. Sign in now.'
        : 'Account created and email verified automatically. Sign in now.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    sessionStorage.removeItem('visabd_admin_session');
    setSession(null);
  }

  async function saveVisa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const textValues = ['country', 'countryCode', 'title', 'categoryTag', 'region', 'minEducation', 'languageRequirement'];
    const numericOnlyText = textValues.find((name) => /^\d+$/.test(String(form.get(name) ?? '').trim()));
    try {
      if (numericOnlyText) throw new Error(`${numericOnlyText.replace(/([A-Z])/g, ' $1')} cannot contain only numbers.`);
      const requiredValues = ['slug', 'countrySlug', 'country', 'countryCode', 'region', 'title', 'categoryTag', 'processingTime', 'minEducation', 'languageRequirement', 'currency', 'overview'];
      const missingValue = requiredValues.find((name) => !String(form.get(name) ?? '').trim());
      if (missingValue) throw new Error(`${missingValue.replace(/([A-Z])/g, ' $1')} is required.`);
      const slug = String(form.get('slug')).trim().toLowerCase();
      const countrySlug = String(form.get('countrySlug')).trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(countrySlug)) {
        throw new Error('URL slugs must contain lowercase letters, numbers, and hyphens only.');
      }
    const image = String(form.get('image') ?? '').trim();
      if (image && !/^https?:\/\/.+/i.test(image)) throw new Error('Image URL must start with http:// or https://.');
      const list = (name: string) => String(form.get(name) ?? '').split('\n').map((v) => v.trim()).filter(Boolean);
      const title = String(form.get('title')).trim();
      const data = {
        slug, country_slug: countrySlug,
        country: String(form.get('country')).trim(), country_code: String(form.get('countryCode')).trim().toUpperCase(),
        flag: String(form.get('flag')).trim(), region: String(form.get('region')).trim(), title, visa_title: title,
        category_tag: String(form.get('categoryTag')).trim(), processing_time: String(form.get('processingTime')).trim(),
        average_salary: String(form.get('averageSalary')).trim(), validity: String(form.get('validity')).trim(),
        min_education: String(form.get('minEducation')).trim(), language_requirement: String(form.get('languageRequirement')).trim(),
        govt_fee: String(form.get('govtFee')).trim(), service_fee: String(form.get('serviceFee')).trim(),
        currency: String(form.get('currency')).trim(), image, overview: String(form.get('overview')).trim(),
        key_benefits: list('keyBenefits'), eligibility_checklist: list('eligibilityChecklist'),
        required_documents: list('requiredDocuments'), application_stages: list('applicationStages'), status: 'Published',
      };
      const saved = hasSupabaseConfig ? await saveToSupabase('work_visas', data, session?.access_token) : data;
      const savedRecordId = 'id' in saved ? saved.id : undefined;
      const savedId = typeof savedRecordId === 'string' || typeof savedRecordId === 'number' ? savedRecordId : Date.now();
      setVisas((items) => [{ ...data, ...saved, id: savedId }, ...items]);
      setMessage('Work visa saved successfully.');
      event.currentTarget.reset();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save work visa.';
      setMessage(text);
      throw new Error(text);
    }
  }

  async function saveBlog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    if (!title || /^\d+$/.test(title)) throw new Error('Blog title must be text and cannot contain only numbers.');
    const coverImage = String(form.get('coverImage') ?? '').trim();
    if (coverImage && !/^https?:\/\/.+/i.test(coverImage)) throw new Error('Cover image URL must start with http:// or https://.');
    const data = {
      title: String(form.get('title')), slug: String(form.get('slug')), category: String(form.get('category')),
      excerpt: String(form.get('excerpt')), content: String(form.get('content')), cover_image: String(form.get('coverImage')),
      author: { name: String(form.get('authorName')), role: String(form.get('authorRole')), avatar: String(form.get('authorAvatar')) },
      published_at: String(form.get('publishedAt')), reading_time: String(form.get('readingTime')), status: 'Draft',
    };
    try {
      const saved = hasSupabaseConfig ? await saveToSupabase('blogs', data, session?.access_token) : data;
      const savedRecordId = 'id' in saved ? saved.id : undefined;
      const savedId = typeof savedRecordId === 'string' || typeof savedRecordId === 'number' ? savedRecordId : Date.now();
      setBlogs((items) => [{ ...data, ...saved, id: savedId }, ...items]);
      setMessage('Blog draft saved successfully.');
      event.currentTarget.reset();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save blog.';
      setMessage(text);
      throw new Error(text);
    }
  }

  async function changeStatus(table: 'work_visas' | 'blogs' | 'submissions', id: string | number, status: string) {
    try {
      if (hasSupabaseConfig) await updateSupabase(table, id, { status }, session?.access_token);
      if (table === 'work_visas') setVisas((items) => items.map((item) => item.id === id ? { ...item, status } : item));
      if (table === 'blogs') setBlogs((items) => items.map((item) => item.id === id ? { ...item, status } : item));
      if (table === 'submissions') setSubmissions((items) => items.map((item) => item.id === id ? { ...item, status } : item));
      setMessage('Status updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update status.'); }
  }

  async function removeItem(table: 'work_visas' | 'blogs', id: string | number) {
    if (!window.confirm('Delete this item permanently?')) return;
    try {
      if (hasSupabaseConfig) await deleteFromSupabase(table, id, session?.access_token);
      if (table === 'work_visas') setVisas((items) => items.filter((item) => item.id !== id));
      else setBlogs((items) => items.filter((item) => item.id !== id));
      setMessage('Item deleted.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to delete item.'); }
  }

  const filteredSubmissions = useMemo(() => submissions.filter((item) =>
    Object.values(item).join(' ').toLowerCase().includes(search.toLowerCase())
  ), [submissions, search]);

  const navigation: { name: Section; icon: typeof LayoutDashboard }[] = [
    { name: 'Overview', icon: LayoutDashboard }, { name: 'Work Visas', icon: Plane },
    { name: 'Blogs', icon: FileText }, { name: 'Submissions', icon: Users }, { name: 'Settings', icon: Settings },
  ];

  if (!sessionReady) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">Loading...</main>;
  }

  if (!session) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <form onSubmit={authMode === 'login' ? login : register} className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        <p className="text-xl font-black text-slate-950">Visa<span className="text-amber-400">BD</span></p>
        <h1 className="mt-7 text-2xl font-black text-slate-950">{authMode === 'login' ? 'Admin sign in' : 'Create admin account'}</h1>
        <p className="mt-2 text-sm text-slate-500">{authMode === 'login' ? 'Use your VisaBD administrator account.' : 'Create the first administrator account. Additional accounts require approval.'}</p>
        {authError && <div role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{authError}</div>}
        {authSuccess && <div role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{authSuccess}</div>}
        {authMode === 'register' && <label className="mt-6 block text-sm font-bold text-slate-700">Full name
          <input name="fullName" required minLength={2} pattern=".*[^0-9].*" autoComplete="name" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" placeholder="Your full name" />
        </label>}
        <label className="mt-6 block text-sm font-bold text-slate-700">Email
          <input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" placeholder="admin@visabd.com" />
        </label>
        <label className="mt-4 block text-sm font-bold text-slate-700">Password
          <input name="password" type="password" required minLength={8} autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
        </label>
        {authMode === 'register' && <label className="mt-4 block text-sm font-bold text-slate-700">Confirm password
          <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
        </label>}
        <button disabled={authLoading} className="mt-6 w-full rounded-xl bg-blue-700 py-3 text-sm font-bold text-white disabled:opacity-60">{authLoading ? (authMode === 'login' ? 'Signing in...' : 'Creating account...') : (authMode === 'login' ? 'Sign in to dashboard' : 'Create admin account')}</button>
        <button type="button" onClick={() => { setAuthError(''); setAuthSuccess(''); setAuthMode(authMode === 'login' ? 'register' : 'login'); }} className="mt-4 w-full text-sm font-bold text-blue-700">
          {authMode === 'login' ? 'Create an admin account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </main>;
  }

  return (
    <>
    <div className="min-h-screen bg-slate-100 lg:flex">
      {menuOpen && <button aria-label="Close sidebar" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" />}
      <aside className={`${menuOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 px-4 py-5 text-white transition-transform lg:static lg:translate-x-0`}>
        <div className="px-3"><p className="text-xl font-black">Visa<span className="text-amber-400">BD</span></p><p className="mt-1 text-xs text-slate-400">Administration</p></div>
        <nav className="mt-10 space-y-1">{navigation.map(({ name, icon: Icon }) =>
          <button key={name} onClick={() => { setSection(name); setMenuOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold ${section === name ? 'bg-blue-700 shadow-lg' : 'text-slate-300 hover:bg-white/10'}`}><Icon className="size-5" />{name}</button>
        )}</nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <button aria-label="Open menu" onClick={() => setMenuOpen(true)} className="rounded-lg border p-2 lg:hidden"><Menu className="size-5" /></button>
          <div><h1 className="text-lg font-bold text-slate-900">{section}</h1><p className="hidden text-xs text-slate-400 sm:block">Manage the VisaBD platform</p></div>
          <button aria-label="Notifications" className="relative ml-auto rounded-full border p-2 text-slate-500"><Bell className="size-5" /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-red-500" /></button>
          <div className="relative">
            <button
              type="button"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 pr-2 text-left shadow-sm hover:bg-slate-50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-bold text-white">{adminInitials}</span>
              <span className="hidden max-w-40 sm:block">
                <span className="block truncate text-xs font-bold text-slate-900">{adminName}</span>
                <span className="block truncate text-[11px] text-slate-500">{adminEmail}</span>
              </span>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <div className="flex items-center gap-3 border-b border-slate-100 px-1 pb-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-700 text-sm font-bold text-white">{adminInitials}</span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{adminName}</p>
                    <p className="truncate text-xs text-slate-500">{adminEmail}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); setSection('Settings'); }}
                  className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Profile settings
                </button>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); logout(); }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {!hasSupabaseConfig && <Notice tone="warning">Supabase is not configured. Restart the server after the environment variables are loaded.</Notice>}
          {message && <Notice onClose={() => setMessage('')}>{message}</Notice>}

          {section === 'Overview' && <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Work visas" value={visas.length} note="Visa programs" icon={Plane} />
              <Stat label="Blog posts" value={blogs.length} note="Published content" icon={FileText} />
              <Stat label="Applications" value={submissions.length} note="Total submissions" icon={Users} />
              <Stat label="Needs review" value={submissions.filter((item) => item.status !== 'Approved' && item.status !== 'Rejected').length} note="Pending action" icon={Bell} />
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
              <Panel title="Recent applications" action={<button onClick={() => setSection('Submissions')} className="text-xs font-bold text-blue-700">View all</button>}>
                {loading ? <EmptyState>Loading applications...</EmptyState> : <SubmissionTable items={submissions.slice(0, 5)} onSelect={setSelectedSubmission} />}
              </Panel>
              <Panel title="Content overview">
                <SummaryRow label="Published visas" count={visas.filter((v) => v.status === 'Published').length} color="bg-blue-500" />
                <SummaryRow label="Draft visas" count={visas.filter((v) => v.status !== 'Published').length} color="bg-amber-400" />
                <SummaryRow label="Published blogs" count={blogs.filter((b) => b.status === 'Published').length} color="bg-emerald-500" />
              </Panel>
            </div>
          </>}

          {section === 'Work Visas' && <Manager title="Work visas" formTitle="Add work visa" submitLabel="Save work visa" onSubmit={saveVisa} fields={<VisaFields />} items={visas} rows={visas.map((v) => [String(v.country ?? ''), String(v.title ?? v.visa_title ?? ''), String(v.status ?? 'Draft')])} onStatus={(id, status) => changeStatus('work_visas', id, status)} onDelete={(id) => removeItem('work_visas', id)} />}
          {section === 'Blogs' && <Manager title="Blogs" formTitle="Add blog post" submitLabel="Save blog draft" onSubmit={saveBlog} fields={<BlogFields />} items={blogs} rows={blogs.map((b) => [b.title, String(b.category ?? 'General'), String(b.status ?? 'Draft')])} onStatus={(id, status) => changeStatus('blogs', id, status)} onDelete={(id) => removeItem('blogs', id)} />}

          {section === 'Submissions' && <Panel title={`${filteredSubmissions.length} submissions`}>
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 px-3 sm:max-w-sm"><Search className="size-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, applicant or country" className="w-full py-3 text-sm outline-none" /></div>
            <SubmissionTable items={filteredSubmissions} editable onSelect={setSelectedSubmission} onStatus={(id, status) => changeStatus('submissions', id, status)} />
          </Panel>}

          {section === 'Settings' && <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Admin profile"><div className="space-y-4"><Field name="displayName" label="Display name" defaultValue={adminName} /><Field name="email" label="Email" defaultValue={adminEmail} /><button className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white">Save profile</button></div></Panel>
          </div>}
        </main>
      </div>
    </div>
    {selectedSubmission && <SubmissionDetails submission={selectedSubmission} onClose={() => setSelectedSubmission(null)} />}
    </>
  );
}

function Notice({ children, tone = 'info', onClose }: { children: ReactNode; tone?: 'info' | 'warning'; onClose?: () => void }) {
  return <div className={`mb-5 flex items-start justify-between rounded-xl border p-3 text-sm ${tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-100 bg-blue-50 text-blue-800'}`}><span>{children}</span>{onClose && <button aria-label="Dismiss" onClick={onClose}><X className="size-4" /></button>}</div>;
}

function Stat({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: typeof Bell }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p></div><div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-700"><Icon className="size-5" /></div></div><p className="mt-3 text-xs text-slate-400">{note}</p></div>;
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h2 className="font-bold text-slate-900">{title}</h2>{action}</div>{children}</section>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-slate-400">{children}</div>;
}

function SummaryRow({ label, count, color }: { label: string; count: number; color: string }) {
  return <div className="mb-5 last:mb-0"><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">{label}</span><b>{count}</b></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, count * 12)}%` }} /></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-slate-100 py-3 text-sm"><span className="text-slate-500">{label}</span><b className="text-emerald-700">{value}</b></div>;
}

function Field({ name, label, defaultValue = '', type = 'text', hint = '' }: { name: string; label: string; defaultValue?: string; type?: string; hint?: string }) {
  return <label className="block text-xs font-bold text-slate-500">{label}<input name={name} type={type} defaultValue={defaultValue} required pattern={type === 'text' ? '.*[^0-9].*' : undefined} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500" />{hint && <span className="mt-1.5 block font-normal text-slate-400">{hint}</span>}</label>;
}

function TextArea({ name, label, rows = 4, hint = '' }: { name: string; label: string; rows?: number; hint?: string }) {
  return <label className="block text-xs font-bold text-slate-500">{label}<textarea name={name} required rows={rows} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal text-slate-900 outline-none focus:border-blue-500" />{hint && <span className="mt-1.5 block font-normal text-slate-400">{hint}</span>}</label>;
}

function Manager({ title, formTitle, submitLabel, onSubmit, fields, items, rows, onStatus, onDelete }: {
  title: string; formTitle: string; submitLabel: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  fields: ReactNode; items: { id: string | number; status?: string }[]; rows: string[][];
  onStatus: (id: string | number, status: string) => void; onDelete: (id: string | number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  return <>
    <div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900">{title}</h2><p className="text-sm text-slate-500">{items.length} total records</p></div><button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white"><Plus className="size-4" />{formTitle}</button></div>
    {showForm && <Panel title={formTitle}>
      <form onSubmit={async (event) => {
        if (saving) return;
        setSaving(true);
        try {
          await onSubmit(event);
          setShowForm(false);
        } catch {
          // Save handlers display the error in the dashboard notice.
        } finally {
          setSaving(false);
        }
      }}>
        <fieldset disabled={saving} className="space-y-0">
          {fields}
          <button type="submit" className="mt-5 inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-400">
            {saving && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {saving ? 'Saving...' : submitLabel}
          </button>
        </fieldset>
      </form>
    </Panel>}
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-400"><tr>{(title === 'Blogs' ? ['Title', 'Category', 'Status'] : ['Country', 'Work visa', 'Status']).map((header) => <th key={header} className="px-5 py-4">{header}</th>)}<th className="px-5 py-4">Actions</th></tr></thead><tbody>{rows.map((row, index) => {
      const item = items[index];
      return <tr key={String(item?.id ?? index)} className="border-t border-slate-100"><>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-5 py-4">{cellIndex === 2 ? <select value={item?.status ?? 'Draft'} onChange={(event) => onStatus(item.id, event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"><option>Draft</option><option>Published</option><option>Archived</option></select> : cell}</td>)}</><td className="px-5 py-4"><button aria-label="Delete item" onClick={() => onDelete(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="size-4" /></button></td></tr>;
    })}</tbody></table>{rows.length === 0 && <EmptyState>No records found.</EmptyState>}</div></div>
  </>;
}

function SubmissionTable({ items, editable = false, onStatus, onSelect }: { items: Submission[]; editable?: boolean; onStatus?: (id: string | number, status: string) => void; onSelect?: (item: Submission) => void }) {
  if (!items.length) return <EmptyState>No applications found.</EmptyState>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="py-3">Tracking ID</th><th className="py-3">Applicant</th><th className="py-3">Country / Visa</th><th className="py-3">Status</th><th className="py-3 text-right">Details</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.id)} className="border-t border-slate-100"><td className="py-4 font-mono text-xs font-bold">{item.tracking_id ?? item.id}</td><td className="py-4 font-bold">{item.customer_name ?? item.name ?? 'Unknown'}</td><td className="py-4 text-slate-500">{item.country ?? ''} {item.visa_title ?? item.visa ? `· ${item.visa_title ?? item.visa}` : ''}</td><td className="py-4">{editable ? <select value={item.status ?? 'Under Review'} onChange={(event) => onStatus?.(item.id, event.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"><option>Under Review</option><option>Documents Required</option><option>Approved</option><option>Rejected</option></select> : <Status value={item.status} />}</td><td className="py-4 text-right">  <button type="button" onClick={() => onSelect?.(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Eye className="size-3.5" /> View</button></td></tr>)}</tbody></table></div>;
}

function SubmissionDetails({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const documents = submission.documents && !Array.isArray(submission.documents) ? Object.entries(submission.documents) : [];
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const formatName = (name: string) => name.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  useEffect(() => {
    let cancelled = false;
    const loadUrls = async () => {
      const urls: Record<string, string> = {};
      await Promise.all(documents.map(async ([name, value]) => {
        const document = typeof value === 'object' && value !== null ? value as { path?: string } : null;
        if (!document?.path) return;
        try {
          const response = await fetch(`/api/submissions/document?path=${encodeURIComponent(document.path)}`);
          const result = await response.json() as { url?: string };
          if (response.ok && result.url) urls[name] = result.url;
        } catch {
          // Keep legacy and unavailable documents out of the preview.
        }

      }));
      if (!cancelled) setDocumentUrls(urls);
    };
    void loadUrls();
    return () => { cancelled = true; };
  }, [submission.id, submission.documents]);
  const openDocument = async (document: { path: string; name?: string; type?: string }) => {
    const response = await fetch(`/api/submissions/document?path=${encodeURIComponent(document.path)}`);
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || 'Document could not be opened.');
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };
  const downloadDocument = async (document: { path: string; name?: string; type?: string }) => {
    const response = await fetch(`/api/submissions/document?path=${encodeURIComponent(document.path)}`);
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || 'Document could not be downloaded.');
    const file = await fetch(result.url);
    const blob = await file.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = objectUrl;
    link.download = document.name || document.path.split('/').pop() || 'document';
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  return <div className="fixed inset-0 z-[60] flex justify-end bg-slate-950/45" role="dialog" aria-modal="true" aria-label="Submission details">
    <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close submission details" />
    <div className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Application</p><h2 className="mt-1 font-mono text-xl font-black text-slate-950">{submission.tracking_id ?? submission.id}</h2></div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="size-5" /></button>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Detail label="Applicant" value={submission.customer_name ?? submission.name} />
        <Detail label="Phone" value={submission.phone} />
        <Detail label="Email" value={submission.email} />
        <Detail label="NID" value={submission.nid} />
        <Detail label="Date of birth" value={submission.date_of_birth} />
        <Detail label="Education" value={submission.education} />
        <Detail label="Experience" value={submission.experience_years} />
        <Detail label="Passport" value={submission.has_passport ? 'Yes' : 'No'} />
        <Detail label="Country" value={submission.country} />
        <Detail label="Visa" value={submission.visa_title ?? submission.visa} />
        <Detail label="Status" value={<Status value={submission.status} />} />
        <Detail label="Submitted" value={submission.created_at ? new Date(submission.created_at).toLocaleString() : undefined} />
      </div>
      <div className="mt-8"><h3 className="flex items-center gap-2 font-bold text-slate-900"><Paperclip className="size-4 text-blue-700" /> Submitted documents</h3>
        {documents.length ? <div className="mt-3 space-y-2">{documents.map(([name, value]) => {
          const document = typeof value === 'object' && value !== null ? value as { path?: string; name?: string; type?: string } : null;
          const isLegacyFilename = typeof value === 'string';
          return <div key={name} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start gap-3"><FileText className="mt-0.5 size-4 shrink-0 text-slate-400" /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{formatName(name)}</p>{isLegacyFilename ? <><p className="mt-1 break-all text-xs text-slate-500">Original file name: {value}</p><p className="mt-1 text-xs text-amber-700">Image unavailable — this submission stored only the file name.</p></> : document?.path ? <p className="mt-1 break-all text-xs text-slate-500">{document.name}</p> : <p className="mt-1 text-xs text-amber-600">File unavailable</p>}</div></div>
            {typeof document?.type === 'string' && document.type.startsWith('image/') && documentUrls[name] && <button type="button" onClick={() => window.open(documentUrls[name], '_blank', 'noopener,noreferrer')} className="mt-3 block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><img src={documentUrls[name]} alt={document.name || formatName(name)} className="max-h-64 w-full object-contain" /></button>}
            {document?.path && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void openDocument(document as { path: string })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50">View</button><button type="button" onClick={() => void downloadDocument(document as { path: string })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Download</button></div>}
          </div>;
        })}</div> : <EmptyState>No documents were submitted.</EmptyState>}
      </div>
    </div>
  </div>;
}

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Status({ value }: { value?: string }) {
  const colors = value === 'Approved' ? 'bg-emerald-50 text-emerald-700' : value === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors}`}>{value ?? 'Under Review'}</span>;
}

function VisaFields() {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <Field name="slug" label="URL slug" hint="Lowercase, for example japan-work-visa" /><Field name="countrySlug" label="Country URL slug" hint="Lowercase route value, for example japan" /><Field name="country" label="Country" hint="Official country name, not a number" />
    <Field name="countryCode" label="Country code" hint="Two letters, for example JP" /><Field name="flag" label="Flag emoji" hint="For example: 🇯🇵" /><label className="text-xs font-bold text-slate-500">Region<select name="region" required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"><option>Asia</option><option>Middle East</option><option>Europe</option><option>Africa</option><option>Americas</option></select><span className="mt-1.5 block font-normal text-slate-400">Choose the applicant destination region.</span></label>
    <Field name="title" label="Visa title" hint="Clear applicant-facing title, for example Skilled Worker Visa" /><Field name="categoryTag" label="Category tag" hint="Short category, for example Skilled Worker or Seasonal Work" /><Field name="processingTime" label="Processing time" hint="Estimated duration, for example 12-16 weeks" />
    <Field name="averageSalary" label="Average salary" hint="Typical annual income, for example EUR 38,000/year" /><Field name="validity" label="Validity" hint="How long the visa remains valid, for example 2 years" /><Field name="minEducation" label="Minimum education" hint="Example: Bachelor's degree or equivalent experience" />
    <Field name="languageRequirement" label="Language requirement" hint="Example: IELTS 5.5 or equivalent" /><Field name="govtFee" label="Government fee" hint="Official government charge, for example 300" /><Field name="serviceFee" label="Service fee" hint="VisaBD service charge, for example 150" />
    <Field name="currency" label="Currency" hint="Currency code used for fees, for example EUR or GBP" />    <div className="lg:col-span-2"><Field name="image" label="Image URL" type="url" hint="Full https:// image address ending with .jpg, .png, or .webp" /></div>
    <div className="sm:col-span-2 lg:col-span-3"><TextArea name="overview" label="Overview" rows={4} hint="Briefly explain who this visa is for and what applicants can do with it." /></div>
    <TextArea name="keyBenefits" label="Key benefits (one per line)" rows={5} hint="Enter each benefit on a new line, for example Family sponsorship." /><TextArea name="eligibilityChecklist" label="Eligibility checklist (one per line)" rows={5} hint="Enter each requirement on a new line, for example Valid passport." /><TextArea name="requiredDocuments" label="Required documents (one per line)" rows={5} hint="Enter each document on a new line, for example Employment contract." />
    <div className="sm:col-span-2 lg:col-span-3"><TextArea name="applicationStages" label="Application stages (one per line)" rows={5} hint="Enter each step in order, starting with Submit application and ending with Visa decision." /></div>
  </div>;
}

function BlogFields() {
  return <div className="grid gap-4 sm:grid-cols-2"><Field name="slug" label="URL slug" hint="Lowercase, words separated by hyphens, for example japan-blog" /><Field name="title" label="Blog title" hint="For example: How to Apply for a Japan Work Visa" /><Field name="category" label="Category" hint="For example: Visa Guide" /><Field name="coverImage" label="Cover image URL" type="url" hint="Full https:// image address, for example https://example.com/japan-visa.jpg" /><TextArea name="excerpt" label="Summary" rows={3} hint="Brief overview shown in article cards, for example: A complete guide to Japan work visa requirements and application steps." /><TextArea name="content" label="Content" rows={8} hint="Write one paragraph per line. For example: Japan offers several work visa options. Check the requirements before applying." /><Field name="authorName" label="Author name" hint="Full name displayed below the article, for example: Sarah Khan" /><Field name="authorRole" label="Author role" hint="For example: Visa Consultant" /><Field name="authorAvatar" label="Author avatar URL" type="url" hint="Full https:// image address, for example https://example.com/sarah.jpg" /><Field name="publishedAt" label="Published date" type="date" hint="Date this article should be published, for example: 2026-10-31" /><Field name="readingTime" label="Reading time" hint="For example: 5 min read" /></div>;
}
