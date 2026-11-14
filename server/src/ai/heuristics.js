const { applyMove, isKingAttacked, generateFilteredLegals } = require('../game/moves')


// 1 if the move puts a piece back onto a cell it stood on in the side's recent moves (A->B->A or
// A->B->C->A) without capturing anything, else 0. Used to stop bots shuffling pieces in loops.
module.exports.revisitsCell = (board, move, recentOwnMoves = []) => {
    if(board[move.to].piece) return 0
    let cell = move.from
    for(let i = recentOwnMoves.length - 1; i >= 0; i--){
        if(recentOwnMoves[i].to == cell){
            cell = recentOwnMoves[i].from
            if(cell == move.to) return 1
        }
    }
    return 0
}

// In-place Fisher-Yates shuffle.
module.exports.shuffle = list => {
    for(let i = list.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
}

module.exports.isCapture = (board, move) => {
    return board[move.to].piece ? 1 : 0
}

module.exports.givesCheck = (board, move, color, enPassant) => {
    const newBoard = applyMove(board, move.from, move.to)
    const enemy = color == 'white' ? 'black' : 'white'
    return isKingAttacked(newBoard, enemy, enPassant) ? 1 : 0
}

module.exports.materialDelta = (board, move) => {
    const captured = board[move.to].piece
    
    return !captured ? 0 : pieceValue(captured)
}

module.exports.hangingPenalty = (board, color, cellIndex, enPassant) => {
    if(!isPieceHanging(board, color, cellIndex, enPassant)) return 0

    const piece = board[cellIndex]
    if(!piece || !piece.piece) return 0

    return -pieceValue(piece.piece)
}

module.exports.movesQueen = (board, move) => {
    const piece = board[move.from]
    if(!piece || !piece.piece) return 0
    return piece.piece.toLowerCase() == 'q' ? 1 : 0
}

module.exports.isNotCapture = (board, move) => {
    return board[move.to].piece ? 0 : 1
}

module.exports.tradeDelta = (board, move, color, enPassant) => {
    if(!board[move.to].piece) return 0

    const attacker = board[move.from].piece
    const target = board[move.to].piece

    const attackerValue = pieceValue(attacker)
    const targetValue = pieceValue(target)

    const newBoard = applyMove(board, move.from, move.to)
    const enemy = color == 'white' ? 'black' : 'white'

    let canRecapture = false

    for(const p of newBoard){
        if(p.color != enemy) continue

        const legalMoves = generateFilteredLegals(newBoard, p.cell, p.color, enPassant)

        if(legalMoves.includes(move.to)){
            canRecapture = true
            break
        }
    }

    return canRecapture ? targetValue - attackerValue : targetValue

} 


const isPieceHanging = (board, color, cellIndex, enPassant) => {
    const enemyColor = color == 'white' ? 'black' : 'white'

    for(let i = 0; i < board.length; i++){
        const piece = board[i]
        if(!piece || piece.color != enemyColor) continue

        const legals = generateFilteredLegals(board, i, enemyColor, enPassant)
        if(legals.includes(cellIndex)){
            return true
        }
    }

    return false
}

const pieceValue = p => ({p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[p.toLowerCase()] ?? 0)

