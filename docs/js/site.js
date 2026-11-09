/* A-Store website — independent design, shared publishing library. */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const siteDefaults = {
  displayName: 'Aryan',
  bio: 'A place for useful apps, creative projects, photographs and ideas worth sharing.',
  email: '', supportUrl: '', privacyUrl: '', termsUrl: '',
  appStoreUrl: '', playStoreUrl: '', websiteUrl: '', instagramUrl: '', xUrl: ''
};
const siteData = { apps: [], projects: [], photos: [], posts: [], about: { ...siteDefaults }, loading: true, error: '' };
const GITHUB_URL = 'https://github.com/Griffith4421';
let page = 'home';
let searchQuery = '';
let appFilter = 'All';
let projectFilter = 'All';
let activeDetail = null;
let activePhotoIndex = 0;
let toastTimer = null;
let editorBusy = false;

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function safeUrl(value) {
  const safe = AStoreCloud.safeHttpUrl(String(value || ''));
  return safe ? esc(safe) : '';
}
function displayDate(value) {
  const ms = AStoreCloud.timestampMillis(value);
  return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase() : 'JUST NOW';
}
function categoryLabel(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
function notify(message, type = 'info') {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function showModal(html, label = 'Dialog') {
  const modal = $('#modal');
  modal.innerHTML = html;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const first = $('button, input, textarea, select, a[href]', modal);
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 20);
  modal.setAttribute('aria-label', label);
}
function closeModal() {
  const modal = $('#modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = '';
  document.body.style.overflow = '';
  activeDetail = null;
}
function go(nextPage) {
  const allowed = ['home', 'apps', 'projects', 'gallery', 'updates', 'about', 'settings', 'studio'];
  page = allowed.includes(nextPage) ? nextPage : 'home';
  if (location.hash !== `#${page}`) location.hash = page;
  else renderMain();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function currentPageFromHash() {
  const next = (location.hash || '#home').slice(1);
  const allowed = ['home', 'apps', 'projects', 'gallery', 'updates', 'about', 'settings', 'studio'];
  page = allowed.includes(next) ? next : 'home';
  if (page === 'studio' && !AStoreCloud.state.isAdmin) page = 'home';
  renderMain();
  updateHeader();
}
function navLink(id, label) {
  return `<a href="#${id}" data-route="${id}" class="${page === id ? 'active' : ''}">${label}</a>`;
}
function shell() {
  const isAdmin = AStoreCloud.state.isAdmin;
  const user = AStoreCloud.state.user;
  const email = user?.email || '';
  const accountLabel = isAdmin ? 'Studio' : user ? 'Account' : 'Sign in';
  return `<div class="wrap">
    <header class="topbar">
      <a class="brand" href="#home" aria-label="A-Store home"><span class="brandmark">A.</span><span>A-STORE</span></a>
      <label class="searchbox" aria-label="Search the store"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input id="site-search" type="search" placeholder="Search apps & projects" value="${esc(searchQuery)}" aria-label="Search apps and projects"></label>
      <nav class="nav" aria-label="Main navigation">${navLink('home', 'Home')}${navLink('apps', 'Apps')}${navLink('projects', 'Projects')}${navLink('gallery', 'Gallery')}</nav>
      <div class="right-nav">
        <span class="tiny-status" title="Shared content sync is active">LIVE SYNC</span>
        <a class="icon-btn github-btn" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer" aria-label="Aryan on GitHub" title="GitHub · Griffith4421"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.98c.85 0 1.7.11 2.5.34 1.9-1.29 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.86v2.58c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg></a>
        <button class="icon-btn update-btn" type="button" data-route="updates" aria-label="Notices" title="Notices"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14V9a2 2 0 0 1 2-2h2l8-4v18l-8-4H6a2 2 0 0 1-2-2Z"></path><path d="M18 9a4 4 0 0 1 0 6M20 6a8 8 0 0 1 0 12"></path></svg><i></i></button>
        <button class="icon-btn account-btn" type="button" data-action="account" aria-label="${esc(accountLabel)}" title="${esc(email || accountLabel)}">${isAdmin ? 'A' : user ? esc((user.displayName || 'U').trim().slice(0, 1).toUpperCase()) : '↗'}</button>
        ${isAdmin ? `<a class="btn btn-green add-top" href="#studio" data-route="studio"><span>＋</span> Studio</a>` : ''}
      </div>
    </header>
    <main id="main" tabindex="-1">${pageMarkup()}</main>
    <footer class="footer"><span>© ${new Date().getFullYear()} A-STORE · A FOR ARYAN, A FOR APPS · MADE BY ARYAN</span><div class="footer-links"><a href="#about" data-route="about">About</a>${safeUrl(siteData.about.websiteUrl) ? `<a href="${safeUrl(siteData.about.websiteUrl)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ''}<a href="mailto:${esc(siteData.about.email || '')}">Say hello ↗</a><a href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="#top" data-action="back-top">Back to top ↑</a></div></footer>
  </div>`;
}
function updateHeader() {
  const current = $('#app');
  const oldHeader = $('.topbar', current);
  if (!oldHeader) return;
  const holder = document.createElement('div');
  holder.innerHTML = shell();
  const freshHeader = $('.topbar', holder);
  if (freshHeader) oldHeader.replaceWith(freshHeader);
}

function renderMain() {
  const app = $('#app');
  if (!app.querySelector('.wrap')) app.innerHTML = shell();
  const main = $('#main');
  if (main) main.innerHTML = pageMarkup();
  $$('.nav a').forEach(link => link.classList.toggle('active', link.dataset.route === page));
  const search = $('#site-search');
  if (search && search.value !== searchQuery) search.value = searchQuery;
  if (page === 'studio' && AStoreCloud.state.isAdmin) loadAdminComments();
}
function pageMarkup() {
  const pages = {
    home: homePage,
    apps: appsPage,
    projects: projectsPage,
    gallery: galleryPage,
    updates: updatesPage,
    about: aboutPage,
    settings: settingsPage,
    studio: studioPage
  };
  return (pages[page] || homePage)();
}
function loadingState(label = 'Loading A-Store…') {
  return `<div class="empty" role="status"><b>${esc(label)}</b>Connecting to the shared content library.</div>`;
}
function emptyState(title, message) {
  return `<div class="empty"><b>${esc(title)}</b>${esc(message)}</div>`;
}
function appIconMarkup(app, size = 62) {
  const image = safeUrl(app.iconURL);
  if (image) return `<span class="astore-icon" style="--icon-size:${size}px"><img src="${image}" alt="${esc(app.title)} icon" loading="lazy"></span>`;
  const glyph = esc(app.icon || String(app.title || 'A').trim().slice(0, 1).toUpperCase());
  return `<span class="astore-icon fallback t-${esc(app.tone || 'green')}" style="--icon-size:${size}px">${glyph}</span>`;
}
function appCard(app, large = false) {
  const tag = app.tag || (app.category ? categoryLabel(app.category).toUpperCase() : 'APP · DOWNLOAD');
  const url = safeUrl(app.url);
  const image = safeUrl(app.iconURL);
  const visual = image ? `<div class="feature-visual app-visual ${esc(app.tone)}"><img src="${image}" alt="${esc(app.title)} icon" loading="lazy"></div>` : `<div class="feature-visual ${esc(app.tone)}"><span class="visual-orbit"></span><span class="visual-core"></span></div>`;
  return `<article class="feature-card ${large ? 'featured-large' : ''}" role="button" tabindex="0" data-open-type="creation" data-id="${esc(app.id)}" aria-label="View ${esc(app.title)}">
    ${visual}<div class="feature-body"><span class="feature-tag">${esc(tag)}${app.version ? ` · V${esc(app.version)}` : ''}</span><h3>${esc(app.title)}</h3><p>${esc(app.description || '')}</p><div class="feature-foot"><span class="meta">${esc(app.platform || 'A little thing I made')}</span>${url ? `<a class="btn btn-green download-card" href="${url}" target="_blank" rel="noopener noreferrer" data-stop-card="true" aria-label="Download ${esc(app.title)}">↓ Download</a>` : '<span class="meta">Download link unavailable</span>'}</div></div>
  </article>`;
}
function projectCard(project) {
  const image = safeUrl(project.image);
  return `<article class="feature-card wide-card" role="button" tabindex="0" data-open-type="creation" data-id="${esc(project.id)}" aria-label="View ${esc(project.title)}">
    <div class="feature-visual ${esc(project.tone)}">${image ? `<img class="project-cover" src="${image}" alt="${esc(project.title)}" loading="lazy">` : '<span class="visual-orbit"></span><span class="visual-core"></span>'}</div>
    <div class="feature-body"><span class="feature-tag">${esc(project.tag || categoryLabel(project.category).toUpperCase())}</span><h3>${esc(project.title)}</h3><p>${esc(project.description || '')}</p><div class="feature-foot"><span class="meta">${esc((project.tags || []).slice(0, 3).join(' · '))}</span><span class="arrow" aria-hidden="true">↗</span></div></div>
  </article>`;
}
function photoMarkup(photo, index, compact = false) {
  const image = safeUrl(photo.image);
  return `<button class="photo-btn" type="button" data-action="open-photo" data-index="${index}" aria-label="Open photo: ${esc(photo.title)}"><div class="photo custom-photo ${compact ? 'compact-photo' : ''}">${image ? `<img src="${image}" alt="${esc(photo.title)}" loading="lazy">` : '<div class="photo-art"><span class="sun"></span><span class="hill"></span><span class="hill2"></span></div>'}<span class="photo-caption">${esc(photo.title)}</span></div></button>`;
}
function postItem(post) {
  return `<button class="journal-item journal-button" type="button" data-open-type="blog" data-id="${esc(post.id)}"><span class="journal-date">${esc(post.date || 'JUST NOW')}</span><span class="journal-title">${esc(post.title)}</span><span class="journal-category">${esc(post.category || 'NOTICE')}</span><span class="journal-arrow">↗</span></button>`;
}
function homePage() {
  if (siteData.loading) return loadingState();
  const featured = siteData.apps.slice(0, 3);
  const latestPosts = siteData.posts.slice(0, 3);
  const latestPhotos = siteData.photos.slice(0, 4);
  const latestProjects = siteData.projects.slice(0, 2);
  return `<section class="hero"><div><span class="eyebrow">A FOR ARYAN · A FOR APPS</span><h1>Ideas made<br><em>into something.</em></h1><p class="hero-copy">A-Store is where I share the apps I build, projects I explore, and moments I want to keep. A small independent space, with room to grow.</p><div class="hero-actions"><a class="btn btn-green" href="#apps" data-route="apps">Explore apps ↗</a><a class="btn btn-outline" href="#updates" data-route="updates">Latest notices</a></div><div class="hero-meta">${siteData.apps.length} APPS · ${siteData.projects.length} PROJECTS · ${siteData.photos.length} PHOTOS</div></div><div class="hero-art"><span class="art-note">A-STORE / BY ARYAN</span><span class="art-circle one"></span><span class="art-circle two"></span><span class="art-shape"></span><span class="art-caption">BUILD · SHARE · REPEAT</span></div></section>
  <section class="section home-feature"><div class="section-head"><div><span class="eyebrow">MADE WITH A LITTLE CURIOSITY</span><h2 class="section-title">Featured apps</h2><p class="section-sub">Small tools and side projects, made with care.</p></div><a class="text-link" href="#apps" data-route="apps">All apps ↗</a></div><div class="featured-grid">${featured.length ? featured.map((item, index) => appCard(item, index === 0)).join('') : emptyState('No apps published yet', 'New apps will appear here as soon as they are published.')}</div></section>
  ${latestProjects.length ? `<section class="section"><div class="section-head"><div><span class="eyebrow">BEYOND THE APP STORE</span><h2 class="section-title">Projects & experiments</h2><p class="section-sub">Code, repositories and other things in progress.</p></div><a class="text-link" href="#projects" data-route="projects">Explore projects ↗</a></div><div class="content-grid">${latestProjects.map(projectCard).join('')}</div></section>` : ''}
  <section class="section"><div class="section-head"><div><span class="eyebrow">FROM THE STUDIO</span><h2 class="section-title">Recent notices</h2><p class="section-sub">Releases, news and notes from the workbench.</p></div><a class="text-link" href="#updates" data-route="updates">All notices ↗</a></div><div class="journal-list">${latestPosts.length ? latestPosts.map(postItem).join('') : emptyState('No notices yet', 'New announcements will appear here.')}</div></section>
  <section class="section"><div class="section-head"><div><span class="eyebrow">LITTLE MOMENTS</span><h2 class="section-title">A few frames</h2><p class="section-sub">A visual diary of here and there.</p></div><a class="text-link" href="#gallery" data-route="gallery">See the gallery ↗</a></div><div class="gallery-grid">${latestPhotos.length ? latestPhotos.map((item, index) => photoMarkup(item, index, true)).join('') : emptyState('No photos yet', 'The gallery is waiting for its first frame.')}</div></section>
  <section class="quote-band"><p>“Make things you wish existed.<br>Then leave the door open.”</p><span>A NOTE TO MYSELF, MOSTLY</span></section>`;
}
function appsPage() {
  if (siteData.loading) return loadingState();
  const query = searchQuery.trim().toLowerCase();
  const categories = ['All', ...new Set(siteData.apps.map(item => categoryLabel(item.category || (item.tags || [])[0] || 'App')))];
  const filtered = siteData.apps.filter(item => {
    const searchable = [item.title, item.description, item.tag, item.platform, item.version, item.category, ...(item.tags || [])].join(' ').toLowerCase();
    return searchable.includes(query) && (appFilter === 'All' || categoryLabel(item.category || (item.tags || [])[0] || 'App') === appFilter);
  });
  return `<section class="page-intro"><span class="eyebrow">USEFUL LITTLE THINGS</span><h1>Apps</h1><p>Applications and tools made with curiosity. Find something useful, open its details and try it out.</p></section>
    <div class="toolbar"><div class="filters">${categories.map(item => `<button class="filter ${item === appFilter ? 'active' : ''}" data-action="app-filter" data-filter="${esc(item)}">${esc(item)}</button>`).join('')}</div><span class="meta">${filtered.length} OF ${siteData.apps.length} APPS</span></div>
    <div class="content-grid">${filtered.length ? filtered.map(appCard).join('') : emptyState(query ? 'No matching apps' : 'No apps published yet', query ? 'Try a different search term or category.' : 'New apps will appear here after they are published.')}</div>`;
}
function projectsPage() {
  if (siteData.loading) return loadingState();
  const categories = ['All', ...new Set(siteData.projects.map(item => item.category === 'repo' ? 'Repositories' : 'Code'))];
  const query = searchQuery.trim().toLowerCase();
  const filtered = siteData.projects.filter(item => {
    const text = [item.title, item.description, item.fullDescription, item.category, ...(item.tags || [])].join(' ').toLowerCase();
    const category = item.category === 'repo' ? 'Repositories' : 'Code';
    return text.includes(query) && (projectFilter === 'All' || category === projectFilter);
  });
  return `<section class="page-intro"><span class="eyebrow">THE WORKBENCH</span><h1>Projects & code</h1><p>Repositories, experiments and the things that sit alongside the apps.</p></section><div class="toolbar"><div class="filters">${categories.map(item => `<button class="filter ${item === projectFilter ? 'active' : ''}" data-action="project-filter" data-filter="${esc(item)}">${esc(item)}</button>`).join('')}</div><span class="meta">${filtered.length} PROJECT${filtered.length === 1 ? '' : 'S'}</span></div><div class="content-grid">${filtered.length ? filtered.map(projectCard).join('') : emptyState('No projects published yet', 'Code projects and repositories will appear here.')}</div>`;
}
function galleryPage() {
  if (siteData.loading) return loadingState();
  return `<section class="page-intro"><span class="eyebrow">THE WORLD, IN LITTLE FRAMES</span><h1>Gallery</h1><p>Color, light, and bits of everyday life. A small collection of moments worth keeping.</p></section><div class="toolbar"><span class="meta">${siteData.photos.length} PHOTOS · AND COUNTING</span></div><div class="gallery-grid page-gallery">${siteData.photos.length ? siteData.photos.map((photo, index) => photoMarkup(photo, index)).join('') : emptyState('No photos yet', 'New gallery images will appear here.')}</div>`;
}
function updatesPage() {
  if (siteData.loading) return loadingState();
  return `<section class="page-intro"><span class="eyebrow">A LITTLE NOTE FROM THE STUDIO</span><h1>Notices & updates</h1><p>New releases, changes, announcements, news and other notes from the studio.</p></section><div class="toolbar"><span class="meta">${siteData.posts.length} NOTICE${siteData.posts.length === 1 ? '' : 'S'} · FRESH FROM THE WORKBENCH</span></div><div class="journal-list updates-list">${siteData.posts.length ? siteData.posts.map(postItem).join('') : emptyState('No notices just yet', 'Announcements will appear here when published.')}</div>`;
}
function aboutPage() {
  const profile = siteData.about;
  const aboutCopy = profile.bio || profile.content || siteDefaults.bio;
  const emailLink = profile.email ? `mailto:${esc(profile.email)}` : '#';
  return `<section class="page-intro"><span class="eyebrow">A HUMAN BEHIND THE PIXELS</span><h1>A little about me</h1><p>${esc(aboutCopy)}</p></section><section class="about-panel"><div class="about-art"><span class="art-note">A WORK IN PROGRESS</span><span class="art-circle one"></span><span class="art-circle two"></span><span class="art-shape"></span></div><div class="about-copy"><span class="eyebrow">HELLO, I'M ${esc((profile.displayName || 'ARYAN').toUpperCase())}</span><h2>Glad you're here.</h2><p>${esc(aboutCopy)}</p><p>This is a small independent corner for apps, code, photographs and ideas. The website and Android app share one publishing library, while keeping their own designs.</p><p>Have a question, an idea, or just want to say hello?</p><div class="hero-actions"><a class="btn btn-green" href="${emailLink}">Get in touch ↗</a><a class="btn btn-outline" href="${GITHUB_URL}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div></div></section>`;
}
function settingsPage() {
  const profile = siteData.about;
  if (!AStoreCloud.state.isAdmin) {
    return `<section class="page-intro"><span class="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Publisher settings are available to the A-Store administrator.</p></section><div class="settings-card"><p class="section-sub">Sign in with the administrator Google account to manage publisher details and shared profile information.</p><button class="btn btn-green" data-action="account">Sign in ↗</button></div>`;
  }
  return `<section class="page-intro settings-intro-page"><span class="eyebrow">PUBLISHER DASHBOARD</span><h1>Settings</h1><p>Update the publisher details used across the A-Store ecosystem.</p></section><form id="profile-form" class="settings-card settings-profile"><div class="settings-fields"><div class="field"><label for="profile-name">Publisher name</label><input id="profile-name" name="displayName" value="${esc(profile.displayName || '')}" required maxlength="80"></div><div class="field"><label for="profile-email">Support email</label><input id="profile-email" name="email" type="email" value="${esc(profile.email || '')}" maxlength="160"></div><div class="field full"><label for="profile-bio">About / bio</label><textarea id="profile-bio" name="bio" maxlength="4000">${esc(profile.bio || profile.content || '')}</textarea></div><div class="field"><label for="profile-support">Support page URL</label><input id="profile-support" name="supportUrl" type="url" value="${esc(profile.supportUrl || '')}"></div><div class="field"><label for="profile-website">Website URL</label><input id="profile-website" name="websiteUrl" type="url" value="${esc(profile.websiteUrl || '')}"></div><div class="field"><label for="profile-privacy">Privacy policy URL</label><input id="profile-privacy" name="privacyUrl" type="url" value="${esc(profile.privacyUrl || '')}"></div><div class="field"><label for="profile-terms">Terms URL</label><input id="profile-terms" name="termsUrl" type="url" value="${esc(profile.termsUrl || '')}"></div><div class="field"><label for="profile-instagram">Instagram URL</label><input id="profile-instagram" name="instagramUrl" type="url" value="${esc(profile.instagramUrl || '')}"></div><div class="field"><label for="profile-x">X / Twitter URL</label><input id="profile-x" name="xUrl" type="url" value="${esc(profile.xUrl || '')}"></div></div><div class="form-foot"><button class="btn btn-green" type="submit">Save shared profile ✓</button></div></form>`;
}
function studioPage() {
  if (!AStoreCloud.state.isAdmin) return `<section class="page-intro"><span class="eyebrow">PUBLISHER ACCESS</span><h1>Studio</h1><p>Sign in with the configured administrator Google account to publish or manage shared content.</p></section><div class="settings-card"><button class="btn btn-green" data-action="account">Sign in with Google ↗</button></div>`;
  const groups = [
    ['Apps', siteData.apps, 'app'],
    ['Code & repositories', siteData.projects, 'project'],
    ['Gallery', uniqueArtRecords(), 'art'],
    ['Notices', siteData.posts, 'notice']
  ];
  return `<section class="page-intro"><span class="eyebrow">ADMINISTRATOR WORKSPACE</span><h1>Studio</h1><p>Publish and manage the content shared by the A-Store website and Android app.</p></section>
    <div class="settings-toolbar"><span class="meta">ONE PUBLISHING LIBRARY · THREE INTERFACES</span><div class="settings-actions"><button class="btn btn-outline" data-action="sign-out">Sign out</button><button class="btn btn-green" data-action="new-content" data-type="app">＋ New content</button></div></div>
    <div class="studio-actions"><button class="btn btn-green" data-action="new-content" data-type="app">＋ App</button><button class="btn btn-outline" data-action="new-content" data-type="project">＋ Code project</button><button class="btn btn-outline" data-action="new-content" data-type="art">＋ Gallery entry</button><button class="btn btn-outline" data-action="new-content" data-type="notice">＋ Notice</button></div>
    <div class="studio-grid">${groups.map(([title, items, type]) => `<section class="settings-card studio-card"><div class="settings-card-head"><div><span class="settings-label">${esc(title.toUpperCase())}</span><h2>${items.length} ${items.length === 1 ? 'entry' : 'entries'}</h2></div><button class="btn btn-outline btn-small" data-action="new-content" data-type="${type}">＋ Add</button></div>${items.length ? `<div class="manage-list">${items.map(item => manageItem(item, type)).join('')}</div>` : '<p class="section-sub">Nothing published yet.</p>'}</section>`).join('')}</div>
    <section class="settings-card studio-card"><div class="settings-card-head"><div><span class="settings-label">COMMUNITY</span><h2>Recent comments</h2></div></div><div id="admin-comments" class="manage-list"><p class="section-sub">Loading comments…</p></div></section>`;
}
function uniqueArtRecords() {
  return AStoreCloud.state.creations.filter(item => String(item.category || '').toLowerCase() === 'art').map(item => ({
    id: item.id, title: item.title || 'Artwork', description: item.shortDesc || '', image: item.image || '',
    images: Array.isArray(item.artImages) ? item.artImages : (item.image ? [item.image] : []), tags: item.tags || [],
    createdAt: item.createdAt, createdAtMs: AStoreCloud.timestampMillis(item.createdAt)
  }));
}
function manageItem(item, type) {
  const when = displayDate(item.createdAt || item.createdAtMs);
  return `<div class="manage-item"><div class="manage-item__info"><div class="manage-item__title">${esc(item.title || 'Untitled')}</div><div class="manage-item__meta">${esc(type.toUpperCase())} · ${esc(when)}</div></div><div class="manage-item__actions"><button class="btn btn-outline btn-small" data-action="edit-content" data-type="${esc(type)}" data-id="${esc(item.id)}">Edit</button><button class="btn btn-outline danger btn-small" data-action="delete-content" data-type="${esc(type)}" data-id="${esc(item.id)}">Delete</button></div></div>`;
}
async function loadAdminComments() {
  const target = $('#admin-comments');
  if (!target || !AStoreCloud.state.isAdmin) return;
  try {
    const comments = await AStoreCloud.getRecentComments(30);
    if (!$('#admin-comments')) return;
    target.innerHTML = comments.length ? comments.map(comment => `<div class="manage-item"><div class="manage-item__info"><div class="manage-item__title">${esc(comment.userName || 'Anonymous')}: ${esc(String(comment.text || '').slice(0, 90))}${String(comment.text || '').length > 90 ? '…' : ''}</div><div class="manage-item__meta">${esc(comment.refType || '')} · ${esc(displayDate(comment.createdAt))}</div></div><button class="btn btn-outline danger btn-small" data-action="delete-comment" data-id="${esc(comment.id)}">Delete</button></div>`).join('') : '<p class="section-sub">No comments yet.</p>';
  } catch (error) {
    console.error(error);
    if ($('#admin-comments')) $('#admin-comments').innerHTML = '<p class="section-sub">Comments could not be loaded.</p>';
  }
}
function editorField(label, name, value = '', options = {}) {
  const type = options.type || 'text';
  const required = options.required ? 'required' : '';
  const full = options.full ? 'full' : '';
  const multiple = options.multiple ? 'multiple' : '';
  if (options.textarea) return `<div class="field ${full}"><label for="edit-${name}">${esc(label)}</label><textarea id="edit-${name}" name="${esc(name)}" ${required} maxlength="${options.maxlength || 8000}">${esc(value)}</textarea></div>`;
  return `<div class="field ${full}"><label for="edit-${name}">${esc(label)}</label><input id="edit-${name}" name="${esc(name)}" type="${type}" ${multiple} value="${esc(value)}" ${required} ${options.maxlength ? `maxlength="${options.maxlength}"` : ''} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ''}></div>`;
}
function openEditor(type, id = '') {
  if (!AStoreCloud.state.isAdmin) return notify('Administrator access required.', 'error');
  const item = id ? findRawRecord(type, id) : null;
  if (id && !item) return notify('That item could not be found.', 'error');
  const isEdit = !!item;
  const title = isEdit ? `Edit ${typeLabel(type)}` : `New ${typeLabel(type)}`;
  const legacyAppUrl = item?.url || item?.link || '';
  const legacyLooksLikeFile = /\.(apk|aab|zip|7z|rar|pdf)(?:$|[?#])/i.test(legacyAppUrl);
  const initialDownloadUrl = item?.downloadLink || item?.downloadUrl || (legacyLooksLikeFile ? legacyAppUrl : '');
  const initialDownloadExtension = (initialDownloadUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i) || [,''])[1].toLowerCase();
  const savedDownloadType = String(item?.downloadType || '').toLowerCase();
  const inferredDownloadType = initialDownloadExtension === 'apk' ? 'apk' : initialDownloadExtension === 'zip' ? 'zip' : (initialDownloadUrl ? 'file' : (item ? 'website' : 'apk'));
  const initialDownloadType = ['apk', 'zip', 'file', 'website'].includes(savedDownloadType) ? savedDownloadType : (savedDownloadType ? 'file' : inferredDownloadType);
  let fields = '';
  if (type === 'app') {
    fields = `<div class="settings-fields">
      ${editorField('App name', 'title', item?.title || '', { required: true, maxlength: 100 })}
      ${editorField('Version', 'version', item?.version || '1.0.0')}
      ${editorField('Short description', 'shortDesc', item?.shortDesc || '', { required: true, full: true, maxlength: 260 })}
      ${editorField('Full description', 'fullDesc', item?.fullDesc || '', { textarea: true, full: true })}
      ${editorField('Direct download URL', 'downloadLink', initialDownloadUrl, { type: 'url', placeholder: 'https://…/your-app.apk' })}
      <div class="field"><label for="edit-downloadType">Download type</label><select id="edit-downloadType" name="downloadType"><option value="apk" ${initialDownloadType === 'apk' ? 'selected' : ''}>Android APK (install after download)</option><option value="zip" ${initialDownloadType === 'zip' ? 'selected' : ''}>ZIP archive</option><option value="file" ${initialDownloadType === 'file' ? 'selected' : ''}>Other file</option><option value="website" ${initialDownloadType === 'website' ? 'selected' : ''}>Website / web app link</option></select><small class="field-help">For APK installation in the Android app, paste a direct HTTPS link to the .apk file. A webpage or sharing-preview URL is not a direct APK link.</small></div>
      ${editorField('Platform', 'platform', item?.platform || 'Android')}
      ${editorField('Category', 'storeCategory', item?.storeCategory || '', { placeholder: 'Productivity, Utility, Tools…' })}
      ${editorField('App icon URL', 'iconURL', item?.iconURL || '', { type: 'url' })}
      ${editorField('App icon image file', 'iconFile', '', { type: 'file' })}
      ${editorField('Screenshots URLs (comma separated)', 'screenshotsText', (item?.screenshots || []).join(', '), { full: true, placeholder: 'https://…/1.png, https://…/2.png' })}
      ${editorField('Add screenshot files', 'screenshotFiles', '', { type: 'file', multiple: true })}
      ${editorField('App Store URL', 'appStore', item?.appStore || '', { type: 'url' })}
      ${editorField('Google Play URL', 'playStore', item?.playStore || '', { type: 'url' })}
      ${editorField('Size', 'size', item?.size || '')}
      ${editorField('Release notes', 'releaseNotes', item?.releaseNotes || '', { textarea: true, full: true })}
      ${editorField('Tags (comma separated)', 'tags', (item?.tags || []).join(', '), { full: true })}
    </div>`;
  } else if (type === 'project') {
    fields = `<div class="settings-fields">
      ${editorField('Project name', 'title', item?.title || '', { required: true })}
      <div class="field"><label for="edit-category">Type</label><select name="category" id="edit-category"><option value="code" ${item?.category === 'code' ? 'selected' : ''}>Code project</option><option value="repo" ${item?.category === 'repo' ? 'selected' : ''}>Repository</option></select></div>
      ${editorField('Short description', 'shortDesc', item?.shortDesc || '', { required: true, full: true })}
      ${editorField('Full description', 'fullDesc', item?.fullDesc || '', { textarea: true, full: true })}
      ${editorField('Project URL', 'link', item?.link || '', { type: 'url' })}
      ${editorField('Cover image URL', 'image', item?.image || '', { type: 'url' })}
      ${editorField('Cover image file', 'imageFile', '', { type: 'file' })}
      ${editorField('Tags (comma separated)', 'tags', (item?.tags || []).join(', '), { full: true })}
    </div>`;
  } else if (type === 'art') {
    fields = `<div class="settings-fields">
      ${editorField('Gallery title', 'title', item?.title || '', { required: true })}
      ${editorField('Description', 'shortDesc', item?.shortDesc || '', { full: true })}
      ${editorField('Image URLs (comma separated)', 'imageUrls', (item?.artImages || (item?.image ? [item.image] : [])).join(', '), { full: true })}
      ${editorField('Add image files', 'imageFiles', '', { type: 'file', full: true, multiple: true })}
      ${editorField('Tags (comma separated)', 'tags', (item?.tags || []).join(', '), { full: true })}
    </div>`;
  } else {
    fields = `<div class="settings-fields">
      ${editorField('Notice title', 'title', item?.title || '', { required: true, full: true })}
      ${editorField('Short summary', 'excerpt', item?.excerpt || '', { required: true, full: true, maxlength: 280 })}
      ${editorField('Notice / news content', 'content', item?.content || '', { textarea: true, full: true })}
      ${editorField('Category', 'category', item?.category || 'A-STORE NOTICE')}
      ${editorField('Cover image URL', 'image', item?.image || '', { type: 'url' })}
      ${editorField('Cover image file', 'imageFile', '', { type: 'file' })}
      ${editorField('Tags (comma separated)', 'tags', (item?.tags || []).join(', '), { full: true })}
    </div>`;
  }
  showModal(`<form id="content-editor" class="modal editor-modal" data-type="${esc(type)}" data-id="${esc(id)}"><div class="modal-head"><div><span class="feature-tag">${isEdit ? 'UPDATE SHARED CONTENT' : 'PUBLISH TO ALL INTERFACES'}</span><h2>${esc(title)}</h2></div><button class="close" type="button" data-action="close-modal" aria-label="Close">×</button></div>${fields}<div class="upload-status" id="editor-status" aria-live="polite"></div><div class="form-foot"><button class="btn btn-outline" type="button" data-action="close-modal">Cancel</button><button class="btn btn-green" type="submit" id="editor-submit">${isEdit ? 'Save changes' : 'Publish'} ↗</button></div></form>`, 'Content editor');
}
function typeLabel(type) { return ({ app: 'app', project: 'project', art: 'gallery entry', notice: 'notice' })[type] || 'content'; }
function findRawRecord(type, id) {
  if (type === 'notice') return AStoreCloud.state.blogs.find(item => item.id === id) || null;
  return AStoreCloud.state.creations.find(item => item.id === id) || null;
}
function splitTags(value) { return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20); }
function splitUrls(value) {
  return String(value || '').split(/[\n,]/).map(item => AStoreCloud.safeHttpUrl(item.trim())).filter(Boolean).slice(0, 12);
}
async function uploadFiles(files, statusEl) {
  const uploaded = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    statusEl.textContent = `Uploading image ${index + 1} of ${files.length}…`;
    uploaded.push(await AStoreCloud.uploadImage(file, percent => {
      statusEl.textContent = `Uploading image ${index + 1} of ${files.length} · ${percent}%`;
    }));
  }
  return uploaded;
}
async function submitEditor(form) {
  if (!AStoreCloud.state.isAdmin || editorBusy) return;
  const formData = new FormData(form);
  const type = form.dataset.type;
  const id = form.dataset.id || '';
  const status = $('#editor-status');
  const submit = $('#editor-submit');
  const value = name => String(formData.get(name) || '').trim();
  const file = name => formData.get(name);
  const files = name => Array.from(form.querySelector(`[name="${name}"]`)?.files || []);
  const tags = splitTags(value('tags'));
  const title = value('title');
  const rawDownloadUrl = type === 'app' ? value('downloadLink') : '';
  const validatedDownloadUrl = rawDownloadUrl ? AStoreCloud.safeHttpUrl(rawDownloadUrl) : '';
  if (!title) return notify('Please enter a title.', 'error');
  if (rawDownloadUrl && (!validatedDownloadUrl || !/^https:\/\//i.test(validatedDownloadUrl))) return notify('Use a valid HTTPS download URL.', 'error');
  editorBusy = true;
  submit.disabled = true;
  try {
    let payload;
    if (type === 'app') {
      let iconURL = AStoreCloud.safeHttpUrl(value('iconURL'));
      if (file('iconFile') && file('iconFile').size) iconURL = await AStoreCloud.uploadImage(file('iconFile'), p => status.textContent = `Uploading app icon · ${p}%`);
      let screenshots = splitUrls(value('screenshotsText'));
      const shotFiles = files('screenshotFiles').filter(item => item && item.size);
      if (shotFiles.length) screenshots = screenshots.concat(await uploadFiles(shotFiles, status));
      payload = {
        title, category: 'app', shortDesc: value('shortDesc'), fullDesc: value('fullDesc'),
        downloadLink: validatedDownloadUrl, downloadType: ['apk', 'zip', 'file', 'website'].includes(value('downloadType').toLowerCase()) ? value('downloadType').toLowerCase() : 'apk',
        platform: value('platform') || 'Android', version: value('version') || '1.0.0',
        storeCategory: value('storeCategory'), iconURL, screenshots, hasScreenshots: screenshots.length > 0,
        appStore: AStoreCloud.safeHttpUrl(value('appStore')), playStore: AStoreCloud.safeHttpUrl(value('playStore')),
        size: value('size'), releaseNotes: value('releaseNotes'), tags,
        tone: ['green', 'purple', 'peach', 'blue'][Math.floor(Math.random() * 4)]
      };
      if (id) await AStoreCloud.updateCreation(id, payload); else await AStoreCloud.addCreation(payload);
    } else if (type === 'project') {
      let image = AStoreCloud.safeHttpUrl(value('image'));
      if (file('imageFile') && file('imageFile').size) image = await AStoreCloud.uploadImage(file('imageFile'), p => status.textContent = `Uploading cover · ${p}%`);
      payload = {
        title, category: value('category') === 'repo' ? 'repo' : 'code',
        shortDesc: value('shortDesc'), fullDesc: value('fullDesc'),
        link: AStoreCloud.safeHttpUrl(value('link')), image, tags
      };
      if (id) await AStoreCloud.updateCreation(id, payload); else await AStoreCloud.addCreation(payload);
    } else if (type === 'art') {
      let artImages = splitUrls(value('imageUrls'));
      const imageFiles = files('imageFiles').filter(item => item && item.size);
      if (imageFiles.length) artImages = artImages.concat(await uploadFiles(imageFiles, status));
      if (!artImages.length && id) {
        const old = findRawRecord('art', id);
        artImages = old?.artImages || (old?.image ? [old.image] : []);
      }
      if (!artImages.length) throw new Error('Add at least one image URL or upload an image file.');
      payload = { title, category: 'art', shortDesc: value('shortDesc'), artImages, image: artImages[0], tags };
      if (id) await AStoreCloud.updateCreation(id, payload); else await AStoreCloud.addCreation(payload);
    } else {
      let image = AStoreCloud.safeHttpUrl(value('image'));
      if (file('imageFile') && file('imageFile').size) image = await AStoreCloud.uploadImage(file('imageFile'), p => status.textContent = `Uploading cover · ${p}%`);
      payload = {
        title, excerpt: value('excerpt'), content: value('content'), image,
        category: value('category') || 'A-STORE NOTICE', tags, source: 'a-store'
      };
      if (id) await AStoreCloud.updateBlog(id, payload); else await AStoreCloud.addBlog(payload);
    }
    closeModal();
    notify(id ? 'Changes saved and shared.' : 'Published to the A-Store ecosystem.', 'success');
    if (page !== 'studio') go('studio'); else renderMain();
  } catch (error) {
    console.error(error);
    status.textContent = error.message || 'Could not save this content.';
    notify(error.message || 'Could not save this content.', 'error');
  } finally {
    editorBusy = false;
    if ($('#editor-submit')) $('#editor-submit').disabled = false;
  }
}
async function deleteContent(type, id) {
  if (!AStoreCloud.state.isAdmin) return;
  const message = `Delete this ${typeLabel(type)} from the shared content library? This also removes it from the other interfaces.`;
  if (!confirm(message)) return;
  try {
    if (type === 'notice') await AStoreCloud.deleteBlog(id);
    else await AStoreCloud.deleteCreation(id);
    notify('Deleted from the shared library.', 'success');
  } catch (error) {
    console.error(error);
    notify(error.message || 'Delete failed.', 'error');
  }
}
function openDetail(type, id) {
  const item = type === 'blog'
    ? siteData.posts.find(value => value.id === id)
    : [...siteData.apps, ...siteData.projects].find(value => value.id === id);
  if (!item) return;
  activeDetail = { type, id };
  const image = safeUrl(item.image || item.iconURL);
  const heading = type === 'blog' ? 'NOTICE' : (item.category === 'repo' ? 'REPOSITORY' : item.category === 'code' ? 'CODE PROJECT' : 'APP');
  const cover = image ? `<img class="detail-cover" src="${image}" alt="${esc(item.title)}" loading="lazy">` : '';
  const screenshots = type === 'creation' && Array.isArray(item.shots) ? item.shots.map(url => safeUrl(url)).filter(Boolean) : [];
  const screenshotMarkup = screenshots.length ? `<div class="detail-shots">${screenshots.map(url => `<button type="button" class="detail-shot" data-action="open-image-url" data-url="${url}"><img src="${url}" alt="${esc(item.title)} screenshot" loading="lazy"></button>`).join('')}</div>` : '';
  const isAppItem = type === 'creation' && !['code', 'repo'].includes(String(item.category || '').toLowerCase()) && (!!item.platform || !!item.downloadUrl || !!item.downloadType || !!item.appStore || !!item.playStore);
  const primaryLink = type === 'blog' ? '' : safeUrl(isAppItem ? (item.downloadUrl || item.url || item.link) : (item.url || item.link));
  const linkLabel = isAppItem ? '↓ Download' : 'View project ↗';
  const body = type === 'blog' ? (item.body || item.excerpt || '') : (item.fullDescription || item.description || '');
  const comments = type === 'blog' ? commentsMarkup('blog', id) : commentsMarkup('creation', id);
  showModal(`<article class="modal detail-modal">${cover}<div class="modal-head"><div><span class="feature-tag">${esc(heading)}${item.version ? ` · V${esc(item.version)}` : ''}</span><h2>${esc(item.title)}</h2><p class="section-sub">${esc(type === 'blog' ? item.date : (item.platform || item.category || ''))}</p></div><button class="close" type="button" data-action="close-modal" aria-label="Close">×</button></div>
    <div class="detail-meta">${(item.tags || []).map(tag => `<span class="detail-tag">${esc(tag)}</span>`).join('')}</div><div class="article-copy">${esc(body)}</div>${item.releaseNotes ? `<div class="release-note"><b>What’s new · ${esc(item.version || '')}</b><p>${esc(item.releaseNotes)}</p></div>` : ''}${screenshotMarkup}${primaryLink ? `<div class="form-foot"><a class="btn btn-green" href="${primaryLink}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>${safeUrl(item.appStore) ? `<a class="btn btn-outline" href="${safeUrl(item.appStore)}" target="_blank" rel="noopener noreferrer">App Store</a>` : ''}${safeUrl(item.playStore) ? `<a class="btn btn-outline" href="${safeUrl(item.playStore)}" target="_blank" rel="noopener noreferrer">Google Play</a>` : ''}</div>` : ''}
    <section class="comments-box"><h3>Discussion</h3><div id="detail-comments">${comments}</div></section></article>`, `${item.title} details`);
  loadDetailComments(type === 'blog' ? 'blog' : 'creation', id);
}
function commentsMarkup(refType, refId) {
  const user = AStoreCloud.state.user;
  const form = user ? `<form id="comment-form" class="comment-form" data-ref-type="${esc(refType)}" data-ref-id="${esc(refId)}"><textarea name="comment" maxlength="2000" required placeholder="Write a thoughtful comment…"></textarea><div class="form-foot"><button class="btn btn-green" type="submit">Post comment</button></div></form>` : `<p class="section-sub">Sign in with Google to join the discussion.</p><button class="btn btn-outline" type="button" data-action="account">Sign in to comment</button>`;
  return `${form}<div class="comment-list"><p class="section-sub">Loading comments…</p></div>`;
}
async function loadDetailComments(refType, refId) {
  const target = $('#detail-comments .comment-list');
  if (!target) return;
  try {
    const comments = await AStoreCloud.getComments(refType, refId);
    if (!$('#detail-comments .comment-list')) return;
    target.innerHTML = comments.length ? comments.map(comment => `<article class="comment-item"><div><b>${esc(comment.userName || 'Anonymous')}</b><span class="comment-date">${esc(displayDate(comment.createdAt))}</span></div><p>${esc(comment.text || '')}</p>${AStoreCloud.state.isAdmin ? `<button class="text-link" data-action="delete-comment" data-id="${esc(comment.id)}">Delete</button>` : ''}</article>`).join('') : '<p class="section-sub">No comments yet. Be the first.</p>';
  } catch (error) {
    console.error(error);
    if ($('#detail-comments .comment-list')) $('#detail-comments .comment-list').innerHTML = '<p class="section-sub">Comments are temporarily unavailable.</p>';
  }
}
function openPhoto(index) {
  const photo = siteData.photos[index];
  if (!photo) return;
  activePhotoIndex = index;
  renderPhotoModal();
}
function renderPhotoModal() {
  const photo = siteData.photos[activePhotoIndex];
  if (!photo) return closeModal();
  const image = safeUrl(photo.image);
  showModal(`<article class="modal photo-modal"><div class="modal-head"><span class="feature-tag">PHOTO ${activePhotoIndex + 1} OF ${siteData.photos.length}</span><button class="close" type="button" data-action="close-modal" aria-label="Close">×</button></div><div class="photo-modal-stage">${image ? `<img src="${image}" alt="${esc(photo.title)}">` : ''}<button class="photo-nav prev" type="button" data-action="photo-step" data-step="-1" aria-label="Previous photo">←</button><button class="photo-nav next" type="button" data-action="photo-step" data-step="1" aria-label="Next photo">→</button></div><h2>${esc(photo.title)}</h2><p class="section-sub">${esc(photo.description || '')}</p></article>`, 'Gallery photo');
}
function adminAuthAction() {
  if (AStoreCloud.state.isAdmin) {
    go('studio');
    return;
  }
  if (AStoreCloud.state.user) {
    showModal(`<div class="modal"><div class="modal-head"><h2>Signed in</h2><button class="close" data-action="close-modal" type="button">×</button></div><p class="section-sub">${esc(AStoreCloud.state.user.email || '')}</p><p class="section-sub">This account does not have A-Store administrator access.</p><div class="form-foot"><button class="btn btn-outline" data-action="sign-out">Sign out</button><button class="btn btn-green" data-action="close-modal">Close</button></div></div>`);
    return;
  }
  AStoreCloud.signIn().then(result => {
    if (result?.user?.uid === ADMIN_UID) notify('Welcome to the studio.', 'success');
    else if (result?.user) notify('Signed in. Admin tools are only available to the configured UID.');
  }).catch(error => {
    console.error(error);
    notify(error.message || 'Google sign-in failed. Check authorized domains.', 'error');
  });
}
function updateSiteData(state) {
  siteData.apps = state.apps || [];
  siteData.projects = state.projects || [];
  siteData.photos = state.photos || [];
  siteData.posts = state.posts || [];
  siteData.about = { ...siteDefaults, ...(state.about || {}) };
  if (!siteData.about.displayName || /griffiti/i.test(String(siteData.about.displayName)) || /^a-store$/i.test(String(siteData.about.displayName).trim())) siteData.about.displayName = 'Aryan';
  if (!siteData.about.bio && siteData.about.content) siteData.about.bio = siteData.about.content;
  siteData.loading = state.loading;
  siteData.error = state.error || '';
  if (page === 'studio' && AStoreCloud.state.isAdmin) renderMain();
  else renderMain();
  updateHeader();
  if (activeDetail) {
    const modal = $('#modal');
    if (modal.classList.contains('show')) {
      const { type, id } = activeDetail;
      const exists = type === 'blog'
        ? siteData.posts.some(item => item.id === id)
        : [...siteData.apps, ...siteData.projects].some(item => item.id === id);
      if (!exists) closeModal();
    }
  }
}

// Delegated interaction handlers keep generated content free of inline scripts.
document.addEventListener('click', async event => {
  const route = event.target.closest('[data-route]');
  if (route) {
    const destination = route.dataset.route;
    if (destination) {
      event.preventDefault();
      go(destination);
      return;
    }
  }
  const action = event.target.closest('[data-action]');
  if (action) {
    const name = action.dataset.action;
    if (name === 'welcome-close') {
      try { localStorage.setItem('astore-welcome-seen', '1'); } catch (error) { console.warn('Could not save welcome preference:', error); }
      $('#welcome').classList.remove('show');
    } else if (name === 'account') adminAuthAction();
    else if (name === 'sign-out') {
      try { await AStoreCloud.signOut(); closeModal(); notify('Signed out.'); }
      catch (error) { notify(error.message || 'Could not sign out.', 'error'); }
    } else if (name === 'close-modal') closeModal();
    else if (name === 'back-top') { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (name === 'app-filter') { appFilter = action.dataset.filter || 'All'; renderMain(); }
    else if (name === 'project-filter') { projectFilter = action.dataset.filter || 'All'; renderMain(); }
    else if (name === 'open-photo') openPhoto(Number(action.dataset.index));
    else if (name === 'photo-step') {
      const count = siteData.photos.length;
      if (count) { activePhotoIndex = (activePhotoIndex + Number(action.dataset.step) + count) % count; renderPhotoModal(); }
    } else if (name === 'new-content') openEditor(action.dataset.type || 'app');
    else if (name === 'edit-content') openEditor(action.dataset.type, action.dataset.id);
    else if (name === 'delete-content') await deleteContent(action.dataset.type, action.dataset.id);
    else if (name === 'delete-comment') {
      try { await AStoreCloud.deleteComment(action.dataset.id); notify('Comment deleted.'); if (activeDetail) loadDetailComments(activeDetail.type === 'blog' ? 'blog' : 'creation', activeDetail.id); else loadAdminComments(); }
      catch (error) { notify(error.message || 'Could not delete comment.', 'error'); }
    } else if (name === 'open-image-url') {
      const url = safeUrl(action.dataset.url);
      if (url) showModal(`<div class="modal image-preview-modal"><button class="close" data-action="close-modal" type="button">×</button><img src="${url}" alt="Screenshot preview"></div>`, 'Image preview');
    }
    return;
  }
  const open = event.target.closest('[data-open-type]');
  if (open && !event.target.closest('[data-stop-card]')) {
    if (open.dataset.openType === 'blog') openDetail('blog', open.dataset.id);
    else openDetail('creation', open.dataset.id);
  }
});

document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
  if ((event.key === 'Enter' || event.key === ' ') && !typing) {
    const card = event.target.closest('[data-open-type]');
    if (card) { event.preventDefault(); openDetail(card.dataset.openType, card.dataset.id); }
  }
  if (event.key === 'Escape') closeModal();
  if ($('#modal').classList.contains('show') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && $('.photo-modal')) {
    const count = siteData.photos.length;
    if (count) { activePhotoIndex = (activePhotoIndex + (event.key === 'ArrowRight' ? 1 : -1) + count) % count; renderPhotoModal(); }
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
    const nextSearch = $('#site-search');
    if (nextSearch) { nextSearch.value = searchQuery; nextSearch.focus(); nextSearch.setSelectionRange(searchQuery.length, searchQuery.length); }
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'content-editor') {
    event.preventDefault();
    await submitEditor(event.target);
  } else if (event.target.id === 'comment-form') {
    event.preventDefault();
    const form = event.target;
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    try {
      const text = new FormData(form).get('comment');
      await AStoreCloud.addComment(form.dataset.refType, form.dataset.refId, text);
      form.reset();
      notify('Comment posted.', 'success');
      await loadDetailComments(form.dataset.refType, form.dataset.refId);
    } catch (error) {
      notify(error.message || 'Could not post comment.', 'error');
    } finally { if (button.isConnected) button.disabled = false; }
  } else if (event.target.id === 'profile-form') {
    event.preventDefault();
    if (!AStoreCloud.state.isAdmin) return notify('Administrator access required.', 'error');
    const form = new FormData(event.target);
    const payload = {};
    for (const key of ['displayName', 'bio', 'email', 'supportUrl', 'websiteUrl', 'privacyUrl', 'termsUrl', 'instagramUrl', 'xUrl']) {
      const value = String(form.get(key) || '').trim();
      payload[key] = ['supportUrl', 'websiteUrl', 'privacyUrl', 'termsUrl', 'instagramUrl', 'xUrl'].includes(key)
        ? (value ? AStoreCloud.safeHttpUrl(value) : '') : value;
    }
    try { await AStoreCloud.saveAbout(payload); notify('Publisher profile updated across the ecosystem.', 'success'); }
    catch (error) { notify(error.message || 'Could not save profile.', 'error'); }
  }
});

$('#modal').addEventListener('click', event => {
  if (event.target.id === 'modal') closeModal();
});
window.addEventListener('hashchange', currentPageFromHash);

// Render the page before contacting Firebase. The shared listeners fill in data
// as soon as they arrive; no window-load timing dependency is used.
page = (location.hash || '#home').slice(1);
if (!['home', 'apps', 'projects', 'gallery', 'updates', 'about', 'settings', 'studio'].includes(page)) page = 'home';
$('#app').innerHTML = shell();
renderMain();
try { if (!localStorage.getItem('astore-welcome-seen')) $('#welcome').classList.add('show'); }
catch (error) { console.warn('Welcome preference unavailable:', error); }
AStoreCloud.subscribe(updateSiteData);
AStoreCloud.start();
