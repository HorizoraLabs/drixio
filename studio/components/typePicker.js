/**
 * Supabase-style Data Type Picker Popover Component
 * Provides a searchable, categorized database data type selector tailored to the active database dialect
 */

import { openDropdownPicker, closeDropdownPicker } from './dropdownPicker.js';

export const DIALECT_TYPE_CATALOGS = {
   sqlite: {
      category: 'SQLITE DATA TYPES',
      types: [
         {
            name: 'INTEGER',
            value: 'INTEGER',
            desc: 'Signed integer (1 to 8 bytes, auto affinity)',
            icon: '#',
         },
         {
            name: 'TEXT',
            value: 'TEXT',
            desc: 'UTF-8 encoded text string',
            icon: 'abc',
         },
         {
            name: 'VARCHAR(255)',
            value: 'VARCHAR(255)',
            desc: 'Variable-length character string',
            icon: 'abc',
         },
         {
            name: 'BOOLEAN',
            value: 'BOOLEAN',
            desc: 'Logical boolean (stored as 0 or 1)',
            icon: 'toggle_on',
         },
         {
            name: 'REAL',
            value: 'REAL',
            desc: 'Floating point number (8-byte IEEE 754)',
            icon: '#',
         },
         {
            name: 'NUMERIC',
            value: 'NUMERIC',
            desc: 'Exact / flexible numeric representation',
            icon: '#',
         },
         {
            name: 'DATETIME',
            value: 'DATETIME',
            desc: 'Date and time string (YYYY-MM-DD HH:MM:SS)',
            icon: 'schedule',
         },
         {
            name: 'DATE',
            value: 'DATE',
            desc: 'Calendar date (YYYY-MM-DD)',
            icon: 'schedule',
         },
         {
            name: 'TIME',
            value: 'TIME',
            desc: 'Time of day (HH:MM:SS)',
            icon: 'schedule',
         },
         {
            name: 'JSON',
            value: 'JSON',
            desc: 'Textual JSON data (supports JSON functions)',
            icon: '{}',
         },
         {
            name: 'BLOB',
            value: 'BLOB',
            desc: 'Binary Large Object (raw binary data)',
            icon: 'data_array',
         },
         {
            name: 'UUID',
            value: 'UUID',
            desc: 'Universally unique identifier (stored as TEXT)',
            icon: 'key',
         },
         {
            name: 'ENUM',
            value: 'ENUM',
            desc: 'User-defined enumeration (CHECK constraint)',
            icon: 'list',
         },
      ],
   },
   mysql: {
      category: 'MYSQL DATA TYPES',
      types: [
         {
            name: 'INT',
            value: 'INT',
            desc: 'Standard 4-byte integer (-2.1B to 2.1B)',
            icon: '#',
         },
         {
            name: 'BIGINT',
            value: 'BIGINT',
            desc: 'Large 8-byte integer',
            icon: '#',
         },
         {
            name: 'TINYINT',
            value: 'TINYINT',
            desc: '1-byte small integer (-128 to 127)',
            icon: '#',
         },
         {
            name: 'BOOLEAN',
            value: 'BOOLEAN',
            desc: 'Logical boolean (alias for TINYINT(1))',
            icon: 'toggle_on',
         },
         {
            name: 'VARCHAR(255)',
            value: 'VARCHAR(255)',
            desc: 'Variable-length string with max limit',
            icon: 'abc',
         },
         {
            name: 'TEXT',
            value: 'TEXT',
            desc: 'Standard text up to 65,535 bytes',
            icon: 'abc',
         },
         {
            name: 'DECIMAL(10,2)',
            value: 'DECIMAL(10,2)',
            desc: 'Exact fixed-point numeric',
            icon: '#',
         },
         {
            name: 'FLOAT',
            value: 'FLOAT',
            desc: 'Single-precision floating-point number',
            icon: '#',
         },
         {
            name: 'DOUBLE',
            value: 'DOUBLE',
            desc: 'Double-precision floating-point number',
            icon: '#',
         },
         {
            name: 'DATETIME',
            value: 'DATETIME',
            desc: 'Date and time (1000-01-01 to 9999-12-31)',
            icon: 'schedule',
         },
         {
            name: 'TIMESTAMP',
            value: 'TIMESTAMP',
            desc: 'UTC timestamp with automatic timezone conversion',
            icon: 'schedule',
         },
         {
            name: 'DATE',
            value: 'DATE',
            desc: 'Calendar date (YYYY-MM-DD)',
            icon: 'schedule',
         },
         {
            name: 'TIME',
            value: 'TIME',
            desc: 'Time value (HH:MM:SS)',
            icon: 'schedule',
         },
         {
            name: 'JSON',
            value: 'JSON',
            desc: 'Native binary JSON document type',
            icon: '{ }',
         },
         {
            name: 'BLOB',
            value: 'BLOB',
            desc: 'Binary large object for raw data/files',
            icon: 'data_array',
         },
         {
            name: 'ENUM',
            value: 'ENUM',
            desc: 'Enumeration with predefined string list',
            icon: 'list',
         },
      ],
   },
   postgres: {
      category: 'POSTGRES DATA TYPES',
      types: [
         {
            name: 'int4',
            value: 'int4',
            desc: 'Signed four-byte integer (integer)',
            icon: '#',
         },
         {
            name: 'int8',
            value: 'int8',
            desc: 'Signed eight-byte integer (bigint)',
            icon: '#',
         },
         {
            name: 'int2',
            value: 'int2',
            desc: 'Signed two-byte integer (smallint)',
            icon: '#',
         },
         {
            name: 'numeric',
            value: 'numeric',
            desc: 'Exact numeric of selectable precision',
            icon: '#',
         },
         {
            name: 'float8',
            value: 'float8',
            desc: 'Double precision floating-point number (8 bytes)',
            icon: '#',
         },
         {
            name: 'float4',
            value: 'float4',
            desc: 'Single precision floating-point number (4 bytes)',
            icon: '#',
         },
         {
            name: 'bool',
            value: 'boolean',
            desc: 'Logical boolean (true/false)',
            icon: 'toggle_on',
         },
         {
            name: 'varchar(255)',
            value: 'varchar(255)',
            desc: 'Variable-length character string with limit',
            icon: 'abc',
         },
         {
            name: 'text',
            value: 'text',
            desc: 'Variable-length character string',
            icon: 'abc',
         },
         {
            name: 'uuid',
            value: 'uuid',
            desc: 'Universally unique identifier',
            icon: 'key',
         },
         {
            name: 'timestamptz',
            value: 'timestamptz',
            desc: 'Date and time with time zone',
            icon: 'schedule',
         },
         {
            name: 'timestamp',
            value: 'timestamp',
            desc: 'Date and time without time zone',
            icon: 'schedule',
         },
         {
            name: 'date',
            value: 'date',
            desc: 'Calendar date (year, month, day)',
            icon: 'schedule',
         },
         {
            name: 'time',
            value: 'time',
            desc: 'Time of day without time zone',
            icon: 'schedule',
         },
         {
            name: 'timetz',
            value: 'timetz',
            desc: 'Time of day including time zone',
            icon: 'schedule',
         },
         {
            name: 'jsonb',
            value: 'jsonb',
            desc: 'Binary JSON data, decomposed & indexable',
            icon: '{ }',
         },
         {
            name: 'json',
            value: 'json',
            desc: 'Textual JSON data',
            icon: '{ }',
         },
         {
            name: 'bytea',
            value: 'bytea',
            desc: 'Binary data ("byte array")',
            icon: 'data_array',
         },
         {
            name: 'ENUM',
            value: 'ENUM',
            desc: 'User-defined enumeration values',
            icon: 'list',
         },
      ],
   },
};

