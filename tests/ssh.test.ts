import { describe, it, expect, vi } from 'vitest';
import { setupTunneledUrl, SshTunnelConfig, ActiveTunnel } from '../src/logic/ssh.js';

describe('SSH Tunnel Utilities', () => {
   it('should reject invalid database URLs for SSH tunneling', async () => {
      await expect(
         setupTunneledUrl('not-a-valid-url', {
            host: 'bastion.example.com',
            user: 'ubuntu',
         }),
      ).rejects.toThrow('Invalid connection URL for SSH tunneling');
   });

   it('should parse database URL, setup tunnel, and redirect host/port to localhost', async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockTunnelCreator = vi.fn().mockImplementation(
         async (cfg: SshTunnelConfig, targetHost: string, targetPort: number): Promise<ActiveTunnel> => {
            return {
               localPort: 54321,
               remoteHost: targetHost,
               remotePort: targetPort,
               close: mockClose,
            };
         },
      );

      const res = await setupTunneledUrl(
         'postgresql://postgres:secret@db-internal.vpc:5432/production',
         {
            host: 'bastion.example.com',
            port: 22,
            user: 'ec2-user',
         },
         mockTunnelCreator,
      );

      expect(mockTunnelCreator).toHaveBeenCalledWith(
         expect.objectContaining({ host: 'bastion.example.com', user: 'ec2-user' }),
         'db-internal.vpc',
         5432,
      );
      expect(res.tunneledUrl).toContain('127.0.0.1:54321');
      expect(res.tunneledUrl).toContain('postgres:secret');
      expect(res.tunneledUrl).toContain('/production');
      expect(res.tunnel.remoteHost).toBe('db-internal.vpc');
      expect(res.tunnel.remotePort).toBe(5432);
      expect(res.tunnel.localPort).toBe(54321);

      await res.tunnel.close();
      expect(mockClose).toHaveBeenCalledTimes(1);
   });

   it('should correctly infer default port for different database dialects', async () => {
      const ports: Record<string, number> = {};
      const mockTunnelCreator = vi.fn().mockImplementation(
         async (_cfg: SshTunnelConfig, targetHost: string, targetPort: number): Promise<ActiveTunnel> => {
            ports[targetHost] = targetPort;
            return {
               localPort: 60000,
               remoteHost: targetHost,
               remotePort: targetPort,
               close: vi.fn(),
            };
         },
      );

      await setupTunneledUrl('mysql://root@mysql.vpc/db', { host: 'b.com' }, mockTunnelCreator);
      expect(ports['mysql.vpc']).toBe(3306);

      await setupTunneledUrl('mssql://sa@mssql.vpc/db', { host: 'b.com' }, mockTunnelCreator);
      expect(ports['mssql.vpc']).toBe(1433);

      await setupTunneledUrl('mongodb://mongo.vpc/db', { host: 'b.com' }, mockTunnelCreator);
      expect(ports['mongo.vpc']).toBe(27017);
   });
});

