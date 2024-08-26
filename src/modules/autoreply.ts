import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ClientUser,
  type Message,
  OAuth2Scopes,
} from 'discord.js'
import { SleetModule } from 'sleetcord'

interface AutoreplyModuleOptions {
  /**
   * Buttons to add to the autoreply message, alongside the "Invite Bot" button (Max 4)
   */
  buttons?: ButtonBuilder[]
  /**
   * The content to send in the autoreply message
   * @default `Use slash commands to interact with me, type \`/\` into your chat bar to see them.\nDon't see them? Try reinviting me!`
   */
  content?: string
}

export function makeAutoreplyModule({
  buttons = [],
  content,
}: AutoreplyModuleOptions = {}): SleetModule {
  let clientUserRegex: RegExp | null = null

  async function handleMessageCreate(message: Message): Promise<unknown> {
    if (message.author.bot) return

    const { client } = message
    const userRegex = lazyInitClientUserRegex(client.user)

    if (userRegex.test(message.content)) {
      const inviteLink = client.generateInvite({
        scopes: client.application.installParams?.scopes ?? [
          OAuth2Scopes.Bot,
          OAuth2Scopes.ApplicationsCommands,
        ],
      })

      const row = new ActionRowBuilder<ButtonBuilder>()
      const inviteButton = new ButtonBuilder()
        .setLabel('Invite Bot')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteLink)

      row.addComponents([inviteButton, ...buttons])

      return message.reply({
        content:
          content ??
          `Use slash commands to interact with me, type \`/\` into your chat bar to see them.\nDon't see them? Try reinviting me!`,
        components: [row],
      })
    }

    return
  }

  function lazyInitClientUserRegex(user: ClientUser): RegExp {
    clientUserRegex ??= new RegExp(`^<@!?${user.id}>$`)
    return clientUserRegex
  }

  return new SleetModule(
    {
      name: 'autoreply',
    },
    {
      messageCreate: handleMessageCreate,
    },
  )
}
