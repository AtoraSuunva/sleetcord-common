import type {
  APIRequest,
  InvalidRequestWarningData,
  RateLimitData,
  ResponseLike,
} from 'discord.js'
import env from 'env-var'
import { type LoggerOptions, pino as createLogger } from 'pino'
import {
  type SleetContext,
  SleetModule,
  formatUser,
  runningModuleStore,
} from 'sleetcord'
import { interactionToString } from '../utils/stringify.js'

const NODE_ENV = env.get('NODE_ENV').required().asString()
const USE_PINO_PRETTY = env.get('USE_PINO_PRETTY').required().asBool()
const LOG_LEVEL_ENV = env.get('LOG_LEVEL').asString()

export const LOG_LEVEL =
  (LOG_LEVEL_ENV ?? NODE_ENV === 'development') ? 'debug' : 'info'

const loggerOptions: LoggerOptions = {
  level: LOG_LEVEL,
}

if (USE_PINO_PRETTY) {
  loggerOptions.transport = {
    target: 'pino-dev',
  }
}

export const baseLogger = createLogger(loggerOptions)
export const eventLogger = baseLogger.child({ module: 'event' })
export const djsLogger = baseLogger.child({ module: 'discord.js' })
const djsName = { name: 'discord.js' }

export const logging = new SleetModule(
  {
    name: 'logging',
  },
  {
    ready(client) {
      const { application, shard, readyAt } = client
      eventLogger.info(`Ready at    : ${readyAt.toISOString()}`)
      eventLogger.info(
        `Logged in   : ${formatUser(client.user, { markdown: false })}`,
      )
      eventLogger.info(`Guild Approx: ${application.approximateGuildCount}`)

      if (shard) {
        eventLogger.info(`Shard Count : ${shard.count}`)
      }

      djsLogger.info({ djsName, type: 'client-ready' }, 'Client is ready!')
    },
    load(this: SleetContext) {
      this.client.rest.on('invalidRequestWarning', onInvalidRequestWarning)
      this.client.rest.on('rateLimited', onRateLimited)
      this.client.rest.on('response', onResponse)
    },
    unload(this: SleetContext) {
      this.client.rest.off('invalidRequestWarning', onInvalidRequestWarning)
      this.client.rest.off('rateLimited', onRateLimited)
      this.client.rest.off('response', onResponse)
    },
    error(error) {
      djsLogger.error({ ...moduleName(), error, type: 'djs-error' })
    },
    warn(warning) {
      djsLogger.warn({ ...moduleName(), type: 'djs-warn' }, warning)
    },
    debug(debug) {
      djsLogger.trace({ ...moduleName(), type: 'djs-debug' }, debug)
    },
    shardReady(shardId, unavailableGuilds) {
      const unavailable = unavailableGuilds
        ? ` with ${unavailableGuilds.size} unavailable guilds`
        : ''
      djsLogger.info(
        { ...djsName, type: 'shard-ready' },
        `Shard ${shardId} ready${unavailable}`,
      )
    },
    shardDisconnect(closeEvent, shardId) {
      djsLogger.warn(
        { ...djsName, type: 'shard-disconnect' },
        `Shard ${shardId} disconnected with code ${closeEvent.code}`,
      )
    },
    shardReconnecting(shardId) {
      djsLogger.info(
        { ...djsName, type: 'shard-reconnecting' },
        `Shard ${shardId} reconnecting`,
      )
    },
    shardResume(shardId, replayedEvents) {
      djsLogger.info(
        { ...djsName, type: 'shard-resume' },
        `Shard ${shardId} resumed with ${replayedEvents} events`,
      )
    },
    shardError(error, shardId) {
      djsLogger.error(
        { ...djsName, ...error, type: 'shard-error' },
        `Shard ${shardId} errored: ${error.message}`,
      )
    },
    guildCreate(guild) {
      const info = [
        `name: ${guild.name}`,
        `id: ${guild.id}`,
        `owner: ${guild.ownerId}`,
        `members: ${guild.memberCount}`,
      ].join(', ')
      djsLogger.info(
        { ...moduleName(), type: 'guild-create', guildId: guild.id },
        `Guild create (${info})`,
      )
    },
    guildDelete(guild) {
      const info = [
        `name: ${guild.name}`,
        `id: ${guild.id}`,
        `owner: ${guild.ownerId}`,
        `members: ${guild.memberCount}`,
      ].join(', ')
      djsLogger.info(
        { ...moduleName(), type: 'guild-delete', guildId: guild.id },
        `Guild delete (${info})`,
      )
    },

    sleetError(message, error) {
      eventLogger.error(
        { ...moduleName(), type: 'sleet-error', error, message },
        error instanceof Error ? error.message : String(error),
      )
    },
    sleetWarn(warning, data) {
      eventLogger.warn({ ...moduleName(), type: 'sleet-warn', data }, warning)
    },
    sleetDebug(debug, data) {
      eventLogger.debug({ ...moduleName(), type: 'sleet-debug', data }, debug)
    },
    applicationInteractionError(module, interaction, error) {
      eventLogger.error(
        {
          name: module.name,
          commandName: interaction.commandName,
          type: 'interaction-error',
          error,
        },
        error instanceof Error ? error.message : String(error),
      )
    },
    autocompleteInteractionError(module, interaction, error) {
      eventLogger.error(
        {
          name: module.name,
          commandName: interaction.commandName,
          type: 'autocomplete-error',
          error,
        },
        error instanceof Error ? error.message : String(error),
      )
    },
    // interactionCreate(interaction) {
    //   const str = interactionToString(interaction)
    //   logger.debug(
    //     {
    //       userId: interaction.user.id,
    //       interactionId: interaction.id,
    //     },
    //     `[INTR] ${str}`,
    //   )
    // },
    runModule(module, interaction) {
      eventLogger.debug(
        {
          name: module.name,
          type: 'run-module',
          userId: interaction.user.id,
          interactionId: interaction.id,
        },
        interactionToString(interaction),
      )
    },
    loadModule(module, qualifiedName) {
      eventLogger.info(
        {
          name: module.name,
          type: 'load-module',
          qualifiedName: qualifiedName,
        },
        'Loaded module',
      )
    },
    unloadModule(module, qualifiedName) {
      eventLogger.info(
        {
          name: module.name,
          type: 'unload-module',
          qualifiedName: qualifiedName,
        },
        'Unloaded module',
      )
    },
  },
)

