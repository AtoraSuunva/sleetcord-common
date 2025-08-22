import type { ApplicationEmoji, ClientApplication } from 'discord.js'

/** Map of { emojiName: 'image.png' } */
type CreateEmojis = Record<string, string>
type EmojiRecord = Record<string, ApplicationEmoji>

type MapToEmoji<T> = {
  [K in keyof T]: T[K] extends string ? ApplicationEmoji : never
}

export async function syncApplicationEmojis<const T extends CreateEmojis>(
  client: ClientApplication,
  emojis: T,
): Promise<MapToEmoji<T>> {
  const existingEmojis = await client.emojis.fetch()
  const existingEmojiNames = new Set(existingEmojis.map((e) => e.name))

  // Delete emojis that are not in the new list
  for (const emoji of existingEmojis.values()) {
    if (emoji.name && !emojis[emoji.name]) {
      await emoji.delete()
    }
  }

  const appEmojis: EmojiRecord = {}

  // Create or update emojis
  for (const [name, attachment] of Object.entries(emojis)) {
    // We can't edit emojis in-place, we need to delete and recreate them
    if (existingEmojiNames.has(name)) {
      await client.emojis.delete(name)
    }

    const newEmoji = await client.emojis.create({ name, attachment })

    appEmojis[name] = newEmoji
  }

  return appEmojis as MapToEmoji<T>
}

await syncApplicationEmojis({} as ClientApplication, {
  test: 'https://example.com/test.png',
  test2: 'https://example.com/test2.png',
  test3: 'https://example.com/test3.png',
})
