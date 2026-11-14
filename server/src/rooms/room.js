const { GameState } = require('../game/rules')
const { requestBotMove } = require('../ai/botPool')
const { Chatter } = require('../ai/chat/chatter')
const { getBotList } = require('../ai/botManager')
const { checkGame, BY_ID } = require('../players/achievements')

const BOT_MOVE_DELAY_MS = 400
const BOT_ANNOUNCE_PAUSE_MS = 900
const RECONNECT_GRACE_MS = 60000
const MAX_CHAT_LENGTH = 300
const MIN_RATED_PLIES = 2      // both sides must move at least once for a game to be rated

// Time controls players can pick: "minutes per side + seconds added per move".
// Keep in step with the list in client/js/roomMenu.js.
const TIME_CONTROLS = Object.fromEntries([
    '1+0', '2+1',                        // bullet
    '3+0', '3+2', '5+0', '5+3',          // blitz
    '10+0', '10+5', '15+0', '15+10',     // rapid
    '30+0', '30+20'                      // classical
].map(name => {
    const [minutes, seconds] = name.split('+').map(Number)
    return [name, { initialMs: minutes * 60000, incrementMs: seconds * 1000 }]
}))

class Room {
    // bots: { white?: botId, black?: botId }   botMeta: { white?: {id,name,elo}, black?: {id,name,elo} }
    // profiles: the PlayerStore used to look up and rate signed-in players (optional)
    // timeControl: a key of TIME_CONTROLS, or null for an untimed game
    // spawn: creates a new room with the given options (used for rematches)
    // isPublic: listed under "Open games" for anyone to join; onChange: called when seats change
    constructor(id, { bots = {}, botMeta = {}, profiles = null, timeControl = null, isPublic = false, onEmpty, onChange = null, spawn = null } = {}){
        this.id = id
        this.players = []
        this.spectators = []
        this.game = new GameState()

        this.bots = bots
        this.botMeta = botMeta
        this.onEmpty = onEmpty
        this.profiles = profiles

        // Clocks live on the server. The side to move's clock runs from `runningSince`; nobody's
        // clock runs before White's first move.
        const tc = TIME_CONTROLS[timeControl]
        this.clock = tc ? {
            name: timeControl,
            ...tc,
            remaining: { white: tc.initialMs, black: tc.initialMs },
            running: null,
            runningSince: 0,
            timer: null
        } : null

        // Which profile sits in each human seat. If a different profile takes over a seat mid-game
        // (e.g. a stranger fills a disconnected player's spot), the game becomes unrated.
        this.seatProfiles = { white: null, black: null }
        this.unrated = false

        this.spawn = spawn
        this.isPublic = isPublic
        this.onChange = onChange
        this.createdAt = Date.now()
        this.timeControl = timeControl
        this.rematchOffers = new Set()       // colours that have asked for a rematch
        this.rated = false

        // Each bot gets a voice. Messages go out as ordinary chat, flagged as coming from a bot.
        this.chatters = {}
        for(const color of ['white', 'black']){
            if(!bots[color]) continue
            const opponent = color == 'white' ? 'black' : 'white'
            this.chatters[color] = new Chatter({
                botId: bots[color],
                color,
                opponentIsBot: Boolean(bots[opponent]),
                getGame: _ => this.game,
                getOpponentName: _ => this.botMeta[opponent]?.name?.split(' ')[0]
                    || (this.seatProfiles[opponent] && this.profiles?.get(this.seatProfiles[opponent])?.name),
                say: text => this.broadcast({ type: 'chat', username: this.botMeta[color]?.name || 'Bot', payload: text, bot: true, color })
            })
        }

        this.botThinking = false
        this.drawOffer = null          // color that offered a draw
        this.disconnectTimer = null
        this.destroyed = false
    }

    get isBotGame(){
        return Boolean(this.bots.white || this.bots.black)
    }

    get isBotVsBot(){
        return Boolean(this.bots.white && this.bots.black)
    }

    send(socket, msg){
        if(socket.readyState == 1) socket.send(JSON.stringify(msg))
    }

    broadcast(msg){
        const json = JSON.stringify(msg)
        for(const client of [...this.players, ...this.spectators]){
            if(client.readyState == 1) client.send(json)
        }
    }

