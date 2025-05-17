import type { getPrismaClient } from '@prisma/client/runtime/library.js'
import env from 'env-var'
import type { LoggerOptions } from 'pino'
import { runningModuleStore } from 'sleetcord'
import { LOG_LEVEL, baseLogger } from './logging.js'
import { Sentry } from './sentry.js'

type Client = ReturnType<typeof getPrismaClient> extends new () => infer T
  ? T
  : never

const USE_PINO_PRETTY = env.get('USE_PINO_PRETTY').required().asBool()

const loggerOptions: LoggerOptions = {
  level: LOG_LEVEL,
}

if (USE_PINO_PRETTY) {
  loggerOptions.transport = {
    target: 'pino-dev',
  }
}

const prismaLogger = baseLogger.child({ module: 'prisma' })

/** Warn if a query took longer than X ms */
const QUERY_TOO_LONG_WARNING = 2_000

type PrismaClient = Pick<Client, '$on'>

/**
 * Inits DB logging using a prisma client, logs queries, info, warnings, errors + warnings for queries that take too long
 * @param prisma The prisma client to use
 */
export function initDBLogging(prisma: PrismaClient) {
  prisma.$on('query', (e: { duration: number; query: string }) => {
    prismaLogger.debug(
      { ...moduleName(), type: 'query', duration: e.duration },
      `${e.query}; (Took ${e.duration}ms)`,
    )

    if (e.duration > QUERY_TOO_LONG_WARNING) {
      const context = {
        ...moduleName(),
        type: 'query-too-long',
        duration: e.duration,
      }
      const message = `${e.query}; (Took too long ${e.duration}ms)`

      prismaLogger.warn(context, message)
      Sentry.captureMessage(message, {
        level: 'warning',
        extra: context,
      })
    }
  })

  prisma.$on('info', (e: { message: string; target: string }) => {
    prismaLogger.info(
      { ...moduleName(), type: 'prisma-info' },
      `${e.message} (Target ${e.target})`,
    )

    Sentry.captureMessage(e.message, {
      level: 'info',
      extra: {
        ...moduleName(),
      },
      tags: {
        target: e.target,
        type: 'prisma-info',
      },
    })
  })

  prisma.$on('warn', (e: { message: string; target: string }) => {
    prismaLogger.warn(
      { ...moduleName(), type: 'prisma-warn' },
      `${e.message} (Target ${e.target})`,
    )

    Sentry.captureMessage(e.message, {
      level: 'warning',
      extra: {
        ...moduleName(),
      },
      tags: {
        target: e.target,
        type: 'prisma-warn',
      },
    })
  })

  prisma.$on('error', (e: { message: string; target: string }) => {
    prismaLogger.error(
      { ...moduleName(), type: 'prisma-error' },
      `${e.message} (Target ${e.target})`,
    )

    Sentry.captureMessage(e.message, {
      level: 'error',
      extra: {
        ...moduleName(),
      },
      tags: {
        target: e.target,
        type: 'prisma-error',
      },
    })
  })
}

function moduleName(): { name: string } | undefined {
  const module = runningModuleStore.getStore()
  if (module) {
    return { name: module.name }
  }
  return
}
