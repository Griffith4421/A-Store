/* A-Store shared data bridge.
   Uses the configured Firebase project as the single source of truth.
   Firebase v8 compat is retained for compatibility with the existing data model. */
(function (global) {
  'use strict';

  const CLOUDINARY_CLOUD_NAME = 'drqibtajt';
  const CLOUDINARY_UPLOAD_PRESET = 'griffiti_uploads';
  const state = {
    loading: true,
    error: '',
    user: null,
    isAdmin: false,
    creations: [],
    blogs: [],
    about: {},
    apps: [],
    projects: [],
    photos: [],
    posts: []
  };
  const subscribers = new Set();
  let db = null;
  let auth = null;
  let started = false;
  let readyCount = 0;
  let initError = null;
  const firstSnapshots = new Set();

  function emit() {
    subscribers.forEach((callback) => {
      try { callback(state); } catch (error) { console.error('A-Store subscriber error:', error); }
    });
  }

  function timestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const number = Number(value);
    if (Number.isFinite(number)) return number;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function dateLabel(value) {
    const ms = timestampMillis(value);
    if (!ms) return 'JUST NOW';
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric'
    }).toUpperCase();
  }

  function cleanArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
  }

  function stableTone(id) {
    const tones = ['green', 'purple', 'peach', 'blue'];
    let hash = 0;
    for (const char of String(id || '')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return tones[Math.abs(hash) % tones.length];
  }

  function normalizeCreations() {
    const apps = [];
    const projects = [];
    const photos = [];

    state.creations.forEach((record) => {
      const category = String(record.category || '').toLowerCase();
      const tone = ['green', 'purple', 'peach', 'blue', 'yellow'].includes(record.tone)
        ? record.tone : stableTone(record.id);
      const common = {
        id: record.id,
        firestoreId: record.id,
        title: record.title || 'Untitled',
        description: record.shortDesc || record.description || '',
        fullDescription: record.fullDesc || record.fullDescription || '',
        tags: cleanArray(record.tags),
        tone,
        createdAt: record.createdAt || null,
        updatedAt: record.updatedAt || record.createdAt || null,
        createdAtMs: timestampMillis(record.createdAt),
        updatedAtMs: timestampMillis(record.updatedAt || record.createdAt)
      };

      if (category === 'app') {
        const screenshots = cleanArray(record.screenshots);
        const fallbackShots = typeof record.shots === 'string'
          ? record.shots.split(',').map((url) => url.trim()).filter(Boolean)
          : cleanArray(record.shots);
        const tags = common.tags;
        const legacyUrl = record.url || record.link || '';
        const explicitDownloadUrl = record.downloadLink || record.downloadUrl || record.apkUrl || record.fileUrl || '';
        const urlLooksLikeFile = (value) => {
          try { return /\.(apk|aab|zip|7z|rar|pdf|exe|msi|dmg)(?:$|[?#])/i.test(new URL(value).pathname); }
          catch { return false; }
        };
        // Old Griffiti records often stored the direct file URL in `url` or `link`.
        // Keep those working while preferring the explicit downloadLink field for new records.
        const downloadUrl = explicitDownloadUrl || (urlLooksLikeFile(legacyUrl) ? legacyUrl : '');
        const landingUrl = record.websiteUrl || record.externalUrl || (!downloadUrl ? legacyUrl : '');
        const downloadType = String(record.downloadType || (urlLooksLikeFile(downloadUrl) ? (downloadUrl.match(/\.([a-z0-9]+)(?:$|[?#])/i) || [,''])[1] : '') || '').toLowerCase();
        apps.push({
          ...common,
          tag: record.tag || (tags.length ? tags.join(' · ').toUpperCase() : 'APP · DOWNLOAD'),
          category: record.storeCategory || record.appCategory || (tags[0] || 'App'),
          url: downloadUrl || landingUrl || legacyUrl,
          downloadUrl,
          downloadType,
          externalUrl: landingUrl,
          icon: record.icon || '',
          iconURL: record.iconURL || '',
          platform: record.platform || 'Android',
          version: record.version || '',
          size: record.size || '',
          shots: screenshots.length ? screenshots : fallbackShots,
          screenshots,
          appStore: record.appStore || '',
          playStore: record.playStore || '',
          releaseNotes: record.releaseNotes || '',
          ageRating: record.ageRating || ''
        });
      } else if (category === 'code' || category === 'repo') {
        projects.push({
          ...common,
          category,
          tag: category === 'repo' ? 'REPOSITORY' : 'CODE PROJECT',
          image: record.image || '',
          url: record.link || '',
          link: record.link || ''
        });
      } else if (category === 'art') {
        const images = cleanArray(record.artImages);
        if (!images.length && typeof record.image === 'string' && record.image.trim()) images.push(record.image.trim());
        images.forEach((image, index) => {
          photos.push({
            ...common,
            id: `${record.id}__${index}`,
            groupId: record.id,
            index,
            image,
            tone: 'custom',
            title: record.title || 'Photo',
            description: record.shortDesc || '',
            tags: common.tags
          });
        });
      }
    });

    const newest = (a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0);
    state.apps = apps.sort(newest);
    state.projects = projects.sort(newest);
    state.photos = photos.sort(newest);
  }

  function normalizeBlogs() {
    state.posts = state.blogs.map((record) => ({
      id: record.id,
      title: record.title || 'Untitled notice',
      excerpt: record.excerpt || '',
      body: record.content || record.body || record.excerpt || '',
      category: record.category || (cleanArray(record.tags).length ? cleanArray(record.tags)[0].toUpperCase() : 'NOTICE'),
      tags: cleanArray(record.tags),
      image: record.image || '',
      date: dateLabel(record.createdAt),
      createdAt: record.createdAt || null,
      createdAtMs: timestampMillis(record.createdAt),
      updatedAtMs: timestampMillis(record.updatedAt || record.createdAt)
    })).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  function markSnapshotReady(name) {
    if (!firstSnapshots.has(name)) {
      firstSnapshots.add(name);
      readyCount += 1;
    }
    if (readyCount >= 3) state.loading = false;
  }

  function start() {
    if (started) return;
    started = true;
    if (!global.firebase || !global.firebaseConfig || !global.ADMIN_UID) {
      state.loading = false;
      state.error = 'Firebase configuration is missing. Check js/config.js.';
      emit();
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(global.firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      const provider = new firebase.auth.GoogleAuthProvider();

      auth.onAuthStateChanged((user) => {
        state.user = user || null;
        state.isAdmin = !!(user && user.uid === global.ADMIN_UID);
        emit();
      }, (error) => {
        console.error('A-Store auth state error:', error);
        state.error = state.error || 'Authentication status could not be checked.';
        emit();
      });

      db.collection('creations').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        state.creations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        normalizeCreations();
        markSnapshotReady('creations');
        emit();
      }, (error) => {
        console.error('A-Store creations listener error:', error);
        state.error = state.error || 'Apps, projects or gallery content could not be loaded.';
        state.creations = [];
        normalizeCreations();
        markSnapshotReady('creations');
        emit();
      });

      db.collection('blogs').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        state.blogs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        normalizeBlogs();
        markSnapshotReady('blogs');
        emit();
      }, (error) => {
        console.error('A-Store notices listener error:', error);
        state.error = state.error || 'Notices could not be loaded.';
        state.blogs = [];
        normalizeBlogs();
        markSnapshotReady('blogs');
        emit();
      });

      db.collection('about').doc('main').onSnapshot((snapshot) => {
        state.about = snapshot.exists ? snapshot.data() : {};
        markSnapshotReady('about');
        emit();
      }, (error) => {
        console.error('A-Store profile listener error:', error);
        state.about = {};
        state.error = state.error || 'Publisher information could not be loaded.';
        markSnapshotReady('about');
        emit();
      });

      state.provider = provider;
    } catch (error) {
      console.error('A-Store Firebase initialization error:', error);
      initError = error;
      state.loading = false;
      state.error = 'Firebase could not be initialized. Check the project configuration.';
      emit();
    }
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    subscribers.add(callback);
    callback(state);
    return () => subscribers.delete(callback);
  }

  function requireAdmin() {
    if (!state.isAdmin || !state.user) throw new Error('Sign in with the administrator account to make changes.');
    return true;
  }

  async function signIn() {
    if (!auth) throw new Error('Firebase Authentication is not ready.');
    const provider = state.provider || new firebase.auth.GoogleAuthProvider();
    try {
      return await auth.signInWithPopup(provider);
    } catch (error) {
      if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment')) {
        await auth.signInWithRedirect(provider);
        return null;
      }
      throw error;
    }
  }

  async function signOut() {
    if (!auth) return;
    await auth.signOut();
  }

  async function addCreation(payload) {
    requireAdmin();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection('creations').add({ ...payload, createdAt: now, updatedAt: now });
  }

  async function updateCreation(id, payload) {
    requireAdmin();
    if (!id) throw new Error('Missing content ID.');
    return db.collection('creations').doc(id).set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  async function deleteCreation(id) {
    requireAdmin();
    if (!id) throw new Error('Missing content ID.');
    return db.collection('creations').doc(id).delete();
  }

  async function addBlog(payload) {
    requireAdmin();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection('blogs').add({ ...payload, createdAt: now, updatedAt: now });
  }

  async function updateBlog(id, payload) {
    requireAdmin();
    if (!id) throw new Error('Missing notice ID.');
    return db.collection('blogs').doc(id).set({ ...payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  async function deleteBlog(id) {
    requireAdmin();
    if (!id) throw new Error('Missing notice ID.');
    return db.collection('blogs').doc(id).delete();
  }

  async function saveAbout(payload) {
    requireAdmin();
    const clean = { ...payload, content: String(payload.bio || payload.content || '') };
    clean.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection('about').doc('main').set(clean, { merge: true });
  }

  async function getComments(refType, refId) {
    if (!db) return [];
    const snapshot = await db.collection('comments')
      .where('refType', '==', refType)
      .where('refId', '==', refId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async function addComment(refType, refId, text) {
    if (!state.user) throw new Error('Sign in with Google before commenting.');
    const comment = String(text || '').trim();
    if (!comment || comment.length > 2000) throw new Error('Comments must be between 1 and 2,000 characters.');
    if (!['creation', 'blog'].includes(refType) || !refId) throw new Error('This discussion is not available.');
    return db.collection('comments').add({
      refType,
      refId,
      text: comment,
      userId: state.user.uid,
      userName: state.user.displayName || 'Anonymous',
      userPhoto: state.user.photoURL || '',
      userEmail: state.user.email || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function deleteComment(id) {
    requireAdmin();
    return db.collection('comments').doc(id).delete();
  }

  async function getRecentComments(limit) {
    requireAdmin();
    const snapshot = await db.collection('comments').orderBy('createdAt', 'desc').limit(limit || 50).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async function uploadImage(file, onProgress) {
    requireAdmin();
    if (!file || !file.type || !file.type.startsWith('image/')) throw new Error('Choose a valid image file.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Images must be 10 MB or smaller.');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
      xhr.timeout = 60000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && typeof onProgress === 'function') {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        let response;
        try { response = JSON.parse(xhr.responseText || '{}'); }
        catch { reject(new Error('Image service returned an unreadable response.')); return; }
        if (xhr.status >= 200 && xhr.status < 300 && typeof response.secure_url === 'string') {
          resolve(response.secure_url);
        } else {
          reject(new Error(response.error?.message || `Image upload failed (HTTP ${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during image upload.'));
      xhr.ontimeout = () => reject(new Error('Image upload timed out. Please try again.'));
      xhr.send(formData);
    });
  }

  function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim(), global.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  global.AStoreCloud = {
    state,
    start,
    subscribe,
    signIn,
    signOut,
    addCreation,
    updateCreation,
    deleteCreation,
    addBlog,
    updateBlog,
    deleteBlog,
    saveAbout,
    getComments,
    addComment,
    deleteComment,
    getRecentComments,
    uploadImage,
    safeHttpUrl,
    timestampMillis,
    dateLabel
  };
})(window);
