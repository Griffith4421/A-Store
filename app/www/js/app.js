/* A-Store Android app — Apps, Gallery, Notices and personal Settings. */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const APP_PREF_KEY = 'astore-app-prefs-v1';
const APP_USER_KEY = 'astore-app-user-v1';
const DOWNLOADS_KEY = 'astore-downloads-v1';
const PREF_DEFAULTS = { theme: 'light', accent: 'lime', radius: 'soft', reduceMotion: false };
const USER_DEFAULTS = { read: [], favoriteApps: [], favoritePhotos: [] };
let prefs = readLocal(APP_PREF_KEY, PREF_DEFAULTS);
let userState = readLocal(APP_USER_KEY, USER_DEFAULTS);
userState.read = Array.isArray(userState.read) ? userState.read : [];
userState.favoriteApps = Array.isArray(userState.favoriteApps) ? userState.favoriteApps : [];
userState.favoritePhotos = Array.isArray(userState.favoritePhotos) ? userState.favoritePhotos : [];
let content = { apps: [], photos: [], posts: [], about: {}, loading: true, error: '' };
let page = 'apps';
let searchQuery = '';
let categoryFilter = 'All';
let lightboxIndex = 0;
let activeAppId = null;
let toastTimer = null;
let downloadJobs = new Map(Object.entries(readLocal(DOWNLOADS_KEY, {}).jobs || {}));
let cordovaReady = false;
const appStartedAt = Date.now();
let launchSplashHidden = false;

