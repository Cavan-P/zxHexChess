const fs = require('fs')
const path = require('path')
const eloStore = require('./eloStore')

const bots = {}
//const botFolder = path.join(__dirname, 'strategies')

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

const loadBotsFromDirectory = (directory, categoryOverride = null) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })

    for(const entry of entries){
        const fullPath = path.join(directory, entry.name)

        if(entry.isDirectory()){
            loadBotsFromDirectory(fullPath, entry.name)
            continue
        }

        if(!entry.name.endsWith('.js')) continue

        registerBotModule(require(fullPath), categoryOverride)
    }
}

const botFolder = path.join(__dirname, 'strategies')
loadBotsFromDirectory(botFolder)

/*
fs.readdirSync(botFolder).forEach(file => {
    if(!file.endsWith('.js')) return

    const filePath = path.join(botFolder, file)

    const bot = require(filePath)

    if(typeof bot.play != 'function'){
        console.warn('[BotLoader] Skipping ' + file + ': no play() function')
        return
    }

    bots[bot.id] = {
        play: bot.play,
        meta: {
            id: bot.id,
            name: bot.name,
            category: bot.category || 'Uncategorized',
            icon: bot.icon || 'fa-chess-pawn',
            description: bot.description || '',
            elo: bot.elo || '???'
        }
    }
})
*/
module.exports = {
    getBotList: _ => Object.values(bots).map(b => {
        const record = eloStore.getRecord(b.meta.id, b.meta.elo)
        return { ...b.meta, elo: record.elo, wins: record.wins, losses: record.losses, draws: record.draws, gamesPlayed: record.gamesPlayed }
    }),
    getBotByName: id => {
        const bot = bots[id]
        if(!bot) console.warn(`[botManager.js] No bot found with ID:`, id)
        return bot?.play
    },
    // Registers a bot in the live in-process registry immediately (used by evolve.js so a freshly
    // trained bot is playable right away, without waiting for a server restart to rescan the directory).
    registerBot: registerBotModule
}