    addClient(socket){
        if(this.destroyed) return false

        const humanColors = ['white', 'black'].filter(c => !this.bots[c])
        const taken = this.players.map(p => p.color)
        const free = humanColors.filter(c => !taken.includes(c))

        if(free.length){
            socket.color = free[0]
            this.players.push(socket)
            this.claimSeat(socket)
        }
        else {
            socket.color = 'spectator'
            this.spectators.push(socket)
        }

        // A player came back (or someone took the empty seat) before the abandonment timer ran out.
        if(this.disconnectTimer && this.players.length == humanColors.length){
            clearTimeout(this.disconnectTimer)
            this.disconnectTimer = null
            this.broadcast({ type: 'opponentReconnected' })
        }

        this.send(socket, { type: 'assignColor', color: socket.color })
        this.send(socket, {
            type: 'init',
            fen: this.game.fen,
            turn: this.game.turn,
            history: this.game.history.map(m => m.notation),
            // Every position and move so far, so a player can step back through the game.
            positions: this.game.positions,
            plyMoves: this.game.history.map(m => ({ from: m.from, to: m.to, check: m.check })),
            lastMove: this.game.history.at(-1) || null,
            result: this.game.result,
            legal: this.game.allLegalMoves(),
            clock: this.clockState(),
            isPublic: this.isPublic
        })
        this.broadcastPresence()

        // Bots say hello once someone is there to hear it: the human opponent, or the first viewer of a bot battle.
        if(socket.color != 'spectator' || this.isBotVsBot){
            for(const chatter of Object.values(this.chatters)) chatter.onStart()
        }

        this.scheduleBotMove()
        return true
    }

    claimSeat(socket){
        const profileId = socket.profileId || null
        const current = this.seatProfiles[socket.color]

        if(current && current != profileId) this.unrated = true
        if(!current) this.seatProfiles[socket.color] = profileId
    }

    getMatchInfo(){
        const colorInfo = color => {
            const meta = this.botMeta[color]
            if(meta) return { type: 'bot', id: meta.id, name: meta.name, elo: meta.elo, icon: meta.icon, title: meta.title }

            const profile = this.seatProfiles[color] && this.profiles?.get(this.seatProfiles[color])
            return profile
                ? { type: 'human', name: profile.name, elo: profile.elo, provisional: profile.provisional, title: profile.title }
                : { type: 'human' }
        }

        return { white: colorInfo('white'), black: colorInfo('black') }
    }

    // Which seats are filled (bots always are), so clients can show "waiting for opponent",
    // plus fresh names and ratings for everyone.
    broadcastPresence(){
        this.onChange?.()
        const seated = color => Boolean(this.bots[color]) || this.players.some(p => p.color == color)
        this.broadcast({ type: 'matchInfo', ...this.getMatchInfo() })
        this.broadcast({ type: 'presence', white: seated('white'), black: seated('black') })
    }

    // Applies Elo changes for a finished game. Returns { white, black } rating changes (null for
    // bots and unrated sides), or null if the game wasn't rated at all.
    rateGame(result){
        if(this.rated || !this.profiles || this.unrated || this.isBotVsBot) return null
        if(this.game.history.length < MIN_RATED_PLIES) return null

        const scoreFor = color => {
            if(!result.winner) return 0.5
            const won = result.winner == color
            if(result.reason == 'stalemate') return won ? 0.75 : 0.25
            return won ? 1 : 0
        }

        const white = this.seatProfiles.white
        const black = this.seatProfiles.black
        let changes = null
        const titlesBefore = {}
        for(const id of [white, black]) if(id) titlesBefore[id] = this.profiles.get(id)?.title || null

        if(this.isBotGame){
            const humanColor = this.bots.white ? 'black' : 'white'
            const botColor = humanColor == 'white' ? 'black' : 'white'
            const profileId = this.seatProfiles[humanColor]
            const botRating = this.botMeta[botColor]?.elo
            if(!profileId || botRating == null) return null

            const change = this.profiles.recordBotGame(profileId, botRating, scoreFor(humanColor), this.bots[botColor])
            if(change) changes = { [humanColor]: change, [botColor]: null }
        }
        else if(white && black && white != black){
            const res = this.profiles.recordGame(white, black, scoreFor('white'))
            if(res) changes = { white: res[white], black: res[black] }
        }

        if(!changes) return null
        this.rated = true

        const newAchievements = this.awardAchievements(result, changes)

        // Push updated profiles to whoever is still connected, announcing any newly earned title.
        for(const socket of this.players){
            const profile = socket.profileId && this.profiles.get(socket.profileId)
            if(!profile) continue
            this.send(socket, { type: 'profile', player: profile })
            const before = titlesBefore[socket.profileId]
            if(profile.title && profile.title.code != before?.code) this.send(socket, { type: 'titleEarned', title: profile.title })
            const earned = newAchievements[socket.profileId]
            if(earned?.length) this.send(socket, { type: 'achievements', earned: earned.map(id => BY_ID[id]) })
        }

        return changes
    }