function readLocal(key, defaults) {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(key) || '{}') || {}) }; }
  catch { return { ...defaults }; }
}
function saveLocal() {
  try {
    localStorage.setItem(APP_PREF_KEY, JSON.stringify(prefs));
    localStorage.setItem(APP_USER_KEY, JSON.stringify(userState));
  } catch (error) { console.warn('Could not save A-Store local preferences:', error); }
}
function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeUrl(value) {
  const safe = AStoreCloud.safeHttpUrl(String(value || ''));
  return safe ? esc(safe) : '';
}
function notify(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function displayDate(value) {
  const ms = AStoreCloud.timestampMillis(value);
  return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just now';
}
function timeAgo(value) {
  const ms = AStoreCloud.timestampMillis(value);
  if (!ms) return 'Just now';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return displayDate(value);
}
function cat(app) {
  const value = app.category || (app.tags || [])[0] || 'App';
  return String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function publisherName() {
  const name = String(content.about?.displayName || '').trim();
  return !name || /griffiti/i.test(name) || /^a-store$/i.test(name) ? 'Aryan' : name;
}
function isFavoriteApp(id) { return userState.favoriteApps.includes(String(id)); }
function isFavoritePhoto(id) { return userState.favoritePhotos.includes(String(id)); }
function toggleFavorite(kind, id) {
  const key = kind === 'app' ? 'favoriteApps' : 'favoritePhotos';
  const value = String(id || '');
  if (!value) return;
  const index = userState[key].indexOf(value);
  const added = index < 0;
  if (added) userState[key].push(value);
  else userState[key].splice(index, 1);
  userState[key] = [...new Set(userState[key])].slice(-500);
  saveLocal();
  renderMain();
  if (kind === 'app' && activeAppId === value && $('#modal').classList.contains('show')) {
    const app = content.apps.find(item => item.id === value);
    if (app) renderAppSheet(app);
  }
  if (kind === 'photo' && $('.lightbox') && $('#modal').classList.contains('show')) renderLightbox();
  notify(added ? 'Added to your favourites.' : 'Removed from your favourites.');
}
function appIcon(app, size = 58) {
  const iconUrl = safeUrl(app.iconURL);
  if (iconUrl) return `<span class="a-store-icon" style="--s:${size}px"><img src="${iconUrl}" alt="${esc(app.title)} icon" loading="lazy"></span>`;
  const glyph = app.icon || String(app.title || 'A').trim().slice(0, 1).toUpperCase();
  return `<span class="a-store-icon fallback t-${esc(app.tone || 'green')}" style="--s:${size}px">${esc(glyph)}</span>`;
}
function getBtn(app, big = false) {
  const id = String(app.id);
  const currentUrl = AStoreCloud.safeHttpUrl(String(app.downloadUrl || app.url || ''));
  let job = downloadJobs.get(id);
  // A newly published app version or URL must not inherit the previous APK's Install state.
  if (job && (job.url !== currentUrl || job.version !== String(app.version || '') || job.type !== String(app.downloadType || ''))) {
    downloadJobs.delete(id);
    persistDownloads();
    job = null;
  }
  const sizeClass = big ? 'big' : '';
  if (job && ['pending', 'running', 'paused'].includes(job.status)) {
    const progress = Number.isFinite(job.progress) && job.progress > 0 ? ` ${job.progress}%` : '';
    return `<button class="btn download-action download-busy ${sizeClass}" type="button" disabled aria-live="polite">Downloading${progress}</button>`;
  }
  if (job && job.status === 'successful' && job.isApk) {
    return `<button class="btn download-action btn-green ${sizeClass}" type="button" data-action="install-apk" data-id="${esc(id)}">Install</button>`;
  }
  const url = AStoreCloud.safeHttpUrl(String(app.downloadUrl || app.url || ''));
  if (!url) return `<button class="btn download-action btn-outline ${sizeClass}" type="button" data-action="open-app" data-id="${esc(id)}">Details</button>`;
  const repeatLabel = job && job.status === 'successful' ? 'Download again' : 'Download';
  return `<button class="btn download-action btn-green ${sizeClass}" type="button" data-action="download-app" data-id="${esc(id)}">${repeatLabel}</button>`;
}
function favoriteButton(kind, id, active, extraClass = '') {
  const label = active ? 'Remove from favourites' : 'Add to favourites';
  return `<button class="favorite-toggle ${extraClass} ${active ? 'on' : ''}" type="button" data-action="toggle-favorite-${kind}" data-id="${esc(id)}" aria-label="${label}" aria-pressed="${active ? 'true' : 'false'}" title="${label}">${active ? '♥' : '♡'}</button>`;
}
function appCard(app, large = false) {
  const tag = app.tag || cat(app).toUpperCase();
  const description = app.description || '';
  return `<article class="feature-card ${large ? 'featured-large' : ''}" role="button" tabindex="0" data-action="open-app" data-id="${esc(app.id)}" aria-label="View ${esc(app.title)}">
    <div class="feature-visual ${esc(app.tone || '')}">${appIcon(app, 70)}${favoriteButton('app', app.id, isFavoriteApp(app.id), 'app-favorite')}</div>
    <div class="feature-body"><span class="feature-tag">${esc(tag)}${app.version ? ` · V${esc(app.version)}` : ''}</span><h3>${esc(app.title)}</h3><p>${esc(description)}</p><div class="feature-foot"><span class="meta">${esc(app.platform || 'App')}</span>${getBtn(app)}</div></div>
  </article>`;
}
function chartRow(app, index, subtitle = '') {
  return `<div class="chart-row" role="button" tabindex="0" data-action="open-app" data-id="${esc(app.id)}">${index !== null ? `<span class="rank">${index + 1}</span>` : ''}${appIcon(app, 48)}<div class="cr-main"><b>${esc(app.title)}</b><small>${esc(subtitle || `${cat(app)} · ${app.platform || 'App'}`)}</small></div>${favoriteButton('app', app.id, isFavoriteApp(app.id), 'row-favorite')}${getBtn(app)}</div>`;
}
function art(photo, index) {
  const image = safeUrl(photo.image);
  return `<div class="photo-tile"><button class="photo-btn" type="button" data-action="open-photo" data-index="${index}" aria-label="Open ${esc(photo.title)}"><div class="photo custom-photo">${image ? `<img src="${image}" alt="${esc(photo.title)}" loading="lazy">` : ''}<span class="photo-caption">${esc(photo.title)}</span></div></button>${favoriteButton('photo', photo.id, isFavoritePhoto(photo.id), 'photo-favorite')}</div>`;
}
function postItem(post) {
  const unread = !userState.read.includes(post.id);
  return `<button class="journal-item journal-button" type="button" data-action="open-post" data-id="${esc(post.id)}"><span class="journal-date">${unread ? '<i class="udot"></i>' : ''}${esc(post.date || 'JUST NOW')}</span><span class="journal-title">${esc(post.title)}</span><span class="journal-category">${esc(post.category || 'NOTICE')}</span><span class="journal-arrow">↗</span></button>`;
}
function unreadCount() { return content.posts.filter(post => !userState.read.includes(post.id)).length; }
function updateBadge() {
  const dot = $('#upddot');
  if (dot) dot.style.display = unreadCount() ? 'block' : 'none';
}
function shell() {
  const nav = [
    ['apps', 'Apps', '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'],
    ['gallery', 'Gallery', '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'],
    ['updates', 'Notices', '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'],
    ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 2.4-2.2 2.2-2.5-1.4a7.8 7.8 0 0 1-1.6.7l-.7 2.8h-3.1l-.7-2.8a7.8 7.8 0 0 1-1.6-.7L6 19.7l-2.2-2.2 1.4-2.5a7.8 7.8 0 0 1-.7-1.6L1.7 12.7V9.6l2.8-.7a7.8 7.8 0 0 1 .7-1.6L3.8 4.8 6 2.6l2.5 1.4a7.8 7.8 0 0 1 1.6-.7l.7-2.8h3.1l.7 2.8a7.8 7.8 0 0 1 1.6.7l2.5-1.4 2.2 2.2-1.4 2.5a7.8 7.8 0 0 1 .7 1.6l2.8.7v3.1l-2.8.7a7.8 7.8 0 0 1-.8 1.6Z"/>']
  ];
  return `<div class="wrap"><header class="topbar">
    <a class="brand" href="#apps" data-route="apps" aria-label="A-Store home"><span class="brandmark">A.</span><span class="brand-name">A-STORE</span></a>
    <div class="searchwrap"><div class="pill" id="pill"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input id="site-search" type="search" placeholder="Search apps" value="${esc(searchQuery)}" autocomplete="off" aria-label="Search apps" /><kbd>/</kbd></div></div>
    </header><main id="main" tabindex="-1">${pageMarkup()}</main><footer class="footer"><span>© ${new Date().getFullYear()} A-STORE · A FOR ARYAN, A FOR APPS · MADE BY ARYAN</span><div class="footer-links"><a href="#apps" data-route="apps">Apps</a><a href="#gallery" data-route="gallery">Gallery</a><a href="#updates" data-route="updates">Notices</a></div></footer></div>
    <nav class="bottom-nav" aria-label="Main sections"><div class="bottom-nav-inner">${nav.map(([id, label, icon]) => `<a href="#${id}" data-route="${id}" class="bottom-nav-item ${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}><span class="bottom-nav-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${id === 'updates' ? '<i id="upddot" class="nav-notice-dot"></i>' : ''}</span><span>${label}</span></a>`).join('')}</div></nav>`;
}
function loadingState(message = 'Loading A-Store…') {
  return `<div class="empty" role="status"><b>${esc(message)}</b>Connecting to the shared content library.</div>`;
}
function emptyState(title, message) { return `<div class="empty"><b>${esc(title)}</b>${esc(message)}</div>`; }
function discover() {
  if (!content.apps.length) return '';
  const featured = [...content.apps].sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0))[0];
  const fresh = [...content.apps].sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0)).slice(0, 4);
  return `<div class="aotd ${esc(featured.tone || '')}" data-action="open-app" data-id="${esc(featured.id)}" role="button" tabindex="0"><div class="aotd-copy"><span class="feature-tag">FEATURED APP · ${esc(cat(featured).toUpperCase())}</span><h2>${esc(featured.title)}</h2><p>${esc(featured.description || '')}</p><div class="aotd-actions">${getBtn(featured, true)}<span class="meta" style="color:#596253">${esc(featured.platform || '')}${featured.size ? ` · ${esc(featured.size)}` : ''}</span></div></div><div class="aotd-art">${appIcon(featured, 108)}${favoriteButton('app', featured.id, isFavoriteApp(featured.id), 'app-favorite')}</div></div>
    <div class="two-col app-discover"><div><div class="section-head" style="margin-bottom:12px"><div><span class="eyebrow">RECENTLY ADDED</span><h2 class="section-title" style="font-size:24px">Fresh apps</h2></div></div><div class="chart-list">${fresh.map((app, index) => chartRow(app, index, `${cat(app)} · ${app.platform || 'App'}`)).join('')}</div></div><div><div class="section-head" style="margin-bottom:12px"><div><span class="eyebrow">FROM THE GALLERY</span><h2 class="section-title" style="font-size:24px">Recent frames</h2></div></div><div class="gallery-grid mini-gallery">${content.photos.slice(0, 4).map(art).join('') || '<p class="section-sub">No photos yet.</p>'}</div></div></div>`;
}
function appsPage() {
  if (content.loading) return loadingState();
  const query = searchQuery.trim().toLowerCase();
  const cats = ['All', ...new Set(content.apps.map(cat))];
  if (!cats.includes(categoryFilter)) categoryFilter = 'All';
  const list = content.apps.filter(app => {
    const haystack = [app.title, app.description, app.tag, app.platform, app.version, app.category, ...(app.tags || [])].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (categoryFilter === 'All' || cat(app) === categoryFilter);
  }).sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0));
  return `<section class="page-intro"><span class="eyebrow">USEFUL LITTLE THINGS</span><h1>Apps</h1><p>Small tools and side projects, made with care. Find something useful and give it a try.</p></section>
    <div class="chips">${cats.map(category => `<button class="filter ${category === categoryFilter ? 'active' : ''}" data-action="filter-category" data-category="${esc(category)}">${esc(category)}</button>`).join('')}</div>
    ${!query && categoryFilter === 'All' ? discover() : ''}
    <div class="toolbar"><span class="meta">${list.length} OF ${content.apps.length} APPS${query ? ` · “${esc(searchQuery)}”` : ''}</span>${query ? '<button class="filter" data-action="clear-search">Clear search ×</button>' : ''}</div>
    <div class="content-grid">${list.length ? list.map(appCard).join('') : emptyState(query ? 'No matching apps' : 'No apps published yet', query ? 'Try a different search term or category.' : 'New apps will appear here after they are published.')}</div>`;
}
function galleryPage() {
  if (content.loading) return loadingState();
  return `<section class="page-intro"><span class="eyebrow">THE WORLD, IN LITTLE FRAMES</span><h1>Gallery</h1><p>Color, light and bits of everyday life. A small collection of moments worth keeping.</p></section><div class="toolbar"><span class="meta">${content.photos.length} PHOTOS</span></div><div class="gallery-grid page-gallery">${content.photos.length ? content.photos.map(art).join('') : emptyState('No photos yet', 'New gallery images will appear here.')}</div>`;
}
function updatesPage() {
  if (content.loading) return loadingState();
  return `<section class="page-intro"><span class="eyebrow">A LITTLE NOTE FROM THE STUDIO</span><h1>Notices & updates</h1><p>Release notes, announcements, important news and other updates from the studio.</p></section><div class="toolbar"><span class="meta">${content.posts.length} NOTICE${content.posts.length === 1 ? '' : 'S'}</span><button class="filter" data-action="mark-read" ${unreadCount() ? '' : 'disabled'}>Mark all read</button></div><div class="journal-list updates-list">${content.posts.length ? content.posts.map(postItem).join('') : emptyState('No notices just yet', 'New announcements will appear here.')}</div>`;
}
function settingThemeTiles() {
  return ['light', 'dark', 'sepia', 'mint'].map(theme => `<button type="button" class="theme-option ${prefs.theme === theme ? 'active' : ''}" data-action="set-theme" data-theme-value="${theme}" aria-pressed="${prefs.theme === theme}"><span class="theme-preview ${theme}"><i></i><b></b><em></em></span><span>${theme[0].toUpperCase() + theme.slice(1)}</span></button>`).join('');
}
function settingsPage() {
  const favoriteApps = content.apps.filter(app => isFavoriteApp(app.id));
  const favoritePhotos = content.photos.filter(photo => isFavoritePhoto(photo.id));
  return `<section class="page-intro settings-intro"><span class="eyebrow">YOUR A-STORE</span><h1>Settings</h1><p>Make the app feel like yours and keep the things you love close by.</p></section>
    <section class="settings-card settings-appearance"><div class="settings-card-head"><div><span class="settings-label">PERSONALIZATION</span><h2>Appearance</h2><p>Choose a theme and give the interface your own touch. These choices stay on this device.</p></div><span class="settings-card-icon">◐</span></div>
      <div class="setting-group"><span class="sl">THEME</span><div class="theme-options">${settingThemeTiles()}</div></div>
      <div class="setting-group"><span class="sl">ACCENT COLOUR</span><div class="sws">${[['lime','#c5f66b'],['lilac','#d3c4f8'],['peach','#f9bba3'],['sky','#b0dbf6'],['rose','#f6bfd3']].map(([name,color]) => `<button type="button" class="swatch ${prefs.accent === name ? 'on' : ''}" style="--swatch:${color}" data-action="set-accent" data-accent-value="${name}" aria-label="${name} accent" aria-pressed="${prefs.accent === name}" title="${name}"></button>`).join('')}</div></div>
      <div class="setting-group"><span class="sl">CORNER STYLE</span><div class="seg">${[['sharp','Sharp'],['soft','Soft'],['round','Round']].map(([value,label]) => `<button type="button" class="${prefs.radius === value ? 'on' : ''}" data-action="set-radius" data-radius-value="${value}" aria-pressed="${prefs.radius === value}">${label}</button>`).join('')}</div></div>
      <label class="setting-toggle"><span><b>Reduce motion</b><small>Use simpler transitions and animations.</small></span><input type="checkbox" data-action="toggle-reduce-motion" ${prefs.reduceMotion ? 'checked' : ''}><i></i></label>
      <div class="settings-reset"><button type="button" class="btn btn-outline" data-action="reset-settings">Reset appearance</button></div>
    </section>
    <section class="favorites-section"><div class="section-head"><div><span class="eyebrow">SAVED FOR LATER</span><h2 class="section-title">Your favourites</h2><p class="section-sub">Only you can see these saved items. They stay on this device.</p></div><span class="favorite-count">${favoriteApps.length + favoritePhotos.length} SAVED</span></div>
      <div class="favorite-group"><div class="favorite-group-head"><h3>Apps</h3><span>${favoriteApps.length}</span><a href="#apps" data-route="apps">Browse apps ↗</a></div>${favoriteApps.length ? `<div class="favorite-app-list">${favoriteApps.map(app => `<div class="favorite-app-row"><button type="button" class="favorite-app-open" data-action="open-app" data-id="${esc(app.id)}">${appIcon(app, 48)}<span><b>${esc(app.title)}</b><small>${esc(cat(app))} · ${esc(app.platform || 'App')}</small></span></button>${favoriteButton('app', app.id, true, 'remove-favorite')}</div>`).join('')}</div>` : emptyState('No favourite apps yet', 'Tap the heart on any app to save it here.')}</div>
      <div class="favorite-group"><div class="favorite-group-head"><h3>Pictures</h3><span>${favoritePhotos.length}</span><a href="#gallery" data-route="gallery">Browse gallery ↗</a></div>${favoritePhotos.length ? `<div class="gallery-grid favorite-photo-grid">${favoritePhotos.map(photo => art(photo, content.photos.findIndex(item => item.id === photo.id))).join('')}</div>` : emptyState('No favourite pictures yet', 'Tap the heart on any gallery picture to save it here.')}</div>
    </section>`;
}
function pageMarkup() {
  return ({ apps: appsPage, gallery: galleryPage, updates: updatesPage, settings: settingsPage }[page] || appsPage)();
}
function renderMain() {
  const main = $('#main');
  if (main) main.innerHTML = pageMarkup();
  $$('.bottom-nav-item').forEach(link => {
    const active = link.dataset.route === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  updateBadge();
  const search = $('#site-search');
  if (search && search.value !== searchQuery) search.value = searchQuery;
}
function go(nextPage) {
  page = ['apps', 'gallery', 'updates', 'settings'].includes(nextPage) ? nextPage : 'apps';
  if (location.hash !== `#${page}`) location.hash = page;
  else renderMain();
  window.scrollTo({ top: 0, behavior: prefs.reduceMotion ? 'auto' : 'smooth' });
}
function openModal(html, label = 'Details') {
  const modal = $('#modal');
  modal.innerHTML = html;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  modal.setAttribute('aria-label', label);
  const first = $('button, a[href]', modal);
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 15);
}
function closeModal() {
  const modal = $('#modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = '';
  document.body.style.overflow = '';
  activeAppId = null;
  lightboxIndex = null;
}
function openExternal(url) {
  const clean = AStoreCloud.safeHttpUrl(String(url || ''));
  if (!clean) return notify('This item does not have a valid download link yet.');
  if (window.cordova && typeof window.open === 'function') window.open(clean, '_system');
  else window.open(clean, '_blank', 'noopener,noreferrer');
}
function safeFileName(value, extension) {
  const base = String(value || 'A-Store-download').normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 64) || 'A-Store-download';
  const ext = String(extension || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
}
function fileExtension(url) {
  try { const path = new URL(url).pathname; const match = path.match(/\.([a-z0-9]{2,6})$/i); return match ? match[1].toLowerCase() : ''; }
  catch { return ''; }
}
function persistDownloads() {
  try {
    const recent = Array.from(downloadJobs.entries()).slice(-50);
    downloadJobs = new Map(recent);
    localStorage.setItem(DOWNLOADS_KEY, JSON.stringify({ jobs: Object.fromEntries(downloadJobs) }));
  }
  catch (error) { console.warn('Could not persist download state:', error); }
}
function refreshDownloadUI(appId) {
  renderMain();
  if (activeAppId === String(appId) && $('#modal').classList.contains('show')) {
    const app = content.apps.find(item => String(item.id) === String(appId));
    const oldButton = $('#modal .download-action');
    if (app && oldButton) oldButton.outerHTML = getBtn(app, true);
  }
}
function pollDownload(appId) {
  const key = String(appId);
  const job = downloadJobs.get(key);
  const api = window.cordova?.plugins?.astoreDownload;
  if (!job || !job.id || !api || !cordovaReady) return;
  api.query(job.id, result => {
    const current = downloadJobs.get(key);
    if (!current || current.id !== job.id) return;
    current.status = result.status || 'running';
    current.progress = Number(result.progress || 0);
    current.reason = result.reason || '';
    current.statusErrors = 0;
    if (current.status === 'successful') current.progress = 100;
    persistDownloads();
    refreshDownloadUI(key);
    if (current.status === 'successful') {
      notify(current.isApk ? 'Download complete. Tap Install when you are ready.' : 'Download completed. Check your Downloads folder.');
      return;
    }
    if (current.status === 'failed') {
      notify(`Download failed${current.reason ? `: ${current.reason}` : '.'}`);
      downloadJobs.delete(key);
      persistDownloads();
      refreshDownloadUI(key);
      return;
    }
    setTimeout(() => pollDownload(key), 1200);
  }, error => {
    console.warn('A-Store download status error:', error);
    const current = downloadJobs.get(key);
    if (!current || current.id !== job.id) return;
    current.statusErrors = Number(current.statusErrors || 0) + 1;
    if (current.statusErrors >= 8) {
      downloadJobs.delete(key);
      persistDownloads();
      refreshDownloadUI(key);
      notify('The Android download record is no longer available. Check your Downloads folder.');
      return;
    }
    persistDownloads();
    setTimeout(() => pollDownload(key), 2500);
  });
}
async function downloadApp(id) {
  const app = content.apps.find(item => String(item.id) === String(id));
  if (!app) return notify('This app is no longer available.');
  const rawUrl = app.downloadUrl || app.url || '';
  const clean = AStoreCloud.safeHttpUrl(String(rawUrl));
  if (!clean) return notify('This app has no valid download URL yet.');

  const explicitType = String(app.downloadType || '').toLowerCase();
  const extension = fileExtension(clean);
  const platform = String(app.platform || 'Android').toLowerCase();
  const type = explicitType || extension || (platform.includes('android') ? 'apk' : 'website');
  const isApk = type === 'apk' || extension === 'apk';
  const isWebLink = type === 'website' || (!app.downloadUrl && !extension && !explicitType);
  const nativeApi = window.cordova?.plugins?.astoreDownload;

  // Website/PWA and non-file links open normally. Native Android direct files use
  // Android DownloadManager so large APK downloads continue outside the WebView.
  if (isWebLink) return openExternal(clean);
  if (window.cordova && window.cordova.platformId === 'android') {
    if (!cordovaReady) return notify('A-Store is still preparing the download service. Please try again in a moment.');
    if (!nativeApi) return notify('The native download service is missing. Rebuild A-Store with the latest build-apk.bat.');
  } else if (isApk && !window.cordova) {
    const anchor = document.createElement('a'); anchor.href = clean; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); return;
  } else {
    return openExternal(clean);
  }

  const ext = isApk ? 'apk' : (['zip', '7z', 'rar', 'pdf', 'aab'].includes(type) ? type : (extension || 'bin'));
  const filename = safeFileName(`A-Store-${app.title || 'download'}-${Date.now()}`, ext);
  const key = String(app.id);
  try {
    const result = await new Promise((resolve, reject) => nativeApi.enqueue({
      url: clean, filename, title: app.title || 'A-Store download',
      description: `Downloading ${app.title || 'file'} from A-Store`,
      mimeType: isApk ? 'application/vnd.android.package-archive' : 'application/octet-stream'
    }, resolve, reject));
    downloadJobs.set(key, { id: String(result.id), filename, isApk, url: clean, version: String(app.version || ''), type: String(app.downloadType || ''), status: 'pending', progress: 0, startedAt: Date.now() });
    persistDownloads();
    refreshDownloadUI(key);
    notify('Download started. You can track it in your notification shade.');
    pollDownload(key);
  } catch (error) {
    console.error('A-Store download could not start:', error);
    notify((typeof error === 'string' ? error : error?.message) || 'Could not start the download. Check your connection and link.');
  }
}
function installDownloadedApk(id) {
  const job = downloadJobs.get(String(id));
  const api = window.cordova?.plugins?.astoreDownload;
  if (!job || !job.id || !job.isApk || job.status !== 'successful') return notify('The APK has not finished downloading yet.');
  if (!api) return notify('The Android installer bridge is unavailable. Rebuild the app with the latest project.');
  api.openApk(job.id, result => {
    if (result?.requiresPermission) notify('Allow A-Store to install unknown apps in Android Settings, then tap Install again.');
    else notify('Opening Android package installer…');
  }, error => {
    console.error('APK installer could not open:', error);
    downloadJobs.delete(String(id));
    persistDownloads();
    refreshDownloadUI(String(id));
    notify((typeof error === 'string' ? error : error?.message) || 'Android could not open this APK. Download it again and retry.');
  });
}
function getApp(id) { downloadApp(id); }
function openApp(id) {
  const app = content.apps.find(item => item.id === id);
  if (!app) return;
  activeAppId = id;
  renderAppSheet(app);
}
function renderAppSheet(app) {
  const screenshots = (app.shots || []).map(url => safeUrl(url)).filter(Boolean);
  const shotMarkup = screenshots.length
    ? screenshots.map((url, index) => `<button type="button" class="shot" data-action="open-shot" data-index="${index}"><img src="${url}" alt="${esc(app.title)} screenshot ${index + 1}" loading="lazy"></button>`).join('')
    : `<div class="shot ${esc(app.tone || '')}"><i class="s-bar"></i><b class="s-h">${esc(app.title)}</b><span class="s-core"></span><i class="s-line"></i><i class="s-line short"></i><span class="s-card"></span></div>`;
  const tags = (app.tags || []).map(tag => `<span class="detail-tag">${esc(tag)}</span>`).join('');
  const image = safeUrl(app.iconURL);
  const icon = image ? `<img class="detail-app-icon" src="${image}" alt="${esc(app.title)} icon">` : appIcon(app, 76);
  openModal(`<article class="modal sheet"><div class="sheet-bar"><span class="feature-tag">APP DETAILS</span><button class="close" type="button" data-action="close-modal" aria-label="Close">×</button></div><div class="sheet-body">
    <div class="app-head">${icon}<div class="ah-main"><span class="feature-tag">${esc(cat(app).toUpperCase())}</span><h2>${esc(app.title)}</h2><p class="by">Made by ${esc(publisherName())} · ${esc(app.platform || 'App')}</p><div class="ah-actions">${getBtn(app, true)}${favoriteButton('app', app.id, isFavoriteApp(app.id), 'detail-favorite')}<span class="meta">${app.size ? esc(app.size) + ' · ' : ''}${app.version ? 'v' + esc(app.version) : ''}</span></div></div></div>
    <div class="statstrip"><div><span>Version</span><b>${esc(app.version || '—')}</b></div><div><span>Platform</span><b>${esc(app.platform || '—')}</b></div><div><span>Category</span><b>${esc(cat(app))}</b></div><div><span>Updated</span><b>${esc(timeAgo(app.updatedAt || app.createdAt))}</b></div></div>
    <div class="sh">Preview <small>${screenshots.length ? `${screenshots.length} SCREENSHOTS` : 'APP PREVIEW'}</small></div><div class="shots">${shotMarkup}</div>
    <div class="sh">About this app</div><div class="about-text">${esc(app.fullDescription || app.description || 'No description has been added yet.')}</div>
    <div class="sh">What’s new <small>${app.version ? 'v' + esc(app.version) : 'LATEST UPDATE'}</small></div><div class="whatsnew">${esc(app.releaseNotes || 'No release notes have been added yet.')}</div>
    ${tags ? `<div class="sh">Tags</div><div class="detail-meta">${tags}</div>` : ''}
    <div class="sh">Information</div><div class="info"><div><span>Publisher</span><b>${esc(publisherName())}</b></div><div><span>Platform</span><b>${esc(app.platform || '—')}</b></div><div><span>Category</span><b>${esc(cat(app))}</b></div><div><span>Version</span><b>${esc(app.version || '—')}</b></div></div>
    <div class="form-foot">${safeUrl(app.appStore) ? `<a class="btn btn-outline" href="${safeUrl(app.appStore)}" target="_blank" rel="noopener noreferrer">App Store ↗</a>` : ''}${safeUrl(app.playStore) ? `<a class="btn btn-outline" href="${safeUrl(app.playStore)}" target="_blank" rel="noopener noreferrer">Google Play ↗</a>` : ''}${safeUrl(content.about.supportUrl) ? `<a class="btn btn-outline" href="${safeUrl(content.about.supportUrl)}" target="_blank" rel="noopener noreferrer">Support ↗</a>` : ''}</div>
  </div></article>`, `${app.title} details`);
}
function openPost(id) {
  const post = content.posts.find(item => item.id === id);
  if (!post) return;
  if (!userState.read.includes(id)) {
    userState.read.push(id);
    userState.read = userState.read.slice(-300);
    saveLocal();
    updateBadge();
  }
  const image = safeUrl(post.image);
  openModal(`<article class="modal notice-modal"><div class="modal-head"><span class="feature-tag">${esc(post.category || 'NOTICE')} · ${esc(post.date || '')}</span><button class="close" data-action="close-modal" type="button" aria-label="Close">×</button></div>${image ? `<img class="notice-cover" src="${image}" alt="${esc(post.title)}">` : ''}<h2>${esc(post.title)}</h2><p class="section-sub">${esc(post.date || '')}</p><div class="article-copy">${esc(post.body || post.excerpt || '')}</div></article>`, 'Notice');
  if (page === 'updates') renderMain();
}
function openPhoto(index) {
  if (!content.photos.length) return;
  lightboxIndex = ((Number(index) || 0) % content.photos.length + content.photos.length) % content.photos.length;
  renderLightbox();
}
function renderLightbox() {
  const photo = content.photos[lightboxIndex];
  if (!photo) return closeModal();
  const image = safeUrl(photo.image);
  openModal(`<article class="modal lightbox"><div class="modal-head"><span class="feature-tag">PHOTO ${lightboxIndex + 1} OF ${content.photos.length}</span><button class="close" data-action="close-modal" type="button" aria-label="Close">×</button></div><div class="lb-stage">${image ? `<img src="${image}" alt="${esc(photo.title)}">` : ''}<button class="lb-nav l" type="button" data-action="photo-step" data-step="-1" aria-label="Previous">←</button><button class="lb-nav r" type="button" data-action="photo-step" data-step="1" aria-label="Next">→</button></div><div class="lb-meta"><b>${esc(photo.title)}</b>${favoriteButton('photo', photo.id, isFavoritePhoto(photo.id), 'detail-favorite')}</div><span class="meta">${esc(displayDate(photo.createdAt || photo.createdAtMs))}</span></article>`, 'Gallery photo');
}
function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = ['light', 'dark', 'sepia', 'mint'].includes(prefs.theme) ? prefs.theme : 'light';
  root.dataset.accent = ['lime', 'lilac', 'peach', 'sky', 'rose'].includes(prefs.accent) ? prefs.accent : 'lime';
  root.dataset.radius = ['sharp', 'soft', 'round'].includes(prefs.radius) ? prefs.radius : 'soft';
  document.body.classList.toggle('reduce', !!prefs.reduceMotion);
  const themeColor = $('meta[name="theme-color"]');
  if (themeColor) themeColor.content = getComputedStyle(root).getPropertyValue('--paper').trim() || '#f7f7f4';
}
function updateContent(snapshot) {
  content.apps = snapshot.apps || [];
  content.photos = snapshot.photos || [];
  content.posts = snapshot.posts || [];
  content.about = snapshot.about || {};
  content.loading = snapshot.loading;
  content.error = snapshot.error || '';
  renderMain();
  if (activeAppId) {
    const app = content.apps.find(item => item.id === activeAppId);
    if (app && $('#modal').classList.contains('show')) renderAppSheet(app);
    else if (!app) closeModal();
  }
  if (lightboxIndex !== null && lightboxIndex !== undefined && $('#modal').classList.contains('show') && $('.lightbox')) {
    if (content.photos.length) { lightboxIndex = Math.min(lightboxIndex, content.photos.length - 1); renderLightbox(); }
    else closeModal();
  }
  // Drop favourites whose shared records were deleted, while retaining IDs if a
  // record is temporarily absent during the initial loading snapshot.
  if (!content.loading && !content.error) {
    const appIds = new Set(content.apps.map(item => String(item.id)));
    const photoIds = new Set(content.photos.map(item => String(item.id)));
    const nextApps = userState.favoriteApps.filter(id => appIds.has(String(id)));
    const nextPhotos = userState.favoritePhotos.filter(id => photoIds.has(String(id)));
    if (nextApps.length !== userState.favoriteApps.length || nextPhotos.length !== userState.favoritePhotos.length) {
      userState.favoriteApps = nextApps;
      userState.favoritePhotos = nextPhotos;
      saveLocal();
      if (page === 'settings') renderMain();
    }
  }
}