export function getDbDialect(explicitDialect) {
   const db = (
      explicitDialect ||
      window.AppState?.dbType ||
      'sqlite'
   ).toLowerCase();
   if (db.includes('postgres') || db.includes('pg')) return 'postgres';
   if (db.includes('mysql')) return 'mysql';
   return 'sqlite';
}

export function openTypePicker({
   anchorEl,
   initialValue = '',
   dialect,
   extraItems = [],
   onSelect,
   onCancel,
}) {
   const activeDialect = getDbDialect(dialect);
   const catalog =
      DIALECT_TYPE_CATALOGS[activeDialect] || DIALECT_TYPE_CATALOGS.sqlite;

   const allTypes = [...catalog.types];
   if (Array.isArray(extraItems) && extraItems.length > 0) {
      allTypes.unshift(...extraItems);
   }
   if (
      initialValue &&
      !allTypes.some(
         (t) =>
            t.value.toUpperCase() === initialValue.trim().toUpperCase() ||
            t.name.toUpperCase() === initialValue.trim().toUpperCase(),
      )
   ) {
      allTypes.unshift({
         name: initialValue.trim(),
         value: initialValue.trim(),
         desc: 'Current column type',
         icon: 'tune',
      });
   }

   openDropdownPicker({
      anchorEl,
      title: catalog.category,
      placeholder: 'Search types...',
      items: allTypes,
      initialValue,
      width: 380,
      maxHeight: 280,
      onSelect,
      onCancel,
   });
}

export { closeDropdownPicker as closeTypePicker };
