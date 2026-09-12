/**
 * Connection Store and Hot-Swapping Manager for Drixio Studio
 * Allows persisting multiple database connections (SQLite, PostgreSQL, MySQL)
 * and switching between them on-the-fly without page reloads.
 */

const STORAGE_KEY = 'drixio_saved_connections';

/**
 * @typedef {Object} SavedConnection
 * @property {string} id
 * @property {string} name
 * @property {'sqlite' | 'postgres' | 'mysql'} dialect
 * @property {string} url
 * @property {boolean} isRemote
 * @property {string} badgeLabel
 * @property {number} lastConnected
 */

export function getSavedConnections() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
   } catch {
      return [];
   }
}

export function saveConnection(profile) {
   if (!profile || !profile.url) return getSavedConnections();

   const list = getSavedConnections();
   const cleanUrl = profile.url.trim();

   // Derive a friendly display name if not provided
   let displayName = profile.name;
   if (!displayName) {
      if (profile.dialect === 'sqlite') {
         displayName =
            cleanUrl
               .replace(/^file:/, '')
               .split(/[/\\]/)
               .pop() || 'sqlite.db';
      } else {
         const parts = cleanUrl.split('/');
         const dbPart = parts.pop()?.split('?')[0];
         displayName = dbPart || 'database';
      }
   }

   const existingIndex = list.findIndex(
      (c) => c.url.trim().toLowerCase() === cleanUrl.toLowerCase(),
   );

   const entry = {
      id:
         existingIndex >= 0
            ? list[existingIndex].id
            : `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: displayName,
      dialect: profile.dialect || 'sqlite',
      url: cleanUrl,
      isRemote: !!profile.isRemote,
      badgeLabel: profile.badgeLabel || (profile.isRemote ? 'REMOTE' : 'LOCAL'),
      lastConnected: Date.now(),
   };

   if (existingIndex >= 0) {
      list[existingIndex] = { ...list[existingIndex], ...entry };
   } else {
      list.unshift(entry);
   }

   localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
   return list;
}

export function removeConnection(id) {
   const list = getSavedConnections().filter((c) => c.id !== id);
   localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
   return list;
}

export async function switchDatabase(connection) {
   if (!connection || !connection.url) return false;

   if (typeof window.showToast === 'function') {
      window.showToast(`Connecting to ${connection.name}...`, 'info');
   }

   try {
      const res = await fetch('/api/connect', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            url: connection.url,
            saveToEnv: false,
         }),
      });

      const data = await res.json();
      if (!data.success) {
         throw new Error(data.error || 'Failed to connect');
      }

      // Update lastConnected timestamp in store
      saveConnection({
         ...connection,
         lastConnected: Date.now(),
      });

      // Update Global AppState
      if (window.AppState) {
         window.AppState.dbType = data.data.dbType;
         window.AppState.isRemote = connection.isRemote;
         window.AppState.badgeLabel = connection.badgeLabel;
         window.AppState.currentTable = null;
         window.AppState.currentTableBtnElement = null;
      }

      // Update Header Breadcrumbs
      const dbNameEl = document.getElementById('db-name');
      if (dbNameEl) {
         dbNameEl.textContent = data.data.dbName || connection.name;
      }

      const envBadge = document.getElementById('env-badge');
      if (envBadge) {
         envBadge.textContent = connection.badgeLabel;
         envBadge.className = `env-badge ${connection.isRemote ? 'remote' : 'local'}`;
         envBadge.classList.remove('hidden');
      }

      // Refresh Tables in Sidebar
      if (typeof window.initSidebar === 'function') {
         await window.initSidebar(true);
      }

      // Activate connected mode in UI
      if (typeof window.setStudioConnectionMode === 'function') {
         window.setStudioConnectionMode(true);
      }

      // Switch to Table Editor view if currently on connect-btn or no view
      if (
         window.AppState?.currentTab === 'connect-btn' &&
         typeof window.handleSwitchTab === 'function'
      ) {
         window.handleSwitchTab('data-btn');
      } else if (typeof window.renderCurrentView === 'function') {
         window.renderCurrentView('', true);
      }

      if (typeof window.showToast === 'function') {
         window.showToast(
            `Switched to database: ${connection.name}`,
            'success',
         );
      }

      return true;
   } catch (err) {
      if (typeof window.showToast === 'function') {
         window.showToast(`Connection error: ${err.message}`, 'error');
      }
      return false;
   }
}
