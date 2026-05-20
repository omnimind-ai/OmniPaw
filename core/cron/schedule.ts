import type {
  CreateCronTaskRequest,
  CronSchedule,
  CronValidationError,
  UpdateCronTaskRequest,
} from '@shared/types/cron'

const CRON_PARTS = 5
const MAX_SEARCH_MINUTES = 5 * 366 * 24 * 60

interface CronFieldSpec {
  name: string
  min: number
  max: number
  normalize?: (value: number) => number
}

const FIELD_SPECS: CronFieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'dayOfWeek', min: 0, max: 7, normalize: (value) => (value === 7 ? 0 : value) },
]

export interface NormalizeScheduleInput {
  runAt?: number | null
  cronExpression?: string | null
  timezone?: string | null
  existing?: CronSchedule
  now?: number
  requireSchedule?: boolean
}

export interface NormalizeScheduleResult {
  schedule?: CronSchedule
  errors: CronValidationError[]
}

export interface ParsedCronExpression {
  expression: string
  minute: Set<number>
  hour: Set<number>
  dayOfMonth: Set<number>
  month: Set<number>
  dayOfWeek: Set<number>
}

export function normalizeScheduleInput(input: NormalizeScheduleInput): NormalizeScheduleResult {
  const hasRunAt = input.runAt !== undefined && input.runAt !== null
  const hasCron =
    input.cronExpression !== undefined &&
    input.cronExpression !== null &&
    input.cronExpression.trim().length > 0

  if (hasRunAt && hasCron) {
    return {
      errors: [
        {
          path: 'schedule',
          code: 'conflicting_schedule',
          message: 'Provide either runAt or cronExpression, not both.',
        },
      ],
    }
  }

  if (!hasRunAt && !hasCron && input.requireSchedule !== false && !input.existing) {
    return {
      errors: [
        {
          path: 'schedule',
          code: 'required',
          message: 'A scheduled task requires runAt or cronExpression.',
        },
      ],
    }
  }

  if (hasRunAt) {
    if (!Number.isFinite(input.runAt)) {
      return {
        errors: [
          {
            path: 'runAt',
            code: 'invalid_type',
            message: 'runAt must be a Unix timestamp in milliseconds.',
          },
        ],
      }
    }
    return {
      schedule: {
        kind: 'at',
        runAt: Math.floor(input.runAt as number),
        timezone: normalizeTimezone(input.timezone),
      },
      errors: [],
    }
  }

  if (hasCron) {
    const expression = input.cronExpression?.trim() ?? ''
    const parsed = parseCronExpression(expression)
    if (!('value' in parsed)) {
      return { errors: parsed.errors }
    }
    return {
      schedule: {
        kind: 'cron',
        cronExpression: parsed.value.expression,
        timezone: normalizeTimezone(input.timezone),
      },
      errors: [],
    }
  }

  if (input.existing) {
    const timezone = input.timezone === null ? undefined : normalizeTimezone(input.timezone)
    return {
      schedule:
        timezone === undefined && input.timezone !== null
          ? input.existing
          : { ...input.existing, timezone },
      errors: [],
    }
  }

  return { errors: [] }
}

export function scheduleFromCreateRequest(
  request: CreateCronTaskRequest,
  now = Date.now()
): NormalizeScheduleResult {
  return normalizeScheduleInput({
    runAt: request.runAt,
    cronExpression: request.cronExpression,
    timezone: request.timezone,
    now,
    requireSchedule: true,
  })
}

export function scheduleFromUpdateRequest(
  request: UpdateCronTaskRequest,
  existing: CronSchedule,
  now = Date.now()
): NormalizeScheduleResult {
  return normalizeScheduleInput({
    runAt: request.runAt,
    cronExpression: request.cronExpression,
    timezone: request.timezone,
    existing,
    now,
    requireSchedule: false,
  })
}

export function nextRunAt(schedule: CronSchedule, from = Date.now()): number | undefined {
  if (schedule.kind === 'at') {
    return schedule.runAt > from ? schedule.runAt : undefined
  }

  const parsed = parseCronExpression(schedule.cronExpression)
  if (!('value' in parsed)) {
    return undefined
  }

  const start = new Date(from)
  start.setSeconds(0, 0)
  let candidate = start.getTime() <= from ? start.getTime() + 60_000 : start.getTime()
  for (let index = 0; index < MAX_SEARCH_MINUTES; index += 1) {
    const date = new Date(candidate)
    if (matchesCron(date, parsed.value)) {
      return candidate
    }
    candidate += 60_000
  }
  return undefined
}

