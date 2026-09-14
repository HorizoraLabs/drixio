export interface ReplCommand {
   type: 'connect' | 'disconnect' | 'create_database' | 'sql';
   url?: string;
   dbName?: string;
   originalSql: string;
}

export function parseReplCommand(rawSql: string): ReplCommand {
   const trimmed = rawSql.trim();

   const connectMatch = trimmed.match(/^CONNECT\s+([^\s;]+)\s*;?$/i);
   if (connectMatch) {
      return { type: 'connect', url: connectMatch[1], originalSql: rawSql };
   }

   if (/^DISCONNECT\s*;?$/i.test(trimmed)) {
      return { type: 'disconnect', originalSql: rawSql };
   }

   const createDbMatch = trimmed.match(
      /^CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?['"`]?([^'";`\s]+)['"`]?\s*;?$/i,
   );
   if (createDbMatch) {
      return { type: 'create_database', dbName: createDbMatch[1], originalSql: rawSql };
   }

   return { type: 'sql', originalSql: rawSql };
}
