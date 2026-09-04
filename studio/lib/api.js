export async function fetchTables() {
   const res = await fetch('/api/tables');
   const data = await res.json();
   return data;
}

export async function fetchConfig() {
   const res = await fetch('/api/config');
   const data = await res.json();
   return data;
}

export async function fetchTableStats() {
   const res = await fetch('/api/tables/stats');
   const data = await res.json();
   return data;
}

export async function fetchTableWithName(tableName, options = {}) {
   const { where = '', limit = 50, offset = 0, orderCol, orderAsc } = options;
   const params = new URLSearchParams();
   if (where) params.append('where', where);
   params.append('limit', limit.toString());
   params.append('offset', offset.toString());
   if (orderCol) {
      params.append('orderCol', orderCol);
      params.append('orderAsc', orderAsc !== false ? 'true' : 'false');
   }

   const url = `/api/tables/${tableName}/data?${params.toString()}`;
   const res = await fetch(url);
   const data = await res.json();
   return data;
}

export async function fetchTableSchema(tableName) {
   const res = await fetch(`/api/tables/${tableName}/schema`);
   const data = await res.json();
   return data;
}

export async function fetchTableIndexes(tableName) {
   const res = await fetch(`/api/tables/${tableName}/indexes`);
   const data = await res.json();
   return data;
}

export async function executeRawQuery(sql) {
   const res = await fetch('/api/query', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
   });
   const data = await res.json();
   return data;
}

export async function mutateTableRecords(tableName, payload) {
   const res = await fetch(
      `/api/tables/${encodeURIComponent(tableName)}/records`,
      {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify(payload),
      },
   );
   return await res.json();
}

export async function mutateTableSchema(tableName, payload) {
   const res = await fetch(
      `/api/tables/${encodeURIComponent(tableName)}/schema`,
      {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify(payload),
      },
   );
   return await res.json();
}

export async function truncateTableApi(tableName) {
   const res = await fetch(
      `/api/tables/${encodeURIComponent(tableName)}/truncate`,
      {
         method: 'POST',
      },
   );
   return await res.json();
}