    // Checks each rated player's achievements after a game. Returns { profileId: [new ids] }.
    awardAchievements(result, changes){
        const awarded = {}
        try {
            const bots = getBotList()
            for(const color of ['white', 'black']){
                const profileId = this.seatProfiles[color]
                const change = changes[color]
                if(!profileId || !change || this.bots[color]) continue

                const opp = color == 'white' ? 'black' : 'white'
                const isBot = Boolean(this.bots[opp])
                const opponentRating = isBot ? this.botMeta[opp]?.elo : changes[opp]?.before

                const ids = checkGame({
                    color, game: this.game, result,
                    player: this.profiles.record(profileId),
                    opponent: { isBot, rating: opponentRating },
                    ratingBefore: change.before,
                    clockMs: this.clock ? this.clockState().remaining[color] : null,
                    bots
                })
                awarded[profileId] = this.profiles.awardAchievements(profileId, ids)
            }
        }
        catch(e){ console.error(`[room ${this.id}] Achievement check failed:`, e) }
        return awarded
    }

    removeClient(socket){
        const wasPlayer = this.players.includes(socket)

        this.players = this.players.filter(p => p != socket)
        this.spectators = this.spectators.filter(s => s != socket)

        const nobodyLeft = !this.players.length && !this.spectators.length
        const noHumansLeft = this.isBotGame && !this.isBotVsBot && !this.players.length

        // Walking away from a bot game in progress counts as a loss, so it can't be dodged.
        if(noHumansLeft && wasPlayer && !this.game.result && this.game.history.length >= MIN_RATED_PLIES){
            this.endGame(this.game.abandon(socket.color))
        }

        // Bot games have no one to wait for, and an empty room is just garbage.
        if(nobodyLeft || noHumansLeft) return this.destroy()

        this.broadcastPresence()

        if(wasPlayer && !this.game.result && this.game.history.length){
            this.broadcast({ type: 'opponentDisconnected', graceSeconds: RECONNECT_GRACE_MS / 1000 })

            clearTimeout(this.disconnectTimer)
            this.disconnectTimer = setTimeout(_ => {
                this.disconnectTimer = null
                this.endGame(this.game.abandon(socket.color))
            }, RECONNECT_GRACE_MS)
        }
    }

    // ------ Clock ------

    // Remaining time for both sides as of now, plus who is running.
    clockState(){
        const c = this.clock
        if(!c) return null
        const remaining = { ...c.remaining }
        if(c.running) remaining[c.running] = Math.max(0, remaining[c.running] - (Date.now() - c.runningSince))
        return { name: c.name, initialMs: c.initialMs, incrementMs: c.incrementMs, remaining, running: c.running }
    }

    startClock(color){
        const c = this.clock
        if(!c || this.game.result) return
        c.running = color
        c.runningSince = Date.now()
        clearTimeout(c.timer)
        c.timer = setTimeout(_ => this.flag(color), c.remaining[color] + 50)
    }

    // Stops the running clock, charging the elapsed time. Returns false if that side had run out.
    stopClock(){
        const c = this.clock
        if(!c?.running) return true
        clearTimeout(c.timer)
        const color = c.running
        c.remaining[color] = Math.max(0, c.remaining[color] - (Date.now() - c.runningSince))
        c.running = null
        return c.remaining[color] > 0
    }

    flag(color){
        if(this.game.result || this.destroyed) return
        this.stopClock()
        this.clock.remaining[color] = 0
        this.endGame(this.game.timeout(color))
    }

    destroy(){
        if(this.destroyed) return
        this.destroyed = true
        clearTimeout(this.disconnectTimer)
        if(this.clock) clearTimeout(this.clock.timer)
        for(const chatter of Object.values(this.chatters)) chatter.stop()
        this.onEmpty?.(this)
    }

    endGame(result){
        if(!result) return
        this.stopClock()
        this.drawOffer = null
        clearTimeout(this.disconnectTimer)
        this.disconnectTimer = null

        let ratings = null
        try { ratings = this.rateGame(result) }
        catch(e){ console.error(`[room ${this.id}] Rating update failed:`, e) }

        this.broadcast({ type: 'gameOver', result, ratings, clock: this.clockState() })

        for(const chatter of Object.values(this.chatters)) chatter.onGameOver(result)
    }

