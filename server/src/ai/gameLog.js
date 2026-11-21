const fs = require('fs')
const path = require('path')

// Every rated bot-vs-bot game, one JSON object per line:
//   { t, white, black, wv, bv, result: 'white' | 'black' | 'draw', reason, plies }
// wv / bv are the bot versions (botVersion.js) that played. The ratings are re-fitted from this
// whole file (see botRatings.js), so it's the source of truth and eloRatings.json is just its output.
const LOG_PATH = path.join(__dirname, '../../data/botGames.jsonl')

const appendGame = entry => {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, JSON.stringify({ t: Date.now(), ...entry }) + '\n')
}

const readGames = (logPath = LOG_PATH) => {
    let text
    try { text = fs.readFileSync(logPath, 'utf8') }
    catch(e){ return [] }
    const games = []
    for(const line of text.split('\n')){
        if(!line.trim()) continue
        try { games.push(JSON.parse(line)) }
        catch(e){ console.warn('[gameLog] Skipping unreadable line') }
    }
    return games
}

module.exports = { appendGame, readGames, LOG_PATH }
