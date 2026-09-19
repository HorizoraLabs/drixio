import pc from 'picocolors';
import { createDesktopLauncher } from '../logic/launcher.js';

export async function runInstallAppCommand(options: Record<string, any> = {}) {
   console.log(pc.cyan(`\nSetting up Drixio Studio Desktop App Launcher...`));

   const workingDir = options.dir || process.cwd();
   const res = await createDesktopLauncher({ workingDir });

   if (!res.success) {
      console.error(pc.red(`\n✗ Failed to create desktop launcher: ${res.error}`));
      process.exit(1);
   }

   console.log(pc.green(`\n✓ Successfully created Drixio Studio desktop launcher!`));
   console.log(pc.bold(`  Path: `) + pc.cyan(res.data.path));
   console.log(
      pc.dim(`  Double-click the desktop icon to launch Drixio Studio in standalone app mode without opening a terminal.\n`),
   );
}