    isPlayer(socket){
        return this.players.includes(socket) && (socket.color == 'white' || socket.color == 'black')
    }

    handleMessage(socket, data){
        switch(data.type){
            case 'chat': return this.handleChat(socket, data)
            case 'requestLegalMoves': return this.handleLegalMoves(socket, data)
            case 'attemptMove':
            case 'promotionChoice': return this.handleMove(socket, data)
            case 'resign': return this.handleResign(socket)
            case 'offerDraw': return this.handleOfferDraw(socket)
            case 'acceptDraw': return this.handleAcceptDraw(socket)
            case 'declineDraw': return this.handleDeclineDraw(socket)
            case 'leaveRoom': return this.handleLeave(socket)
            case 'rematch': return this.handleRematch(socket)
        }
    }

    handleChat(socket, data){
        if(typeof data.payload != 'string') return
        const text = data.payload.trim().slice(0, MAX_CHAT_LENGTH)
        if(!text) return

        const seatName = socket.color == 'spectator' ? 'Spectator' : socket.color == 'white' ? 'White' : 'Black'
        const name = (socket.profileId && this.profiles?.get(socket.profileId)?.name) || seatName
        for(const client of [...this.players, ...this.spectators]){
            if(client != socket) this.send(client, { type: 'chat', username: name, payload: text })
        }

        // A bot answers its opponent (spectators chatting in a bot battle get answers too).
        for(const [color, chatter] of Object.entries(this.chatters)){
            if(socket.color != color) chatter.onOpponentChat(text)
        }
    }

    handleLegalMoves(socket, data){
        const moves = this.isPlayer(socket) ? this.game.legalMovesFrom(socket.color, data.from) : []
        this.send(socket, { type: 'legalMoves', from: data.from, moves })
    }

    handleMove(socket, data){
        if(!this.isPlayer(socket)){
            return this.send(socket, { type: 'illegalMove', reason: 'Spectators cannot make moves' })
        }

        const fenBefore = this.game.fen
        const res = this.game.play(socket.color, data.from, data.to, data.promotion)

        if(!res.ok){
            if(res.needsPromotion) return this.send(socket, { type: 'promotionRequired', from: +data.from, to: +data.to })
            return this.send(socket, { type: 'illegalMove', reason: res.reason })
        }

        this.afterMove(res.move, fenBefore, socket.color)
    }

    afterMove(move, fenBefore, mover){
        this.drawOffer = null

        // Charge the mover's thinking time, add the increment, and start the opponent's clock.
        if(this.clock){
            const wasRunning = this.clock.running == mover
            if(!this.stopClock()) return this.flag(mover)
            if(wasRunning) this.clock.remaining[mover] += this.clock.incrementMs
            this.startClock(this.game.turn)
        }

        this.broadcast({
            type: 'move',
            ...move,
            fen: this.game.fen,
            turn: this.game.turn,
            result: this.game.result,
            // Sent with every move so the next player's highlights appear instantly on pickup.
            legal: this.game.allLegalMoves(),
            clock: this.clockState()
        })

        if(this.game.result) return this.endGame(this.game.result)

        for(const chatter of Object.values(this.chatters)){
            try { chatter.onMove({ move, mover, fenBefore, game: this.game }) }
            catch(e){ console.error(`[room ${this.id}] Bot chat error:`, e) }
        }

        this.scheduleBotMove()
    }

    scheduleBotMove(){
        const color = this.game.turn
        const botId = this.bots[color]

        if(!botId || this.botThinking || this.game.result || this.destroyed) return

        this.botThinking = true
        const ply = this.game.history.length

        // On a clock, a bot budgets its time like a person: roughly a 30th of what's left plus most
        // of the increment, so a slow Master speeds up instead of losing on time.
        const budget = this.botTimeBudget(color)
        const hurried = budget != null && budget < 2000

        setTimeout(async _ => {
            let move = null
            try {
                move = await requestBotMove(botId, { fen: this.game.fen, turn: color, enPassant: this.game.enPassant, seen: this.game.seenPositions(), recentOwnMoves: this.game.recentMovesBy(color), timeBudgetMs: budget })
            }
            catch(e){
                console.error(`[room ${this.id}] Bot ${botId} failed:`, e.message)
            }

            this.botThinking = false

            // The room may have closed or the game ended while the bot was thinking.
            if(this.destroyed || this.game.result || this.game.history.length != ply) return

            const play = _ => {
                if(this.destroyed || this.game.result || this.game.history.length != ply) return

                // Bots that always promote to a queen can omit the piece.
                const fenBefore = this.game.fen
                const res = move ? this.game.play(color, move.from, move.to, move.promotion || 'q') : { ok: false }

                if(!res.ok){
                    console.error(`[room ${this.id}] Bot ${botId} produced no legal move; it resigns.`)
                    return this.endGame(this.game.resign(color))
                }

                this.afterMove(res.move, fenBefore, color)
            }

            // "Free bishop!" ...then take it, a beat later.
            const announced = move && this.chatters[color]?.beforeOwnMove(move)
            if(announced) setTimeout(play, hurried ? 150 : BOT_ANNOUNCE_PAUSE_MS)
            else play()
        }, hurried ? 50 : BOT_MOVE_DELAY_MS)
    }

