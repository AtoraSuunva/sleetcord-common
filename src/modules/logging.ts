import { SleetContext, SleetModule, runningModuleStore } from 'sleetcord'
import { LoggerOptions, pino as createLogger } from 'pino'
import env from 'env-var'
import { interactionToString } from '../utils/stringify.js'

const NODE_ENV = env.get('NODE_ENV').required().asString()
const USE_PINO_PRETTY = env.get('USE_PINO_PRETTY').required().asBool()

const loggerOptions: LoggerOptions = {
  level: NODE_ENV === 'development' ? 'debug' : 'info',
}

if (USE_PINO_PRETTY) {
  loggerOptions.transport = {
    target: 'pino-dev',
  }
}

const baseLogger = createLogger(loggerOptions)
export const logger = baseLogger.child({ module: 'main' })
export const djsLogger = baseLogger.child({ module: 'discord.js' })
const djsName = { name: 'discord.js' }

export const logging = new SleetModule(
  {
    name: 'logging',
  },
  {
    ready(this: SleetContext) {
      this.client.rest.on('invalidRequestWarning', (invalidRequestInfo) => {
        djsLogger.warn(
          { ...moduleName(), type: 'invalid-request' },
          'Invalid Request Warning: %o',
          invalidRequestInfo,
        )
      })
      this.client.rest.on('rateLimited', (rateLimitInfo) => {
        djsLogger.warn(
          { ...moduleName(), type: 'ratelimit' },
          'Ratelimited: %o',
          rateLimitInfo,
        )
      })
      this.client.rest.on('response', (request, response) => {
        const path = `${request.method} ${censorPath(request.path)} ${
          response.statusCode
        }`

        const ratelimit = {
          remaining: response.headers['x-ratelimit-remaining'],
          limit: response.headers['x-ratelimit-limit'],
          resetAfter: response.headers['x-ratelimit-reset-after'],
        }

        const ratelimitLine = ratelimit.remaining
          ? `[${ratelimit.remaining}/${ratelimit.limit} (${ratelimit.resetAfter}s)]`
          : ''
        let body = ''

        if (response.statusCode >= 400) {
          const bodyBuilder = []
          if (request.method !== 'GET') {
            bodyBuilder.push('\nRequest:\n')
            bodyBuilder.push(JSON.stringify(request.data.body, null, 2))
            // unfortunately there's no easy way to clone the response body without consuming it because it's some weird undici thing
            // there's a commit that does allow you to override `makeRequest` with native `fetch` that returns a cloneable response
            // but it doesn't seem to be there in the latest release
            // see https://github.com/discordjs/discord.js/commit/cdaa0a36f586459f1e5ede868c4250c7da90455c
            // bodyBuilder.push('\nResponse:\n')
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
      })
      djsLogger.info({ djsName, type: 'client-ready' }, 'Client is ready!')
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
        `Joined guild (${info})`,
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
        `Left guild (${info})`,
      )
    },

    sleetError(error) {
      logger.error({ ...moduleName(), type: 'sleet-error', error }, error)
    },
    sleetWarn(warning) {
      logger.warn({ ...moduleName(), type: 'sleet-warn' }, warning)
    },
    sleetDebug(debug) {
      logger.debug({ ...moduleName(), type: 'sleet-debug' }, debug)
    },
    applicationInteractionError(_module, _interaction, error) {
      logger.error(
        { ...moduleName(), type: 'interaction-error', error },
        error instanceof Error ? error.message : String(error),
      )
    },
    autocompleteInteractionError(_module, _interaction, error) {
      logger.error(
        { ...moduleName(), type: 'autocomplete-error', error },
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
      logger.debug(
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
      logger.info(
        {
          name: module.name,
          type: 'load-module',
          qualifiedName: qualifiedName,
        },
        'Loaded module',
      )
    },
    unloadModule(module, qualifiedName) {
      logger.info(
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
  /^(\/interactions\/\d{17,19}\/)(.*)(\/callback.*)/,
  /^(\/webhooks\/\d{17,19}\/)(.*)(\/messages.*)/,
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
  for (const regex of CENSOR_REGEXES) {
    path = path.replace(regex, '$1:token$3')
  }
  return path
}

export function moduleName(): { name: string } | undefined {
  const module = runningModuleStore.getStore()
  if (module) {
    return { name: module.name }
  }
  return
}
