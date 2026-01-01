const { randomUUID } = require('crypto')
const { coordToIndex, parseFen, generateFilteredLegals, isKingAttacked } = require('../game/moves.js')

const boardToFen = board => {
    let fen = ''
    let emptyCount = 0

    const flushEmpty = _ => {
        while(emptyCount > 9){
            fen += '9'
            emptyCount -= 9
        }
        if(emptyCount > 0){
            fen += String(emptyCount)
            emptyCount = 0
        }
    }

    for(let i = 0; i < board.length; i++){
        const cell = board[i]

        const isEmpty = !cell || !cell.piece || cell.piece == ''

        if(isEmpty) emptyCount ++
        else {
            if(emptyCount > 0) flushEmpty()
            fen += cell.piece
        }
    }

    if(emptyCount > 0) flushEmpty()

        return fen
}

const whitePromotionCells = [0,  1,  2,  3,  5,  6,  9,  10, 14]
const blackPromotionCells = [76, 80, 81, 84, 85, 87, 88, 89, 90]

class Room {
    constructor(id){
        this.id = id || randomUUID.slice(0, 6).toUpperCase()
        this.players = []
        this.spectators = []
        this.gameState = {
            //Stalemate '5k92BR96K4N993P3PP7P1P95'
            //Checkmate '999997P8P3PPKB4R2PN91k2'
            //Start 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'
            fen: '999997P8P3PPKB4R2PN91k2',
            enPassant: null,
            turn: 'white'
        }

        this.pendingPromotion = null

        this.finished = false
    }

    addClient(socket){

        //console.log(`[room.js] isBotGame?`, this.isBotGame)
        //console.log(`[room.js] has strategy?`, this.botStrategy)
        //console.log(`[room.js] strategies?`, this.botStrategies)

        if(this.isBotGame && this.botStrategies && typeof this.botStrategies.white == 'function' && typeof this.botStrategies.black == 'function'){
            socket.color = 'spectator'
            this.spectators.push(socket)

            socket.send(JSON.stringify({
                type: 'assignColor',
                color: 'spectator'
            }))
        }
        else if(this.isBotGame && typeof this.botStrategy == 'function'){
            socket.color = this.playerColor || 'white'
            this.players.push(socket)

            socket.send(JSON.stringify({
                type: 'assignColor',
                color: socket.color
            }))
        }
        else if(this.players.length < 2){
            const colors = ['white', 'black']
            const taken = this.players.map(player => player.color)
            const available = colors.filter(color => !taken.includes(color))

            const assignedColor = available.length ? available[0] : colors[Math.floor(Math.random() * 2)]

            socket.color = assignedColor
            this.players.push(socket)

            socket.send(JSON.stringify({
                type: 'assignColor',
                color: assignedColor
            }))
        }
        else {
            socket.color = 'spectator'
            this.spectators.push(socket)
            socket.send(JSON.stringify({
                type: 'assignColor',
                color: 'spectator'
            }))
        }

        socket.send(JSON.stringify({
            type: 'init',
            fen: this.gameState.fen,
            turn: this.gameState.turn
        }))

        console.log(`Client joined room ${this.id} as ${socket.color}`)

        if(this.isBotGame && this.botStrategies && typeof this.botStrategies.white == 'function' && typeof this.botStrategies.black == 'function'){
            //console.log('Should be moving first bot')
            
            setTimeout(_ => {
                const currentBot = this.botStrategies[this.gameState.turn]
                if(!currentBot) return

                const botMove = currentBot({
                    fen: this.gameState.fen,
                    turn: this.gameState.turn,
                    enPassant: this.gameState.enPassant
                })

                if(!botMove) return

                this.handleMessage({ color: this.gameState.turn }, {
                    type: 'attemptMove',
                    from: botMove.from,
                    to: botMove.to
                })
            }, 400)
        }

        //console.log(`[room:${this.id}] After addClient — players:`,
        //    this.players.map(p => p.color),
        //    'spectators:', this.spectators.map(s => s.color)
        //  )
          
    }

    removeClient(socket){
        this.players = this.players.filter(player => player != socket)
        this.spectators = this.spectators.filter(spectator => spectator != socket)
    }