    // How long a bot may think this move, or null if it isn't on a clock.
    botTimeBudget(color){
        const clock = this.clockState()
        if(!clock) return null
        const remaining = clock.remaining[color]
        return Math.max(150, Math.min(remaining / 30 + clock.incrementMs * 0.7, remaining / 3))
    }

    handleResign(socket){
        if(!this.isPlayer(socket)) return
        this.endGame(this.game.resign(socket.color))
    }

    handleOfferDraw(socket){
        if(!this.isPlayer(socket) || this.isBotGame || this.game.result || this.drawOffer) return
        this.drawOffer = socket.color
        this.broadcast({ type: 'drawOffered', by: socket.color })
    }

    handleAcceptDraw(socket){
        if(!this.isPlayer(socket) || !this.drawOffer || this.drawOffer == socket.color) return
        this.endGame(this.game.agreeDraw())
    }

    handleDeclineDraw(socket){
        if(!this.isPlayer(socket) || !this.drawOffer || this.drawOffer == socket.color) return
        this.drawOffer = null
        this.broadcast({ type: 'drawDeclined', by: socket.color })
    }

    // ------ Rematch ------

    // Moves a client into another room, as if they'd joined it themselves.
    moveClient(socket, room){
        this.players = this.players.filter(p => p != socket)
        this.spectators = this.spectators.filter(s => s != socket)
        socket.room = room
        room.addClient(socket)
        this.send(socket, { type: 'roomJoined', code: room.id, rematch: true })
    }

    // Same opponent(s), colours swapped, same clock. Against a bot (or watching two bots) it starts
    // straight away; between two people both have to ask.
    handleRematch(socket){
        if(!this.game.result || !this.spawn || this.destroyed) return
        const swap = c => c == 'white' ? 'black' : 'white'

        if(this.isBotVsBot){
            const room = this.spawn({
                bots: { white: this.bots.black, black: this.bots.white },
                botMeta: { white: this.botMeta.black, black: this.botMeta.white },
                timeControl: this.timeControl
            })
            for(const s of [...this.spectators]) this.moveClient(s, room)
            return this.destroy()
        }

        if(!this.isPlayer(socket)) return

        if(this.isBotGame){
            const botColor = swap(socket.color)
            const room = this.spawn({
                bots: { [socket.color]: this.bots[botColor] },
                botMeta: { [socket.color]: this.botMeta[botColor] },
                timeControl: this.timeControl
            })
            this.moveClient(socket, room)
            if(!this.players.length) this.destroy()
            return
        }

        if(this.players.length < 2) return this.send(socket, { type: 'rematchUnavailable' })

        this.rematchOffers.add(socket.color)
        if(this.rematchOffers.size < 2) return this.broadcast({ type: 'rematchOffered', by: socket.color })

        // Both agreed. Seat last game's Black first so they get White this time.
        const room = this.spawn({ timeControl: this.timeControl })
        const order = [...this.players].sort((a, b) => (a.color == 'black' ? -1 : 1) - (b.color == 'black' ? -1 : 1))
        for(const s of order) this.moveClient(s, room)
        if(!this.players.length && !this.spectators.length) this.destroy()
    }

    // Leaving mid-game is a resignation; leaving after it ends is just leaving.
    handleLeave(socket){
        if(this.isPlayer(socket) && !this.game.result && this.game.history.length && !this.isBotVsBot){
            this.endGame(this.game.resign(socket.color))
        }

        this.players = this.players.filter(p => p != socket)
        this.spectators = this.spectators.filter(s => s != socket)
        socket.room = null

        if(!this.players.length && !this.spectators.length) return this.destroy()
        if(this.isBotGame && !this.isBotVsBot && !this.players.length) return this.destroy()

        this.broadcastPresence()
    }
}

module.exports = Room
module.exports.TIME_CONTROLS = TIME_CONTROLS
