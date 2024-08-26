import {
  ApplicationCommandOptionType,
  type CommandInteractionOption,
  type Interaction,
} from 'discord.js'

const optionTypeToString: Record<ApplicationCommandOptionType, string> = {
  1: 'Subcommand',
  2: 'SubcommandGroup',
  3: 'String',
  4: 'Integer',
  5: 'Boolean',
  6: 'User',
  7: 'Channel',
  8: 'Role',
  9: 'Mentionable',
  10: 'Number',
  11: 'Attachment',
}

/**
 * Format an interaction into a string, like:
 * @example
 * // Slash commands & autocomplete
 * /command [option1<String>: value1] [option2<Integer>: value2]
 * /command sub_command [focused*<String>: value]
 * // Right click commands (message or user)
 * >command [Message (1233123123333): hello everybody my name is markiplier...]
 * >command [User (91298392100299): atorasuunva]
 * // Buttons/select menus/modals
 * [Button (custom-id)]
 * [SelectMenu (custom-id) [val1, val2, val3]]
 * [ModalSubmit (custom-id)]
 * @param interaction The interaction to format as a string
 * @returns The interaction as a string
 */
export function interactionToString(interaction: Interaction): string {
  if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
    const name = interaction.commandName
    const group = interaction.options.getSubcommandGroup(false) ?? ''
    const subcommand = interaction.options.getSubcommand(false) ?? ''

    const fGroup = group ? ` ${group}` : ''
    const fSubcommand = subcommand ? ` ${subcommand}` : ''

    const options = interaction.options.data.map(stringifyOption)
    return `/${name}${fGroup}${fSubcommand} ${options.join(' ')}`
  }

  if (interaction.isUserContextMenuCommand()) {
    return `>${interaction.commandName} [User] (${interaction.targetId}): ${interaction.targetUser.username}]`
  }

  if (interaction.isMessageContextMenuCommand()) {
    return `>${interaction.commandName} [Message] (${
      interaction.targetId
    }): ${interaction.targetMessage.content.substring(0, 50)}`
  }

  if (interaction.isButton()) {
    return `[Button] (${interaction.customId})`
  }

  if (interaction.isAnySelectMenu()) {
    return `[SelectMenu] (${interaction.customId}) [${interaction.values.join(
      ', ',
    )}]`
  }

  if (interaction.isModalSubmit()) {
    // So far, only strings exist for modal submits
    const opts = interaction.fields.fields.map(
      (f) => `[${f.customId}<String>: ${f.value}]`,
    )
    return `[ModalSubmit] (${interaction.customId}) ${opts.join(' ')}`
  }

  return '[Unknown interaction type]'
}

function stringifyOption(opt: CommandInteractionOption): string {
  if (opt.type === ApplicationCommandOptionType.Subcommand) {
    return opt.options ? opt.options.map(stringifyOption).join(' ') : ''
  }

  if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
    return opt.options ? opt.options.map(stringifyOption).join(' ') : ''
  }

  return `[${opt.name}${opt.focused ? '*' : ''}<${
    optionTypeToString[opt.type]
  }>: ${opt.value}]`
}
