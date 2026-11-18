const eloStore = require('./eloStore')
const botManager = require('./botManager')
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

// Round-robin tournament. Games run in parallel on the training worker threads (so they don't block
// the server), and Elo is updated after each individual game as it finishes.
//
// Callbacks (all optional): onGameMove(id, { fen, from, to, ply }); onProgress({ id, pairing, white,
// black, result, ratings, gamesPlayed, totalGames }) after each game.
const runTournament = async ({ botIds, gamesPerPairing = 2, schedule = buildSchedule(botIds, gamesPerPairing), onGameMove, onProgress }) => {
    for(const id of botIds) if(!botManager.hasBot(id)) throw new Error(`Unknown bot id: ${id}`)

    const seedElo = id => botManager.getBotList().find(b => b.id == id)?.elo
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
        const eloResult = result.result == 'draw' ? 'draw' : (result.result == 'white' ? game.white : game.black) == idA ? 'A' : 'B'
        const ratings = eloStore.recordResult(idA, idB, eloResult, seedElo(idA), seedElo(idB))

        gamesPlayed++
        onProgress?.({ id: game.id, pairing: game.pairing, white: game.white, black: game.black, result, ratings, gamesPlayed, totalGames: schedule.length })
    }))

    return {
        standings: eloStore.getAllRatings(),
        gamesPlayed
    }
}

module.exports = { runTournament, buildPairings, buildSchedule }
