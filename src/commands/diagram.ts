import pc from 'picocolors';
import {
   DBConfig,
   createDBAdapter,
   generateMermaidErDiagram,
} from '../logic/index.js';
import fs from 'fs/promises';
import path from 'path';

export async function runDiagramCommand(dbConfig: DBConfig) {
   if (dbConfig.type === 'unknown') {
      console.log(
         pc.red(
            'Error: No database connection found. Cannot generate diagram.',
         ),
      );
      process.exit(1);
   }

   const adapter = createDBAdapter(dbConfig as any);

   console.log(pc.cyan(`\nScanning database to generate ER diagram...`));

   try {
      const allTables = await adapter.getTables();

      if (allTables.length === 0) {
         console.log(pc.yellow('No tables found in the database.'));
         process.exit(0);
      }

      const diagramRes = await generateMermaidErDiagram(adapter);
      if (!diagramRes.success) {
         console.log(
            pc.red(`\n✘ Failed to generate diagram: ${diagramRes.error}`),
         );
         await adapter.close();
         process.exit(1);
      }
      const mermaidCode = diagramRes.data;

      const markdownOutput = `
# Database Schema Diagram

You can paste this Mermaid code directly into [Draw.io](https://app.diagrams.net/) (Arrange > Insert > Advanced > Mermaid) or view it on GitHub/GitLab!

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;

      const outPath = path.resolve(process.cwd(), 'drixio_schema.md');
      await fs.writeFile(outPath, markdownOutput.trim(), 'utf-8');

      console.log(pc.green(`\n✔ Diagram generated successfully!`));
      console.log(pc.white(`Output saved to: ${pc.bold(outPath)}`));
      console.log(
         pc.dim(
            'Tip: Open this file in VSCode with a Markdown viewer or paste it into Draw.io.',
         ),
      );
   } catch (e: any) {
      console.log(pc.red(`\n✘ Failed to generate diagram: ${e.message}`));
   } finally {
      await adapter.close();
   }

   process.exit(0);
}
