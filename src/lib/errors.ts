export interface AppError {
  code: string
  params?: Record<string, string | number | boolean>
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as AppError).code === 'string'
  )
}
