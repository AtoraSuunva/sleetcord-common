import * as Sentry from '@sentry/node'
import type { AutocompleteInteraction } from 'discord.js'
import env from 'env-var'
import {
  type ApplicationInteraction,
  defaultModuleRunner,
  type ModuleRunner,
  runningModuleStore,
  SleetModule,
} from 'sleetcord'
import { interactionToString } from '../utils/stringify.js'
import { censorPath } from './logging.js'

export { Sentry }

const NODE_ENV = env.get('NODE_ENV').required().asString()
const SENTRY_DSN = env.get('SENTRY_DSN').asString() ?? ''

/**
 * Init Sentry, enabling logging
 *
 * This comes with default settings for Sentry, but you can override any of them by providing options
 *
 * Requires the Sentry DSN to be set as an env var `SENTRY_DSN`
 * @param options Sentry options
 */
export function initSentry(options?: Sentry.NodeOptions) {
  if (!SENTRY_DSN) {
    console.warn(
      'SENTRY_DSN not set, not initializing Sentry. Set it to enable Sentry.',
    )
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV,
    integrations: [
      Sentry.dedupeIntegration(),
      Sentry.localVariablesIntegration({
        captureAllExceptions: true,
        maxExceptionsPerSecond: 5,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 0.1,
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 0.5,
    includeLocalVariables: true,

    // Censor out tokens from url breadcrumbs, they're not very useful
    beforeBreadcrumb(breadcrumb) {
      if (typeof breadcrumb.data?.url === 'string') {
        breadcrumb.data.url = censorPath(breadcrumb.data.url)
      }

      return breadcrumb
    },

    // Apply any provided options
    ...options,
  })
}

/**
 * Conditionally either return a module runner to run events under a Sentry span,
 * or the default module runner from sleetcord depending on if SENTRY_DSN is defined
 * as an env var
 * @returns The module runner to use for the current environment
 */
export function getModuleRunner(): ModuleRunner {
  return SENTRY_DSN ? sentryModuleRunner : defaultModuleRunner
}

/**
 * A module runner designed to run every module+event under a Sentry span
 * for error tracing
 * @param module The module to run
 * @param callback The callback that runs the module
 * @param event The event that will be handled by the module
 * @returns The result of running that module
 */
export const sentryModuleRunner: ModuleRunner = (module, callback, event) => {
  Sentry.startSpanManual(
    {
      name: `${module.name}:${event.name}`,
      op: 'module',
    },
    (span, finish) => {
      const scope = Sentry.getCurrentScope()
      scope.clearBreadcrumbs()
      scope.setTag('module', module.name)

      try {
        const res = Sentry.withIsolationScope(() =>
          callback(...event.arguments),
        )
        return res
      } finally {
        scope.clearBreadcrumbs()
        scope.setTag('module', undefined)
        span.end()
        finish()
      }
    },
  )
}

export const sentryLogger = new SleetModule(
  {
    name: 'sentryLogger',
  },
  {
    // discord.js error
    error(error) {
      Sentry.captureException(error, {
        tags: {
          ...moduleName(),
          type: 'discord.js-error',
        },
      })
    },
    sleetError(message, error) {
      Sentry.captureException(error, {
        tags: {
          ...moduleName(),
          type: 'sleet-error',
        },
        extra: {
          message,
        },
      })
    },

    // discord.js warning
    warn(message) {
      Sentry.captureMessage(message, {
        level: 'warning',
        tags: {
          ...moduleName(),
          type: 'discord.js-warning',
        },
      })
    },
    sleetWarn(message, data) {
      Sentry.captureMessage(message, {
        level: 'warning',
        tags: {
          ...moduleName(),
          type: 'sleet-warn',
        },
        extra: {
          data,
        },
      })
    },

    autocompleteInteractionError: interactionErrorHandler,
    applicationInteractionError: interactionErrorHandler,
  },
)

function interactionErrorHandler(
  module: SleetModule,
  interaction: ApplicationInteraction | AutocompleteInteraction,
  error: unknown,
) {
  Sentry.captureException(error, {
    extra: {
      interaction: interactionToString(interaction),
    },
    tags: {
      // I **think** module might be sometimes undefined? Not sure, but just in case until i confirm
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      moduleName: module?.name,
      type: 'interaction-error',
      commandName: interaction.commandName,
    },
  })
}

function moduleName(): { moduleName: string } | undefined {
  const module = runningModuleStore.getStore()
  if (module) {
    return { moduleName: module.name }
  }
  return
}
