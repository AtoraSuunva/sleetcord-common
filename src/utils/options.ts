import {
  ApplicationCommandOptionType,
  type CommandInteraction,
  type CommandInteractionOption,
} from 'discord.js'

/**
 * Checks if the given option is a subcommand or subcommand group
 * @param option The option to check
 * @returns Whether the option is a subcommand or subcommand group
 */
export function isSubcommandOption(option: CommandInteractionOption): boolean {
  return [
    ApplicationCommandOptionType.Subcommand,
    ApplicationCommandOptionType.SubcommandGroup,
  ].includes(option.type)
}

/**
 * Recursively gets all options from the given options, including options from subcommands and subcommand groups
 * @param options The options to get
 * @returns All options
 */
export function getAllOptions(
  options: readonly CommandInteractionOption[],
): CommandInteractionOption[] {
  return options.flatMap((option) => {
    if (isSubcommandOption(option)) {
      return option.options ? getAllOptions(option.options) : []
    }
    return option
  })
}

/**
 * Checks how many options the user specified for the interaction, excluding subcommands and subcommand groups
 * @param interaction The interaction to check
 * @returns The number of options specified
 */
export function getOptionCount(interaction: CommandInteraction): number {
  return getAllOptions(interaction.options.data).length
}
