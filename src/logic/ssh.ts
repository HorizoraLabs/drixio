import net from 'net';
import { Client as SshClient } from 'ssh2';

export interface SshTunnelConfig {
   enabled?: boolean;
   host: string;
   port?: number | string;
   username?: string;
   user?: string;
   password?: string;
   privateKey?: string;
   passphrase?: string;
}

export interface ActiveTunnel {
   localPort: number;
   remoteHost: string;
   remotePort: number;
   close: () => Promise<void>;
}

/**
 * Creates an SSH tunnel forwarding an ephemeral local port to remote destination via bastion host
 */
export async function createSshTunnel(
   sshConfig: SshTunnelConfig,
   targetHost: string,
   targetPort: number,
): Promise<ActiveTunnel> {
   return new Promise((resolve, reject) => {
      const ssh = new SshClient();
      let localServer: net.Server | null = null;
      let isClosed = false;

      ssh.on('ready', () => {
         localServer = net.createServer((socket) => {
            if (isClosed) {
               socket.destroy();
               return;
            }

            ssh.forwardOut(
               '127.0.0.1',
               socket.remotePort || 0,
               targetHost,
               targetPort,
               (err, stream) => {
                  if (err) {
                     socket.destroy(err);
                     return;
                  }
                  socket.pipe(stream).pipe(socket);
               },
            );
         });

         localServer.listen(0, '127.0.0.1', () => {
            const addr = localServer?.address() as net.AddressInfo;
            const localPort = addr.port;

            resolve({
               localPort,
               remoteHost: targetHost,
               remotePort: targetPort,
               close: async () => {
                  isClosed = true;
                  if (localServer) {
                     localServer.close();
                     localServer = null;
                  }
                  ssh.end();
               },
            });
         });

         localServer.on('error', (err) => {
            ssh.end();
            reject(err);
         });
      });

      ssh.on('error', (err) => {
         if (localServer) {
            localServer.close();
         }
         reject(new Error(`SSH Tunnel connection error: ${err.message}`));
      });

      const port = parseInt(String(sshConfig.port || 22), 10);
      const username = sshConfig.username || sshConfig.user || 'root';
      try {
         ssh.connect({
            host: sshConfig.host,
            port,
            username,
            password: sshConfig.password || undefined,
            privateKey: sshConfig.privateKey || undefined,
            passphrase: sshConfig.passphrase || undefined,
            readyTimeout: 10000,
         });
      } catch (err: any) {
         reject(new Error(`Failed to initiate SSH connection: ${err.message}`));
      }
   });
}

/**
 * Wraps a target connection URL to route through an established SSH tunnel to localhost
 */
export async function setupTunneledUrl(
   targetUrl: string,
   sshConfig: SshTunnelConfig,
   tunnelCreator: typeof createSshTunnel = createSshTunnel,
): Promise<{ tunneledUrl: string; tunnel: ActiveTunnel }> {
   let parsed: URL;
   try {
      parsed = new URL(targetUrl);
   } catch {
      throw new Error('Invalid connection URL for SSH tunneling');
   }

   const proto = parsed.protocol.replace(':', '').toLowerCase();
   const defaultPort =
      proto.startsWith('my')
         ? 3306
         : proto.startsWith('ms') || proto.startsWith('sqlserver')
           ? 1433
           : proto.startsWith('mongo')
             ? 27017
             : 5432;

   const remoteHost = parsed.hostname;
   const remotePort = parseInt(parsed.port || String(defaultPort), 10);

   const tunnel = await tunnelCreator(sshConfig, remoteHost, remotePort);

   parsed.hostname = '127.0.0.1';
   parsed.port = String(tunnel.localPort);

   return {
      tunneledUrl: parsed.toString(),
      tunnel,
   };
}
