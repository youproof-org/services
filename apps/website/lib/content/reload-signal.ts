import 'server-only'
import fs from 'fs'
import path from 'path'

function getSignalPath(): string {
  return path.join(process.cwd(), '.next', 'cache', 'content-reload-signal')
}

export function writeReloadSignal(): void {
  try {
    const file = getSignalPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Date.now().toString())
  } catch {}
}

export function readReloadSignal(): string | null {
  try {
    return fs.readFileSync(getSignalPath(), 'utf8')
  } catch {
    return null
  }
}
