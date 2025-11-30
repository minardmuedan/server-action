import 'server-only'

export type RateLimiterParams = { maxAttempt: number; refill: { attempt: number; perSeconds: number } }

type RateLimit =
  | { isExceed: true; retryAt: number }
  | ({ isExceed: false } & ({ shouldWarn: true; refillAt: number } | { shouldWarn: false }))

type RecordData = { attempt: number; lastUsed: number }
const records = new Map<string, RecordData>()

export const createMemoryRateLimiter = ({ maxAttempt, refill }: RateLimiterParams) => {
  const refillPerMs = refill.perSeconds * 1000

  return (id: string): RateLimit => {
    const now = Date.now()
    const record: RecordData = records.get(id) ?? { attempt: maxAttempt, lastUsed: now }

    const elapsed = Math.floor((now - record.lastUsed) / refillPerMs)
    if (elapsed > 0) {
      const newRecordAttempts = elapsed * refill.attempt + record.attempt
      record.attempt = Math.min(maxAttempt, newRecordAttempts)
    }

    if (record.attempt <= 0) return { isExceed: true, retryAt: record.lastUsed + refillPerMs }

    record.attempt -= 1
    record.lastUsed = now
    records.set(id, record)

    return { isExceed: false, shouldWarn: record.attempt < 1, refillAt: record.lastUsed + refillPerMs }
  }
}

// todo:  add cleanup