/**
 * Regexes to censor tokens from paths
 *
 * Regexes should have 3 capture groups:
 *   1. The path before the token
 *   2. The token itself
 *   3. The path after the token
 */
const CENSOR_REGEXES: RegExp[] = [
  /^((?:https:\/\/discord(?:app)?\.com\/api\/v\d{2})?\/interactions\/\d{17,19}\/)(.*)(\/callback.*)/,
  /^((?:https:\/\/discord(?:app)?\.com\/api\/v\d{2})?\/webhooks\/\d{17,19}\/)(.*)(\/messages.*|$)/,
]

/**
 * Attempts to "censor" a path by replacing tokens with :token
 *
 * Though technically not required (at least for interactions, since those tokens
 * expire after a couple seconds/15 mins), it makes logs a lot easier to read and parse
 * @param path The path to censor
 * @returns The censored path
 */
export function censorPath(path: string): string {
  let newPath = path

  for (const regex of CENSOR_REGEXES) {
    newPath = newPath.replace(regex, '$1:token$3')
  }

  return newPath
}

/**
 * Get the name of the currently-running module from the running module store, if available
 *
 * Returned as an object so it can be spread into context objects
 * @returns The name of the currently running module, or undefined if there is none
 */
function moduleName(): { name: string } | undefined {
  const module = runningModuleStore.getStore()
  if (module) {
    return { name: module.name }
  }
  return
}

function onInvalidRequestWarning(
  invalidRequestInfo: InvalidRequestWarningData,
) {
  djsLogger.warn(
    { ...moduleName(), type: 'invalid-request' },
    'Invalid Request Warning: %o',
    invalidRequestInfo,
  )
}

function onRateLimited(rateLimitInfo: RateLimitData) {
  djsLogger.warn(
    { ...moduleName(), type: 'ratelimit' },
    'Ratelimited: %o',
    rateLimitInfo,
  )
}

function onResponse(req: APIRequest, res: ResponseLike) {
  if (!(res instanceof Response)) {
    djsLogger.warn(
      "Response is not a Response object, set `makeRequest: fetch` in your rest client options. You might need `makeRequest: fetch as unknown as RESTOptions['makeRequest'],` for it to work nicely.",
    )
    return
  }

  const path = `${req.method} ${censorPath(req.path)} ${res.status} ${
    res.statusText
  }`

  const ratelimit = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    resetAfter: res.headers.get('x-ratelimit-reset-after'),
    retryAfter: res.headers.get('retry-after'),
    bucket: res.headers.get('x-ratelimit-bucket'),
    global: res.headers.get('x-ratelimit-global'),
    scope: res.headers.get('x-ratelimit-scope'),
  }

  const ratelimitLine = ratelimit.remaining
    ? `[${ratelimit.remaining}/${ratelimit.limit} (${
        ratelimit.resetAfter
      }s) ${ratelimit.bucket}${
        ratelimit.scope ? ` ${ratelimit.scope}` : ''
      }${ratelimit.global ? '!' : ''}${
        ratelimit.retryAfter ? ` retry in ${ratelimit.retryAfter}s` : ''
      }]`
    : ''
  let body = ''

  if (res.status >= 400) {
    const bodyBuilder = []

    if (req.method !== 'GET') {
      bodyBuilder.push('\nRequest:\n')
      bodyBuilder.push(JSON.stringify(req.data.body, null, 2))
      if (!res.bodyUsed && res.body !== null && !res.body.locked) {
        bodyBuilder.push('\nResponse:\n')
        bodyBuilder.push(JSON.stringify(res.clone().body, null, 2))
      }
    }

    body = bodyBuilder.join('')
  }

  djsLogger.debug(
    {
      ...moduleName(),
      type: 'rest',
    },
    `${path} ${ratelimitLine}${body}`,
  )
}
