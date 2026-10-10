const { playGame } = require('./selfPlay')
const eloStore = require('./eloStore')
const botManager = require('./botManager')

const yieldToEventLoop = _ => new Promise(resolve => setImmediate(resolve))

const buildPairings = botIds => {
    const pairings = []
    for(let i = 0; i < botIds.length; i++){
        for(let j = i + 1; j < botIds.length; j++){
            pairings.push([botIds[i], botIds[j]])
        }
    }
    return pairings
}

// Round-robin tournament: every pair of bots plays `gamesPerPairing` games (colors alternate),
// with Elo updated sequentially after each individual game.
const runTournament = async ({ botIds, gamesPerPairing = 2, maxPlies, noProgressLimit, onProgress }) => {
    const bots = {}
    for(const id of botIds){
        const play = botManager.getBotByName(id)
        if(!play) throw new Error(`Unknown bot id: ${id}`)
        bots[id] = play
    }

    const pairings = buildPairings(botIds)
    const totalGames = pairings.length * gamesPerPairing
    let gamesPlayed = 0

    for(const [idA, idB] of pairings){
        for(let g = 0; g < gamesPerPairing; g++){
            const aIsWhite = g % 2 == 0
            const whiteId = aIsWhite ? idA : idB
            const blackId = aIsWhite ? idB : idA

            const result = await playGame({
                playA: bots[whiteId],
                playB: bots[blackId],
                maxPlies,
                noProgressLimit
            })

            let eloResult
            if(result.result == 'draw') eloResult = 'draw'
            else if(result.result == 'white') eloResult = whiteId == idA ? 'A' : 'B'
            else eloResult = blackId == idA ? 'A' : 'B'

            const seedElo = id => botManager.getBotList().find(b => b.id == id)?.elo
            const ratings = eloStore.recordResult(idA, idB, eloResult, seedElo(idA), seedElo(idB))

            gamesPlayed++

            onProgress?.({
                pairing: [idA, idB],
                white: whiteId,
                black: blackId,
                result,
                ratings,
                gamesPlayed,
                totalGames
            })

            await yieldToEventLoop()
        }
    }

    return {
        standings: eloStore.getAllRatings(),
        gamesPlayed
    }
}

module.exports = { runTournament, buildPairings }
