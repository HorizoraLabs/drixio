import { describe, it, expect } from 'vitest';
import { getDesktopDirectory, createDesktopLauncher } from '../src/logic/launcher.js';
import fs from 'node:fs';

describe('Desktop App Launcher: launcher logic', () => {
   it('should locate a valid Desktop directory path', () => {
      const desktop = getDesktopDirectory();
      expect(typeof desktop).toBe('string');
      expect(desktop.length).toBeGreaterThan(0);
      expect(desktop.toLowerCase()).toContain('desktop');
   });

   it(
      'should generate a desktop app launcher shortcut successfully',
      async () => {
         const res = await createDesktopLauncher({
            workingDir: process.cwd(),
         });

      expect(res.success).toBe(true);
      if (res.success) {
         expect(res.data.path).toBeDefined();
         expect(fs.existsSync(res.data.path)).toBe(true);
         expect(res.data.platform).toBe(process.platform);

         if (process.platform === 'win32') {
            expect(res.data.path.endsWith('.lnk')).toBe(true);
            if (res.data.launcherFile) {
               expect(fs.existsSync(res.data.launcherFile)).toBe(true);
               const content = fs.readFileSync(res.data.launcherFile, 'utf-8');
               expect(content).toContain('npx drixio studio --app');
            }
         }
      }
   }, 30000);
});

