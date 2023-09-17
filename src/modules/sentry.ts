import * as Sentry from '@sentry/node'
import { ProfilingIntegration } from '@sentry/profiling-node'

import env from 'env-var'
import { AutocompleteInteraction } from 'discord.js'
import {
  ApplicationInteraction,
  ModuleRunner,
  SleetModule,
  runningModuleStore,
} from 'sleetcord'
import { interactionToString } from '../utils/stringify.js'
import { censorPath } from './logging.js'

export { Sentry }

const NODE_ENV = env.get('NODE_ENV').required().asString()
const SENTRY_DSN = env.get('SENTRY_DSN').asString() ?? ''

/**
 * Init Sentry, enabling logging
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
      new ProfilingIntegration(),
      new Sentry.Integrations.Undici(),
      new Sentry.Integrations.LocalVariables({
        captureAllExceptions: true,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0,
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
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

export const sentryModuleRunner: ModuleRunner = (module, callback, event) => {
  const transaction = Sentry.startTransaction({
    name: `${module.name}:${event.name}`,
    op: 'module',
  })

  Sentry.configureScope((scope) => {
    scope.setTag('module', module.name)
  })

  try {
    return Sentry.runWithAsyncContext(() => callback(...event.arguments))
  } finally {
    Sentry.configureScope((scope) => {
      scope.setTag('module', undefined)
    })
    transaction.finish()
  }
}

export const sentryLogger = new SleetModule(
  {
    name: 'sentryLogger',
  },
  {
    // discord.js error
    error: (error) =>
      void Sentry.captureException(error, {
        tags: {
          ...moduleName(),
          type: 'discord.js-error',
        },
      }),
    sleetError: (error) =>
      void Sentry.captureException(error, {
        tags: {
          ...moduleName(),
          type: 'sleet-error',
        },
      }),

    // discord.js warning
    warn: (message) =>
      void Sentry.captureMessage(message, {
        level: 'warning',
        tags: {
          ...moduleName(),
          type: 'discord.js-warning',
        },
      }),
    sleetWarn: (message) =>
      void Sentry.captureMessage(message, {
        level: 'warning',
        tags: {
          ...moduleName(),
          type: 'sleet-warn',
        },
      }),

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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      module: module?.name,
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
