import 'server-only'

import { z, ZodError, type ZodObject } from 'zod'
import { createMemoryRateLimiter, type RateLimiterParams } from './rate-limiter'
import { typedObjectEntries } from './utils'

type RateLimit = { ratelimit: { retryAt: number } }
type RateLimiterInit = { key: string } & RateLimiterParams

type InputError<T> = { type: 'invalid_inputs' } & z.core.$ZodFlattenedError<z.core.output<T>>
type ServerError = { type: 'server_error'; message: string }
type RateLimitError = { type: 'rate_limit' } & RateLimit
type Errors<T> = { isError: true } & (RateLimitError | InputError<T> | CustomError | ServerError)

type Success = { isError?: undefined }
type HandlerSuccess<R> = Success & { data: R }

export type ActionHandler<R, T = undefined> = Partial<RateLimit> & (HandlerSuccess<R> | Errors<T>)
function handler<T extends ZodObject>(schema?: T) {
  return {
    ratelimit: (init: RateLimiterInit) => {
      const rateLimiter = createMemoryRateLimiter(init)

      return {
        handle: <R>(action: (fields?: z.infer<T>) => Promise<R>) => {
          return async (userInputs?: z.infer<T>): Promise<ActionHandler<R, T>> => {
            const limiter = rateLimiter(init.key)
            if (limiter.isExceed) return { isError: true, type: 'rate_limit', ratelimit: { retryAt: limiter.refillAt } }

            const newLimiter = limiter.decrement()
            const data = await actionFn()
            return { ...data, ratelimit: newLimiter.shouldWarn ? { retryAt: newLimiter.refillAt } : undefined }

            async function actionFn(): Promise<HandlerSuccess<R> | Exclude<Errors<T>, RateLimitError>> {
              try {
                const fields = schema ? schema.parse(userInputs) : undefined
                const data = await action(fields)
                return { data }
              } catch (err) {
                if (err instanceof CustomError) return { isError: true, ...err }
                if (err instanceof ZodError) return { isError: true, type: 'invalid_inputs', ...z.flattenError(err) }
                return { isError: true, type: 'server_error', message: 'Something went wrong' }
              }
            }
          }
        },
      }
    },
  }
}

export function createServerAction(): {
  ratelimit: (init: RateLimiterInit) => {
    handle: <R>(action: () => Promise<R>) => () => Promise<Exclude<ActionHandler<R>, InputError<undefined>>>
  }
}

// prettier-ignore
export function createServerAction<T extends ZodObject>(schema: T): {
  ratelimit: (init: RateLimiterInit) => {
    handle: <R>(action: (fields: z.infer<T>) => Promise<R>) => (userInputs: z.infer<T>) => Promise<ActionHandler<R, T>>
  }
}

export function createServerAction(schema?: ZodObject) {
  return handler(schema)
}

export function throwFieldError<T>(fields: Partial<Record<keyof T, string>>[]): never {
  const errors = fields.flatMap((err) =>
    typedObjectEntries(err).map(([key, value]) => ({ code: 'custom' as const, path: [key], message: value })),
  )
  throw new ZodError(errors)
}

export type CustomErrorTypes = 'not_found' | 'expired' | 'unauthorized' | 'forbidden'

export class CustomError {
  type: CustomErrorTypes
  message: string

  constructor(type: CustomErrorTypes, message: string) {
    this.type = type
    this.message = message
  }
}
