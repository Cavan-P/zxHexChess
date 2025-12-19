const { parseFen, generateFilteredLegals, cloneBoard, applyMove, isKingAttacked } = require('../../game/moves')

const pieceValues = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
}

const evaluateMaterial = (board, color, enPassant) => {
    let score = 0

    for(let i = 0; i < board.length; i++){
        const piece = board[i]
        if(!piece?.piece) continue

        const value = pieceValues[piece.piece.toLowerCase()] || 0
        const isMine = piece.color == color

        if(isMine){
            score += value
            if(isPieceHanging(board, color, i, enPassant)){
                score -= value * 1.5
            }
        }
        else {
            score -= value
        }
    }

    return score
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

const isCheckmate = (board, color, enPassant) => {
    if(!isKingAttacked(board, color, enPassant)) return false

    for(let i = 0; i < board.length; i++){
        const piece = board[i]

        if(!piece || piece.color != color) continue

        const legals = generateFilteredLegals(board, i, color, enPassant)
        if(legals.length) return false
    }

    return true
}

const getEnemyMaterial = (board, color) => {
    let score = 0

    for(const cell of board){
        if(!cell?.piece || cell.color != color) continue

        score += pieceValues[cell.piece.toLowerCase()] || 0
    }

    return score
}

const evaluateTrade = (before, after, color, enPassant) => {
    const scoreBefore = evaluateMaterial(before, color, enPassant)
    const scoreAfter = evaluateMaterial(after, color, enPassant)

    return scoreAfter - scoreBefore
}

module.exports = function learnerBot({ fen, turn, enPassant }) {
    const board = parseFen(fen)
    
    let highestScore = -Infinity
    let bestMoves = []

    for (let i = 0; i < board.length; i++) {
        const piece = board[i]
        if (!piece || piece.color != turn) continue

        const legals = generateFilteredLegals(board, i, turn, enPassant)

        for (const to of legals) {
            const clone = cloneBoard(board)
            const simulatedMove = applyMove(clone, i, to)
            const enemyColor = turn == 'white' ? 'black' : 'white'

            const score = evaluateTrade(board, simulatedMove, turn, enPassant)

            const enemyMaterial = getEnemyMaterial(simulatedMove, enemyColor)

            if(isKingAttacked(simulatedMove, enemyColor, enPassant) && enemyMaterial < 10){
                score += 15 - enemyMaterial
            }

            if(isCheckmate(simulatedMove, enemyColor, enPassant)){
                score = Infinity
            }

            if(score > highestScore){
                highestScore = score
                bestMoves = [{ from: i, to }]
            }
            else if(score == highestScore){
                bestMoves.push({ from: i, to })
            }
        }
    }

    if(!bestMoves.length) return null

    return bestMoves[~~(Math.random() * bestMoves.length)]

}
