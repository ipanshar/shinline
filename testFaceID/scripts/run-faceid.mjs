import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const testFaceIdDir = path.join(repoRoot, 'testFaceID')
const frontendDir = path.join(testFaceIdDir, 'frontend')
const pythonExecutable = path.join(
  testFaceIdDir,
  '.venv',
  'Scripts',
  process.platform === 'win32' ? 'python.exe' : 'python',
)
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = []
let shuttingDown = false
let exitedChildren = 0
let exitCode = 0

function startProcess(name, command, args, cwd, shell = false) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell,
  })

  child.on('error', (error) => {
    console.error(`[${name}] failed to start:`, error.message)
  })

  return child
}

async function isBackendRunning() {
  try {
    const response = await fetch('http://127.0.0.1:8008/api/status', {
      signal: AbortSignal.timeout(1500),
    })

    return response.ok
  } catch {
    return false
  }
}

async function isFrontendRunning() {
  try {
    const response = await fetch('http://127.0.0.1:4174/', {
      signal: AbortSignal.timeout(1500),
    })

    if (!response.ok) {
      return false
    }

    const html = await response.text()
    return html.toLowerCase().includes('<!doctype html>')
  } catch {
    return false
  }
}

function shutdown(signalCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  exitCode = signalCode

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGINT')
    }
  }
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

if (await isBackendRunning()) {
  console.log('[faceid] backend already running on http://127.0.0.1:8008')
} else {
  children.push(
    startProcess(
      'backend',
      pythonExecutable,
      ['-m', 'uvicorn', 'backend.app:app', '--app-dir', 'testFaceID', '--host', '127.0.0.1', '--port', '8008'],
      repoRoot,
    ),
  )
}

if (await isFrontendRunning()) {
  console.log('[faceid] frontend already running on http://localhost:4174')
} else {
  children.push(
    startProcess(
      'frontend',
      npmExecutable,
      ['run', 'dev'],
      frontendDir,
      process.platform === 'win32',
    ),
  )
}

if (children.length === 0) {
  process.exit(0)
}

for (const child of children) {
  child.on('exit', (code) => {
    exitedChildren += 1
    if (typeof code === 'number' && code !== 0 && exitCode === 0) {
      exitCode = code
    }

    if (!shuttingDown && typeof code === 'number' && code !== 0) {
      shutdown(code)
      return
    }

    if (exitedChildren === children.length) {
      process.exit(exitCode)
    }
  })
}
