export function useToast() {
  const notify = (message, level = 'info') => {
    if (level === 'error') {
      console.error(message)
      return
    }
    if (level === 'warning') {
      console.warn(message)
      return
    }
    console.info(message)
  }

  return {
    toast: notify,
    success: (message) => notify(message, 'success'),
    error: (message) => notify(message, 'error'),
    info: (message) => notify(message, 'info'),
    warning: (message) => notify(message, 'warning'),
  }
}
