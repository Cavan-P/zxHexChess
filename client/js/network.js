import { Game } from "./game.js"
import { addChatMessage, addSystemMessage } from "./chat.js"
import { setSystemMessage } from "./utils.js"

const host = window.location.hostname
const isLocal = host == 'localhost' || host == '127.0.0.1'

const send = msg => {
    if(Game.socket?.readyState == WebSocket.OPEN) Game.socket.send(JSON.stringify(msg))
}

export const setupNetwork = onFenInit => {
    const protocol = window.location.protocol == 'https:' ? 'wss' : 'ws'
    const port = isLocal ? `:${window.location.port || 8000}` : ''
    Game.socket = new WebSocket(`${protocol}://${host}${port}`)

    Game.socket.onopen = _ => {
        Game.onConnected?.()
        send({ type: 'getBotList' })
    }

    Game.socket.onmessage = msg => {
        const data = JSON.parse(msg.data)

        // Clock snapshots ride along on init/move/gameOver; remember when we got each one so the
        // display can count down smoothly between server updates.
        if('clock' in data){
            Game.clock = data.clock
            Game.clockReceivedAt = performance.now()
        }

        switch(data.type){
            case 'roomCreated':
                Game.onRoomCreated?.(data.code)
                setRoomCodeDisplay(data.code)
                return

            case 'roomJoined':
                Game.onRoomJoined?.(data)
                if(data.code) setRoomCodeDisplay(data.code)
                onFenInit(Game.fen)
                if(Game.result) handleGameOver(Game.result, { quiet: true })
                return

            case 'error':
                Game.onRoomError?.(data.message)
                return

            case 'init':
                Game.turn = data.turn
                Game.fen = data.fen
                Game.result = data.result || null
                Game.legalMap = data.legal || null
                Game.lastMove = data.lastMove ? { from: data.lastMove.from, to: data.lastMove.to } : null
                Game.check = data.lastMove?.check ?? null
                Game.drawOffer = null
                Game.opponentAway = false
                Game.onHistory?.(data.history || [])
                Game.updatePlayers?.()
                return

            case 'presence':
                Game.presence = { white: data.white, black: data.black }
                Game.updatePlayers?.()
                Game.onDrawOfferChanged?.()
                return

            case 'assignColor':
                Game.playerColor = data.color
                return

            case 'matchInfo':
                Game.matchInfo = { white: data.white, black: data.black }
                Game.onMatchInfo?.(Game.matchInfo)
                return

            case 'chat':
                addChatMessage(data.username, data.payload, false, { bot: data.bot })
                if(data.bot) Game.onBotSpeech?.(data)
                return

            case 'move': return handleMove(data)

            case 'gameOver':
                handleGameOver(data.result, { ratings: data.ratings ?? null })
                Game.onRatingsChanged?.()
                return

            case 'profile': return Game.onProfile?.(data.player)
            case 'registered': return Game.onRegistered?.(data.player, data.token)
            case 'profileInvalid': return Game.onProfileInvalid?.()
            case 'profileError': return Game.onProfileError?.(data.message)
            case 'leaderboard': return Game.onLeaderboard?.(data.players)

            case 'legalMoves':
                Game.legalMoves = data.moves
                return Game.onLegalMoves?.(data.from, data.moves)

            case 'illegalMove':
                if(Game.pendingMove){
                    const { piece, originalX, originalY } = Game.pendingMove
                    piece.targetX = originalX
                    piece.targetY = originalY
                    piece.currentCell = piece.originalCell
                }

                Game.pendingMove = null
                Game.selectedPiece = null
                Game.cells.forEach(cell => cell.isLegalTarget = false)
                Game.legalMoves = []
                Game.draggedPiece = null
                return

            case 'promotionRequired': {
                const promoUi = document.getElementById('promotion-ui')
                Game.onPromotionRequired?.()
                promoUi.classList.remove('hidden')
                promoUi.dataset.from = data.from
                promoUi.dataset.to = data.to
                return
            }

            case 'rematchOffered':
                Game.rematchOffer = data.by
                Game.onDrawOfferChanged?.()
                if(data.by != Game.playerColor) addSystemMessage('Your opponent wants a rematch.')
                return

            case 'rematchUnavailable':
                addSystemMessage('Your opponent has left, so a rematch isn\'t possible.')
                Game.rematchOffer = null
                Game.onDrawOfferChanged?.()
                return

            case 'drawOffered':
                Game.drawOffer = data.by
                Game.onDrawOfferChanged?.()
                return

            case 'drawDeclined':
                Game.drawOffer = null
                Game.onDrawOfferChanged?.()
                if(data.by != Game.playerColor) addSystemMessage('Your draw offer was declined.')
                return

            case 'opponentDisconnected':
                Game.opponentAway = true
                addSystemMessage(`Your opponent disconnected. If they don't return within ${data.graceSeconds} seconds, you win by abandonment.`)
                return

            case 'opponentReconnected':
                Game.opponentAway = false
                addSystemMessage('Your opponent is back.')
                return

            case 'botList':
                Game.labEnabled = Boolean(data.labEnabled)
                Game.onBotListReceived?.(data.bots)
                return

            case 'tournamentProgress':
                Game.onTournamentProgress?.(data)
                return

            case 'tournamentComplete':
                Game.onTournamentComplete?.(data)
                return

            case 'trainingProgress':
                Game.onTrainingProgress?.(data)
                return

            case 'trainingComplete':
                Game.onTrainingComplete?.(data)
                return
        }
    }

    Game.socket.onclose = _ => {
        setSystemMessage('Disconnected from server - refresh to reconnect')
        Game.disconnected = true
    }
}