// Click and keyboard handling is delegated so controls survive live Firestore updates.
document.addEventListener('click', event => {
  const route = event.target.closest('[data-route]');
  if (route) {
    event.preventDefault();
    go(route.dataset.route);
    return;
  }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const name = action.dataset.action;
  if (name === 'welcome-close') {
    try { localStorage.setItem('astore-app-welcome-seen', '1'); } catch (error) { console.warn('Could not save welcome state:', error); }
    $('#welcome')?.classList.remove('show');
  } else if (name === 'close-modal') closeModal();
  else if (name === 'open-app') openApp(action.dataset.id);
  else if (name === 'download-app' || name === 'get-app') { event.preventDefault(); event.stopPropagation(); getApp(action.dataset.id); }
  else if (name === 'install-apk') { event.preventDefault(); event.stopPropagation(); installDownloadedApk(action.dataset.id); }
  else if (name === 'toggle-favorite-app') { event.stopPropagation(); toggleFavorite('app', action.dataset.id); }
  else if (name === 'toggle-favorite-photo') { event.stopPropagation(); toggleFavorite('photo', action.dataset.id); }
  else if (name === 'set-theme') {
    prefs.theme = ['light', 'dark', 'sepia', 'mint'].includes(action.dataset.themeValue) ? action.dataset.themeValue : 'light';
    saveLocal(); applyPrefs(); renderMain();
  } else if (name === 'set-accent') {
    prefs.accent = ['lime', 'lilac', 'peach', 'sky', 'rose'].includes(action.dataset.accentValue) ? action.dataset.accentValue : 'lime';
    saveLocal(); applyPrefs(); renderMain();
  } else if (name === 'set-radius') {
    prefs.radius = ['sharp', 'soft', 'round'].includes(action.dataset.radiusValue) ? action.dataset.radiusValue : 'soft';
    saveLocal(); applyPrefs(); renderMain();
  } else if (name === 'toggle-reduce-motion') {
    prefs.reduceMotion = !!action.checked;
    saveLocal(); applyPrefs(); renderMain();
  } else if (name === 'reset-settings') {
    prefs = { ...PREF_DEFAULTS }; saveLocal(); applyPrefs(); renderMain(); notify('Appearance reset.');
  } else if (name === 'open-post') openPost(action.dataset.id);
  else if (name === 'open-photo') openPhoto(Number(action.dataset.index));
  else if (name === 'photo-step') {
    if (content.photos.length) { lightboxIndex = (lightboxIndex + Number(action.dataset.step) + content.photos.length) % content.photos.length; renderLightbox(); }
  } else if (name === 'open-shot') {
    const app = content.apps.find(item => item.id === activeAppId);
    const url = safeUrl(app?.shots?.[Number(action.dataset.index)]);
    if (url) openModal(`<div class="modal image-preview-modal"><button class="close" data-action="close-modal" type="button">×</button><img src="${url}" alt="Screenshot"></div>`, 'Screenshot preview');
  } else if (name === 'filter-category') {
    categoryFilter = action.dataset.category || 'All';
    renderMain();
  } else if (name === 'clear-search') {
    searchQuery = '';
    if ($('#site-search')) $('#site-search').value = '';
    renderMain();
  } else if (name === 'mark-read') {
    userState.read = content.posts.map(post => post.id);
    saveLocal();
    renderMain();
    notify('All caught up.');
  }
});

