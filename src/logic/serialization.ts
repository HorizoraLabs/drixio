/**
 * Global serialization safeguards for BigInt and binary data.
 */

// Enable safe BigInt serialization across JSON.stringify, Hono c.json, and CLI output formatters
if (!('toJSON' in BigInt.prototype)) {
   (BigInt.prototype as any).toJSON = function () {
      return this.toString();
   };
}

/**
 * Ensures any deep BigInt values in objects or arrays are safely converted to string
 * before JSON serialization, preventing TypeError: Do not know how to serialize a BigInt.
 */
export function sanitizeBigInt<T>(data: T): T {
   if (data === null || data === undefined) {
      return data;
   }

   if (typeof data === 'bigint') {
      return (data as bigint).toString() as unknown as T;
   }

   if (Array.isArray(data)) {
      return data.map((item) => sanitizeBigInt(item)) as unknown as T;
   }

   if (typeof data === 'object') {
      const copy: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
         copy[key] = sanitizeBigInt(value);
      }
      return copy as T;
   }

   return data;
}
