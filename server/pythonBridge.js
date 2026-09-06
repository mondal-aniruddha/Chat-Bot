/**
 * Node.js bridge to the Python Assistant subsystem.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Find Python executable in .venv or system
function getPythonExecutable() {
  const venvPython = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return 'python';
}

/**
 * Executes an action via assistant.bridge module and returns the parsed JSON response.
 * @param {string} action - Action name ('status', 'audio', 'config', 'save-config', 'logs', 'chat')
 * @param {object} payload - Optional data payload
 * @param {object} options - Optional options such as { lines: 50 }
 */
export function callPythonBridge(action, payload = null, options = {}) {
  return new Promise((resolve, reject) => {
    const pythonExe = getPythonExecutable();
    const args = ['-m', 'assistant.bridge', '--action', action];

    if (options.lines) {
      args.push('--lines', String(options.lines));
    }

    if (options.duration) {
      args.push('--duration', String(options.duration));
    }

    if (payload !== null) {
      args.push('--stdin');
    }

    const child = spawn(pythonExe, args, {
      cwd: projectRoot,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true,
    });

    let stdoutData = '';
    let stderrData = '';

    if (payload !== null) {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    }

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python bridge exited with code ${code}: ${stderrData || stdoutData}`));
      }
      try {
        const json = JSON.parse(stdoutData.trim());
        resolve(json);
      } catch (err) {
        reject(new Error(`Failed to parse Python bridge output: ${stdoutData}. Stderr: ${stderrData}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