const handleMove = data => {
    if(Game.state == 'idle') return
    Game.selectedPiece = null
    Game.turn = data.turn
    Game.legalMap = data.legal || null
    Game.pendingMove = null
    Game.check = data.check
    Game.drawOffer = null
    Game.onDrawOfferChanged?.()

    const { from, to, fen } = data
    Game.lastMove = { from, to }
    Game.onMovePlayed?.(data.notation)
    Game.updatePlayers?.()

    const piece = Game.pieces.find(p => p.currentCell.num == from)
    const targetCell = Game.cells.find(c => c.num == to)

    if(!piece || !targetCell){
        console.error('Could not apply move, resyncing board', data)
        Game.resyncBoard?.(fen)
    }
    else {
        if(data.captured){
            const capturedCell = data.capturedCell
            Game.pieces = Game.pieces.filter(p => p == piece || p.currentCell.num != capturedCell)
        }

        if(data.promotion) piece.piece = data.promotion

        piece.targetX = targetCell.x
        piece.targetY = targetCell.y
        piece.currentCell = targetCell
    }

    Game.fen = fen
    Game.draggedPiece = null
    Game.cells.forEach(cell => cell.isLegalTarget = false)
    Game.legalMoves = []

    if(data.result) handleGameOver(data.result)
}

export const sendRoomCreate = timeControl => send({ type: 'createRoom', timeControl })

export const sendRoomJoin = code => send({ type: 'joinRoom', code })

export const sendChatMessage = msg => {
    if(!Game.socket || Game.socket.readyState != WebSocket.OPEN) return

    send({ type: 'chat', payload: msg })
    addChatMessage('You', msg, true)
}

export const setRoomCodeDisplay = code => {
    const el = document.getElementById("room-display")
    if (el) el.textContent = code
}

export const sendStartBotGame = (botId, playerColor = 'white', timeControl = null) => send({ type: 'startBotGame', botId, playerColor, timeControl })
export const sendRematch = _ => send({ type: 'rematch' })

export const sendBotVsBot = (botA, botB, timeControl = null) => send({ type: 'startBotVsBot', botA, botB, timeControl })