document.addEventListener('keydown', event => {
  const targetTag = (event.target.tagName || '').toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(targetTag);
  if (event.key === '/' && !typing && !$('#modal').classList.contains('show')) {
    event.preventDefault();
    $('#site-search')?.focus();
  }
  if (event.key === 'Escape') closeModal();
  if (!typing && $('#modal').classList.contains('show') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && $('.lightbox')) {
    if (content.photos.length) { lightboxIndex = (lightboxIndex + (event.key === 'ArrowRight' ? 1 : -1) + content.photos.length) % content.photos.length; renderLightbox(); }
  }
  if ((event.key === 'Enter' || event.key === ' ') && !typing && !event.target.closest('button, a, input, textarea, select')) {
    const card = event.target.closest('[data-action="open-app"]');
    if (card && event.target === card) { event.preventDefault(); openApp(card.dataset.id); }
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'site-search') {
    searchQuery = event.target.value;
    if (page !== 'apps') {
      page = 'apps';
      if (location.hash !== '#apps') location.hash = 'apps';
    }
    renderMain();
    const next = $('#site-search');
    if (next) { next.value = searchQuery; next.focus(); next.setSelectionRange(searchQuery.length, searchQuery.length); }
  }
});
$('#modal').addEventListener('click', event => { if (event.target.id === 'modal') closeModal(); });
window.addEventListener('hashchange', () => {
  const next = (location.hash || '#apps').slice(1);
  page = ['apps', 'gallery', 'updates', 'settings'].includes(next) ? next : 'apps';
  renderMain();
  window.scrollTo({ top: 0, behavior: prefs.reduceMotion ? 'auto' : 'smooth' });
});

