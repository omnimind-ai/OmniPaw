export interface RetryNonEmptyResultOptions {
  delaysMs: readonly number[]
  wait?: (delayMs: number) => Promise<void>
}

export async function retryNonEmptyResult<T>(
  operation: () => Promise<readonly T[]>,
  options: RetryNonEmptyResultOptions
): Promise<readonly T[]> {
  const wait = options.wait ?? delay
  let result = await operation()

  for (const delayMs of options.delaysMs) {
    if (result.length > 0) {
      return result
    }
    await wait(Math.max(0, delayMs))
    result = await operation()
  }

  return result
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}
