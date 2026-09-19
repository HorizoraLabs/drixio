import { TableSchemaInfo } from './types.js';

export interface AiConfig {
   provider?: 'deepseek' | 'ollama' | 'openai' | 'custom';
   baseUrl?: string;
   apiKey?: string;
   model?: string;
   temperature?: number;
}

export const DEFAULT_AI_PRESETS: Record<string, { baseUrl: string; model: string; defaultKey?: string }> = {
   deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
   },
   ollama: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3',
      defaultKey: 'ollama',
   },
   openai: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
   },
};

/**
 * Builds a compact schema summary of the database for the LLM context.
 */
export function buildSchemaContext(
   tables: TableSchemaInfo[],
   dialect: string,
   currentTable?: string,
): string {
   if (!tables || tables.length === 0) {
      return `Database Dialect: ${dialect.toUpperCase()}\nNo tables currently present in database.`;
   }

   const sortedTables = [...tables].sort((a, b) => {
      if (currentTable && a.tableName === currentTable) return -1;
      if (currentTable && b.tableName === currentTable) return 1;
      return 0;
   });

   const lines: string[] = [
      `Database Dialect: ${dialect.toUpperCase()}`,
      `Tables:`,
   ];

   for (const table of sortedTables) {
      const isCurrent = currentTable && table.tableName === currentTable;
      const colDefs = table.columns.map((col) => {
         let def = `${col.name} ${col.type || 'TEXT'}`;
         if (col.isPk) def += ' [PK]';
         if (col.isUnique) def += ' [UNIQUE]';
         if (!col.nullable) def += ' NOT NULL';
         if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
         if (col.fkTarget) {
            def += ` [FK -> ${col.fkTarget.table}.${col.fkTarget.column}]`;
         } else {
            const tableFk = (table as any).foreignKeys?.find(
               (f: any) => f.fromColumn === col.name,
            );
            if (tableFk) {
               const toTable = tableFk.table || tableFk.toTable;
               const toCol = tableFk.column || tableFk.toColumn;
               def += ` [FK -> ${toTable}.${toCol}]`;
            }
         }
         return def;
      });

      lines.push(
         `- ${table.tableName}${isCurrent ? ' (active)' : ''}: (${colDefs.join(', ')})`,
      );
   }

   return lines.join('\n');
}

/**
 * Dispatches an OpenAI-compatible chat completion request.
 */
export async function callOpenAiCompatible(
   config: AiConfig,
   messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<{ content: string; model: string }> {
   const preset = config.provider && DEFAULT_AI_PRESETS[config.provider];
   const baseUrl = (config.baseUrl || preset?.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
   const apiKey = config.apiKey || preset?.defaultKey || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '';
   const model = config.model || preset?.model || 'deepseek-chat';
   const temperature = config.temperature ?? 0.1;

   const endpoint = `${baseUrl}/chat/completions`;

   const headers: Record<string, string> = {
      'Content-Type': 'application/json',
   };
   if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
   }

   const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
         model,
         messages,
         temperature,
         stream: false,
      }),
      signal: AbortSignal.timeout(45000),
   });

   if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `AI API error (${res.status} ${res.statusText})`;
      try {
         const errJson = JSON.parse(errText);
         if (errJson.error?.message) {
            errMsg += `: ${errJson.error.message}`;
         } else if (errJson.message) {
            errMsg += `: ${errJson.message}`;
         }
      } catch {
         if (errText) errMsg += `: ${errText.slice(0, 150)}`;
      }
      throw new Error(errMsg);
   }

   const json = (await res.json()) as any;
   const content = json.choices?.[0]?.message?.content || '';
   return {
      content: content.trim(),
      model: json.model || model,
   };
}

/**
 * Extracts raw SQL from an LLM response string, stripping ```sql ... ``` fences if present.
 */
export function extractSqlFromResponse(text: string): { sql: string; explanation: string } {
   const trimmed = (text || '').trim();

   // Match ```sql ... ``` or ``` ... ``` code blocks
   const codeBlockMatch = trimmed.match(/```(?:sql)?\s*([\s\S]*?)```/i);
   if (codeBlockMatch) {
      const sql = codeBlockMatch[1].trim();
      const explanation = trimmed.replace(/```(?:sql)?\s*[\s\S]*?```/gi, '').trim();
      return { sql, explanation };
   }

   // If the whole response looks like a SQL statement
   const looksLikeSql = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i.test(trimmed);
   if (looksLikeSql && !trimmed.includes('\n\n')) {
      return { sql: trimmed, explanation: '' };
   }

   return { sql: trimmed, explanation: '' };
}

/**
 * Generates SQL from natural language prompt.
 */
