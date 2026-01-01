const { applyMove, isKingAttacked, generateFilteredLegals } = require('../game/moves')


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