export const sendStartTournament = (botIds, gamesPerPairing) => send({ type: 'startTournament', botIds, gamesPerPairing })

export const sendStartTraining = (generations, populationSize, gamesPerMatch) =>
    send({ type: 'startTraining', generations, populationSize, gamesPerMatch })

export const sendResign = _ => send({ type: 'resign' })
export const sendOfferDraw = _ => send({ type: 'offerDraw' })
export const sendAcceptDraw = _ => send({ type: 'acceptDraw' })
export const sendDeclineDraw = _ => send({ type: 'declineDraw' })
export const sendLeaveRoom = _ => send({ type: 'leaveRoom' })

const colorName = color => color == 'white' ? 'White' : 'Black'

const sideName = color => {
    const info = Game.matchInfo?.[color]
    if(info?.type == 'bot') return info.name
    if(Game.playerColor == color) return 'You'
    return colorName(color)
}

// Turns a server result ({ winner, reason, score }) into a headline and a detail line.
export const describeResult = result => {
    const { winner, reason, score } = result

    if(!winner){
        return { title: 'Draw', detail: `Draw by ${reason} (${score})` }
    }

    const youWon = winner == Game.playerColor
    const youLost = Game.playerColor == 'white' || Game.playerColor == 'black' ? !youWon : false
    const who = sideName(winner)
    const title = youWon ? 'You win!' : youLost ? 'You lose' : `${who} wins`

    const how = {
        checkmate: 'by checkmate',
        stalemate: 'by stalemate',
        resignation: 'by resignation',
        abandonment: 'by abandonment',
        timeout: 'on time'
    }[reason] || `(${reason})`

    return { title, detail: `${colorName(winner)} wins ${how} (${score})` }
}

// Shows "Rating 812 → 826 (+14)" for the viewer's seat once the server reports it.
const renderRatingChange = ratings => {
    const line = document.getElementById('game-over-rating')
    const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
    const change = ratings?.[Game.playerColor]

    line.className = 'mt-3 text-sm font-semibold'

    if(ratings === undefined || !seated){
        line.classList.add('hidden')
        return
    }

    if(!change){
        line.textContent = Game.profile ? 'This game was unrated.' : 'Create a profile to get rated.'
        line.classList.add('text-(--text-muted)')
        return
    }

    const sign = change.delta > 0 ? '+' : change.delta < 0 ? '−' : '±'
    line.textContent = `Rating ${change.before} → ${change.after} (${sign}${Math.abs(change.delta)})`
    line.classList.add(change.delta > 0 ? 'text-(--success)' : change.delta < 0 ? 'text-(--danger)' : 'text-(--text-main)')
}

const handleGameOver = (result, { quiet = false, ratings } = {}) => {
    // Ignore the result of a game we've already left (leaving mid-game resigns, and the server's
    // game-over message arrives after we're back on the home screen).
    if(!result || Game.state == 'idle') return

    Game.state = 'gameOver'
    Game.result = result
    Game.draggedPiece = null
    Game.legalMoves = []
    Game.drawOffer = null
    Game.cells.forEach(c => c.isLegalTarget = false)
    document.getElementById('promotion-ui').classList.add('hidden')
    Game.onDrawOfferChanged?.()

    const { title, detail } = describeResult(result)
    setSystemMessage(detail)
    Game.onGameOver?.()

    if(quiet) return

    const icon = !result.winner ? 'fa-handshake' : result.winner == Game.playerColor ? 'fa-trophy' : 'fa-chess-king'
    document.getElementById('game-over-icon').replaceChildren(Object.assign(document.createElement('i'), { className: `fa-solid ${icon}` }))
    document.getElementById('game-over-title').textContent = title
    document.getElementById('game-over-detail').textContent = detail
    renderRatingChange(ratings)
    document.getElementById('game-over-overlay').classList.remove('hidden')
}
