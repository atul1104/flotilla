#!/usr/bin/env node
/**
 * @atul1104/flotilla — local daemon CLI (PLAN.md §8.1).
 *
 *   flotilla-daemon pair <serverUrl> <code> [--name "My laptop"]
 *   flotilla-daemon start [--server <url>] [--name "My laptop"]
 *
 * Pairing: exchange a one-time code (from the web UI) for a device token,
 * stored in ~/.flotilla/config.json. Start: connect and receive runs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { platform, release, homedir } from 'node:os';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { readConfig, writeConfig } from './config.js';
import { startDaemon } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const DAEMON_VERSION = pkg.version;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1];
    else out._.push(a);
  }
  return out;
}

async function pair(args) {
  const [serverUrl, code] = args._;
  if (!serverUrl || !code) {
    console.error('Usage: flotilla-daemon pair <serverUrl> <code> [--name "My laptop"]');
    process.exit(1);
  }
  const res = await fetch(`${serverUrl}/api/v1/daemon/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      name: args.name || `${platform()} ${release()}`.trim(),
      platform: `${platform()}/${release()}`,
      daemonVersion: DAEMON_VERSION,
    }),
  });
  if (!res.ok) {
    console.error(`Pairing failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const { computerId, deviceToken } = await res.json();
  writeConfig({ serverUrl, computerId, deviceToken });
  console.log(`✓ Paired computer ${computerId}. Token stored in ~/.flotilla/config.json`);
  console.log('  Run `flotilla-daemon start` to go online.');
}

function start(args) {
  const cfg = readConfig();
  const serverUrl = args.server || cfg.serverUrl;
  const token = cfg.deviceToken;
  if (!serverUrl || !token) {
    console.error('Not paired. Run `flotilla-daemon pair <serverUrl> <code>` first.');
    process.exit(1);
  }
  console.log(`flotilla-daemon v${DAEMON_VERSION} → ${serverUrl}`);
  startDaemon({
    serverUrl,
    token,
    name: args.name || cfg.computerId,
    platform: `${platform()}/${release()}`,
    daemonVersion: DAEMON_VERSION,
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log('\n[flotilla-daemon] shutting down');
      process.exit(0);
    });
  }
}

/**
 * Install a user-level background service (PLAN.md §8.1 — Phase 6). launchd on
 * macOS, systemd --user on Linux. Writes the service file + prints how to load
 * it. Requires the daemon to be paired first (the service runs `start`).
 */
function installService() {
  const cfg = readConfig();
  if (!cfg.serverUrl || !cfg.deviceToken) {
    console.error('Not paired. Run `flotilla-daemon pair <serverUrl> <code>` first.');
    process.exit(1);
  }
  const home = homedir();
  const plat = platform();
  const cmd = `flotilla-daemon start --server ${cfg.serverUrl}`;

  if (plat === 'darwin') {
    const dir = join(home, 'Library', 'LaunchAgents');
    const file = join(dir, 'dev.flotilla.daemon.plist');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        '  <key>Label</key><string>dev.flotilla.daemon</string>',
        '  <key>ProgramArguments</key>',
        '  <array>' +
          cmd
            .split(' ')
            .map((c) => `<string>${c}</string>`)
            .join('') +
          '</array>',
        '  <key>RunAtLoad</key><true/>',
        '  <key>KeepAlive</key><true/>',
        `  <key>StandardOutPath</key><string>${join(home, '.flotilla', 'daemon.out.log')}</string>`,
        `  <key>StandardErrorPath</key><string>${join(home, '.flotilla', 'daemon.err.log')}</string>`,
        '</dict></plist>',
        '',
      ].join('\n'),
    );
    console.log(`✓ Wrote ${file}`);
    console.log('Load it with:');
    console.log('  launchctl load ~/Library/LaunchAgents/dev.flotilla.daemon.plist');
    console.log('Unload with: launchctl unload ~/Library/LaunchAgents/dev.flotilla.daemon.plist');
  } else if (plat === 'linux') {
    const dir = join(home, '.config', 'systemd', 'user');
    const file = join(dir, 'flotilla-daemon.service');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      [
        '[Unit]',
        'Description=Flotilla daemon (runs local AI agents)',
        '[Service]',
        `ExecStart=${cmd}`,
        'Restart=always',
        'RestartSec=5',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
    );
    console.log(`✓ Wrote ${file}`);
    console.log('Enable + start it with:');
    console.log('  systemctl --user enable --now flotilla-daemon.service');
  } else {
    console.error(`install-service is not supported on ${plat} (use a process manager).`);
    process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === '--version' || cmd === '-v') {
  console.log(pkg.version);
  process.exit(0);
}
if (cmd === 'pair') {
  pair({ ...args, _: args._.slice(1) });
} else if (cmd === 'start') {
  start(args);
} else if (cmd === 'install-service') {
  installService();
} else {
  console.log(`flotilla-daemon v${DAEMON_VERSION}`);
  console.log('');
  console.log('Usage:');
  console.log('  flotilla-daemon pair <serverUrl> <code> [--name "My laptop"]');
  console.log('  flotilla-daemon start [--server <url>] [--name "My laptop"]');
  console.log('  flotilla-daemon install-service    # launchd (mac) / systemd --user (linux)');
  console.log('  flotilla-daemon --version');
}
