import {
   fetchTables,
   fetchTableSchema,
   mutateTableSchema,
} from '../../lib/api.js';

export async function fetchAllSchemaData() {
   const res = await fetchTables();
   if (!res || !res.success || !res.data) return [];

   const tables = Array.isArray(res.data) ? [...res.data].sort() : [];
   const results = await Promise.all(
      tables.map(async (table) => {
         const schemaRes = await fetchTableSchema(table);
         if (schemaRes && schemaRes.success) {
            return { table, columns: schemaRes.data };
         }
         return null;
      }),
   );

   return results.filter(Boolean);
}

export function loadSavedPositions() {
   try {
      const data = localStorage.getItem('drixio-erd-positions');
      return data ? JSON.parse(data) : {};
   } catch (e) {
      return {};
   }
}

export function savePositions(positions) {
   localStorage.setItem('drixio-erd-positions', JSON.stringify(positions));
}

export async function saveErdDrafts(erdData) {
   if (!erdData) return true;
   try {
      for (const schema of erdData) {
         if (schema.isDraft) {
            const res = await mutateTableSchema(schema.table, {
               columns: schema.columns,
            });
            if (!res.success)
               throw new Error(res.error || 'Failed to create table');
         } else {
            const draftCols = schema.columns.filter((c) => c.isDraft);
            if (draftCols.length > 0) {
               const res = await mutateTableSchema(schema.table, {
                  pendingInserts: draftCols,
               });
               if (!res.success)
                  throw new Error(res.error || 'Failed to add column');
            }
         }
      }
      return true;
   } catch (err) {
      window.showToast?.('Failed to save: ' + err.message, 'error');
      return false;
   }
}

export function getErdPendingDraftCount(erdData) {
   if (!erdData) return 0;
   let count = 0;
   erdData.forEach((schema) => {
      if (schema.isDraft) {
         count++;
      } else {
         schema.columns.forEach((col) => {
            if (col.isDraft) count++;
         });
      }
   });
   return count;
}

export function autoLayoutErd(erdData) {
   if (!erdData || erdData.length === 0) return;

   const deps = {};
   erdData.forEach((t) => (deps[t.table] = new Set()));

   erdData.forEach((t) => {
      t.columns.forEach((col) => {
         if (col.fkTarget && col.fkTarget.table && deps[t.table]) {
            if (col.fkTarget.table !== t.table) {
               deps[t.table].add(col.fkTarget.table);
            }
         }
      });
   });

   const ranks = {};
   erdData.forEach((t) => (ranks[t.table] = 0));

   let changed = true;
   let iterations = 0;
   while (changed && iterations < erdData.length + 5) {
      changed = false;
      iterations++;
      for (const t of erdData) {
         const myRank = ranks[t.table];
         for (const parent of deps[t.table]) {
            if (ranks[parent] !== undefined && ranks[parent] >= myRank) {
               ranks[t.table] = ranks[parent] + 1;
               changed = true;
            }
         }
      }
   }

   const rankGroups = {};
   for (const t of erdData) {
      const r = ranks[t.table] || 0;
      if (!rankGroups[r]) rankGroups[r] = [];
      rankGroups[r].push(t.table);
   }

   const positions = loadSavedPositions() || {};

   const startX = 600;
   const startY = 400;
   const gapX = 360;
   const gapY = 260;

   Object.keys(rankGroups).forEach((r) => {
      const rank = parseInt(r);
      const tablesInRank = rankGroups[r];

      tablesInRank.forEach((tableName, index) => {
         positions[tableName] = {
            x: startX + rank * gapX,
            y: startY + index * gapY,
         };
      });
   });

   savePositions(positions);
   return positions;
}

