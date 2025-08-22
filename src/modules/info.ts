import * as os from 'node:os'
import {
  type ChatInputCommandInteraction,
  type Client,
  version as discordJSVersion,
  EmbedBuilder,
  type Guild,
  type Invite,
  Team,
  User,
} from 'discord.js'
import { formatUser, SleetSlashCommand } from 'sleetcord'
import { notNullish } from '../utils/functions.js'

/**
 * Get some info about the bot, currently includes:
 *   - Owner
 *   - Version (Node/d.js)
 *   - CPU Load Average
 *   - Memory Usage
 *   - Bot Guild
 *   - Approximate Guild Count
 */
export const info = new SleetSlashCommand(
  {
    name: 'info',
    description: 'Get info about the bot',
  },
  {
    run: runInfo,
  },
)

/** os.loadavg() "Returns an array containing the 1, 5, and 15 minute load averages." */
const cpuLoadIntervals = [1, 5, 15]

let CACHED_INVITE: Invite | null = null

async function runInfo(interaction: ChatInputCommandInteraction) {
  const { client } = interaction

  const embed = new EmbedBuilder()

  const owner = formatOwner(client)
  const versionInfo = `Node ${process.version}\ndiscord.js v${discordJSVersion}`
  const cpuString = os
    .loadavg()
    .map((v, i) => `${cpuLoadIntervals[i]}m: ${v.toFixed(2)}%`)
    .join(', ')

  const totalMem = os.totalmem()
  const usedMem = os.totalmem() - os.freemem()
  const usedMemPercent = ((usedMem / totalMem) * 100).toFixed(2)
  const memoryString = `${formatBytes(usedMem)} / ${formatBytes(
    totalMem,
  )} (${usedMemPercent}%)`

  const approximateGuildCount =
    client.application.approximateGuildCount?.toLocaleString() ?? 'Unknown'

  const botGuild = client.application.guild

  const botGuildInvite = botGuild
    ? await ensureInviteFor(botGuild, CACHED_INVITE)
    : null

  if (CACHED_INVITE == null && botGuildInvite) {
    CACHED_INVITE = botGuildInvite
  }

  const botGuildInfo =
    botGuild === null
      ? 'Unknown'
      : `${botGuild.name} (${botGuild.id}) ${
          botGuildInvite ? `[[Invite]](${botGuildInvite.url})` : ''
        }`

  embed.addFields([
    { name: 'Owner', value: owner, inline: true },
    { name: 'Using', value: versionInfo, inline: true },
    { name: ' ', value: ' ' },
    { name: 'CPU Load Average', value: cpuString, inline: true },
    { name: 'Memory Usage', value: memoryString, inline: true },
    { name: ' ', value: ' ' },
    { name: 'Bot Guild', value: botGuildInfo, inline: true },
    { name: 'Approximate Guilds', value: approximateGuildCount, inline: true },
  ])

  if (client.shard) {
    embed.addFields([
      {
        name: 'Shard',
        value: `IDs: ${client.shard.ids.join(', ')} (${client.shard.count} total)`,
      },
    ])
  }

  await interaction.reply({
    embeds: [embed],
  })
}

const k = 1000
const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

/**
 * Formats a number of bytes into a format like `512.00 MB`, using the "best-fit" unit size
 * @param bytes The bytes to format
 * @param decimals The number of decimals to show
 * @returns A string representation of the byte size, with the appropriate unit
 */
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(decimals + 1))} ${sizes[i]}`
}

/**
 * Formats the owner details into a string, dealing with teams appropriately
 * @param interaction The client to pull information from
 * @returns A string representation of the owner details
 */
function formatOwner(client: Client<true>): string {
  const { owner } = client.application

  if (owner instanceof User) {
    return formatUser(owner)
  }

  if (owner instanceof Team) {
    return `Team: ${owner.name} (Owned by ${
      owner.owner ? formatUser(owner.owner.user) : '<Unknown>'
    })`
  }

  return '<Unknown>'
}

async function ensureInviteFor(
  guild: Guild,
  cachedInvite: Invite | null,
): Promise<Invite | null> {
  if (cachedInvite === null) {
    const channels = await guild.channels.fetch()
    const firstChannel =
      channels.find((c) => c !== null && c.id === guild.rulesChannelId) ??
      channels
        .filter(notNullish)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .find((c) => 'createInvite' in c)

    if (firstChannel === undefined) {
      return null
    }

    if ('createInvite' in firstChannel) {
      CACHED_INVITE = await firstChannel.createInvite({
        maxAge: 0,
        maxUses: 0,
        temporary: false,
        unique: false,
      })

      return CACHED_INVITE
    }
  }

  return cachedInvite
}