export async function generateSqlFromPrompt(options: {
   prompt: string;
   tables: TableSchemaInfo[];
   dialect: string;
   currentTable?: string;
   config: AiConfig;
   history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ sql: string; explanation: string; model: string }> {
   const { prompt, tables, dialect, currentTable, config, history = [] } = options;
   const schemaContext = buildSchemaContext(tables, dialect, currentTable);

   const systemPrompt = `You are a database and SQL expert assistant integrated into Drixio Database Studio.
Your task is to generate precise, executable, syntactically correct SQL for ${dialect.toUpperCase()} based on the user's natural language request.

CURRENT DATABASE SCHEMA:
${schemaContext}

GUIDELINES:
1. Generate standard, idiomatic ${dialect.toUpperCase()} SQL.
2. Use existing table names and column names from the schema. Never invent non-existent columns.
3. If table names or column names contain spaces or special keywords, quote them appropriately for ${dialect.toUpperCase()}.
4. Return your output formatted with a SQL code block: \`\`\`sql ... \`\`\` followed by a brief 1-2 sentence explanation in the user's language (Chinese if user queried in Chinese, English otherwise).
5. Only generate SELECT or read statements unless the user explicitly asks to modify, update, or delete data.`;

   const userPrompt = `Generate a ${dialect.toUpperCase()} SQL query for: ${prompt}`;

   const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
   ];

   if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-6)) {
         if (h.role === 'user' || h.role === 'assistant') {
            messages.push({ role: h.role, content: h.content });
         }
      }
   }

   messages.push({ role: 'user', content: userPrompt });

   const res = await callOpenAiCompatible(config, messages);

   const { sql, explanation } = extractSqlFromResponse(res.content);
   return {
      sql,
      explanation: explanation || 'Generated query based on schema.',
      model: res.model,
   };
}

/**
 * Explains and optimizes an existing SQL query.
 */
export async function explainAndOptimizeSql(options: {
   sql: string;
   tables: TableSchemaInfo[];
   dialect: string;
   currentTable?: string;
   config: AiConfig;
}): Promise<{
   explanation: string;
   performanceTips: string[];
   optimizedSql?: string;
   model: string;
}> {
   const { sql, tables, dialect, currentTable, config } = options;
   const schemaContext = buildSchemaContext(tables, dialect, currentTable);

   const systemPrompt = `You are an expert database performance engineer for ${dialect.toUpperCase()}.
Analyze the provided SQL query against the schema. Provide:
1. Clear explanation of what the query does.
2. Performance review: potential bottlenecks (full table scans, unindexed joins, wildcard LIKE, N+1 patterns).
3. If applicable, an optimized rewritten SQL query.

SCHEMA:
${schemaContext}

Respond in structured format:
### Explanation
(concise explanation in user's language)

### Performance Tips
- (tip 1)
- (tip 2)

### Optimized SQL
\`\`\`sql
(optimized SQL if rewrite is beneficial, otherwise leave empty or repeat)
\`\`\``;

   const res = await callOpenAiCompatible(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analyze this SQL query:\n\n${sql}` },
   ]);

   const content = res.content;
   const optMatch = content.match(/### Optimized SQL\s*```(?:sql)?\s*([\s\S]*?)```/i);
   const optimizedSql = optMatch ? optMatch[1].trim() : undefined;

   // Extract performance tips
   const tipsMatch = content.match(/### Performance Tips\s*([\s\S]*?)(?:###|$)/i);
   const performanceTips: string[] = [];
   if (tipsMatch) {
      tipsMatch[1]
         .split('\n')
         .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
         .filter((l) => l.length > 0)
         .forEach((tip) => performanceTips.push(tip));
   }

   // Extract explanation
   const expMatch = content.match(/### Explanation\s*([\s\S]*?)(?:###|$)/i);
   const explanation = expMatch ? expMatch[1].trim() : content.split('###')[0].trim();

   return {
      explanation,
      performanceTips: performanceTips.length > 0 ? performanceTips : ['Query structure looks reasonable.'],
      optimizedSql: optimizedSql && optimizedSql !== sql ? optimizedSql : undefined,
      model: res.model,
   };
}

/**
 * Diagnoses a failed SQL query error and provides a corrected version.
 */
export async function fixSqlError(options: {
   sql: string;
   error: string;
   tables: TableSchemaInfo[];
   dialect: string;
   currentTable?: string;
   config: AiConfig;
}): Promise<{ fixedSql: string; explanation: string; model: string }> {
   const { sql, error, tables, dialect, currentTable, config } = options;
   const schemaContext = buildSchemaContext(tables, dialect, currentTable);

   const systemPrompt = `You are an expert SQL debugging assistant for ${dialect.toUpperCase()}.
A SQL query was executed and returned an error. Diagnose the error and return the fixed query.

SCHEMA:
${schemaContext}

FAILED SQL:
${sql}

ERROR MESSAGE:
${error}

GUIDELINES:
1. Identify the exact issue (e.g., misspelled column name, syntax error, missing JOIN, ambiguous column, type mismatch).
2. Return the corrected SQL query inside a \`\`\`sql ... \`\`\` block.
3. Provide a brief 1-2 sentence explanation of what was changed and why.`;

   const res = await callOpenAiCompatible(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Fix the failed SQL query.' },
   ]);

   const { sql: fixedSql, explanation } = extractSqlFromResponse(res.content);
   return {
      fixedSql,
      explanation: explanation || 'Corrected query syntax according to error.',
      model: res.model,
   };
}

