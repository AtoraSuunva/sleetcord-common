import {
  GatewayDispatchEvents,
  InteractionType,
  LimitedCollection,
  SnowflakeUtil,
  codeBlock,
} from 'discord.js'
import prettyMilliseconds from 'pretty-ms'
import { SleetSlashCommand } from 'sleetcord'

const rawInteractions = new LimitedCollection<string, bigint>({
  maxSize: 10,
})

export const ping = new SleetSlashCommand(
  {
    name: 'ping',
    description: 'Pong! Checks the bot latency',
  },
  {
    raw(data) {
      if (
        data.t === GatewayDispatchEvents.InteractionCreate &&
        data.d.type === InteractionType.ApplicationCommand &&
        data.d.data.name === ping.name
      ) {
        rawInteractions.set(data.d.id, process.hrtime.bigint())
      }
    },
    async run(interaction) {
      // Handled first to minimize delay
      const interactionHandled = process.hrtime.bigint()

      const interactionCreate = SnowflakeUtil.timestampFrom(interaction.id)
      const interactionReceived = rawInteractions.get(interaction.id)

      const initialContent = formatResponseTime({
        wsPing: this.client.ws.ping,
        interactionCreate,
        interactionReceived,
        interactionHandled,
      })

      const messageSent = process.hrtime.bigint()

      const reply = await interaction.reply({
        content: initialContent,
        fetchReply: true,
      })

      const content = formatResponseTime({
        wsPing: this.client.ws.ping,
        messageCreated: reply.createdTimestamp,
        interactionCreate,

        interactionReceived,
        interactionHandled,
        messageSent,
        replyReceived: process.hrtime.bigint(),
      })

      await interaction.editReply(content)
    },
  },
)

interface ResponseTime {
  wsPing?: number | undefined
  interactionCreate?: number | undefined
  messageCreated?: number | undefined

  interactionReceived?: bigint | undefined
  interactionHandled?: bigint | undefined
  messageSent?: bigint | undefined
  replyReceived?: bigint | undefined
}

function formatResponseTime(r: ResponseTime): string {
  return `**Websocket**: ${r.wsPing ? prettyMilliseconds(r.wsPing) : '...'}\n${codeBlock(
    'js',
    `╭╼ Discord (ms)
╰┬╼ Interaction Create (${r.interactionCreate ?? '...'})
 ├ ${delayBetween(r.interactionCreate, r.messageCreated)}
 ╰╼ Message Created (${r.messageCreated ?? '...'})

╭╼ Bot (ns)
╰┬╼ Interaction Received (${r.interactionReceived ?? '...'})
 ├ ${delayBetweenBI(r.interactionReceived, r.interactionHandled)}
 ├╼ Interaction Handled (${r.interactionHandled ?? '...'})
 ├ ${delayBetweenBI(r.interactionHandled, r.messageSent)}
 ├╼ Message Sent (${r.messageSent ?? '...'})
 ├ ${delayBetweenBI(r.messageSent, r.replyReceived)}
 ├╼ Reply Received (${r.replyReceived ?? '...'})
 ╰─╼ Total: ${delayBetweenBI(r.interactionReceived, r.replyReceived)}`,
  )}`
}

function delayBetween(
  timeA: number | undefined,
  timeB: number | undefined,
): string {
  if (timeA === undefined || timeB === undefined) {
    return '...'
  }

  return prettyMilliseconds(timeB - timeA)
}

function delayBetweenBI(
  timeA: bigint | undefined,
  timeB: bigint | undefined,
): string {
  if (timeA === undefined || timeB === undefined) {
    return '...'
  }

  return prettyMilliseconds(Number(timeB - timeA) / 1_000_000, {
    formatSubMilliseconds: true,
  })
}
