# sleetcord-common

A set of common modules and utils I use for most of my own bots. These aren't general enough to include in sleetcord, and not specific enough to be bot-independent.

Used in:
  - [Smol Bot](https://github.com/AtoraSuunva/SmolBot)
  - [BooruBot](https://github.com/AtoraSuunva/BooruBot)
  - [BulbaTrivia](https://github.com/AtoraSuunva/BulbaTrivia)

Notes:
  - `discord.js` is _required_.
  - `sleetcord` is _required_ for any modules.
  - Prisma (`@prisma/client`/`@prisma/instrumentation`) is only required if you enable `dbLogging`. If you install them, they should both be the same version.
