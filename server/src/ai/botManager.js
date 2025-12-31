const fs = require('fs')
const path = require('path')

const bots = {}
//const botFolder = path.join(__dirname, 'strategies')

const loadBotsFromDirectory = (directory, categoryOverride = null) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })

    for(const entry of entries){
        const fullPath = path.join(directory, entry.name)

        if(entry.isDirectory()){
            loadBotsFromDirectory(fullPath, entry.name)
            continue
        }

        if(!entry.name.endsWith('.js')) continue

        const bot = require(fullPath)

        if(typeof bot.play != 'function'){
            console.warn(`[BotLoader] Skipping ${entry.name}: no play() function`)
            continue
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
    getBotList: _ => Object.values(bots).map(b => b.meta),
    getBotByName: id => {
        const bot = bots[id]
        if(!bot) console.warn(`[botManager.js] No bot found with ID:`, id)
        return bot?.play
    }
}