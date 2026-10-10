const fs = require('fs')
const path = require('path')

const RATINGS_PATH = path.join(__dirname, '../../data/eloRatings.json')
const K_FACTOR = 32
const FLOOR = 100

const load = _ => {
    try {
        return JSON.parse(fs.readFileSync(RATINGS_PATH, 'utf8'))
    } catch(e){
        return {}
    }
}

const ratings = load()

const save = _ => {
    fs.mkdirSync(path.dirname(RATINGS_PATH), { recursive: true })
    fs.writeFileSync(RATINGS_PATH, JSON.stringify(ratings, null, 2))
}

const ensureBot = (id, startingElo) => {
    if(!ratings[id]){
        ratings[id] = { elo: startingElo ?? 1000, wins: 0, losses: 0, draws: 0, gamesPlayed: 0 }
    }
    return ratings[id]
}

const getElo = (id, fallbackElo) => {
    if(ratings[id]) return ratings[id].elo
    return fallbackElo ?? 1000
}

const getRecord = (id, fallbackElo) => {
    return { ...ensureBot(id, fallbackElo) }
}

const expectedScore = (ratingA, ratingB) => 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))

// result: 'A' (idA won), 'B' (idB won), or 'draw'
const recordResult = (idA, idB, result, fallbackEloA, fallbackEloB) => {
    const a = ensureBot(idA, fallbackEloA)
    const b = ensureBot(idB, fallbackEloB)

    const expectedA = expectedScore(a.elo, b.elo)
    const expectedB = 1 - expectedA

    const actualA = result == 'A' ? 1 : result == 'B' ? 0 : 0.5
    const actualB = 1 - actualA

    a.elo = Math.max(FLOOR, Math.round(a.elo + K_FACTOR * (actualA - expectedA)))
    b.elo = Math.max(FLOOR, Math.round(b.elo + K_FACTOR * (actualB - expectedB)))

    a.gamesPlayed++
    b.gamesPlayed++

    if(result == 'A'){ a.wins++; b.losses++ }
    else if(result == 'B'){ b.wins++; a.losses++ }
    else { a.draws++; b.draws++ }

    save()

    return { [idA]: { ...a }, [idB]: { ...b } }
}

const getAllRatings = _ => JSON.parse(JSON.stringify(ratings))

module.exports = { getElo, getRecord, recordResult, getAllRatings, ensureBot }
