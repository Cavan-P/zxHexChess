const fs = require('fs')
const path = require('path')

// Bot ratings, as last fitted from the game log by botRatings.js. This file is only the output: the
// source of truth is data/botGames.jsonl, and ratings are never updated game by game any more.
const RATINGS_PATH = path.join(__dirname, '../../data/eloRatings.json')

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
    fs.writeFileSync(RATINGS_PATH, JSON.stringify(ratings, null, 2) + '\n')
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

// Replaces the listed bots' entries (others are left alone) and saves.
const setRatings = updates => {
    for(const [id, entry] of Object.entries(updates)) ratings[id] = { ...entry }
    save()
}

const getAllRatings = _ => JSON.parse(JSON.stringify(ratings))

module.exports = { getElo, getRecord, setRatings, getAllRatings, ensureBot }
