const { parseFen, generateFilteredLegals, boardToFen, getGameStatus, coordToIndex } = require('../game/moves')
const { promotionCells } = require('./engine')

const START_FEN = 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'

// Applies one already-validated move to a parsed board, mirroring room.js's attemptMove logic
// (promotion, en-passant capture + en-passant-state tracking), and returns the new state.
const applyGameMove = (board, turn, enPassant, move) => {
    const from = +move.from
    const to = +move.to
    const movingPiece = board[from]

    let capturedPiece = board[to]?.piece || ''
    let epCaptureCell = null

    if(enPassant){
        const isPawn = movingPiece.piece.toLowerCase() == 'p'
        const isEnemy = enPassant.color != movingPiece.color
        const landsOnCaptureCell = to == enPassant.captureCell

        if(isPawn && isEnemy && landsOnCaptureCell){
            epCaptureCell = enPassant.pawnCell
            capturedPiece = board[epCaptureCell]?.piece || ''
        }
    }

    const isPawn = movingPiece.piece.toLowerCase() == 'p'
    const promotionRank = movingPiece.color == 'white' ? promotionCells.white.includes(to) : promotionCells.black.includes(to)

    let piece = movingPiece.piece
    if(isPawn && promotionRank){
        const promo = move.promotion || 'q'
        piece = movingPiece.color == 'white' ? promo.toUpperCase() : promo.toLowerCase()
    }

    const newPieceObj = { piece, color: movingPiece.color, cell: to, coords: [...board[to].coords] }

    board[to] = newPieceObj
    board[from] = { piece: '', color: '', cell: from, coords: [...movingPiece.coords] }

    if(epCaptureCell != null){
        board[epCaptureCell] = { piece: '', color: '', cell: epCaptureCell, coords: [...board[epCaptureCell].coords] }
    }

    let newEnPassant = null
    if(isPawn && !promotionRank){
        const fromR = movingPiece.coords[1]
        const toR = newPieceObj.coords[1]

        if(Math.abs(fromR - toR) == 2){
            const midQ = (movingPiece.coords[0] + newPieceObj.coords[0]) / 2
            const midR = (movingPiece.coords[1] + newPieceObj.coords[1]) / 2
            const midS = (movingPiece.coords[2] + newPieceObj.coords[2]) / 2
            const midIndex = coordToIndex(midQ, midR, midS)

            if(midIndex != undefined){
                newEnPassant = { captureCell: midIndex, pawnCell: to, color: movingPiece.color }
            }
        }
    }

    const capturedOrPawnMove = Boolean(capturedPiece) || isPawn

    return { board, enPassant: newEnPassant, capturedOrPawnMove }
}

const yieldToEventLoop = _ => new Promise(resolve => setImmediate(resolve))

// Plays one full headless game between two bot play functions. Returns
// { result: 'white'|'black'|'draw', reason, plies }
// Yields to the event loop after every move (a single bot search can itself take seconds) so a
// long-running game never fully monopolizes the server - other connections stay responsive.
const playGame = async ({ playA, playB, maxPlies = 300, noProgressLimit = 80, fen = START_FEN } = {}) => {
    let board = parseFen(fen)
    let turn = 'white'
    let enPassant = null
    let plySinceProgress = 0

    for(let ply = 0; ply < maxPlies; ply++){
        const status = getGameStatus(board, turn, enPassant)
        if(status == 'checkmate'){
            const winner = turn == 'white' ? 'black' : 'white'
            return { result: winner, reason: 'checkmate', plies: ply }
        }
        if(status == 'stalemate'){
            return { result: 'draw', reason: 'stalemate', plies: ply }
        }

        const play = turn == 'white' ? playA : playB
        const currentFen = boardToFen(board)
        const move = play({ fen: currentFen, turn, enPassant })

        if(!move || move.from == null || move.to == null){
            const winner = turn == 'white' ? 'black' : 'white'
            return { result: winner, reason: 'forfeit-no-move', plies: ply }
        }

        const piece = board[+move.from]
        if(!piece || piece.color != turn){
            const winner = turn == 'white' ? 'black' : 'white'
            return { result: winner, reason: 'forfeit-illegal-move', plies: ply }
        }

        const legal = generateFilteredLegals(board, +move.from, turn, enPassant)
        if(!legal.includes(+move.to)){
            const winner = turn == 'white' ? 'black' : 'white'
            return { result: winner, reason: 'forfeit-illegal-move', plies: ply }
        }

        const applied = applyGameMove(board, turn, enPassant, move)
        board = applied.board
        enPassant = applied.enPassant

        plySinceProgress = applied.capturedOrPawnMove ? 0 : plySinceProgress + 1
        if(plySinceProgress >= noProgressLimit){
            return { result: 'draw', reason: 'no-progress', plies: ply + 1 }
        }

        turn = turn == 'white' ? 'black' : 'white'

        await yieldToEventLoop()
    }

    return { result: 'draw', reason: 'ply-limit', plies: maxPlies }
}

module.exports = { playGame, applyGameMove, START_FEN }
