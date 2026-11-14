const fs = require('fs')
const path = require('path')
const eloStore = require('./eloStore')
const { titleFor } = require('../players/titles')

const bots = {}
const botFolder = path.join(__dirname, 'strategies')

// Registers an already-`require`'d bot module (or freshly-loaded one) into the live registry.
const registerBotModule = (bot, categoryOverride = null) => {
    if(typeof bot.play != 'function'){
        console.warn(`[BotLoader] Skipping ${bot.id || bot.name || 'unknown bot'}: no play() function`)
        return
    }

    const category = bot.category || categoryOverride || 'Uncategorized'

    bots[bot.id] = {
        play: bot.play,
        meta: {
            id: bot.id,
            name: bot.name,
            description: bot.description || '',
            icon: bot.icon || 'fa-chess-pawn',
            elo: bot.elo,
            category
        }
    }
}

// Bots live one folder deep (strategies/<tier>/<bot>.js). Loose files directly in strategies/
// are shared helpers or experiments, not bots, so they're ignored.
const loadBots = _ => {
    for(const tier of fs.readdirSync(botFolder, { withFileTypes: true })){
        if(!tier.isDirectory()) continue

        const tierPath = path.join(botFolder, tier.name)
        for(const file of fs.readdirSync(tierPath)){
            if(file.endsWith('.js')) registerBotModule(require(path.join(tierPath, file)), tier.name)
        }
    }
}

loadBots()

module.exports = {
    getBotList: _ => Object.values(bots).map(b => {
        const record = eloStore.getRecord(b.meta.id, b.meta.elo)
        return { ...b.meta, elo: record.elo, title: titleFor(record.elo), wins: record.wins, losses: record.losses, draws: record.draws, gamesPlayed: record.gamesPlayed }
    }),
    getBotByName: id => bots[id]?.play,
    hasBot: id => typeof id == 'string' && Object.prototype.hasOwnProperty.call(bots, id),
    // Registers a bot in the live in-process registry immediately (used by evolve.js so a freshly
    // trained bot is playable right away, without waiting for a server restart to rescan the directory).
    registerBot: registerBotModule,
    // Rescans the strategies folder (used by bot worker threads to pick up newly trained bots).
    reload: loadBots
}
