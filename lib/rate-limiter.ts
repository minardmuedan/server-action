import 'server-only'

export type RateLimiterParams = { maxAttempt: number; refill: { attempt: number; perSeconds: number } }

export type RateLimiter = { isExceed: boolean; refillAt: number; decrement: () => { shouldWarn: boolean; refillAt: number } }

type RecordData = { attempt: number; lastUsed: number }
const records = new Map<string, RecordData>()

export const createMemoryRateLimiter = ({ maxAttempt, refill }: RateLimiterParams) => {
  const refillPerMs = refill.perSeconds * 1000

  return (id: string): RateLimiter => {
    const now = Date.now()
    const record: RecordData = records.get(id) ?? { attempt: maxAttempt, lastUsed: now }

    const elapsed = Math.floor((now - record.lastUsed) / refillPerMs)
    if (elapsed > 0) {
      const newRecordAttempts = elapsed * refill.attempt + record.attempt
      record.attempt = Math.min(maxAttempt, newRecordAttempts)
    }

    return {
      isExceed: record.attempt <= 0,
      refillAt: record.lastUsed + refillPerMs,
      decrement: () => {
        record.attempt -= 1
        record.lastUsed = now
        records.set(id, record)

        return { shouldWarn: record.attempt === 0, refillAt: record.lastUsed + refillPerMs }
      },
    }
  }
}

// todo:  add cleanup
