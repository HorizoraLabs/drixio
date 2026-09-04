import { input, select, confirm } from '@inquirer/prompts';
import pc from 'picocolors';
import { ColumnSchema, DBAdapter } from '../../logic/index.js';

export async function promptColumnSchema(
   adapter: DBAdapter,
   hasPkSoFar: boolean,
   existingColumns: string[] = [],
   defaultName: string = '',
): Promise<{ col: ColumnSchema | null; isPk: boolean }> {
   let colName = '';

   while (!colName) {
      colName = await input({
         message: 'Column name (leave empty to cancel/finish):',
         default: defaultName,
      });

      if (!colName.trim()) {
         return { col: null, isPk: false };
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(colName)) {
         console.log(
            pc.red(
               'Invalid column name. Use only letters, numbers, and underscores.',
            ),
         );
         colName = '';
      } else if (existingColumns.includes(colName)) {
         console.log(pc.red('Column name already exists!'));
         colName = '';
      }
   }

   const colType = await select({
      message: `Select type for column '${colName}':`,
      choices: [
         { name: 'Integer', value: 'Integer' },
         { name: 'Text (String)', value: 'Text' },
         { name: 'Boolean', value: 'Boolean' },
         { name: 'Decimal (Float)', value: 'Decimal' },
         { name: 'DateTime', value: 'DateTime' },
         { name: 'Enum', value: 'Enum' },
      ],
   });

   let enumValues: string[] | undefined = undefined;
   if (colType === 'Enum') {
      const enumStr = await input({
         message: `Enter comma-separated Enum values (e.g. active, pending, deleted):`,
      });
      enumValues = enumStr
         .split(',')
         .map((s) => s.trim())
         .filter((s) => s);
      if (enumValues.length === 0) {
         console.log(pc.yellow('Warning: No enum values provided.'));
      }
   }

   let defaultValue = '';

   if (colType === 'DateTime') {
      const isTimestamp = await confirm({
         message: `Set default to CURRENT_TIMESTAMP?`,
         default: false,
      });
      if (isTimestamp) {
         defaultValue = 'Timestamp';
      }
   }

   let isPk = false;
   let fkTarget: { table: string; column: string } | undefined = undefined;

   if (colType !== 'DateTime') {
      const keyChoices = [{ name: 'None', value: 'none' }];
      if (!hasPkSoFar) {
         keyChoices.push({ name: 'Primary Key', value: 'pk' });
      }
      keyChoices.push({ name: 'Foreign Key', value: 'fk' });

      const keyType = await select({
         message: `Key type for '${colName}':`,
         choices: keyChoices,
      });

      if (keyType === 'pk') {
         isPk = true;
         if (colType === 'Integer') defaultValue = 'AutoInc';
      } else if (keyType === 'fk') {
         const allTables = await adapter.getTables();
         if (allTables.length > 0) {
            const targetTable = await select({
               message: 'Select target table:',
               choices: allTables.map((t: string) => ({ name: t, value: t })),
            });
            const targetSchema = await adapter.getSchema(targetTable);
            if (targetSchema.length > 0) {
               const targetCol = await select({
                  message: 'Select target column:',
                  choices: targetSchema.map((c: ColumnSchema) => ({
                     name: `${c.name} (${c.type})`,
                     value: c.name,
                  })),
               });
               fkTarget = {
                  table: targetTable as string,
                  column: targetCol as string,
               };
               defaultValue = `FK -> ${targetTable}.${targetCol}`;
            } else {
               console.log(pc.yellow('Target table has no columns.'));
            }
         } else {
            console.log(pc.yellow('No other tables found to link to.'));
         }
      }
   }

   let nullable = false;
   if (!isPk) {
      nullable = await confirm({
         message: `Can '${colName}' be NULL?`,
         default: true,
      });
   }

   if (!isPk && !fkTarget && colType !== 'DateTime') {
      if (colType === 'Boolean') {
         const defaultBool = await select({
            message: `Default value for '${colName}':`,
            choices: [
               { name: 'None', value: '' },
               { name: 'TRUE', value: 'TRUE' },
               { name: 'FALSE', value: 'FALSE' },
            ],
         });
         defaultValue = defaultBool;
      } else if (colType === 'Enum' && enumValues) {
         const defaultEnum = await select({
            message: `Default value for '${colName}':`,
            choices: [
               { name: 'None', value: '' },
               ...enumValues.map((v) => ({ name: v, value: `'${v}'` })),
            ],
         });
         defaultValue = defaultEnum;
      } else {
         const defaultStr = await input({
            message: `Default value for '${colName}' (leave empty for none):`,
         });
         if (defaultStr) {
            if (colType === 'Text') {
               defaultValue = `'${defaultStr.replace(/'/g, "''")}'`;
            } else {
               defaultValue = defaultStr;
            }
         }
      }
   }

   const col: ColumnSchema = {
      name: colName,
      type: colType,
      isPk,
      nullable,
      defaultValue,
      fkTarget,
      enumValues,
   };

   return { col, isPk };
}
