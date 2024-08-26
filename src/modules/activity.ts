import { readFile } from 'node:fs/promises'
import {
  type APIApplicationCommandOptionChoice,
  type ActivityOptions,
  ActivityType,
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  type Client,
} from 'discord.js'
import env from 'env-var'
import { type SleetContext, SleetSlashCommand, isOwnerGuard } from 'sleetcord'
import { MINUTE } from '../utils/constants.js'

/** Holds the timeout that we use to periodically change the activity */
let timeout: NodeJS.Timeout
/** Every 15m, change the current activity */
const timeoutDelay = 15 * MINUTE // in ms
/** These activities will be randomly selected and shown by the bot */
const activities: ActivityOptions[] = []

/** You shouldn't see this, this is just a fallback activity if the random pick fails */
const FALLBACK_ACTIVITY: ActivityOptions = {
  type: ActivityType.Custom,
  name: 'Failed to load activity!',
} as const

/** Maps from an activity ID or string to a display string */
const reverseActivityTypesMap: Record<
  Exclude<ActivityOptions['type'], undefined>,
  string
> = {
  [ActivityType.Playing]: 'Playing',
  [ActivityType.Streaming]: 'Streaming',
  [ActivityType.Listening]: 'Listening to',
  [ActivityType.Watching]: 'Watching',
  [ActivityType.Custom]: 'Custom',
  [ActivityType.Competing]: 'Competing in',
}

const ACTIVITIES_FILE = env.get('ACTIVITIES_FILE').asString()

/**
 * Valid choices for activities that bots can set
 */
const activityChoices: APIApplicationCommandOptionChoice<number>[] = [
  {
    name: 'playing',
    value: ActivityType.Playing,
  },
  {
    name: 'streaming',
    value: ActivityType.Streaming,
  },
  {
    name: 'listening',
    value: ActivityType.Listening,
  },
  {
    name: 'watching',
    value: ActivityType.Watching,
  },
  {
    name: 'custom',
    value: ActivityType.Custom,
  },
  {
    name: 'competing',
    value: ActivityType.Competing,
  },
]

/**
 * Set the activity that a bot is doing, ie. the "**Playing** some game"
 */
export const activity = new SleetSlashCommand(
  {
    name: 'activity',
    description: 'Allow to randomly/manually set a new activity',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The new activity name to use',
      },
      {
        name: 'type',
        type: ApplicationCommandOptionType.Integer,
        description: 'The activity type to set',
        choices: activityChoices,
      },
      {
        name: 'state',
        type: ApplicationCommandOptionType.String,
        description: 'The activity state to set',
      },
    ],
    registerOnlyInGuilds: [],
  },
  {
    ready: runReady,
    run: runActivity,
  },
)

/** Run a timeout to change the bot's activity on READY and every couple mins */
async function runReady(client: Client) {
  await loadActivities()
  const activity = getRandomActivity()

  setClientActivity(client, activity)

  timeout = setTimeout(() => {
    void runReady(client)
  }, timeoutDelay)
}

/** Either set a new random activity, or set it to the one the user specified */
async function runActivity(
  this: SleetContext,
  interaction: ChatInputCommandInteraction,
) {
  await isOwnerGuard(interaction)

  const name = interaction.options.getString('name')
  const type = interaction.options.getInteger('type') as Exclude<
    ActivityOptions['type'],
    undefined
  > | null
  const state = interaction.options.getString('state')

  let activity: ActivityOptions
  clearTimeout(timeout)

  if (type === null && name === null) {
    // Set a random one
    activity = getRandomActivity()
    timeout = setTimeout(() => {
      void runReady(interaction.client)
    }, timeoutDelay)
  } else {
    const previousActivity = interaction.client.user.presence.activities[0]
    activity = {
      type: type ?? previousActivity.type,
      name: name ?? previousActivity.name,
    }

    if (state) {
      activity.state = state
    }
  }

  setClientActivity(interaction.client, activity)

  return interaction.reply({
    ephemeral: true,
    content: `Set activity to:\n> ${formatActivity(activity)}`,
  })
}

async function loadActivities() {
  if (!ACTIVITIES_FILE) return

  const lines = await readFile(ACTIVITIES_FILE, 'utf-8').then((content) =>
    content.trim().split('\n'),
  )

  const stats: ActivityOptions[] = lines.map((line) => {
    const space = line.indexOf(' ') + 1
    let [type, name] = [line.substring(0, space), line.substring(space)].map(
      (str) => str.trim(),
    )

    type = type.replace(/{(\w+)}/, '$1')

    if (!(type in ActivityType)) {
      type = 'Custom'
      name = line
    }

    return {
      type: ActivityType[type as keyof typeof ActivityType],
      name,
    }
  })

  activities.push(...stats)
}

/**
 * Helper function to set the activity for a client, adds in shard ID if the client is sharded
 * @param client The client to set the activity for
 * @param activity The activity to set
 */
function setClientActivity(client: Client, activity: ActivityOptions) {
  if (client.shard) {
    for (const shardId of client.shard.ids) {
      // Shards start at 0, so with 4 shards we'd have [0, 1, 2, 3] and we don't want "Shard 3/4"
      const count = client.shard.count - 1

      client.user?.setActivity({
        ...activity,
        name: `${activity.name} | Shard ${shardId}/${count}`,
        shardId,
      })
    }
  } else {
    client.user?.setActivity(activity)
  }
}

/**
 * Get a random activity from our list of activities
 * @returns a random activity from the list
 */
function getRandomActivity(): ActivityOptions {
  const randomIndex = Math.floor(Math.random() * activities.length)
  return activities[randomIndex] ?? FALLBACK_ACTIVITY
}

/**
 * Formats an activity object into a string
 * @param activity The activity object
 * @returns The formatted string
 */
function formatActivity(activity: ActivityOptions): string {
  const activityType =
    reverseActivityTypesMap[activity.type ?? ActivityType.Custom]
  const formattedType = activityType ? `**${activityType}** ` : ''
  return `${formattedType}${activity.name}`
}
