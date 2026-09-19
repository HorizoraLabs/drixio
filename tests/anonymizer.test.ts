import { describe, it, expect } from 'vitest';
import { anonymizeValue, anonymizeRecords } from '../src/logic/anonymizer.js';
import { exportQueryResult } from '../src/logic/transfer.js';

describe('PII Data Masking: anonymizeValue', () => {
   it('should deterministically pseudonymize email addresses', () => {
      const email = 'alex.morgan@company.org';
      const masked1 = anonymizeValue(email, 'email');
      const masked2 = anonymizeValue(email, 'email');

      expect(masked1).toBe(masked2);
      expect(masked1).not.toBe(email);
      expect(masked1).toContain('@example.com');
      expect(masked1.startsWith('user_')).toBe(true);

      const otherMasked = anonymizeValue('different.user@company.org', 'email');
      expect(otherMasked).not.toBe(masked1);
   });

   it('should mask sensitive credentials and secrets', () => {
      expect(anonymizeValue('super_secret_pw_123', 'password')).toBe('[REDACTED_HASH]');
      expect(anonymizeValue('ghp_910283918239128', 'api_key')).toBe('[REDACTED_HASH]');
      expect(anonymizeValue('4111222233334444', 'credit_card')).toContain('****-****-****-');
      expect(anonymizeValue('123-45-6789', 'ssn')).toContain('****-****-****-');
   });

   it('should pseudonymize IP addresses deterministically', () => {
      const ip = '192.168.1.55';
      const masked = anonymizeValue(ip, 'ip_address');

      expect(masked).not.toBe(ip);
      expect(masked).toContain('.***.***');
      expect(anonymizeValue(ip, 'client_ip')).toBe(masked);
   });

   it('should pseudonymize phone numbers preserving format', () => {
      const phone = '+1 (555) 234-5678';
      const masked = anonymizeValue(phone, 'phone_number');

      expect(masked).not.toBe(phone);
      expect(masked.startsWith('+1-555-***-')).toBe(true);
      expect(anonymizeValue(phone, 'phone')).toBe(masked);
   });

   it('should pseudonymize full names deterministically', () => {
      const name = 'Bruce Wayne';
      const masked = anonymizeValue(name, 'full_name');

      expect(masked).not.toBe(name);
      expect(typeof masked).toBe('string');
      expect(anonymizeValue(name, 'full_name')).toBe(masked);
   });

   it('should preserve null, undefined, numbers and booleans untouched', () => {
      expect(anonymizeValue(null, 'email')).toBe(null);
      expect(anonymizeValue(undefined, 'email')).toBe(undefined);
      expect(anonymizeValue(12345, 'count')).toBe(12345);
      expect(anonymizeValue(true, 'is_active')).toBe(true);
   });
});

describe('PII Data Masking: anonymizeRecords & Relational Consistency', () => {
   it('should preserve relational joins across rows with deterministic pseudonyms', () => {
      const rawRecords = [
         { id: 1, user_email: 'sarah@domain.com', action: 'login', ip: '1.2.3.4' },
         { id: 2, user_email: 'sarah@domain.com', action: 'checkout', ip: '1.2.3.4' },
         { id: 3, user_email: 'john@domain.com', action: 'view', ip: '5.6.7.8' },
      ];

      const masked = anonymizeRecords(rawRecords);

      expect(masked.length).toBe(3);
      // Row 1 and Row 2 have the same email and IP in source data
      expect(masked[0].user_email).toBe(masked[1].user_email);
      expect(masked[0].ip).toBe(masked[1].ip);

      // Row 3 should have a different masked email and IP
      expect(masked[2].user_email).not.toBe(masked[0].user_email);
      expect(masked[2].ip).not.toBe(masked[0].ip);

      // Non-PII fields remain intact
      expect(masked[0].id).toBe(1);
      expect(masked[0].action).toBe('login');
      expect(masked[1].action).toBe('checkout');
   });

   it('should integrate seamlessly into exportQueryResult CSV and JSON', () => {
      const records = [
         { id: 1, email: 'ceo@enterprise.com', password_hash: '$2b$12$e8...' },
      ];

      // JSON with maskPii
      const jsonMasked = exportQueryResult(records, 'json', true);
      const parsed = JSON.parse(jsonMasked);
      expect(parsed[0].email).toContain('@example.com');
      expect(parsed[0].password_hash).toBe('[REDACTED_HASH]');

      // CSV with maskPii
      const csvMasked = exportQueryResult(records, 'csv', true);
      expect(csvMasked).toContain('@example.com');
      expect(csvMasked).toContain('[REDACTED_HASH]');
      expect(csvMasked).not.toContain('ceo@enterprise.com');
   });
});

