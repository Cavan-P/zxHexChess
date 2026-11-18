const { WebSocketServer } = require('ws')
const matchmaker = require('./rooms/matchmaker')
const Room = require('./rooms/room')
const { getBotList, hasBot } = require('./ai/botManager')
const { DEFINITIONS: ACHIEVEMENTS } = require('./players/achievements')
const { runTournament, buildSchedule } = require('./ai/tournament')
const { runEvolution, materializeGenome, readEvolvedBot, snapshotEvolvedBot } = require('./ai/evolve')
const { reloadBots } = require('./ai/botPool')
const { PlayerStore } = require('./players/playerStore')

const profiles = new PlayerStore(process.env.PLAYERS_FILE || undefined)
matchmaker.profiles = profiles

const MAX_REGISTRATIONS_PER_CONNECTION = 3

const LAB_ENABLED = process.env.ENABLE_BOT_LAB == '1'

// ------ Live lab view ------
// The current training run or tournament, kept on the server so the Lab view can be opened (or
// reloaded) at any point. Changes are batched and pushed to everyone watching a few times a second.
const lab = {
    mode: null,              // 'training' | 'tournament'
    names: {},               // tournament only: bot id -> { name, elo } at the start
    running: false,
    settings: null,
    generation: 0,
    generations: 0,
    games: new Map(),        // id -> { id, white, black, fen, from, to, ply, done, result }
    history: [],             // per-generation summaries
    lastBot: null,
    watchers: new Set(),
    dirty: new Set(),
    timer: null
}

const labSnapshot = _ => ({
    type: 'labState',
    mode: lab.mode,
    names: lab.names,
    running: lab.running,
    settings: lab.settings,
    generation: lab.generation,
    generations: lab.generations,
    games: [...lab.games.values()],
    history: lab.history,
    lastBot: lab.lastBot
})

const toWatchers = msg => {
    const json = JSON.stringify(msg)
    for(const s of lab.watchers) if(s.readyState == 1) s.send(json)
}

const flushLab = _ => {
    if(!lab.dirty.size) return
    toWatchers({ type: 'labUpdate', games: [...lab.dirty].map(id => lab.games.get(id)).filter(Boolean) })
    lab.dirty.clear()
}

let labJobRunning = false

// Lab-only bots (frozen training snapshots) are only listed, and only playable bot-vs-bot, when the
// lab is on; nobody can start a normal game against one.
const visibleBots = _ => LAB_ENABLED ? getBotList() : getBotList().filter(b => !b.labOnly)
const isLabOnly = id => Boolean(getBotList().find(b => b.id == id)?.labOnly)

const getBotMeta = id => {
    const meta = getBotList().find(b => b.id == id)
    return meta ? { id: meta.id, name: meta.name, elo: meta.elo, icon: meta.icon, title: meta.title } : null
}

const send = (socket, msg) => {
    if(socket.readyState == 1) socket.send(JSON.stringify(msg))
}

const joinRoom = (socket, room) => {
    if(socket.room && socket.room != room) socket.room.handleMessage(socket, { type: 'leaveRoom' })

    socket.room = room
    room.addClient(socket)
    send(socket, { type: 'roomJoined', code: room.id })
}

const runLabJob = (socket, job, label) => {
    if(!LAB_ENABLED) return send(socket, { type: 'error', message: 'Bot lab is disabled on this server' })
    if(labJobRunning) return send(socket, { type: 'error', message: 'Another tournament or training run is already in progress' })

    labJobRunning = true
    job()
        .catch(e => {
            console.error(`[websocket] ${label} error:`, e)
            send(socket, { type: 'error', message: `${label} failed: ${e.message}` })
        })
        .finally(_ => { labJobRunning = false })
}

