export function log(scope: string, message: string): void {
  console.log(`${new Date().toISOString()} [${scope}] ${message}`)
}

export function logError(scope: string, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`${new Date().toISOString()} [${scope}] ${detail}`)
}
