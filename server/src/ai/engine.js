const { parseFen, generateFilteredLegals, cloneBoard, applyMove, isKingAttacked } = require('../game/moves')

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
const CENTER = 5 // hex board radius, cell [0,0,0] is the center

const promotionCells = {
    white: [0,  1,  2,  3,  5,  6,  9,  10, 14],
    black: [76, 80, 81, 84, 85, 87, 88, 89, 90]
}

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

const hexDistanceFromCenter = coords => Math.max(Math.abs(coords[0]), Math.abs(coords[1]), Math.abs(coords[2]))

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

// A weighted evaluation: material + hanging-piece penalty, centrality, mobility, and king safety,
// each independently tunable. This is the single evaluator all tiers (and evolved genomes) run through -
// a tier's "personality" is just a different weights object, not different code.
const DEFAULT_WEIGHTS = {
    pieceValues: { p: 1, n: 3, b: 3, r: 5, q: 9 },
    hangingPenaltyMult: HANG_PENALTY_MULT,
    centralityWeight: 0.05,
    mobilityWeight: 0.02,
    kingSafetyWeight: 0.1
}

const evaluateWeighted = (board, maximizingColor, enPassant, weights) => {
    let score = 0

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const lower = cell.piece.toLowerCase()
        const friendly = cell.color == maximizingColor
        const sign = friendly ? 1 : -1

        const v = lower == 'k' ? 0 : (weights.pieceValues[lower] || 0)
        score += sign * v

        if(friendly && v && isPieceHanging(board, maximizingColor, i, enPassant)){
            score -= v * weights.hangingPenaltyMult
        }

        if(weights.centralityWeight && lower != 'k' && lower != 'p'){
            score += sign * (CENTER - hexDistanceFromCenter(cell.coords)) * weights.centralityWeight
        }

        if(weights.mobilityWeight){
            score += sign * generateFilteredLegals(board, i, cell.color, enPassant).length * weights.mobilityWeight
        }
    }

    if(weights.kingSafetyWeight){
        const king = board.find(p => p.piece?.toLowerCase() == 'k' && p.color == maximizingColor)
        if(king){
            let defenders = 0
            for(const cell of board){
                if(!cell?.piece || cell.color != maximizingColor || cell.cell == king.cell) continue
                if(hexDistanceFromCenter(cell.coords.map((c, idx) => c - king.coords[idx])) <= 2) defenders++
            }
            score += defenders * weights.kingSafetyWeight
        }
    }

    return score
}

const MATERIAL_WEIGHTS = { ...DEFAULT_WEIGHTS, centralityWeight: 0, mobilityWeight: 0, kingSafetyWeight: 0 }
const CENTRAL_WEIGHTS = { ...DEFAULT_WEIGHTS, mobilityWeight: 0, kingSafetyWeight: 0 }
const POSITIONAL_WEIGHTS = { ...DEFAULT_WEIGHTS, kingSafetyWeight: 0 }
const MASTER_WEIGHTS = { ...DEFAULT_WEIGHTS }

// Material count, penalizing pieces the opponent could capture for free
const evaluateMaterial = (board, maximizingColor, enPassant) => evaluateWeighted(board, maximizingColor, enPassant, MATERIAL_WEIGHTS)

// Material + a bonus for keeping minor/major pieces away from the board edge
const evaluateCentral = (board, maximizingColor, enPassant) => evaluateWeighted(board, maximizingColor, enPassant, CENTRAL_WEIGHTS)

// Central eval + mobility (how many squares each side can actually move to)
const evaluatePositional = (board, maximizingColor, enPassant) => evaluateWeighted(board, maximizingColor, enPassant, POSITIONAL_WEIGHTS)

// Positional eval + keeping friendly pieces near your own king
const evaluateMaster = (board, maximizingColor, enPassant) => evaluateWeighted(board, maximizingColor, enPassant, MASTER_WEIGHTS)

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

const iterativeDeepening = (rootBoard, rootTurn, rootEnPassant, maxDepth, timeLimitMs, evaluate) => {
    let bestMove = null
    const startTime = Date.now()

    const search = (board, turn, enPassant, depth, alpha, beta, maximizingColor, ply) => {
        if(Date.now() - startTime > timeLimitMs) return { timeout: true }

        const tScore = terminalScore(board, turn, maximizingColor, enPassant, ply)
        if(tScore != null) return { score: tScore, move: null }

        if(!depth){
            let s = evaluate(board, maximizingColor, enPassant)

            const enemy = other(turn)
            if(isKingAttacked(board, enemy, enPassant)) s += CHECK_BONUS

            return { score: s, move: null }
        }

        const moves = generateAllMoves(board, turn, enPassant)
        if(!moves.length) return { score: evaluate(board, maximizingColor, enPassant), move: null }

        moves.sort((a, b) => moveHeuristic(board, b, turn, enPassant) - moveHeuristic(board, a, turn, enPassant))

        let bestLocal = null
        const maximizing = turn == maximizingColor
        let value = maximizing ? -Infinity : Infinity

        for(const move of moves){
            const clone = cloneBoard(board)
            const nextBoard = applyMove(clone, move.from, move.to)

            const r = search(nextBoard, other(turn), enPassant, depth - 1, alpha, beta, maximizingColor, ply + 1)
            if(r.timeout) return r

            if(maximizing ? r.score > value : r.score < value){
                value = r.score
                bestLocal = move
            }

            if(maximizing){
                alpha = Math.max(alpha, value)
            }
            else {
                beta = Math.min(beta, value)
            }

            if(beta <= alpha) break
        }

        return { score: value, move: bestLocal }
    }

    for(let depth = 1; depth <= maxDepth; depth++){
        const r = search(rootBoard, rootTurn, rootEnPassant, depth, -Infinity, Infinity, rootTurn, 0)
        if(r.timeout) break

        bestMove = r.move || bestMove
    }

    return bestMove
}

// Parses the FEN, runs a timeboxed alpha-beta search, and returns a ready-to-play move.
// Falls back to any legal move if the search times out before finishing depth 1 (e.g. a cold start),
// so a bot never silently stalls the game by returning nothing.
const searchBot = ({ fen, turn, enPassant, maxDepth, timeLimitMs, evaluate }) => {
    const board = parseFen(fen)
    const move = iterativeDeepening(board, turn, enPassant, maxDepth, timeLimitMs, evaluate)
        || generateAllMoves(board, turn, enPassant)[0]

    if(!move) return null

    const piece = board[move.from]
    if(piece?.piece?.toLowerCase() == 'p' && promotionCells[turn].includes(move.to)){
        return {...move, promotion: 'q'}
    }

    return move
}

module.exports = {
    pieceValues,
    promotionCells,
    generateAllMoves,
    iterativeDeepening,
    searchBot,
    evaluateWeighted,
    DEFAULT_WEIGHTS,
    evaluateMaterial,
    evaluateCentral,
    evaluatePositional,
    evaluateMaster
}
