// Bot table talk. Watches the game from one bot's seat, spots situations worth commenting on
// (hung pieces, sacrifices, checks, swings, drawish endings...) and says a line from that bot's
// personality. Purely canned lines - no AI, no dependencies.

const { parseFen, generateLegalMoves, cellName } = require('../../game/moves')
const { getPersonality } = require('./personalities')

const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

const MIN_GAP_MS = 7000            // between optional comments
const SAC_WINDOW_PLIES = 6         // how long a sacrifice has to pay off
const BIG_SWING = 5                // material lead (in pawns) that counts as "winning"

const other = c => c == 'white' ? 'black' : 'white'
const value = cell => VALUES[cell.piece.toLowerCase()] || 0
const rand = (min, max) => min + Math.random() * (max - min)

// Material from `color`'s point of view.
const materialBalance = (board, color) =>
    board.reduce((sum, c) => c.piece ? sum + (c.color == color ? 1 : -1) * value(c) : sum, 0)

const totalMaterial = board => board.reduce((sum, c) => sum + (c.piece ? value(c) : 0), 0)

// Pieces of `color` (worth at least `minValue`) that the opponent can win: attacked and either
// undefended or attacked by something cheaper. Pseudo-legal, which is plenty for table talk.
const hangingPieces = (board, color, enPassant, minValue = 3) => {
    const enemy = other(color)
    const cheapestAttacker = new Map()

    for(const c of board){
        if(c.color != enemy) continue
        for(const target of generateLegalMoves(board, c.cell, enemy, enPassant)){
            const v = value(c) || 100   // a king can only take undefended pieces; treat it as expensive
            if(!cheapestAttacker.has(target) || v < cheapestAttacker.get(target)) cheapestAttacker.set(target, v)
        }
    }

    const hanging = []
    for(const c of board){
        if(c.color != color || c.piece.toLowerCase() == 'k' || value(c) < minValue) continue
        if(!cheapestAttacker.has(c.cell)) continue

        // Would a friendly piece recapture? Pretend the square holds an enemy piece and ask.
        const probe = board.map(x => x.cell == c.cell ? { ...x, color: enemy } : x)
        const defended = board.some(d => d.color == color && d.cell != c.cell &&
            generateLegalMoves(probe, d.cell, color, enPassant).includes(c.cell))

        if(!defended || cheapestAttacker.get(c.cell) < value(c)) hanging.push(c)
    }

    return hanging.sort((a, b) => value(b) - value(a))
}

class Chatter {
    // say(text) delivers a message. getOpponentName() returns who the bot is talking to.
    constructor({ botId, color, say, getOpponentName, opponentIsBot = false }){
        this.botId = botId
        this.color = color
        this.deliver = say
        this.getOpponentName = getOpponentName
        this.opponentIsBot = opponentIsBot
        this.personality = getPersonality(botId)

        this.used = new Set()
        this.lastSentAt = 0
        this.pending = null
        this.timers = new Set()
        this.idleTimer = null
        this.idleCount = 0
        this.stopped = false

        this.started = false
        this.advantage = 'even'      // 'even' | 'winning' | 'losing'
        this.saidDrawish = false
        this.sac = null              // { cell, before, ply, taken }
    }

    // ------ delivery ------

    later(fn, ms){
        const t = setTimeout(_ => { this.timers.delete(t); fn() }, ms)
        this.timers.add(t)
        return t
    }

    pick(event){
        const pool = this.personality.lines[event]
        if(!pool?.length) return null

        const fresh = pool.filter(line => !this.used.has(line))
        const choices = fresh.length ? fresh : pool
        const line = choices[Math.floor(Math.random() * choices.length)]
        this.used.add(line)
        return line
    }

    // Returns true if a message was queued.
    say(event, vars = {}, { force = false, delay = rand(700, 1600) } = {}){
        if(this.stopped && !force) return false
        if(!force && (this.pending || Date.now() - this.lastSentAt < MIN_GAP_MS)) return false

        const line = this.pick(event)
        if(!line) return false

        const name = this.getOpponentName() || 'friend'
        const text = line
            .replace(/\{name\}/g, name)
            .replace(/\{piece\}/g, vars.piece || 'piece')
            .replace(/\{cell\}/g, vars.cell || 'there')

        if(this.pending){
            clearTimeout(this.pending)
            this.timers.delete(this.pending)
        }
        this.pending = this.later(_ => {
            this.pending = null
            this.lastSentAt = Date.now()
            this.deliver(text)
        }, delay)
        this.lastSentAt = Date.now()   // reserve the slot so nothing else jumps in
        return true
    }

    roll(p){
        return Math.random() < p
    }

    // ------ events from the room ------

    onStart(){
        if(this.started) return
        this.started = true
        if(this.roll(0.5 + 0.5 * this.personality.chattiness)) this.say('greeting', {}, { delay: rand(900, 1800) })
    }

