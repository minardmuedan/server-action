import type { CustomErrorTypes, ServerAction } from '@/lib/server-action'
import { useEffect, useState } from 'react'
import { useCountDown } from './countdown'

type OnErrorError = { type: CustomErrorTypes | 'server_error'; message: string }

type InitNoInputs<R> = {
  rateLimitKey: string
  onSuccess?: (data: R) => void
  onError?: (error: OnErrorError) => void
  onSettled?: (actionData: { success: true; data: R } | { success: false; error: OnErrorError }) => void
}

type Init<R, TFields> = InitNoInputs<R> & { onFieldError?: (errorFields: { [P in keyof TFields]?: string[] }) => void }

type UseServerAction = { isPending: boolean; rateLimiter: { isLimit: boolean; remainingSeconds: number } }

export function useServerAction<R>(
  serverAction: () => Promise<ServerAction<R, never>>,
  init: InitNoInputs<R>,
): UseServerAction & { execute: () => Promise<R> }

export function useServerAction<R, TFields>(
  serverAction: (fields: TFields) => Promise<ServerAction<R, TFields>>,
  init: Init<R, TFields>,
): UseServerAction & { execute: (inputs: TFields) => Promise<R> }

export function useServerAction<R, TFields>(
  serverAction: (() => Promise<ServerAction<R, never>>) | ((fields: TFields) => Promise<ServerAction<R, TFields>>),
  init: Init<R, TFields>,
) {
  const [isPending, setIsPending] = useState(false)
  const { timeLeft, setTimeLeft } = useCountDown()

  useEffect(() => {
    const storedRateLimitSecondsLeft = getSecondsLeft(Number(localStorage.getItem(init.rateLimitKey)))
    if (storedRateLimitSecondsLeft > 0) setTimeLeft(storedRateLimitSecondsLeft)
    else localStorage.removeItem(init.rateLimitKey)
  }, [])

  return {
    isPending,
    rateLimiter: { isLimit: timeLeft > 0, remainingSeconds: timeLeft },
    execute: async (inputs: TFields) => {
      setIsPending(true)
      const actionData = await serverAction(inputs)

      setIsPending(false)

      if (actionData.ratelimit) {
        localStorage.setItem(init.rateLimitKey, actionData.ratelimit.refillAt.toString())
        setTimeLeft(getSecondsLeft(actionData.ratelimit.refillAt))
      }

      if (actionData.isError) {
        if (actionData.type === 'input_error') init.onFieldError?.(actionData.fieldErrors)

        if (actionData.type !== 'rate_limit' && actionData.type !== 'input_error') {
          init.onError?.(actionData)
          init.onSettled?.({ success: false, error: actionData })
        }
        return undefined
      }

      const data = actionData.data
      init.onSuccess?.(data)
      init.onSettled?.({ success: true, data })
      return data
    },
  }
}

const getSecondsLeft = (retryAt: number) => Math.ceil((retryAt - Date.now()) / 1000)
