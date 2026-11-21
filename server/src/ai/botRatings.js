const botManager = require('./botManager')
const eloStore = require('./eloStore')
const { readGames } = require('./gameLog')
const { botVersion } = require('./botVersion')
const { fitRatings } = require('./ratingFit')

// The rating anchor: Milo Pruitt is 400 by definition (he finishes games and knows checkmate, but
// only notices a mate in one about half the time). Everyone else is measured against him.
const ANCHOR = { id: 'miloPruitt', elo: 400 }
// Lowest rating shown. Only a display floor: the fit itself never sees it, so it can't add points
// to the pool the way clamping inside a game-by-game update does.
const FLOOR = 100

// Re-fits every bot's rating from the full game log.
//   allVersions: also count games played by older versions of a bot (normally they're dropped,
//                because a reworked bot is a different player).
// Returns { ok, reason?, rows, whiteAdvantage, gamesUsed, gamesSkipped, anchor }.
const computeRatings = ({ allVersions = false, logPath } = {}) => {
    const current = {}
    for(const b of botManager.getBotList()) current[b.id] = botVersion(b.id)

    const games = []
    let skipped = 0
    for(const g of readGames(logPath)){
        const usable = g.white in current && g.black in current &&
            (allVersions || (g.wv == current[g.white] && g.bv == current[g.black]))
        if(!usable){ skipped++; continue }
        // Stalemate is a ¾-¼ win under the rules (rules.js), so it counts as 0.75, like in player ratings.
        const win = g.reason == 'stalemate' ? 0.75 : 1
        games.push({ ...g, score: g.result == 'white' ? win : g.result == 'black' ? 1 - win : 0.5 })
    }

    const anchorGames = games.filter(g => g.white == ANCHOR.id || g.black == ANCHOR.id).length
    if(!anchorGames){
        return { ok: false, reason: `The anchor (${ANCHOR.id}) has no games${allVersions ? '' : ' in its current version'} - run a tournament that includes it.`, rows: [], gamesUsed: games.length, gamesSkipped: skipped, anchor: ANCHOR }
    }

    const fit = fitRatings({ games, anchorId: ANCHOR.id, anchorElo: ANCHOR.elo })

    const records = {}
    const rec = id => records[id] ||= { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 }
    for(const g of games){
        const w = rec(g.white), b = rec(g.black)
        w.gamesPlayed++; b.gamesPlayed++
        if(g.result == 'white'){ w.wins++; b.losses++ }
        else if(g.result == 'black'){ b.wins++; w.losses++ }
        else { w.draws++; b.draws++ }
    }

    const old = eloStore.getAllRatings()
    const rows = botManager.getBotList().map(b => {
        const r = fit.ratings[b.id]
        const base = { id: b.id, name: b.name, labOnly: b.labOnly, oldElo: old[b.id]?.elo ?? null, version: current[b.id] }
        if(!r) return { ...base, status: records[b.id] ? 'unconnected' : 'no games', ...(records[b.id] || {}) }
        return {
            ...base,
            status: 'rated',
            rawElo: r.elo,
            elo: Math.max(FLOOR, Math.round(r.elo)),
            se: r.se,
            ...records[b.id]
        }
    }).sort((a, b) => (b.rawElo ?? -Infinity) - (a.rawElo ?? -Infinity))

    return { ok: true, rows, whiteAdvantage: fit.whiteAdvantage, gamesUsed: games.length, gamesSkipped: skipped, anchor: ANCHOR }
}

// Writes the fitted ratings into eloRatings.json. Bots the fit couldn't rate keep what they had.
const saveRatings = result => {
    if(!result.ok) return false
    const updates = {}
    for(const r of result.rows){
        if(r.status != 'rated') continue
        updates[r.id] = { elo: r.elo, uncertainty: Math.round(r.se), wins: r.wins, losses: r.losses, draws: r.draws, gamesPlayed: r.gamesPlayed, version: r.version }
    }
    eloStore.setRatings(updates)
    return true
}

module.exports = { computeRatings, saveRatings, ANCHOR, FLOOR }