    broadcastExcept(sender, msgObj){
        const msg = JSON.stringify(msgObj)
        const all = [...this.players, ...this.spectators]

        all.forEach(client => {
            if(client != sender && client.readyState == 1){
                client.send(msg)
            }
        })
    }

    handleMessage(socket, data){
        if(this.finished) return

        if(data.type == 'move'){
            this.gameState.fen = data.fen || this.gameState.fen

            this.broadcastExcept(socket, {
                type: 'move',
                fen: this.gameState.fen,
                username: data.username,
                payload: data.payload
            })
        }


        if(data.type == 'chat'){
            this.broadcastExcept(socket, {
                type: 'chat',
                username: data.username,
                payload: data.payload,
                self: false
            })
        }


        if(data.type == 'requestLegalMoves'){

            //console.log('Legal move request received', socket.color, data.from)

            if(socket.color != 'white' && socket.color != 'black'){
                socket.send(JSON.stringify({
                    type: 'legalMoves',
                    from: data.from,
                    moves: []
                }))
                return
            }

            const board = parseFen(this.gameState.fen)
            //const legal = generateLegalMoves(board, data.from, socket.color, this.gameState.enPassant)
            const legal = generateFilteredLegals(board, data.from, socket.color, this.gameState.enPassant)

            //const whiteCheck = isKingAttacked(board, 'white', this.gameState.enPassant)
            //const blackCheck = isKingAttacked(board, 'black', this.gameState.enPassant)

            socket.send(JSON.stringify({
                type: 'legalMoves',
                from: data.from,
                moves: legal,
                //check: { white: whiteCheck, black: blackCheck }
            }))

            return
        }


        if(data.type == 'attemptMove'){

            if(socket.color != this.gameState.turn){
                socket.send(JSON.stringify({
                    type: 'illegalMove',
                    reason: 'Not your turn'
                }))
                return
            }

            if(socket.color != 'white' && socket.color != 'black'){
                socket.send(JSON.stringify({
                    type: 'illegalMove',
                    reason: 'Spectators cannot make moves'
                }))
                return
            }

            const from = +data.from
            const to = +data.to
            if(Number.isNaN(from) || Number.isNaN(to)){
                socket.send(JSON.stringify({ type: 'illegalMove', reason: 'Bad cell index' }))
                return
            }

            const board = parseFen(this.gameState.fen)
            //const legal = generateLegalMoves(board, from, socket.color, this.gameState.enPassant)
            const legal = generateFilteredLegals(board, data.from, socket.color, this.gameState.enPassant)

            //console.log('legal for', from, legal)

            if(!Array.isArray(legal) || !legal.some(m => +m == to)){
                socket.send(JSON.stringify({ type: 'illegalMove', from, to }))
                return
            }

            const movingPiece = board[from]

            if(!movingPiece || !movingPiece.piece){
                socket.send(JSON.stringify({ type: 'illegalMove', reason: 'No piece at from' }))
                return
            }

            let capturedPiece = board[to]?.piece || ''
            let epCaptureCell = null

            if(this.gameState.enPassant){
                const ep = this.gameState.enPassant

                const isPawn = movingPiece.piece.toLowerCase() == 'p'
                const isEnemy = ep.color != movingPiece.color
                const landsOnCaptureCell = to == ep.captureCell
                
                if(isPawn && isEnemy && landsOnCaptureCell){
                    epCaptureCell = ep.pawnCell
                    capturedPiece = board[epCaptureCell]?.piece || ''
                }
            }

            const isPawn = movingPiece.piece.toLowerCase() == 'p'

            const promotionRank = movingPiece.color == 'white' ? whitePromotionCells.includes(to) : blackPromotionCells.includes(to)

            if(isPawn && promotionRank){

                if(this.isBotGame && socket.color != this.playerColor){
                    if(!data.promotion){
                        console.error('Promotion missing from bot move')
                        return
                    }

                    return this.handleMessage(socket, {
                        type: 'promotionChoice',
                        from,
                        to,
                        promotion: data.promotion
                    })
                }

                if(data.promotion){
                    return this.handleMessage(socket, {
                        type: 'promotionChoice',
                        from,
                        to,
                        promotion: data.promotion
                    })
                }

                this.pendingPromotion = { from, to, color: movingPiece.color }

                socket.send(JSON.stringify({
                    type: 'promotionRequired',
                    from,
                    to
                }))

                return
            }

            const newPieceObj = {
                piece: movingPiece.piece,
                color: movingPiece.color,
                cell: to,
                coords: [...board[to].coords]
            }

            //console.log('new piece obj', newPieceObj)

            board[to] = newPieceObj
            board[from] = {
                piece: '',
                color: '',
                cell: from,
                coords: Array.isArray(board[from]?.coords) ? [...board[from].coords] : board[from]?.coords
            }

            if(epCaptureCell != null){
                board[epCaptureCell] = {
                    piece: '',
                    color: '',
                    cell: epCaptureCell,
                    coords: Array.isArray(board[epCaptureCell]?.coords) ? [...board[epCaptureCell].coords] : board[epCaptureCell]?.coords
                }
            }

            this.gameState.enPassant = null

            if(isPawn){
                const fromR = movingPiece.coords[1]
                const toR = newPieceObj.coords[1]

                //console.log('From, to', fromR, toR)

                if(Math.abs(fromR - toR) == 2){
                    const midQ = (movingPiece.coords[0] + newPieceObj.coords[0]) / 2
                    const midR = (movingPiece.coords[1] + newPieceObj.coords[1]) / 2
                    const midS = (movingPiece.coords[2] + newPieceObj.coords[2]) / 2

                    const midIndex = coordToIndex(midQ, midR, midS)

                    if(midIndex != undefined){
                        this.gameState.enPassant = {
                            captureCell: midIndex,
                            pawnCell: to,
                            color: movingPiece.color
                        }
                    }
                }
            }

            const newFen = boardToFen(board)
            this.gameState.fen = newFen

            const verify = parseFen(newFen)

            if(!verify[to] || !verify[to].piece){
                console.error('[room] FEN roundtrip failed: destination empty after boardToFen')
            }

            const whiteCheck = isKingAttacked(board, 'white', this.gameState.enPassant)
            const blackCheck = isKingAttacked(board, 'black', this.gameState.enPassant)

            const whiteKing = board.find(p => p.piece.toLowerCase() == 'k' && p.color == 'white')
            const blackKing = board.find(p => p.piece.toLowerCase() == 'k' && p.color == 'black')

            const nextColor = this.gameState.turn == 'white' ? 'black' : 'white'
            let movesExist = false
            for(let i = 0; i < board.length; i++){
                const piece = board[i]
                if(piece && piece.color == nextColor){
                    const legals = generateFilteredLegals(board, i, nextColor, this.gameState.enPassant)
                    if(legals.length){
                        movesExist = true
                        break
                    }
                }
            }

            let gameOver = null
            if(!movesExist){
                const kingAttacked = isKingAttacked(board, nextColor, this.gameState.enPassant)
                gameOver = kingAttacked ? 'checkmate' : 'stalemate'
            }

            if(gameOver) this.finished = true

            this.gameState.turn = this.gameState.turn == 'white' ? 'black' : 'white'
            
            //console.log('gameOver', gameOver)

            this.broadcastExcept(socket, {
                type: 'move',
                fen: newFen,
                from,
                to,
                captured: capturedPiece || null,
                capturedCell: epCaptureCell ?? to,
                check: whiteCheck ? whiteKing.cell : blackCheck ? blackKing.cell : null,
                turn: this.gameState.turn,
                gameOver
            })

            if(socket.send){ // For bot games, we don't need to send to itself
                socket.send(JSON.stringify({
                    type: 'move',
                    fen: newFen,
                    from,
                    to,
                    captured: capturedPiece || null,
                    capturedCell: epCaptureCell ?? to,
                    check: whiteCheck ? whiteKing.cell : blackCheck ? blackKing.cell : null,
                    turn: this.gameState.turn,
                    gameOver
                }))
            }

            let botFunc = null

            if(this.botStrategies && this.botStrategies[this.gameState.turn]){
                botFunc = this.botStrategies[this.gameState.turn]
            }
            else if(this.botStrategy && typeof this.botStrategy == 'function'){
                botFunc = this.botStrategy
            }

            if(!this.finished && this.isBotGame && botFunc && this.gameState.turn != this.playerColor){
                setTimeout(_ => {
                    const botMove = botFunc({
                        fen: this.gameState.fen,
                        turn: this.gameState.turn,
                        enPassant: this.gameState.enPassant
                    })

                    if(!botMove) return

                    this.handleMessage({ color: this.gameState.turn }, {
                        type: 'attemptMove',
                        from: botMove.from,
                        to: botMove.to,
                        promotion: botMove.promotion
                    })
                }, 400)
            }

            return
        }


        if(data.type == 'promotionChoice'){
            const { from, to } = data
            let { promotion } = data

            //console.log('Promotion to ', promotion)
            if(!this.isBotGame){
                if(!this.pendingPromotion || this.pendingPromotion.from != from || this.pendingPromotion.to != to){
                    socket.send(JSON.stringify({
                        type: 'illegalMove',
                        reason: 'Promotion mismatch'
                    }))

                    return
                }
            }

            const board = parseFen(this.gameState.fen)

            promotion = board[from].color == 'white' ? promotion.toUpperCase() : promotion.toLowerCase()

            const movingPiece = board[from]
            let capturedPiece = board[to]?.piece || ''
            let epCaptureCell = null

            board[to] = {
                piece: promotion,
                color: movingPiece.color,
                cell: to,
                coords: [...board[to].coords]
            }

            board[from] = {
                piece: '',
                color: '',
                cell: from,
                coords: [...movingPiece.coords]
            }

            this.pendingPromotion = null

            this.gameState.fen = boardToFen(board)

            const whiteCheck = isKingAttacked(board, 'white', this.gameState.enPassant)
            const blackCheck = isKingAttacked(board, 'black', this.gameState.enPassant)

            const whiteKing = board.find(p => p.piece.toLowerCase() == 'k' && p.color == 'white')
            const blackKing = board.find(p => p.piece.toLowerCase() == 'k' && p.color == 'black')

            const nextColor = this.gameState.turn == 'white' ? 'black' : 'white'
            let movesExist = false
            for(let i = 0; i < board.length; i++){
                const piece = board[i]
                if(piece && piece.color == nextColor){
                    const legals = generateFilteredLegals(board, i, nextColor, this.gameState.enPassant)
                    if(legals.length){
                        movesExist = true
                        break
                    }
                }
            }

            let gameOver = null
            if(!movesExist){
                const kingAttacked = isKingAttacked(board, nextColor, this.gameState.enPassant)
                gameOver = kingAttacked ? 'checkmate' : 'stalemate'
            }

            this.gameState.turn = this.gameState.turn == 'white' ? 'black' : 'white'
            
            //console.log('gameOver', gameOver)

            this.broadcastExcept(socket, {
                type: 'move',
                fen: this.gameState.fen,
                from,
                to,
                captured: capturedPiece || null,
                capturedCell: to,
                promotion: promotion,
                check: whiteCheck ? whiteKing.cell : blackCheck ? blackKing.cell : null,
                turn: this.gameState.turn,
                gameOver
            })

            if(socket.send){ // For bot games, we don't need to send to itself
                socket.send(JSON.stringify({
                    type: 'move',
                    fen: this.gameState.fen,
                    from,
                    to,
                    captured: capturedPiece || null,
                    capturedCell: to,
                    promotion: promotion,
                    check: whiteCheck ? whiteKing.cell : blackCheck ? blackKing.cell : null,
                    turn: this.gameState.turn,
                    gameOver
                }))
            }

            let botFunc = null

            if(this.botStrategies && this.botStrategies[this.gameState.turn]){
                botFunc = this.botStrategies[this.gameState.turn]
            }
            else if(this.botStrategy && typeof this.botStrategy == 'function'){
                botFunc = this.botStrategy
            }

            if(this.isBotGame && botFunc && this.gameState.turn != this.playerColor){
                setTimeout(_ => {
                    const botMove = botFunc({
                        fen: this.gameState.fen,
                        turn: this.gameState.turn,
                        enPassant: this.gameState.enPassant
                    })

                    if(!botMove) return

                    this.handleMessage({ color: this.gameState.turn }, {
                        type: 'attemptMove',
                        from: botMove.from,
                        to: botMove.to,
                        promotion: botMove.promotion
                    })
                }, 400)
            }

            return
        }


        if(data.type == 'leaveRoom'){
            removeClient(socket)

            if(!this.players.length && !this.spectators.length){
                this.finished = true
            }

            return
        }
    }
}

module.exports = Room