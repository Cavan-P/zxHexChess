const { GameState } = require('../game/rules')
const { requestBotMove } = require('../ai/botPool')
const { Chatter } = require('../ai/chat/chatter')

const BOT_MOVE_DELAY_MS = 400
const BOT_ANNOUNCE_PAUSE_MS = 900
const RECONNECT_GRACE_MS = 60000
const MAX_CHAT_LENGTH = 300
const MIN_RATED_PLIES = 2      // both sides must move at least once for a game to be rated

class Room {
    // bots: { white?: botId, black?: botId }   botMeta: { white?: {id,name,elo}, black?: {id,name,elo} }
    // profiles: the PlayerStore used to look up and rate signed-in players (optional)
    constructor(id, { bots = {}, botMeta = {}, profiles = null, onEmpty } = {}){
        this.id = id
        this.players = []
        this.spectators = []
        this.game = new GameState()

        this.bots = bots
        this.botMeta = botMeta
        this.onEmpty = onEmpty
        this.profiles = profiles

        // Which profile sits in each human seat. If a different profile takes over a seat mid-game
        // (e.g. a stranger fills a disconnected player's spot), the game becomes unrated.
        this.seatProfiles = { white: null, black: null }
        this.unrated = false
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
            lastMove: this.game.history.at(-1) || null,
            result: this.game.result,
            legal: this.game.allLegalMoves()
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
            if(meta) return { type: 'bot', id: meta.id, name: meta.name, elo: meta.elo, icon: meta.icon }

            const profile = this.seatProfiles[color] && this.profiles?.get(this.seatProfiles[color])
            return profile
                ? { type: 'human', name: profile.name, elo: profile.elo, provisional: profile.provisional }
                : { type: 'human' }
        }

        return { white: colorInfo('white'), black: colorInfo('black') }
    }

    // Which seats are filled (bots always are), so clients can show "waiting for opponent",
    // plus fresh names and ratings for everyone.
    broadcastPresence(){
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

        // Push updated profiles to whoever is still connected.
        for(const socket of this.players){
            const profile = socket.profileId && this.profiles.get(socket.profileId)
            if(profile) this.send(socket, { type: 'profile', player: profile })
        }

        return changes
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

    destroy(){
        if(this.destroyed) return
        this.destroyed = true
        clearTimeout(this.disconnectTimer)
        for(const chatter of Object.values(this.chatters)) chatter.stop()
        this.onEmpty?.(this)
    }

    endGame(result){
        if(!result) return
        this.drawOffer = null
        clearTimeout(this.disconnectTimer)
        this.disconnectTimer = null

        let ratings = null
        try { ratings = this.rateGame(result) }
        catch(e){ console.error(`[room ${this.id}] Rating update failed:`, e) }

        this.broadcast({ type: 'gameOver', result, ratings })

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

        this.broadcast({
            type: 'move',
            ...move,
            fen: this.game.fen,
            turn: this.game.turn,
            result: this.game.result,
            // Sent with every move so the next player's highlights appear instantly on pickup.
            legal: this.game.allLegalMoves()
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

        setTimeout(async _ => {
            let move = null
            try {
                move = await requestBotMove(botId, { fen: this.game.fen, turn: color, enPassant: this.game.enPassant, seen: this.game.seenPositions(), recentOwnMoves: this.game.recentMovesBy(color) })
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
            if(announced) setTimeout(play, BOT_ANNOUNCE_PAUSE_MS)
            else play()
        }, BOT_MOVE_DELAY_MS)
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
