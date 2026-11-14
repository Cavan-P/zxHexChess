// Player profiles and Elo ratings, persisted to a JSON file.
//
// There are no passwords: a profile is created with just a display name, and the browser keeps
// a random secret token that proves it owns that profile. Only a hash of the token is stored.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DEFAULT_PATH = path.join(__dirname, '../../data/players.json')

const STARTING_ELO = 800
const ELO_FLOOR = 100
const PROVISIONAL_GAMES = 20     // higher K while a rating is still settling
const K_PROVISIONAL = 40
const K_ESTABLISHED = 20
const HISTORY_LENGTH = 50

const { titleFor } = require('./titles')
const { BY_ID } = require('./achievements')

const NAME_PATTERN = /^[\p{L}\p{N} _.'-]{2,20}$/u

const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex')

const expectedScore = (rating, opponentRating) => 1 / (1 + Math.pow(10, (opponentRating - rating) / 400))

const kFactor = player => player.gamesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED

// New rating after scoring `score` (1 win, 0.5 draw, 0.75 Gliński stalemate win, ...) against `opponentRating`.
const nextRating = (player, opponentRating, score) =>
    Math.max(ELO_FLOOR, Math.round(player.elo + kFactor(player) * (score - expectedScore(player.elo, opponentRating))))

// A player's title: from their best established rating, kept even if they drop back down.
const titleOf = player => player.gamesPlayed >= PROVISIONAL_GAMES ? titleFor(Math.max(player.titlePeak || 0, player.elo)) : null

const cleanName = name => typeof name == 'string' ? name.trim().replace(/\s+/g, ' ') : ''

class PlayerStore {
    constructor(filePath = DEFAULT_PATH){
        this.filePath = filePath
        this.players = this.load()
    }

    load(){
        try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) }
        catch(e){ return {} }
    }

    save(){
        if(!this.filePath) return
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
        const tmp = this.filePath + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(this.players, null, 2))
        fs.renameSync(tmp, this.filePath)
    }

    // Returns an error message, or null if the name is usable by `exceptId`.
    validateName(name, exceptId = null){
        if(!NAME_PATTERN.test(name)) return 'Names must be 2-20 letters, numbers, spaces or _ . \' -'
        const lower = name.toLowerCase()
        const taken = Object.values(this.players).some(p => p.id != exceptId && p.name.toLowerCase() == lower)
        return taken ? 'That name is already taken' : null
    }

    register(rawName){
        const name = cleanName(rawName)
        const error = this.validateName(name)
        if(error) return { error }

        const id = crypto.randomUUID()
        const token = crypto.randomBytes(32).toString('hex')

        this.players[id] = {
            id,
            name,
            tokenHash: hashToken(token),
            elo: STARTING_ELO,
            peak: STARTING_ELO,
            wins: 0,
            losses: 0,
            draws: 0,
            gamesPlayed: 0,
            history: [{ t: Date.now(), elo: STARTING_ELO }],
            botsBeaten: {},
            achievements: {},
            createdAt: Date.now()
        }
        this.save()

        return { player: this.publicProfile(id), token }
    }

    authenticate(id, token){
        const player = typeof id == 'string' && this.players[id]
        if(!player || typeof token != 'string') return null

        const given = Buffer.from(hashToken(token), 'hex')
        const stored = Buffer.from(player.tokenHash, 'hex')
        return crypto.timingSafeEqual(given, stored) ? this.publicProfile(id) : null
    }

    rename(id, rawName){
        const player = this.players[id]
        if(!player) return { error: 'Unknown player' }

        const name = cleanName(rawName)
        const error = this.validateName(name, id)
        if(error) return { error }

        player.name = name
        this.save()
        return { player: this.publicProfile(id) }
    }

    // Wipes a player's rating, record, history and beaten bots, keeping their name and token.
    resetProgress(id){
        const player = this.players[id]
        if(!player) return { error: 'Unknown player' }
        Object.assign(player, {
            elo: STARTING_ELO, peak: STARTING_ELO, wins: 0, losses: 0, draws: 0, gamesPlayed: 0,
            history: [{ t: Date.now(), elo: STARTING_ELO }], botsBeaten: {}, achievements: {}, streak: 0
        })
        delete player.titlePeak
        this.save()
        return { player: this.publicProfile(id) }
    }

    get(id){
        return this.players[id] ? this.publicProfile(id) : null
    }

    publicProfile(id){
        const { tokenHash, ...profile } = this.players[id]
        return {
            ...profile,
            title: titleOf(profile),
            provisional: profile.gamesPlayed < PROVISIONAL_GAMES,
            history: [...profile.history],
            botsBeaten: { ...(profile.botsBeaten || {}) },
            achievements: { ...(profile.achievements || {}) }
        }
    }

    // The raw stored record (for achievement checks). Read-only, please.
    record(id){
        return this.players[id] || null
    }

    // Records achievements and returns the ids that are new for this player.
    awardAchievements(id, ids){
        const player = this.players[id]
        if(!player) return []
        player.achievements ||= {}
        const fresh = ids.filter(a => BY_ID[a] && !player.achievements[a])
        if(!fresh.length) return []
        const now = Date.now()
        fresh.forEach(a => player.achievements[a] = now)
        this.save()
        return fresh
    }

    applyResult(player, opponentRating, score){
        const before = player.elo
        player.elo = nextRating(player, opponentRating, score)
        player.peak = Math.max(player.peak, player.elo)
        player.gamesPlayed++
        // Titles go by the best rating reached once the rating is established.
        if(player.gamesPlayed >= PROVISIONAL_GAMES) player.titlePeak = Math.max(player.titlePeak || 0, player.elo)

        if(score > 0.5) player.wins++
        else if(score < 0.5) player.losses++
        else player.draws++
        player.streak = score > 0.5 ? (player.streak || 0) + 1 : 0

        player.history.push({ t: Date.now(), elo: player.elo })
        if(player.history.length > HISTORY_LENGTH) player.history.splice(0, player.history.length - HISTORY_LENGTH)

        return { before, after: player.elo, delta: player.elo - before }
    }

    // Two players, scoreA from A's point of view. Both ratings move.
    recordGame(idA, idB, scoreA){
        const a = this.players[idA]
        const b = this.players[idB]
        if(!a || !b || idA == idB) return null

        const ratingA = a.elo
        const ratingB = b.elo

        const result = {
            [idA]: this.applyResult(a, ratingB, scoreA),
            [idB]: this.applyResult(b, ratingA, 1 - scoreA)
        }
        this.save()
        return result
    }

    // A player against a bot with a fixed rating. Only the player's rating moves, so bots stay
    // stable reference points on the ladder. Wins are also remembered per bot.
    recordBotGame(id, botRating, score, botId = null){
        const player = this.players[id]
        if(!player) return null

        const change = this.applyResult(player, botRating, score)

        if(botId && score > 0.5){
            player.botsBeaten ||= {}
            const record = player.botsBeaten[botId] || { first: Date.now(), wins: 0 }
            record.wins++
            player.botsBeaten[botId] = record
        }
        this.save()
        return change
    }

    leaderboard(limit = 20){
        return Object.values(this.players)
            .filter(p => p.gamesPlayed > 0)
            .sort((a, b) => b.elo - a.elo || b.gamesPlayed - a.gamesPlayed)
            .slice(0, limit)
            .map(p => ({ id: p.id, name: p.name, elo: p.elo, gamesPlayed: p.gamesPlayed, provisional: p.gamesPlayed < PROVISIONAL_GAMES, title: titleOf(p) }))
    }
}

module.exports = { PlayerStore, expectedScore, STARTING_ELO, PROVISIONAL_GAMES }
