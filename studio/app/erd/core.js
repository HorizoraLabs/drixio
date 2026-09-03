import {
   fetchTables,
   fetchTableSchema,
   executeRawQuery as runQuery,
} from '../../lib/api.js';

export async function fetchAllSchemaData() {
   const res = await fetchTables();
   if (!res || !res.success || !res.data) return [];

   const tables = res.data;
   const schemas = [];

   const promises = tables.map(async (table) => {
      const schemaRes = await fetchTableSchema(table);
      if (schemaRes && schemaRes.success) {
         schemas.push({ table, columns: schemaRes.data });
      }
   });

   await Promise.all(promises);
   return schemas;
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
   const queries = [];

   erdData.forEach((schema) => {
      if (schema.isDraft) {
         // Create new table
         const colDefs = schema.columns
            .map((col) => {
               let def = `${col.name} ${col.type}`;
               if (col.isPk) {
                  if (col.type.toUpperCase() === 'INTEGER') {
                     def += ' PRIMARY KEY AUTOINCREMENT';
                  } else {
                     def += ' PRIMARY KEY';
                  }
               }
               if (!col.nullable && !col.isPk) def += " NOT NULL DEFAULT ''"; // Default to avoid SQLite NOT NULL errors

               if (col.fkTarget) {
                  def += ` REFERENCES ${col.fkTarget.table}(${col.fkTarget.column})`;
               }
               return def;
            })
            .join(', ');

         queries.push(`CREATE TABLE ${schema.table} (${colDefs});`);
      } else {
         // Existing table, check for draft columns
         schema.columns.forEach((col) => {
            if (col.isDraft) {
               let def = `ALTER TABLE ${schema.table} ADD COLUMN ${col.name} ${col.type}`;
               if (col.fkTarget) {
                  def += ` REFERENCES ${col.fkTarget.table}(${col.fkTarget.column})`;
               }
               queries.push(def + ';');
            }
         });
      }
   });

   if (queries.length === 0) return true;

   try {
      // SQLite doesn't natively support multiple statements in a single runQuery call easily
      // depending on the adapter, so we run them sequentially.
      for (const sql of queries) {
         const res = await runQuery(sql);
         if (!res.success) throw new Error(res.error || 'Query failed');
      }
      return true;
   } catch (err) {
      window.showToast('Failed to save: ' + err.message, 'error');
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
