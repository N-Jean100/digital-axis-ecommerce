import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AddProduct from './AddProduct.jsx';
import ProductList from './ProductList.jsx';
import Messages from './Messages.jsx';
import AuthEntry from './AuthEntry.jsx';
import ChatWidget from './ChatWidget.jsx';
import { Icon } from './icons.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const PRODUCTS_URL = `${API_URL}/products`;
const SETTINGS_KEY = 'digital-axis-settings';
const NOTIFICATIONS_KEY = 'digital-axis-notifications';

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || error.message || fallback;
}

function Sidebar({ activeView, onNavigate, apiStatus, user }) {
  const links = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'products', label: 'Products', icon: 'box' },
  ];
  if (user?.role === 'customer' || user?.role === 'vendor') {
    links.splice(2, 0, { id: 'messages', label: 'Messages', icon: 'users' });
  }
  if (user?.role === 'vendor' || user?.role === 'admin') {
    links.push({ id: 'add-product', label: 'Add product', icon: 'plus' });
  }

  return (
    <aside className="sidebar desktop-sidebar sticky top-0 flex h-screen flex-col px-4 py-6">
      <div className="brand-row mb-10 flex items-center gap-3 px-2">
        <div className="brand-mark"><span className="text-lg font-black">D</span></div>
        <div className="brand-copy leading-tight">
          <div className="brand-word text-[15px] font-extrabold">DIGITAL <span className="font-medium">Axis</span></div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.17em] text-[var(--muted)]">Commerce workspace</div>
        </div>
      </div>

      <div className="sidebar-caption mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">Workspace</div>
      <nav className="flex flex-col gap-1" aria-label="Main navigation">
        {links.map((link) => (
          <button className={`nav-link rounded-xl px-3 py-3 text-[13px] ${activeView === link.id ? 'is-active' : ''}`} key={link.id} onClick={() => onNavigate(link.id)} aria-current={activeView === link.id ? 'page' : undefined}>
            <Icon className="nav-icon" name={link.icon} />
            <span className="nav-copy">{link.label}</span>
            {link.id === 'add-product' && <span className="nav-copy ml-auto text-[10px] text-[var(--muted)]">NEW</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom mt-auto rounded-2xl bg-[var(--mint)] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-[var(--ink)]"><span className={`status-dot ${apiStatus === 'Unavailable' ? '!bg-[#db744d]' : ''}`} /> API {apiStatus.toLowerCase()}</div>
        <p className="sidebar-note text-[11px] leading-relaxed text-[var(--muted)]">{apiStatus === 'Unavailable' ? 'The catalog service is not responding.' : 'Catalog status updates from the live API.'}</p>
      </div>
      <div className="brand-copy mt-4 px-2 text-[10px] text-[var(--muted)]">Built for your next move ↗</div>
    </aside>
  );
}

function Topbar({ activeView, onSettings, notifications, onToggleNotifications, notificationsOpen, onMarkRead, onDismiss, onClear, apiStatus, onAdmin, onLogout, user }) {
  const unreadCount = notifications.filter((item) => !item.read).length;
  const userInitials = user?.name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'DA';
  return (
    <header className="topbar sticky top-0 z-20 flex items-center justify-between gap-2 px-8 backdrop-blur-md max-sm:px-3">
      <div className="hidden items-center gap-3 sm:flex">
        <div className="text-[12px] font-medium text-[var(--muted)]">Workspace <span className="mx-2 text-[#b4bdb5]">/</span><span className="text-[var(--ink)]">Digital Axis</span></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="mr-2 hidden items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-[11px] text-[var(--muted)] sm:flex">
          <span className="status-dot" />           {apiStatus}
        </div>
        <div className="relative">
          <button className="icon-button relative rounded-xl" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen} onClick={onToggleNotifications}>
            <Icon name="bell" />
            {unreadCount > 0 && <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full border border-[var(--panel)] bg-[#e27b4d]" />}
          </button>
          {notificationsOpen && (
            <div className="popover absolute right-0 top-[calc(100%+12px)] z-40 w-[min(360px,calc(100vw-28px))] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]" role="dialog" aria-label="Notifications">
              <div className="flex items-start justify-between border-b border-[var(--line)] px-5 py-4">
                <div><h2 className="text-[15px] font-bold">Notifications</h2><p className="mt-1 text-[11px] text-[var(--muted)]">{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</p></div>
                {notifications.length > 0 && <button className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]" onClick={onClear}>Clear all</button>}
              </div>
              <div className="max-h-[340px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-6 py-10 text-center">
                    <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--mint)] text-[var(--ink)]"><Icon name="bell" /></div>
                    <p className="text-[13px] font-semibold">Nothing new</p><p className="mt-1 text-[11px] text-[var(--muted)]">Updates from your workspace will show up here.</p>
                  </div>
                ) : notifications.map((item) => (
                  <article key={item.id} className={`border-b border-[var(--line)] px-5 py-4 last:border-0 ${item.read ? 'opacity-70' : ''}`}>
                    <div className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? 'bg-[#bdc5be]' : 'bg-[#92c442]'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold">{item.title}</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{item.body}</p>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted)]">
                          <time>{new Date(item.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>
                          <span className="flex gap-3">
                            {!item.read && <button className="font-semibold hover:text-[var(--ink)]" onClick={() => onMarkRead(item.id)}>Mark read</button>}
                            <button className="hover:text-[var(--ink)]" aria-label={`Dismiss ${item.title}`} onClick={() => onDismiss(item.id)}>Dismiss</button>
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="border-t border-[var(--line)] px-5 py-3 text-center text-[10px] text-[var(--muted)]">Only real workspace activity appears here.</div>
            </div>
          )}
        </div>
        <button className="icon-button rounded-xl" aria-label="Open settings" onClick={onSettings}><Icon name="settings" /></button>
        {user?.role === 'admin' && (
          <button
            type="button"
            className="primary-action-button inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[10px] font-bold transition hover:-translate-y-0.5 sm:gap-2 sm:px-3 sm:text-[11px]"
            aria-current={activeView === 'admin' ? 'page' : undefined}
            aria-label="Open admin catalog overview"
            title="Admin"
            onClick={onAdmin}
          >
            <Icon name="users" size={15} />
            <span>Admin</span>
          </button>
        )}
        <div className="ml-1 hidden max-w-[150px] text-right sm:block">
          <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{user?.name || 'Your account'}</p>
          <p className="text-[10px] capitalize text-[var(--muted)]">{user?.role || 'account'}</p>
        </div>
        <div aria-hidden="true" className="ml-1 hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[11px] font-bold text-[var(--panel)] sm:grid">{userInitials}</div>
        <button
          type="button"
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#d9b3a5] bg-[var(--panel)] px-2 text-[10px] font-semibold text-[#a45136] transition hover:bg-[#fff3ee] sm:gap-2 sm:px-3 sm:text-[11px]"
          aria-label="Log out"
          title="Log out"
          onClick={onLogout}
        >
          <Icon name="logout" size={15} />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
}

function SettingsDialog({ settings, onChange, onClose }) {
  useEffect(() => {
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="scrim fixed inset-0 z-50 grid place-items-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog w-full max-w-[460px] rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow)]" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="mb-6 flex items-start justify-between">
          <div><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--mint)]"><Icon name="settings" /></span><h2 id="settings-title" className="text-xl font-bold tracking-tight">Your preferences</h2><p className="mt-1 text-[12px] text-[var(--muted)]">Make the workspace feel like yours.</p></div>
          <button className="icon-button rounded-xl" aria-label="Close settings" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="divide-y divide-[var(--line)]">
          <div className="flex items-center justify-between py-4">
            <div><p className="text-[13px] font-semibold">Appearance</p><p className="mt-1 text-[11px] text-[var(--muted)]">Choose a light or dark workspace.</p></div>
            <div className="flex rounded-xl border border-[var(--line)] p-1">
              {['light', 'dark'].map((theme) => <button key={theme} onClick={() => onChange({ ...settings, theme })} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold capitalize ${settings.theme === theme ? 'bg-[var(--ink)] text-[var(--panel)]' : 'text-[var(--muted)]'}`} aria-pressed={settings.theme === theme}><Icon name={theme === 'light' ? 'sun' : 'moon'} size={14} />{theme}</button>)}
            </div>
          </div>
          {[
            { key: 'reducedMotion', title: 'Reduce motion', detail: 'Use quieter transitions throughout.' },
            { key: 'compact', title: 'Compact density', detail: 'Fit more product details on screen.' },
          ].map((setting) => (
            <label key={setting.key} className="flex cursor-pointer items-center justify-between gap-4 py-4">
              <span><span className="block text-[13px] font-semibold">{setting.title}</span><span className="mt-1 block text-[11px] text-[var(--muted)]">{setting.detail}</span></span>
              <input className="h-[18px] w-[18px] accent-[#8dbb3d]" type="checkbox" checked={settings[setting.key]} onChange={(event) => onChange({ ...settings, [setting.key]: event.target.checked })} />
            </label>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-[var(--paper)] px-4 py-3 text-[11px] text-[var(--muted)]"><span>Preferences save automatically</span><Icon name="check" size={15} /></div>
      </section>
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);
  if (!toast) return null;
  return (
    <div className="toast-enter fixed bottom-5 right-5 z-[60] flex max-w-[min(420px,calc(100vw-40px))] items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)]" role="status">
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${toast.type === 'error' ? 'bg-[#fff0eb] text-[#ad4b28]' : 'bg-[var(--mint)] text-[#51752e]'}`}><Icon name={toast.type === 'error' ? 'close' : 'check'} size={15} /></span>
      <div className="flex-1"><p className="text-[12px] font-bold">{toast.title}</p><p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{toast.message}</p></div>
      <button className="text-[var(--muted)] hover:text-[var(--ink)]" aria-label="Dismiss notification" onClick={onDismiss}><Icon name="close" size={15} /></button>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]"><span className="h-px w-5 bg-[#a4c46e]" />{eyebrow}</div><h1 className="text-[clamp(27px,4vw,38px)] font-semibold leading-[1.1] tracking-[-.045em]">{title}</h1><p className="mt-2 max-w-[580px] text-[13px] leading-relaxed text-[var(--muted)]">{description}</p></div>
      {action}
    </div>
  );
}

function Dashboard({ onLogout, user }) {
  const [activeView, setActiveView] = useState('overview');
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [settings, setSettings] = useState(() => ({ theme: 'dark', reducedMotion: false, compact: false, ...readStorage(SETTINGS_KEY, {}) }));
  const [notifications, setNotifications] = useState(() => {
    const stored = readStorage(NOTIFICATIONS_KEY, []);
    return Array.isArray(stored) ? stored : [];
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [startConversation, setStartConversation] = useState(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductsError('');
    try {
      const response = await axios.get(PRODUCTS_URL);
      setProducts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setProductsError(getErrorMessage(error, 'Could not load products from the service.'));
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences remain usable for this session. */ }
  }, [settings]);
  useEffect(() => {
    try { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications)); } catch { /* Notifications remain usable for this session. */ }
  }, [notifications]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'all' || product.category === category;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchesQuery = !normalizedQuery || [product.name, product.description, product.category].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
    return matchesCategory && matchesQuery;
  }), [products, category, query]);
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(), [products]);

  const pushNotification = useCallback((title, body) => {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, body, time: new Date().toISOString(), read: false };
    setNotifications((current) => [item, ...current].slice(0, 30));
    setToast({ title, message: body, type: 'success' });
  }, []);
  const reportError = useCallback((title, message) => {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, body: message, time: new Date().toISOString(), read: false };
    setNotifications((current) => [item, ...current].slice(0, 30));
    setToast({ title, message, type: 'error' });
  }, []);
  const handleProductAdded = useCallback((product, message) => {
    if (product?._id) setProducts((current) => [product, ...current.filter((item) => item._id !== product._id)]);
    else loadProducts();
    pushNotification('Product added', message || 'Your product was added to the catalog.');
    setActiveView('products');
  }, [loadProducts, pushNotification]);
  const handleNavigate = (view) => {
    if (view === 'admin' && user?.role !== 'admin') return;
    if (view === 'add-product' && user?.role !== 'vendor' && user?.role !== 'admin') return;
    setActiveView(view);
    setNotificationsOpen(false);
    if (view === 'overview') { setQuery(''); setCategory('all'); }
    window.scrollTo({ top: 0, behavior: settings.reducedMotion ? 'auto' : 'smooth' });
  };
  const handleContactSeller = (product) => {
    setStartConversation({ id: `${product._id}-${Date.now()}`, productId: product._id });
    handleNavigate('messages');
  };

  const canManageProducts = user?.role === 'vendor' || user?.role === 'admin';
  const productAction = canManageProducts ? <button onClick={() => handleNavigate('add-product')} className="primary-action-button inline-flex items-center gap-2 rounded-xl px-4 py-3 text-[12px] font-semibold transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none"><Icon name="plus" size={16} /> Add a product</button> : undefined;
  const visibleProductsCount = products.length;
  const apiStatus = loadingProducts ? 'Syncing' : productsError ? 'Unavailable' : 'Connected';
  return (
    <div className={`app-shell flex min-h-screen ${settings.compact ? 'compact-density' : ''}`}>
      <Sidebar activeView={activeView} onNavigate={handleNavigate} apiStatus={apiStatus} user={user} />
      <div className="main-area flex min-h-screen flex-1 flex-col">
        <Topbar activeView={activeView} notifications={notifications} notificationsOpen={notificationsOpen} onToggleNotifications={() => setNotificationsOpen((open) => !open)} onSettings={() => setSettingsOpen(true)} onMarkRead={(id) => setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item))} onDismiss={(id) => setNotifications((items) => items.filter((item) => item.id !== id))} onClear={() => setNotifications([])} apiStatus={apiStatus} onAdmin={() => handleNavigate('admin')} onLogout={onLogout} user={user} />
        <main key={activeView} className="content-wrap page-enter flex-1 px-9 py-9 max-sm:py-7">
          {activeView === 'overview' && (
            <>
              <PageHeading eyebrow="Your commerce workspace" title="A clearer view of your catalog." description="Your products, ready to manage. Keep your catalog moving with one focused workspace." action={productAction} />
              <div className="mb-8 grid gap-4 md:grid-cols-[1.4fr_.8fr]">
                <section className="relative overflow-hidden rounded-3xl bg-[#111b2c] p-6 text-white md:p-8">
                  <div className="absolute -right-8 -top-12 h-52 w-52 rounded-full border-[35px] border-white/[.04]" /><div className="absolute -right-1 top-10 h-24 w-24 rounded-full border border-[#c8f169]/25" />
                  <div className="relative max-w-[530px]">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#d9ebc3]"><Icon name="sparkle" size={13} /> Catalog pulse</span>
                    <h2 className="mt-5 text-[25px] font-semibold leading-tight tracking-[-.04em] md:text-[30px]">Good things start with a well-kept catalog.</h2>
                    <p className="mt-3 max-w-[420px] text-[12px] leading-relaxed text-white/65">Add, review, and organize the products you’ve connected to DIGITAL Axis.</p>
                    <button onClick={() => handleNavigate('products')} className="primary-action-button mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[11px] font-bold transition">Explore products <Icon name="arrow" size={14} /></button>
                  </div>
                  <div className="absolute bottom-7 right-8 hidden text-right sm:block"><div className="text-[38px] font-semibold leading-none tracking-[-.06em]">{loadingProducts ? '—' : visibleProductsCount}</div><div className="mt-2 text-[10px] uppercase tracking-[.15em] text-white/55">products connected</div></div>
                </section>
                <section className="flex flex-col justify-between rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6">
                  <div><div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--mint)]"><Icon name="box" /></div><p className="text-[11px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">Catalog status</p><div className="mt-2 flex items-center gap-2 text-[18px] font-semibold tracking-[-.03em]"><span className="status-dot" />{loadingProducts ? 'Syncing catalog' : productsError ? 'Needs attention' : 'Connected'}</div></div>
                  <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4 text-[11px]"><span className="text-[var(--muted)]">{productsError ? 'Service response' : 'Live catalog items'}</span><span className="font-semibold">{productsError ? 'Check connection' : loadingProducts ? 'Loading…' : visibleProductsCount}</span></div>
                </section>
              </div>
              <ProductList products={filteredProducts} loading={loadingProducts} error={productsError} onRetry={loadProducts} onAddProduct={canManageProducts ? () => handleNavigate('add-product') : undefined} onContactSeller={handleContactSeller} userRole={user?.role} query={query} onQueryChange={setQuery} category={category} onCategoryChange={setCategory} categories={categories} title="Your products" subtitle="A live view of the items available in your catalog." showFilters={false} />
            </>
          )}
          {activeView === 'products' && (
            <>
              <PageHeading eyebrow="Catalog management" title="Products" description="Search and browse the products returned by your catalog service." action={productAction} />
              <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4"><div className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">Catalog items</div><div className="mt-2 text-[23px] font-semibold tracking-[-.04em]">{loadingProducts ? '—' : products.length}</div></div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4"><div className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">Categories</div><div className="mt-2 text-[23px] font-semibold tracking-[-.04em]">{loadingProducts ? '—' : categories.length}</div></div>
                <div className="col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4 sm:col-span-1"><div className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">API status</div><div className="mt-2 flex items-center gap-2 text-[13px] font-semibold"><span className={`status-dot ${productsError ? '!bg-[#db744d]' : ''}`} />{loadingProducts ? 'Syncing' : productsError ? 'Unavailable' : 'Connected'}</div></div>
              </div>
              <ProductList products={filteredProducts} loading={loadingProducts} error={productsError} onRetry={loadProducts} onAddProduct={canManageProducts ? () => handleNavigate('add-product') : undefined} onContactSeller={handleContactSeller} userRole={user?.role} query={query} onQueryChange={setQuery} category={category} onCategoryChange={setCategory} categories={categories} title="All products" subtitle="Use search and category filters to find an item." showFilters />
            </>
          )}
          {activeView === 'add-product' && (
            <div className="mx-auto max-w-[860px]">
              <PageHeading eyebrow="Catalog management" title="Add a product" description="Share the details your customers need to discover what you offer." />
              <AddProduct onSuccess={handleProductAdded} onError={(message) => reportError('Could not add product', message)} />
            </div>
          )}
          {activeView === 'admin' && user?.role === 'admin' && (
            <>
              <PageHeading eyebrow="Admin workspace" title="Catalog overview" description="Review catalog activity and product inventory across DIGITAL Axis." action={productAction} />
              <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">Catalog products</div>
                  <div className="mt-2 text-[23px] font-semibold tracking-[-.04em]">{loadingProducts ? '—' : products.length}</div>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">Product categories</div>
                  <div className="mt-2 text-[23px] font-semibold tracking-[-.04em]">{loadingProducts ? '—' : categories.length}</div>
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--muted)]">Units in stock</div>
                  <div className="mt-2 text-[23px] font-semibold tracking-[-.04em]">{loadingProducts ? '—' : products.reduce((total, product) => total + (Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0), 0).toLocaleString()}</div>
                </div>
              </div>
              <ProductList products={filteredProducts} loading={loadingProducts} error={productsError} onRetry={loadProducts} onAddProduct={() => handleNavigate('add-product')} query={query} onQueryChange={setQuery} category={category} onCategoryChange={setCategory} categories={categories} title="All catalog products" subtitle="Search and review products currently available in the catalog." showFilters />
            </>
          )}
          {activeView === 'messages' && (user?.role === 'customer' || user?.role === 'vendor') && (
            <Messages user={user} startRequest={startConversation} />
          )}
          <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-5 text-[10px] text-[var(--muted)]"><span>© {new Date().getFullYear()} DIGITAL Axis · Commerce workspace</span><span className="flex items-center gap-2"><span className={`status-dot ${apiStatus === 'Unavailable' ? '!bg-[#db744d]' : ''}`} /> {apiStatus === 'Unavailable' ? 'Catalog service unavailable' : `${apiStatus} to catalog`}</span></footer>
        </main>
        <nav className="mobile-nav sticky bottom-0 z-30 hidden justify-around border-t border-[var(--line)] bg-[var(--panel)] px-2 py-2" aria-label="Mobile navigation">
          {[{ id: 'overview', label: 'Home', icon: 'grid' }, { id: 'products', label: 'Products', icon: 'box' }, ...(user?.role === 'customer' || user?.role === 'vendor' ? [{ id: 'messages', label: 'Messages', icon: 'users' }] : []), ...(canManageProducts ? [{ id: 'add-product', label: 'Add', icon: 'plus' }] : [])].map((link) => <button key={link.id} onClick={() => handleNavigate(link.id)} className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] ${activeView === link.id ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'}`} aria-current={activeView === link.id ? 'page' : undefined}><Icon name={link.icon} size={17} />{link.label}</button>)}
        </nav>
      </div>
      {settingsOpen && <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default function EcommerceApp() {
  const [user, setUser] = useState(null);

  return (
    <>
      {user
        ? <Dashboard user={user} onLogout={() => { localStorage.removeItem('token'); setUser(null); }} />
        : <AuthEntry onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)} />}
      <ChatWidget />
    </>
  );
}