    // move: the move object from GameState.play; game: the GameState after the move.
    onMove({ move, mover, fenBefore, game }){
        if(this.stopped || game.result) return

        const { chattiness, awareness } = this.personality
        const mine = mover == this.color
        const opp = other(this.color)
        const ply = game.history.length

        const before = parseFen(fenBefore)
        const after = game.board()
        const balance = materialBalance(after, this.color)

        // Candidate comments in priority order: [event, probability, vars]
        const candidates = []

        if(this.sac && ply - this.sac.ply > SAC_WINDOW_PLIES) this.sac = null

        if(mine){
            if(this.sac && move.captured && move.to == this.sac.cell) this.sac.taken = true

            if(move.promotion) candidates.push(['botPromotes', 0.8])
            if(move.check != null) candidates.push(['botChecks', 0.35 * chattiness + 0.1])
            if(move.captured) candidates.push(['botCaptures', 0.25 * chattiness, { piece: PIECE_NAMES[move.captured.toLowerCase()] }])
        }
        else {
            // A piece the opponent gave up earlier has paid for itself (material back, or more).
            if(this.sac?.taken && materialBalance(after, opp) >= this.sac.before){
                candidates.push(['brilliantSac', 0.5 + 0.5 * awareness])
                this.sac = null
            }

            // The opponent just took one of our pieces that wasn't properly protected.
            if(move.captured && VALUES[move.captured.toLowerCase()] >= 3){
                const wasHanging = hangingPieces(before, this.color, null, 3).some(c => c.cell == move.capturedCell)
                if(wasHanging){
                    candidates.push(['botBlunder', 0.35 + 0.5 * chattiness, { piece: PIECE_NAMES[move.captured.toLowerCase()] }])
                }
            }

            if(move.promotion) candidates.push(['playerPromotes', 0.7])
            if(move.check != null) candidates.push(['playerChecks', 0.35 * chattiness + 0.1])

            // Did they just leave something en prise? Could be a blunder... or a sacrifice.
            // (A piece that just captured something at least as valuable is only an even trade.)
            const isTrade = c => c.cell == move.to && move.captured && VALUES[move.captured.toLowerCase()] >= value(c)
            const loose = hangingPieces(after, opp, game.enPassant, 3).find(c => !isTrade(c))
            if(loose){
                if(!this.sac) this.sac = { cell: loose.cell, before: materialBalance(before, opp), ply, taken: false }
                candidates.push(['playerHangs', 0.85 * awareness, { piece: PIECE_NAMES[loose.piece.toLowerCase()], cell: cellName(loose.cell) }])
            }
        }

        if(balance >= BIG_SWING && this.advantage != 'winning'){
            this.advantage = 'winning'
            candidates.push(['winning', 0.5 + 0.4 * chattiness])
        }
        else if(balance <= -BIG_SWING && this.advantage != 'losing'){
            this.advantage = 'losing'
            candidates.push(['losing', 0.5 + 0.4 * chattiness])
        }
        else if(Math.abs(balance) <= 1){
            this.advantage = 'even'
        }

        const quietEnding = ply > 40 && totalMaterial(after) <= 14 && Math.abs(balance) <= 1
        if(!this.saidDrawish && (game.halfmoveClock >= 40 || quietEnding)){
            this.saidDrawish = true
            candidates.push(['drawish', 0.75])
        }

        for(const [event, p, vars] of candidates){
            if(this.roll(p) && this.say(event, vars)) break
        }

        this.scheduleIdle(game, ply)
    }

    // Small talk while waiting on a human opponent to move.
    scheduleIdle(game, ply){
        clearTimeout(this.idleTimer)
        this.timers.delete(this.idleTimer)
        this.idleTimer = null

        if(this.opponentIsBot || game.turn == this.color || this.idleCount >= 4) return

        const wait = rand(30000, 50000) * (1.6 - this.personality.chattiness)
        this.idleTimer = this.later(_ => {
            if(this.stopped || game.result || game.history.length != ply) return
            if(this.roll(0.4 + 0.6 * this.personality.chattiness) && this.say('idle')) this.idleCount++
            this.scheduleIdle(game, ply)
        }, wait)
    }

    onGameOver(result){
        if(this.stopped) return

        let event
        if(!result.winner) event = 'draw'
        else if(result.winner == this.color) event = result.reason == 'stalemate' ? 'stalemateWin' : result.reason == 'checkmate' ? 'win' : 'winOther'
        else event = result.reason == 'stalemate' ? 'stalemateLoss' : 'loss'

        if(!this.personality.lines[event]?.length) event = event.startsWith('stalemate') ? (result.winner == this.color ? 'win' : 'loss') : event == 'winOther' ? 'win' : event

        this.say(event, {}, { force: true, delay: rand(900, 1500) })
        this.stop({ keepPending: true })
    }

    onOpponentChat(text){
        if(this.stopped) return
        const t = text.toLowerCase()

        let event = 'reply', p = 0.25 + 0.5 * this.personality.chattiness
        if(/\b(gg|good game|well played|wp|thanks|thank you|ty)\b/.test(t)){ event = 'replyGG'; p = 0.9 }
        else if(/\b(hi|hello|hey|yo|sup|good luck|gl|hf|have fun)\b/.test(t)){ event = 'replyHello'; p = 0.9 }

        if(!this.roll(p)) return

        // Replies may interrupt the comment cooldown, but never stack on a pending message.
        if(this.pending) return
        this.lastSentAt = 0
        this.say(event, {}, { delay: rand(1200, 2600) })
    }

    stop({ keepPending = false } = {}){
        this.stopped = true
        for(const t of this.timers){
            if(keepPending && t == this.pending) continue
            clearTimeout(t)
        }
    }
}

module.exports = { Chatter, hangingPieces, materialBalance }
