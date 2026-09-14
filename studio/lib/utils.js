/**
 * Drixio Studio Shared Utility Library
 * Centralized helpers for formatting, security escaping, and string manipulation.
 */

export function escapeHtml(str) {
   if (str === null || str === undefined) return '';
   return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

export function formatBytes(bytes) {
   if (bytes === 0 || !bytes) return '0 B';
   const k = 1024;
   const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k));
   return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatUptime(seconds) {
   if (!seconds || seconds <= 0) return 'N/A';
   const d = Math.floor(seconds / (3600 * 24));
   const h = Math.floor((seconds % (3600 * 24)) / 3600);
   const m = Math.floor((seconds % 3600) / 60);
   let res = '';
   if (d > 0) res += `${d}d `;
   if (h > 0) res += `${h}h `;
   res += `${m}m`;
   return res || '< 1m';
}

export function truncateText(str, maxLen = 3000) {
   if (!str) return '';
   const s = String(str);
   if (s.length <= maxLen) return s;
   return s.slice(0, maxLen) + '... [truncated]';
}

export function quoteId(name) {
   return `"${(name || '').replace(/"/g, '""')}"`;
}

export function escapeStr(val) {
   return (val || '').replace(/'/g, "''");
}
