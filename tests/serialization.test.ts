import { describe, it, expect } from 'vitest';
import { sanitizeBigInt } from '../src/logic/serialization.js';

describe('Serialization Safeguards', () => {
   it('should serialize native BigInt primitives via JSON.stringify without throwing', () => {
      const data = {
         id: 9007199254740995n,
         largeCount: 1234567890123456789n,
         name: 'Test BigInt',
      };

      // Native JSON.stringify must not throw TypeError: Do not know how to serialize a BigInt
      expect(() => JSON.stringify(data)).not.toThrow();

      const serialized = JSON.stringify(data);
      const parsed = JSON.parse(serialized);

      expect(parsed.id).toBe('9007199254740995');
      expect(parsed.largeCount).toBe('1234567890123456789');
      expect(parsed.name).toBe('Test BigInt');
   });

   it('should recursively sanitize deeply nested objects and arrays containing BigInt', () => {
      const nested = {
         user: {
            id: 100n,
            history: [
               { eventId: 200n, score: 50 },
               { eventId: 201n, score: 99 },
            ],
         },
         meta: [300n, 400n],
      };

      const clean = sanitizeBigInt(nested);

      expect(clean.user.id).toBe('100');
      expect(clean.user.history[0].eventId).toBe('200');
      expect(clean.user.history[1].eventId).toBe('201');
      expect(clean.meta).toEqual(['300', '400']);
   });
});
