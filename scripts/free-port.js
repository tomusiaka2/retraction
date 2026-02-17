#!/usr/bin/env node
const { execSync } = require('child_process');

const port = process.env.PORT || 3000;

function killPort(p) {
  try {
    const output = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    if (!output) return;
    const pids = output.split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch (err) {
        // ignore and try SIGKILL
        try {
          process.kill(Number(pid), 'SIGKILL');
        } catch (_) {
          // give up on this pid
        }
      }
    }
  } catch (err) {
    // lsof likely found nothing; ignore
  }
}

killPort(port);