function hideLaunchSplash() {
  if (launchSplashHidden) return;
  launchSplashHidden = true;
  const splash = $('#launch-splash');
  if (!splash) return;
  const minimumVisible = 650;
  const wait = Math.max(0, minimumVisible - (Date.now() - appStartedAt));
  setTimeout(() => {
    splash.classList.add('is-hidden');
    setTimeout(() => splash.remove(), 520);
  }, wait);
}

window.addEventListener('deviceready', () => {
  cordovaReady = true;
  // Resume status checks for downloads that were running when A-Store was closed.
  for (const [appId, job] of downloadJobs.entries()) {
    if (job && job.id && ['pending', 'running', 'paused'].includes(job.status)) pollDownload(appId);
  }
}, false);
window.addEventListener('load', () => setTimeout(hideLaunchSplash, 900), { once: true });
setTimeout(hideLaunchSplash, 2400); // Never leave the launch artwork covering an offline/error screen.

// Shared published content is loaded from the common Firebase project. Themes,
// favourites and notice read-state remain private to this device.
page = (location.hash || '#apps').slice(1);
if (!['apps', 'gallery', 'updates', 'settings'].includes(page)) page = 'apps';
applyPrefs();
$('#app').innerHTML = shell();
renderMain();
AStoreCloud.subscribe(updateContent);
AStoreCloud.start();
try { if (!localStorage.getItem('astore-app-welcome-seen')) $('#welcome')?.classList.add('show'); } catch (error) { console.warn('Welcome preference unavailable:', error); }
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Offline shell caching unavailable:', error)));
}
