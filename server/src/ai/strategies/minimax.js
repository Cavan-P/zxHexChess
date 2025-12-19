const { parseFen, generateFilteredLegals, cloneBoard, applyMove, isKingAttacked } = require('../../game/moves')

const pieceValues = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
}
const MATE = 10000000
const CHECK_BONUS = 2
const HANG_PENALTY_MULT = 1.2

const other = c => c == 'white' ? 'black' : 'white'

const isPieceHanging = (board, color, cellIndex, enPassant) => {
    const enemyColor = other(color)

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

const generateAllMoves = (board, turn, enPassant) => {
    const moves = []

    for(let i = 0; i < board.length; i++){
        const piece = board[i]

        if(!piece || piece.color != turn) continue

        const legals = generateFilteredLegals(board, i, turn, enPassant)
        for(const to of legals) moves.push({ from: i, to })
    }

    return moves
}

const evaluatePosition = (board, maximizingColor, enPassant) => {
    let score = 0

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const v = pieceValues[cell.piece.toLowerCase()] || 0
        const friendly = cell.color == maximizingColor

        if(friendly){
            score += v
            if(isPieceHanging(board, maximizingColor, i, enPassant)){
                score -= v * HANG_PENALTY_MULT
            }
        }
        else {
            score -= v
        }
    }

    return score
}

const terminalScore = (board, turn, maximizingColor, enPassant, ply) => {
    const moves = generateAllMoves(board, turn, enPassant)
    if(moves.length) return null

    if(isKingAttacked(board, turn, enPassant)){
        const losingSide = turn
        const winForMax = losingSide != maximizingColor

        return winForMax ? (MATE - ply) : (-MATE + ply)
    }

    //Stalemate
    return 0
}

const moveHeuristic = (board, move, turn, enPassant) => {
    let h = 0

    const target = board[move.to]
    if(target?.piece){
        h += (pieceValues[target.piece.toLowerCase()] || 0) * 100
    }

    const clone = cloneBoard(board)
    const nextBoard = applyMove(clone, move.from, move.to)
    const enemy = other(turn)

    if(isKingAttacked(nextBoard, enemy, enPassant)) h += 10000

    return h
}

const iterativeDeepening = (rootBoard, rootTurn, rootEnPassant, maxDepth, timeLimitMs = 3000) => {
    let bestMove = null
    const startTime = Date.now()
    let totalNodes = 0

    const search = (board, turn, enPassant, depth, alpha, beta, maximizingColor, ply) => {
        if(Date.now() - startTime > timeLimitMs) return { timeout: true }

        const tScore = terminalScore(board, turn, maximizingColor, enPassant, ply)

        if(tScore != null){
            totalNodes ++
            return { score: tScore, move: null }
        }

        if(!depth){
            totalNodes ++

            let s = evaluatePosition(board, maximizingColor, enPassant)

            const enemy = other(turn)
            if(isKingAttacked(board, enemy, enPassant)) s += CHECK_BONUS

            return { score: s, move: null }
        }

        const moves = generateAllMoves(board, turn, enPassant)

        if(!moves.length) return { score: evaluatePosition(board, maximizingColor, enPassant), move: null }

        moves.sort((a, b) => moveHeuristic(board, b, turn, enPassant) - moveHeuristic(board, a, turn, enPassant))

        let bestLocal = null

        if(turn == maximizingColor){
            let value = -Infinity

            for(const move of moves){
                const clone = cloneBoard(board)
                const nextBoard = applyMove(clone, move.from, move.to)

                const r = search(nextBoard, other(turn), enPassant, depth - 1, alpha, beta, maximizingColor, ply + 1)
                if(r.timeout) return r

                if(r.score > value){
                    value = r.score
                    bestLocal = move
                }

                alpha = Math.max(alpha, value)
                if(beta <= alpha) break
            }

            return { score: value, move: bestLocal }
        }
        else {
            let value = Infinity

            for(const move of moves){
                const clone = cloneBoard(board)
                const nextBoard = applyMove(clone, move.from, move.to)

                const r = search(nextBoard, other(turn), enPassant, depth - 1, alpha, beta, maximizingColor, ply + 1)
                if(r.timeout) return r

                if(r.score < value){
                    value = r.score
                    bestLocal = move
                }

                beta = Math.min(beta, value)
                if(beta <= alpha) break
            }

            return { score: value, move: bestLocal }
        }
    }

    for(let depth = 1; depth <= maxDepth; depth++){
        const nodesBefore = totalNodes
        const r = search(rootBoard, rootTurn, rootEnPassant, depth, -Infinity, Infinity, rootTurn, 0)
        if(r.timeout) break

        bestMove = r.move || bestMove

        const nodesThisDepth = totalNodes - nodesBefore
        console.log(`Depth ${depth}: +${nodesThisDepth} nodes (total ${totalNodes}) score ${r.score}`)
    }

    return bestMove
}

module.exports = function competitiveBot({ fen, turn, enPassant }) {
    const board = parseFen(fen)

    const SEARCH_DEPTH = 4
    const TIME_MS = 3000

    const start = Date.now()
    const move = iterativeDeepening(board, turn, enPassant, SEARCH_DEPTH, TIME_MS)
    const end = Date.now()

    console.log(`Thought for ${end - start}ms (maxDepth=${SEARCH_DEPTH})`)

    return move
}
