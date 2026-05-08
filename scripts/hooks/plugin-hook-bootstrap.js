#!usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function readStdinRaw() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_error) {
    return '';
  }
}

function writeStderr(stderr) {
  if (typeof stderr === 'string' && stderr.length >0) {
    process.stderr.write(stderr);
  }
}

function passthrough(raw, result) {
  const stdout = typeof result?.stdout === 'string' ? result.stdout : '';
  if (stdout) {
    process.stdout.write(stdout);
    return;
  }

  if (!Number.isInteger(result?.status) || result.status === 0) {
    process.stdout.write(raw);
  }
}

function resolvePluginRoot() {
  // Check environment variable first
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.ECC_PLUGIN_ROOT;
  if (envRoot && envRoot.trim()) {
    return envRoot.trim();
  }

  // Search common plugin paths
  const homeDir = require('os').homedir();
  const baseDir = path.join(homeDir, '.claude');
  const utilsPath = path.join('scripts', 'lib', 'utils.js');

  // Check if already in a plugin directory
  if (fs.existsSync(path.join(baseDir, utilsPath))) {
    return baseDir;
  }

  // Search in plugins directory
  const pluginPaths = [
    ['ecc'],
    ['ecc@ecc'],
    ['marketplace', 'ecc'],
    ['everything-claude-code'],
    ['everything-claude-code@everything-claude-code'],
    ['marketplace', 'everything-claude-code'],
  ];

  for (const segments of pluginPaths) {
    const pluginDir = path.join(baseDir, 'plugins', ...segments);
    if (fs.existsSync(path.join(pluginDir, utilsPath))) {
      return pluginDir;
    }
  }

  // Search in plugin cache
  const cacheBases = ['ecc', 'everything-claude-code'];
  for (const cacheBase of cacheBases) {
    const cacheDir = path.join(baseDir, 'plugins', 'cache', cacheBase);
    try {
      const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subDir = path.join(cacheDir, entry.name);
        const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue;
          const candidate = path.join(subDir, subEntry.name);
          if (fs.existsSync(path.join(candidate, utilsPath))) {
            return candidate;
          }
        }
      }
    } catch (_error) {
      // Ignore errors during cache search
    }
  }

  return baseDir;
}

function findShellBinary() {
  const candidates = [];
  if (process.env.BASH && process.env.BASH.trim()) {
    candidates.push(process.env.BASH.trim());
  }

  if (process.platform === 'win32') {
    candidates.push('bash.exe', 'bash');
  } else {
    candidates.push('bash', 'sh');
  }

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', ':'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!probe.error) {
      return candidate;
    }
  }

  return null;
}

function spawnNode(rootDir, relPath, raw, args) {
  return spawnSync(process.execPath, [path.resolve(rootDir, relPath), ...args], {
    input: raw,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: rootDir,
      ECC_PLUGIN_ROOT: rootDir,
    },
    cwd: process.cwd(),
    timeout: 30000,
    windowsHide: true,
  });
}

function spawnShell(rootDir, relPath, raw, args) {
  const shell = findShellBinary();
  if (!shell) {
    return {
      status: 0,
      stdout: '',
      stderr: '[Hook] shell runtime unavailable; skipping shell-backed hook\n',
    };
  }

  return spawnSync(shell, [path.resolve(rootDir, relPath), ...args], {
    input: raw,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: rootDir,
      ECC_PLUGIN_ROOT: rootDir,
    },
    cwd: process.cwd(),
    timeout: 30000,
    windowsHide: true,
  });
}

function main() {
  const [, , mode, relPath, ...args] = process.argv;
  const raw = readStdinRaw();

  // Resolve plugin root if not already set
  const rootDir = resolvePluginRoot();

  if (!mode || !relPath) {
    process.stdout.write(raw);
    process.exit(0);
  }

  // Set environment for child processes
  process.env.CLAUDE_PLUGIN_ROOT = rootDir;
  process.env.ECC_PLUGIN_ROOT = rootDir;

  let result;
  try {
    if (mode === 'node') {
      result = spawnNode(rootDir, relPath, raw, args);
    } else if (mode === 'shell') {
      result = spawnShell(rootDir, relPath, raw, args);
    } else {
      writeStderr(`[Hook] unknown bootstrap mode: ${mode}\n`);
      process.stdout.write(raw);
      process.exit(0);
    }
  } catch (error) {
    writeStderr(`[Hook] bootstrap execution failed: ${error.message}\n`);
    process.stdout.write(raw);
    process.exit(0);
  }

  passthrough(raw, result);
  writeStderr(result.stderr);

  if (result.error || result.signal || result.status === null) {
    const reason = result.error
      ? result.error.message
      : result.signal
        ? `terminated by signal ${result.signal}`
        : 'missing exit status';
    writeStderr(`[Hook] bootstrap execution failed: ${reason}\n`);
    process.exit(0);
  }

  process.exit(Number.isInteger(result.status) ? result.status : 0);
}

main();
