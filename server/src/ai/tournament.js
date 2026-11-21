const eloStore = require('./eloStore')
const botManager = require('./botManager')
const { appendGame } = require('./gameLog')
const { botVersion } = require('./botVersion')
const { computeRatings, saveRatings } = require('./botRatings')
const { playTrainingGame } = require('./trainPool')

// Same limits a live game would hit: the full 300-ply cap and the 50-move rule.
const MAX_PLIES = 300
const NO_PROGRESS_LIMIT = 100

const buildPairings = botIds => {
    const pairings = []
    for(let i = 0; i < botIds.length; i++){
        for(let j = i + 1; j < botIds.length; j++){
            pairings.push([botIds[i], botIds[j]])
        }
    }
    return pairings
}

// Every game of the tournament, in order: each pair plays `gamesPerPairing` games, colours alternating.
const buildSchedule = (botIds, gamesPerPairing) => buildPairings(botIds).flatMap(([idA, idB], p) =>
    Array.from({ length: gamesPerPairing }, (_, g) => ({
        id: `${p + 1}-${g + 1}`,
        pairing: [idA, idB],
        white: g % 2 == 0 ? idA : idB,
        black: g % 2 == 0 ? idB : idA
    }))
)

// Live view only: a quick game-by-game Elo estimate so standings move while the tournament runs.
// It's never saved - the real ratings come from re-fitting the whole game log at the end.
const LIVE_K = 32
const liveUpdate = (live, idA, idB, scoreA) => {
    const a = live[idA], b = live[idB]
    const expectedA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400))
    const delta = LIVE_K * (scoreA - expectedA)
    a.elo = Math.round(a.elo + delta)
    b.elo = Math.round(b.elo - delta)
    for(const [r, s] of [[a, scoreA], [b, 1 - scoreA]]){
        r.gamesPlayed++
        if(s == 1) r.wins++
        else if(s == 0) r.losses++
        else r.draws++
    }
}

// Round-robin tournament. Games run in parallel on the training worker threads (so they don't block
// the server). Every game is appended to the game log with the versions of the bots that played it;
// when the tournament ends, all bot ratings are re-fitted from the whole log (botRatings.js).
//
// Callbacks (all optional): onGameMove(id, { fen, from, to, ply }); onProgress({ id, pairing, white,
// black, result, ratings, gamesPlayed, totalGames }) after each game.
const runTournament = async ({ botIds, gamesPerPairing = 2, schedule = buildSchedule(botIds, gamesPerPairing), onGameMove, onProgress, refit = true }) => {
    for(const id of botIds) if(!botManager.hasBot(id)) throw new Error(`Unknown bot id: ${id}`)

    const versions = Object.fromEntries(botIds.map(id => [id, botVersion(id)]))
    const current = Object.fromEntries(botManager.getBotList().map(b => [b.id, b]))
    const live = Object.fromEntries(botIds.map(id => [id, { elo: current[id].elo, wins: 0, losses: 0, draws: 0, gamesPlayed: 0 }]))
    let gamesPlayed = 0

    await Promise.all(schedule.map(async game => {
        const { result: outcome } = await playTrainingGame({
            whiteBot: game.white,
            blackBot: game.black,
            maxPlies: MAX_PLIES,
            noProgressLimit: NO_PROGRESS_LIMIT
        }, move => onGameMove?.(game.id, move))

        const result = { result: outcome.winner || 'draw', reason: outcome.reason }
        const [idA, idB] = game.pairing
        appendGame({ white: game.white, black: game.black, wv: versions[game.white], bv: versions[game.black], result: result.result, reason: result.reason })

        const scoreA = result.result == 'draw' ? 0.5 : (result.result == 'white' ? game.white : game.black) == idA ? 1 : 0
        liveUpdate(live, idA, idB, scoreA)
        const ratings = { [idA]: { ...live[idA] }, [idB]: { ...live[idB] } }

        gamesPlayed++
        onProgress?.({ id: game.id, pairing: game.pairing, white: game.white, black: game.black, result, ratings, gamesPlayed, totalGames: schedule.length })
    }))

    const fit = refit ? computeRatings() : { ok: false, reason: 'Re-fit skipped' }
    if(fit.ok) saveRatings(fit)
    else if(refit) console.warn(`[tournament] Ratings not updated: ${fit.reason}`)

    return {
        standings: eloStore.getAllRatings(),
        gamesPlayed,
        ratingsUpdated: fit.ok,
        ratingsNote: fit.ok ? null : fit.reason
    }
}

module.exports = { runTournament, buildPairings, buildSchedule }
