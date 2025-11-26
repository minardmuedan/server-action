import { useEffect, useState } from 'react'

export const useCountDown = () => {
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (timeLeft <= 0) return

    const intervalId = setInterval(() => {
      setTimeLeft((prevTimeLeft) => prevTimeLeft - 1)
    }, 1000)

    return () => clearInterval(intervalId)
  }, [timeLeft])

  return { timeLeft, setTimeLeft }
}