export function exportErdAsSql(erdData) {
   if (!erdData || erdData.length === 0) return '';
   const dbType = (window.AppState?.dbType || 'sqlite').toLowerCase();
   const quote = dbType === 'mysql' ? '`' : '"';

   const lines = [];
   erdData.forEach((schema) => {
      const colDefs = schema.columns.map((c) => {
         let def = `  ${quote}${c.name}${quote} ${c.type}`;
         if (c.isPk) def += ' PRIMARY KEY';
         if (!c.nullable && !c.isPk) def += ' NOT NULL';
         if (c.isUnique && !c.isPk) def += ' UNIQUE';
         return def;
      });

      schema.columns.forEach((c) => {
         if (c.fkTarget && c.fkTarget.table && c.fkTarget.column) {
            colDefs.push(
               `  FOREIGN KEY (${quote}${c.name}${quote}) REFERENCES ${quote}${c.fkTarget.table}${quote}(${quote}${c.fkTarget.column}${quote})`,
            );
         }
      });

      lines.push(
         `CREATE TABLE ${quote}${schema.table}${quote} (\n${colDefs.join(',\n')}\n);`,
      );
   });

   return lines.join('\n\n');
}

export function exportErdAsSvg() {
   const nodes = document.querySelectorAll('.erd-node');
   const svgLayer = document.getElementById('erd-svg-layer');
   if (!nodes || nodes.length === 0 || !svgLayer) {
      window.showToast?.('No tables to export', 'warning');
      return;
   }

   let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
   nodes.forEach((n) => {
      const x = parseFloat(n.style.left) || 0;
      const y = parseFloat(n.style.top) || 0;
      const w = n.offsetWidth || 290;
      const h = n.offsetHeight || 150;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
   });

   const pad = 60;
   const width = maxX - minX + pad * 2;
   const height = maxY - minY + pad * 2;
   const offsetX = minX - pad;
   const offsetY = minY - pad;

   const isDark =
      document.documentElement.getAttribute('data-theme') !== 'light';
   const bg = isDark ? '#111113' : '#f8fafc';
   const cardBg = isDark ? '#18181b' : '#ffffff';
   const cardBorder = isDark ? '#27272a' : '#e2e8f0';
   const text = isDark ? '#f4f4f5' : '#0f172a';
   const textSec = isDark ? '#a1a1aa' : '#64748b';
   const primary = '#3b82f6';

   let nodesSvg = '';
   nodes.forEach((n) => {
      const x = (parseFloat(n.style.left) || 0) - offsetX;
      const y = (parseFloat(n.style.top) || 0) - offsetY;
      const w = n.offsetWidth || 290;
      const h = n.offsetHeight || 150;
      const title = n.querySelector('.erd-node-name')?.textContent || '';

      const cols = Array.from(n.querySelectorAll('.erd-column')).map((c) => {
         const name = c.querySelector('.erd-col-name')?.textContent || '';
         const type = c.querySelector('.erd-col-type')?.textContent || '';
         const isPk = !!c.querySelector('.erd-badge-pk');
         const isPfk = !!c.querySelector('.erd-badge-pfk');
         const isFk = !isPfk && !!c.querySelector('.erd-badge-fk');
         const isUq = !!c.querySelector('.erd-badge-unique');
         return { name, type, isPk, isPfk, isFk, isUq };
      });

      let colsSvg = '';
      cols.forEach((col, idx) => {
         const cy = 40 + idx * 32;
         let badgeSvg = '';
         if (col.isPfk) {
            badgeSvg = `<rect x="12" y="${cy + 6}" width="26" height="15" rx="3" fill="rgba(99,102,241,0.2)" stroke="#818cf8" stroke-width="0.8"/><text x="25" y="${cy + 17}" font-size="9" font-family="monospace" font-weight="700" fill="#a5b4fc" text-anchor="middle">PFK</text>`;
         } else if (col.isPk) {
            badgeSvg = `<rect x="12" y="${cy + 6}" width="20" height="15" rx="3" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" stroke-width="0.8"/><text x="22" y="${cy + 17}" font-size="9" font-family="monospace" font-weight="700" fill="#fbbf24" text-anchor="middle">PK</text>`;
         } else if (col.isFk) {
            badgeSvg = `<rect x="12" y="${cy + 6}" width="20" height="15" rx="3" fill="rgba(59,130,246,0.2)" stroke="#3b82f6" stroke-width="0.8"/><text x="22" y="${cy + 17}" font-size="9" font-family="monospace" font-weight="700" fill="#60a5fa" text-anchor="middle">FK</text>`;
         } else if (col.isUq) {
            badgeSvg = `<rect x="12" y="${cy + 6}" width="20" height="15" rx="3" fill="rgba(14,165,233,0.2)" stroke="#0ea5e9" stroke-width="0.8"/><text x="22" y="${cy + 17}" font-size="9" font-family="monospace" font-weight="700" fill="#38bdf8" text-anchor="middle">UQ</text>`;
         } else {
            badgeSvg = `<circle cx="18" cy="${cy + 14}" r="2" fill="${textSec}"/>`;
         }

         const colNameX = col.isPfk
            ? 44
            : col.isPk || col.isFk || col.isUq
              ? 38
              : 28;
         colsSvg += `
            <line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="${cardBorder}" stroke-width="0.5"/>
            ${badgeSvg}
            <text x="${colNameX}" y="${cy + 18}" font-size="12" font-family="monospace" font-weight="${col.isPk ? '700' : '500'}" fill="${text}">${col.name}</text>
            <text x="${w - 12}" y="${cy + 18}" font-size="10.5" font-family="monospace" fill="${primary}" text-anchor="end">${col.type}</text>
         `;
      });

      nodesSvg += `
         <g transform="translate(${x}, ${y})">
            <rect width="${w}" height="${h}" rx="8" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1"/>
            <rect width="${w}" height="36" rx="8" fill="${isDark ? '#202024' : '#f1f5f9'}"/>
            <rect y="28" width="${w}" height="8" fill="${isDark ? '#202024' : '#f1f5f9'}"/>
            <line x1="0" y1="36" x2="${w}" y2="36" stroke="${cardBorder}" stroke-width="1"/>
            <text x="14" y="23" font-size="13" font-family="sans-serif" font-weight="700" fill="${text}">${title}</text>
            <text x="${w - 14}" y="23" font-size="11" font-family="sans-serif" fill="${textSec}" text-anchor="end">${cols.length} cols</text>
            ${colsSvg}
         </g>
      `;
   });

   // Clone SVG path elements with offset
   const paths = Array.from(
      svgLayer.querySelectorAll('.erd-relationship-path'),
   );
   let pathsSvg = '';
   paths.forEach((p) => {
      const d = p.getAttribute('d') || '';
      const shiftedD = d.replace(/([0-9.]+)\s+([0-9.]+)/g, (_match, px, py) => {
         return `${(parseFloat(px) - offsetX).toFixed(1)} ${(parseFloat(py) - offsetY).toFixed(1)}`;
      });
      pathsSvg += `<path d="${shiftedD}" fill="none" stroke="${isDark ? '#818cf8' : '#6366f1'}" stroke-width="2" opacity="0.8" marker-start="url(#crows-foot-zero-many)" marker-end="url(#one-and-only-one)"/>`;
   });

   const svgStr = `<?xml version="1.0" standalone="no"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
   <defs>
      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
         <circle cx="2" cy="2" r="1" fill="${isDark ? '#27272a' : '#cbd5e1'}" />
      </pattern>
      <marker id="crows-foot-zero-many" viewBox="0 0 16 10" refX="16" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
         <path d="M 16 0 L 8 5 M 16 10 L 8 5 M 16 5 L 8 5 M 4 5 L 0 5" fill="none" stroke="${isDark ? '#818cf8' : '#6366f1'}" stroke-width="1.5" />
         <circle cx="5" cy="5" r="3" fill="${bg}" stroke="${isDark ? '#818cf8' : '#6366f1'}" stroke-width="1.5" />
      </marker>
      <marker id="one-and-only-one" viewBox="0 0 16 10" refX="13" refY="5" markerWidth="10" markerHeight="10" orient="auto">
         <path d="M 10 0 L 10 10 M 6 0 L 6 10" fill="none" stroke="${isDark ? '#818cf8' : '#6366f1'}" stroke-width="1.5" />
      </marker>
   </defs>
   <rect width="100%" height="100%" fill="${bg}" />
   <rect width="100%" height="100%" fill="url(#grid)" />
   <g>${pathsSvg}</g>
   <g>${nodesSvg}</g>
</svg>`;

   const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = `erd-diagram-${new Date().toISOString().slice(0, 10)}.svg`;
   a.click();
   URL.revokeObjectURL(url);
   window.showToast?.('Exported ERD as SVG!', 'success');
}
