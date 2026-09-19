import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import open from 'open';
import { Result, ok, err } from './types.js';

const execAsync = promisify(exec);

/**
 * Returns the user's Desktop directory path across OSes.
 */
export function getDesktopDirectory(): string {
   const home = os.homedir();

   if (process.platform === 'win32') {
      // Check OneDrive Desktop first if present
      if (process.env.OneDrive) {
         const oneDriveDesktop = path.join(process.env.OneDrive, 'Desktop');
         if (fsSync.existsSync(oneDriveDesktop)) return oneDriveDesktop;
      }
      const userDesktop = path.join(home, 'Desktop');
      if (fsSync.existsSync(userDesktop)) return userDesktop;
   }

   return path.join(home, 'Desktop');
}

export interface DesktopLauncherResult {
   path: string;
   platform: string;
   launcherFile?: string;
}

/**
 * Creates a 1-click desktop app shortcut that launches Drixio Studio
 * without showing a command prompt or requiring the user to type CLI commands.
 */
export async function createDesktopLauncher(options: {
   workingDir?: string;
} = {}): Promise<Result<DesktopLauncherResult>> {
   const platform = process.platform;
   const workingDir = options.workingDir || process.cwd();
   const desktopDir = getDesktopDirectory();

   try {
      if (!fsSync.existsSync(desktopDir)) {
         await fs.mkdir(desktopDir, { recursive: true });
      }

      if (platform === 'win32') {
         // Windows: Generate silent .vbs script + .lnk shortcut
         const drixioDir = path.join(os.homedir(), '.drixio');
         if (!fsSync.existsSync(drixioDir)) {
            await fs.mkdir(drixioDir, { recursive: true });
         }

         const vbsPath = path.join(drixioDir, 'drixio-launcher.vbs');
         const vbsContent = [
            'Set WshShell = CreateObject("WScript.Shell")',
            `WshShell.CurrentDirectory = "${workingDir.replace(/"/g, '""')}"`,
            'WshShell.Run "cmd /c npx drixio studio --app", 0, False',
         ].join('\r\n');

         await fs.writeFile(vbsPath, vbsContent, 'utf-8');

         const shortcutPath = path.join(desktopDir, 'Drixio Studio.lnk');
         
         // Create .lnk via PowerShell WScript.Shell
         const psCommand = `
            $WshShell = New-Object -ComObject WScript.Shell;
            $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
            $Shortcut.TargetPath = 'wscript.exe';
            $Shortcut.Arguments = '"${vbsPath.replace(/'/g, "''")}"';
            $Shortcut.WorkingDirectory = '${workingDir.replace(/'/g, "''")}';
            $Shortcut.Description = 'Drixio Studio - Database Manager';
            $Shortcut.IconLocation = 'shell32.dll,277';
            $Shortcut.Save();
         `.replace(/\r?\n\s*/g, ' ');

         await execAsync(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`);

         return ok({
            path: shortcutPath,
            platform: 'win32',
            launcherFile: vbsPath,
         });
      } else if (platform === 'darwin') {
         // macOS: Create an executable .command launcher on Desktop
         const commandPath = path.join(desktopDir, 'Drixio Studio.command');
         const commandContent = [
            '#!/bin/bash',
            `cd "${workingDir}" || exit`,
            'nohup npx drixio studio --app >/dev/null 2>&1 &',
            'exit 0',
         ].join('\n');

         await fs.writeFile(commandPath, commandContent, { mode: 0o755 });
         await fs.chmod(commandPath, 0o755);

         return ok({
            path: commandPath,
            platform: 'darwin',
         });
      } else {
         // Linux: Create .desktop entry
         const desktopFilePath = path.join(desktopDir, 'drixio-studio.desktop');
         const desktopFileContent = [
            '[Desktop Entry]',
            'Version=1.0',
            'Type=Application',
            'Name=Drixio Studio',
            'Comment=Database Manager for SQLite, PostgreSQL & MySQL',
            `Exec=bash -c "cd '${workingDir}' && npx drixio studio --app"`,
            'Terminal=false',
            'Categories=Development;Database;',
         ].join('\n');

         await fs.writeFile(desktopFilePath, desktopFileContent, { mode: 0o755 });
         await fs.chmod(desktopFilePath, 0o755);

         // Also install to ~/.local/share/applications if directory exists
         const appMenuDir = path.join(os.homedir(), '.local', 'share', 'applications');
         if (fsSync.existsSync(appMenuDir)) {
            await fs.writeFile(path.join(appMenuDir, 'drixio-studio.desktop'), desktopFileContent, { mode: 0o755 });
         }

         return ok({
            path: desktopFilePath,
            platform: 'linux',
         });
      }
   } catch (e: any) {
      return err(e.message || 'Failed to create desktop app launcher.', undefined, e);
   }
}

/**
 * Known paths where Chromium-based browsers reside on Windows.
 */
const WIN_BROWSERS = [
   'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
   'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
   'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/**
 * Opens Drixio Studio in standalone App mode (--app) or standard browser.
 */
export async function openBrowserApp(url: string, isAppMode: boolean = false): Promise<void> {
   if (!isAppMode) {
      await open(url);
      return;
   }

   const platform = process.platform;

   if (platform === 'win32') {
      // Find Edge or Chrome on Windows
      let browserPath = '';
      for (const p of WIN_BROWSERS) {
         if (fsSync.existsSync(p)) {
            browserPath = p;
            break;
         }
      }

      if (browserPath) {
         try {
            spawn(browserPath, [`--app=${url}`], {
               detached: true,
               stdio: 'ignore',
            }).unref();
            return;
         } catch {
            // fallback to default open
         }
      }
   } else if (platform === 'darwin') {
      try {
         await execAsync(`open -na "Google Chrome" --args --app="${url}"`);
         return;
      } catch {
         try {
            await execAsync(`open -na "Microsoft Edge" --args --app="${url}"`);
            return;
         } catch {
            // fallback
         }
      }
   } else if (platform === 'linux') {
      try {
         await execAsync(`google-chrome --app="${url}" || chromium --app="${url}"`);
         return;
      } catch {
         // fallback
      }
   }

   // Standard browser fallback
   await open(url);
}
