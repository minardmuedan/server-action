import type { ActionHandler, CustomErrorTypes } from '@/lib/server-action'
import { typedObjectEntries } from '@/lib/utils'
import { useEffect } from 'react'
import { type FieldValues, type UseFormSetError } from 'react-hook-form'
import { useCountDown } from './countdown'

type Init<R, T extends FieldValues = FieldValues> = {
  rateLimitKey: string
  reactForm?: { setError: UseFormSetError<T> }
  onSuccess?: (actionData: { data: R }) => void
  onError?: (error: { type: CustomErrorTypes | 'server_error'; message: string }) => void
  onSettled?: (actionData: ActionHandler<R, T>) => void
}

type UserServerActionRateLimiter = { rateLimiter: { isLimit: false } | { isLimit: true; remainingSeconds: number } }

export function useServerAction<R>(
  serverAction: () => Promise<ActionHandler<R>>,
  init: Init<R>,
): UserServerActionRateLimiter & { execute: () => Promise<R | undefined> }

export function useServerAction<R, T extends FieldValues>(
  serverAction: (fields: T) => Promise<ActionHandler<R>>,
  init: Init<R, T> & Required<Pick<Init<R, T>, 'reactForm'>>,
): UserServerActionRateLimiter & { execute: (fields: FieldValues) => Promise<R | undefined> }

export function useServerAction<R>(serverAction: (fields?: FieldValues) => Promise<ActionHandler<R>>, init: Init<R>) {
  const { timeLeft, setTimeLeft } = useCountDown()

  useEffect(() => {
    const storedRateLimitSecondsLeft = getSecondsLeft(Number(localStorage.getItem(init.rateLimitKey)))
    if (storedRateLimitSecondsLeft > 0) setTimeLeft(storedRateLimitSecondsLeft)
    else localStorage.removeItem(init.rateLimitKey)
  }, [])

  return {
    rateLimiter: { isLimit: timeLeft > 0, remainingSeconds: timeLeft },
    execute: async (fields?: FieldValues) => {
      const actionData = fields ? await serverAction(fields) : await serverAction()

      init.onSettled?.(actionData)

      if (actionData.ratelimit) {
        localStorage.setItem(init.rateLimitKey, actionData.ratelimit.retryAt.toString())
        setTimeLeft(getSecondsLeft(actionData.ratelimit.retryAt))
      }

      if (actionData.isError) {
        const isMessagesError = actionData.type !== 'rate_limit' && actionData.type !== 'invalid_inputs'
        if (init.onError && isMessagesError) init.onError(actionData)

        if (actionData.type === 'invalid_inputs' && init.reactForm) {
          for (const [key, error] of typedObjectEntries(actionData.fieldErrors)) {
            init.reactForm.setError(key, { message: error[0] })
          }
        }
      } else {
        init.onSuccess?.(actionData)
        return actionData.data
      }
    },
  }
}

const getSecondsLeft = (retryAt: number) => Math.ceil((retryAt - Date.now()) / 1000)