const handlers = {
    // Restores a saved profile: { playerId, token } from the browser's storage.
    hello(socket, data){
        const player = profiles.authenticate(data.playerId, data.token)
        if(!player) return send(socket, { type: 'profileInvalid' })

        socket.profileId = player.id
        send(socket, { type: 'profile', player })
    },

    register(socket, data){
        if(socket.profileId) return send(socket, { type: 'profileError', message: 'You already have a profile' })

        socket.registrations = (socket.registrations || 0) + 1
        if(socket.registrations > MAX_REGISTRATIONS_PER_CONNECTION){
            return send(socket, { type: 'profileError', message: 'Too many attempts. Refresh and try again.' })
        }

        const res = profiles.register(data.name)
        if(res.error) return send(socket, { type: 'profileError', message: res.error })

        socket.profileId = res.player.id
        send(socket, { type: 'registered', player: res.player, token: res.token })
    },

    rename(socket, data){
        if(!socket.profileId) return send(socket, { type: 'profileError', message: 'Create a profile first' })

        const res = profiles.rename(socket.profileId, data.name)
        if(res.error) return send(socket, { type: 'profileError', message: res.error })

        send(socket, { type: 'profile', player: res.player })
    },

    resetProfile(socket){
        if(!socket.profileId) return send(socket, { type: 'profileError', message: 'Create a profile first' })
        const res = profiles.resetProgress(socket.profileId)
        if(res.error) return send(socket, { type: 'profileError', message: res.error })
        send(socket, { type: 'profile', player: res.player })
        send(socket, { type: 'leaderboard', players: profiles.leaderboard(25) })
    },

    getAchievementDefs(socket){
        send(socket, { type: 'achievementDefs', defs: ACHIEVEMENTS })
    },

    getLeaderboard(socket){
        send(socket, { type: 'leaderboard', players: profiles.leaderboard(25) })
    },

    getBotList(socket){
        send(socket, { type: 'botList', bots: visibleBots(), labEnabled: LAB_ENABLED })
    },

    startBotGame(socket, data){
        if(!hasBot(data.botId) || isLabOnly(data.botId)) return send(socket, { type: 'error', message: 'Bot not found' })

        const playerColor = data.playerColor == 'black' ? 'black' : 'white'
        const botColor = playerColor == 'white' ? 'black' : 'white'

        const timeControl = Object.prototype.hasOwnProperty.call(Room.TIME_CONTROLS, data.timeControl) ? data.timeControl : null
        const room = matchmaker.createRoom({
            bots: { [botColor]: data.botId },
            botMeta: { [botColor]: getBotMeta(data.botId) },
            timeControl
        })

        joinRoom(socket, room)
    },

    startBotVsBot(socket, data){
        if(!hasBot(data.botA) || !hasBot(data.botB)) return send(socket, { type: 'error', message: 'Bot not found' })
        if(!LAB_ENABLED && (isLabOnly(data.botA) || isLabOnly(data.botB))) return send(socket, { type: 'error', message: 'Bot not found' })

        const timeControl = Object.prototype.hasOwnProperty.call(Room.TIME_CONTROLS, data.timeControl) ? data.timeControl : null
        const room = matchmaker.createRoom({
            bots: { white: data.botA, black: data.botB },
            botMeta: { white: getBotMeta(data.botA), black: getBotMeta(data.botB) },
            timeControl
        })

        send(socket, { type: 'roomCreated', code: room.id })
        joinRoom(socket, room)
    },

    createRoom(socket, data){
        const timeControl = Object.prototype.hasOwnProperty.call(Room.TIME_CONTROLS, data.timeControl) ? data.timeControl : null
        const room = matchmaker.createRoom({ timeControl, isPublic: data.isPublic === true })
        send(socket, { type: 'roomCreated', code: room.id })
        joinRoom(socket, room)
    },

    getLobby(socket){
        send(socket, { type: 'lobby', games: matchmaker.openGames() })
    },

    joinRoom(socket, data){
        const room = matchmaker.getRoom(data.code)
        if(!room) return send(socket, { type: 'error', message: 'Room not found' })
        joinRoom(socket, room)
    },

    startTournament(socket, data){
        const botIds = Array.isArray(data.botIds) ? data.botIds.filter(hasBot) : []
        if(botIds.length < 2) return send(socket, { type: 'error', message: 'Pick at least 2 bots for a tournament' })

        const gamesPerPairing = Math.min(10, Math.max(1, +data.gamesPerPairing || 2))

        runLabJob(socket, async _ => {
            const schedule = buildSchedule(botIds, gamesPerPairing)
            const bots = getBotList()
            const names = Object.fromEntries(botIds.map(id => { const b = bots.find(b => b.id == id); return [id, { name: b?.name || id, elo: b?.elo }] }))

            // Each finished game goes into `history`, the tournament's equivalent of a generation summary.
            Object.assign(lab, { mode: 'tournament', names, running: true, settings: { botCount: botIds.length, gamesPerPairing }, generation: 0, generations: 0, history: [], lastBot: null })
            lab.games.clear()
            for(const g of schedule) lab.games.set(g.id, { id: g.id, white: g.white, black: g.black, fen: null, ply: 0, done: false, result: null })
            lab.timer = setInterval(flushLab, 200)
            toWatchers(labSnapshot())

            try {
                const summary = await runTournament({
                    botIds, schedule,
                    onGameMove: (id, m) => {
                        const g = lab.games.get(id)
                        if(!g) return
                        Object.assign(g, { fen: m.fen, from: m.from, to: m.to, ply: m.ply })
                        lab.dirty.add(id)
                    },
                    onProgress: progress => {
                        const g = lab.games.get(progress.id)
                        if(g){
                            // Shape the result like a training game's ({ winner, reason }) for the live view.
                            Object.assign(g, { done: true, result: { winner: progress.result.result == 'draw' ? null : progress.result.result, reason: progress.result.reason } })
                            lab.dirty.add(progress.id)
                        }
                        flushLab()
                        const summary = { id: progress.id, white: progress.white, black: progress.black, result: progress.result, ratings: progress.ratings, gamesPlayed: progress.gamesPlayed, totalGames: progress.totalGames }
                        lab.history.push(summary)
                        toWatchers({ type: 'labProgress', ...summary })
                        send(socket, { type: 'tournamentProgress', ...progress })
                    }
                })
                send(socket, { type: 'tournamentComplete', ...summary })
            }
            finally {
                clearInterval(lab.timer)
                flushLab()
                lab.running = false
                toWatchers(labSnapshot())
            }
        }, 'Tournament')
    },

    // Freezes an evolved bot as a lab-only snapshot (e.g. "Ada Kessler v2") to measure later versions against.
    freezeBot(socket, data){
        if(!LAB_ENABLED) return send(socket, { type: 'error', message: 'Bot lab is disabled on this server' })
        if(labJobRunning) return send(socket, { type: 'error', message: 'Wait for the current tournament or training run to finish' })
        try {
            const snap = snapshotEvolvedBot(data.botId)
            reloadBots()
            send(socket, { type: 'botFrozen', bot: snap })
            send(socket, { type: 'botList', bots: visibleBots(), labEnabled: LAB_ENABLED })
        }
        catch(e){
            send(socket, { type: 'error', message: e.message })
        }
    },

    watchLab(socket){
        if(!LAB_ENABLED) return send(socket, { type: 'error', message: 'Bot lab is disabled on this server' })
        lab.watchers.add(socket)
        send(socket, labSnapshot())
    },

    unwatchLab(socket){
        lab.watchers.delete(socket)
    },

    startTraining(socket, data){
        const generations = Math.min(100, Math.max(1, +data.generations || 6))
        const populationSize = Math.min(32, Math.max(4, +data.populationSize || 8))
        const gamesPerMatch = Math.min(4, Math.max(1, +data.gamesPerMatch || 2))
        // How the training games themselves are played (shallow and fast; see evolve.js).
        const trainDepth = Math.min(6, Math.max(1, Math.round(+data.trainDepth || 3)))
        const trainMs = Math.round(Math.min(5, Math.max(0.05, +data.trainSeconds || 0.25)) * 1000)
        const paceMs = data.watchable ? 250 : 0
        // How the finished bot will play: any depth up to 12, and up to 60 seconds per move.
        const playDepth = Math.min(12, Math.max(1, Math.round(+data.playDepth || 6)))
        const playMs = Math.round(Math.min(60, Math.max(0.5, +data.playSeconds || 5)) * 1000)
        // Optionally carry on evolving an existing trained bot instead of starting from the defaults.
        const continueFrom = data.continueFrom ? readEvolvedBot(data.continueFrom) : null
        if(data.continueFrom && !continueFrom) return send(socket, { type: 'error', message: 'Only bots made by training can be trained further' })
        if(continueFrom?.labOnly) return send(socket, { type: 'error', message: 'Snapshots stay frozen - train the original bot instead' })

        runLabJob(socket, async _ => {
            Object.assign(lab, { mode: 'training', names: {}, running: true, settings: { generations, populationSize, gamesPerMatch, trainDepth, trainMs, watchable: Boolean(data.watchable), continuing: continueFrom?.name || null, playoff: false }, generation: 0, generations, history: [], lastBot: null })
            lab.games.clear()
            lab.timer = setInterval(flushLab, 200)
            toWatchers(labSnapshot())

            try {
                const best = await runEvolution({
                    generations, populationSize, gamesPerMatch, paceMs, trainDepth, trainMs,
                    baseGenome: continueFrom?.genome,
                    onGeneration: ({ generation, games, playoff }) => {
                        lab.generation = generation
                        lab.settings.playoff = playoff
                        lab.games.clear()
                        for(const g of games) lab.games.set(g.id, { ...g, fen: null, ply: 0, done: false, result: null })
                        lab.dirty.clear()
                        toWatchers(labSnapshot())
                    },
                    onGameMove: (id, m) => {
                        const g = lab.games.get(id)
                        if(!g) return
                        Object.assign(g, { fen: m.fen, from: m.from, to: m.to, ply: m.ply })
                        lab.dirty.add(id)
                    },
                    onGameEnd: (id, { result }) => {
                        const g = lab.games.get(id)
                        if(!g) return
                        Object.assign(g, { done: true, result })
                        lab.dirty.add(id)
                    },
                    onProgress: progress => {
                        flushLab()
                        lab.history.push(progress)
                        toWatchers({ type: 'labProgress', ...progress })
                        send(socket, { type: 'trainingProgress', ...progress })
                    }
                })
                const created = materializeGenome(best.genome, { generations, populationSize, playDepth, playMs, continueFrom })
                if(created.updated) reloadBots()
                lab.lastBot = { ...created, fitness: best.fitness }
                send(socket, { type: 'trainingComplete', bot: created, fitness: best.fitness, bots: visibleBots() })
            }
            finally {
                clearInterval(lab.timer)
                flushLab()
                lab.running = false
                toWatchers(labSnapshot())
            }
        }, 'Training')
    }
}

module.exports = function attachWebSocket(server){
    const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 })

    // Everyone on the home page sees open games appear and disappear live.
    matchmaker.onLobbyChange = games => {
        const msg = JSON.stringify({ type: 'lobby', games })
        for(const client of wss.clients) if(client.readyState == 1) client.send(msg)
    }

    wss.on('connection', socket => {
        socket.room = null

        socket.on('error', e => console.error('Websocket error:', e.message))

        socket.on('message', msg => {
            let data
            try { data = JSON.parse(msg) }
            catch(e){ return }

            if(!data || typeof data.type != 'string') return
            
            try {
                if(Object.prototype.hasOwnProperty.call(handlers, data.type)) handlers[data.type](socket, data)
                else socket.room?.handleMessage(socket, data)
            }
            catch(e){
                console.error(`[websocket] Error handling "${data.type}":`, e)
                send(socket, { type: 'error', message: 'Something went wrong handling that request' })
            }
        })

        socket.on('close', _ => {
            lab.watchers.delete(socket)
            socket.room?.removeClient(socket)
            socket.room = null
        })
    })

    return wss
}