export function validateCronExpression(expression: string): CronValidationError[] {
  return parseCronExpression(expression).errors
}

export function parseCronExpression(
  expression: string
): { value: ParsedCronExpression; errors: [] } | { errors: CronValidationError[] } {
  const normalized = expression.trim().replace(/\s+/g, ' ')
  const parts = normalized.split(' ')
  if (parts.length !== CRON_PARTS) {
    return {
      errors: [
        {
          path: 'cronExpression',
          code: 'unsupported_cron',
          message: 'Cron expression must use exactly five fields: minute hour day month weekday.',
        },
      ],
    }
  }

  const values: Array<Set<number>> = []
  const errors: CronValidationError[] = []
  for (const [index, part] of parts.entries()) {
    const parsed = parseCronField(part, FIELD_SPECS[index]!)
    if (!('value' in parsed)) {
      errors.push(...parsed.errors)
    } else {
      values.push(parsed.value)
    }
  }

  if (errors.length) {
    return { errors }
  }

  return {
    value: {
      expression: normalized,
      minute: values[0]!,
      hour: values[1]!,
      dayOfMonth: values[2]!,
      month: values[3]!,
      dayOfWeek: values[4]!,
    },
    errors: [],
  }
}

function parseCronField(
  value: string,
  spec: CronFieldSpec
): { value: Set<number>; errors: [] } | { errors: CronValidationError[] } {
  if (!value) {
    return {
      errors: [cronFieldError(spec, 'Cron field cannot be empty.')],
    }
  }

  const result = new Set<number>()
  for (const token of value.split(',')) {
    const parsed = parseCronToken(token, spec)
    if (!('value' in parsed)) {
      return parsed
    }
    for (const item of parsed.value) {
      result.add(spec.normalize ? spec.normalize(item) : item)
    }
  }

  return { value: result, errors: [] }
}

function parseCronToken(
  token: string,
  spec: CronFieldSpec
): { value: number[]; errors: [] } | { errors: CronValidationError[] } {
  const [rangeToken, stepToken] = token.split('/')
  if (!rangeToken || token.split('/').length > 2) {
    return { errors: [cronFieldError(spec, `Unsupported cron token "${token}".`)] }
  }
  const step = stepToken === undefined ? 1 : Number(stepToken)
  if (!Number.isInteger(step) || step <= 0) {
    return { errors: [cronFieldError(spec, `Invalid step in cron token "${token}".`)] }
  }

  const range = parseCronRange(rangeToken, spec)
  if (!('min' in range)) {
    return range
  }

  const values: number[] = []
  for (let value = range.min; value <= range.max; value += step) {
    values.push(value)
  }
  return { value: values, errors: [] }
}

function parseCronRange(
  token: string,
  spec: CronFieldSpec
): { min: number; max: number; errors: [] } | { errors: CronValidationError[] } {
  if (token === '*') {
    return { min: spec.min, max: spec.max, errors: [] }
  }
  const range = token.split('-')
  if (range.length === 1) {
    const value = Number(range[0])
    if (!isCronValue(value, spec)) {
      return { errors: [cronFieldError(spec, `Invalid ${spec.name} value "${token}".`)] }
    }
    return { min: value, max: value, errors: [] }
  }
  if (range.length !== 2) {
    return { errors: [cronFieldError(spec, `Invalid ${spec.name} range "${token}".`)] }
  }
  const min = Number(range[0])
  const max = Number(range[1])
  if (!isCronValue(min, spec) || !isCronValue(max, spec) || min > max) {
    return { errors: [cronFieldError(spec, `Invalid ${spec.name} range "${token}".`)] }
  }
  return { min, max, errors: [] }
}

function matchesCron(date: Date, expression: ParsedCronExpression): boolean {
  return (
    expression.minute.has(date.getMinutes()) &&
    expression.hour.has(date.getHours()) &&
    expression.dayOfMonth.has(date.getDate()) &&
    expression.month.has(date.getMonth() + 1) &&
    expression.dayOfWeek.has(date.getDay())
  )
}

function isCronValue(value: number, spec: CronFieldSpec): boolean {
  return Number.isInteger(value) && value >= spec.min && value <= spec.max
}

function cronFieldError(spec: CronFieldSpec, message: string): CronValidationError {
  return {
    path: `cronExpression.${spec.name}`,
    code: 'unsupported_cron',
    message,
  }
}

function normalizeTimezone(value: string | null | undefined): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || undefined
}
