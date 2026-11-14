const { parseFen, boardToFen, generateFilteredLegals, generateLegalMoves, cloneBoard, applyMove, isKingAttacked, promotionCells } = require('../game/moves')

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

const other = c => c == 'white' ? 'black' : 'white'

// One pass over the board: for each side, which cells it covers (attacks or defends) and the
// value of its cheapest piece covering each cell, plus how many moves it has. Moves are generated
// on a copy where every piece is "neutral", so a piece guarding a friend counts as covering it.
// Pseudo-legal moves ignore pins, which is fine for evaluation and far cheaper than the fully
// legal generator (that one replays every move to test for check).
const coverageMap = (board, enPassant, values) => {
    const neutral = board.map(c => c.piece ? { ...c, color: 'neutral' } : c)
    const cheapest = { white: new Map(), black: new Map() }
    const mobility = { white: 0, black: 0 }

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const value = cell.piece.toLowerCase() == 'k' ? 100 : (values[cell.piece.toLowerCase()] || 0)
        const covers = cheapest[cell.color]

        for(const to of generateLegalMoves(neutral, i, cell.color, enPassant)){
            if(board[to].color != cell.color) mobility[cell.color]++
            if(!covers.has(to) || value < covers.get(to)) covers.set(to, value)
        }
    }

    return { cheapest, mobility }
}

// What `color` stands to lose on `cell` if the opponent captures there: the whole piece if it's
// undefended, the difference if the attacker is cheaper, nothing otherwise.
const exposure = (cell, color, value, cheapest) => {
    const enemy = other(color)
    if(!cheapest[enemy].has(cell)) return 0
    if(!cheapest[color].has(cell)) return value
    return Math.max(0, value - cheapest[enemy].get(cell))
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

// `toMove` (optional) is whose turn it is in this position. The side to move can grab the
// opponent's most exposed piece, while its own exposed pieces aren't lost yet - it can still move
// them. Without it, the evaluator assumes the opponent moves next (the old behaviour).
const evaluateWeighted = (board, maximizingColor, enPassant, weights, toMove = other(maximizingColor)) => {
    let score = 0

    const { cheapest, mobility } = coverageMap(board, enPassant, weights.pieceValues)
    const enemyColor = other(maximizingColor)
    const worstExposure = { white: 0, black: 0 }

    if(weights.mobilityWeight){
        score += (mobility[maximizingColor] - mobility[enemyColor]) * weights.mobilityWeight
    }

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const lower = cell.piece.toLowerCase()
        const friendly = cell.color == maximizingColor
        const sign = friendly ? 1 : -1

        const v = lower == 'k' ? 0 : (weights.pieceValues[lower] || 0)
        score += sign * v

        if(v){
            const lost = exposure(i, cell.color, v, cheapest)
            if(lost > worstExposure[cell.color]) worstExposure[cell.color] = lost
        }

        if(weights.centralityWeight && lower != 'k' && lower != 'p'){
            score += sign * (CENTER - hexDistanceFromCenter(cell.coords)) * weights.centralityWeight
        }

    }

    // Only the side NOT to move is at risk of losing a piece right now, and only its worst one.
    const victim = toMove == maximizingColor ? enemyColor : maximizingColor
    const threatened = worstExposure[victim] * (weights.hangingPenaltyMult / HANG_PENALTY_MULT) * 0.8
    score += victim == maximizingColor ? -threatened : threatened

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
const evaluateMaterial = (board, maximizingColor, enPassant, toMove) => evaluateWeighted(board, maximizingColor, enPassant, MATERIAL_WEIGHTS, toMove)

// Material + a bonus for keeping minor/major pieces away from the board edge
const evaluateCentral = (board, maximizingColor, enPassant, toMove) => evaluateWeighted(board, maximizingColor, enPassant, CENTRAL_WEIGHTS, toMove)

// Central eval + mobility (how many squares each side can actually move to)
const evaluatePositional = (board, maximizingColor, enPassant, toMove) => evaluateWeighted(board, maximizingColor, enPassant, POSITIONAL_WEIGHTS, toMove)

// Positional eval + keeping friendly pieces near your own king
const evaluateMaster = (board, maximizingColor, enPassant, toMove) => evaluateWeighted(board, maximizingColor, enPassant, MASTER_WEIGHTS, toMove)

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

// Repeating an earlier position counts as a draw, scored just below level so a bot that's ahead
// avoids it (no more shuffling the same piece back and forth) and a bot that's behind welcomes it.
const REPETITION_SCORE = -0.1

// Moving a piece straight back to where it just came from is rarely the best idea; this nudge
// stops bots from shuffling one piece back and forth when nothing else stands out.
const UNDO_PENALTY = 0.5

// `seen` (optional) is a Set of "fen|turn" keys for positions that already happened in the game.
// `lastOwnMove` (optional) is the side to move's previous move, { from, to }.
const iterativeDeepening = (rootBoard, rootTurn, rootEnPassant, maxDepth, timeLimitMs, evaluate, seen = null, lastOwnMove = null) => {
    let bestMove = null
    const startTime = Date.now()

    // The time limit only applies once depth 1 is done: a bot must always finish at least a
    // one-move search, or it would fall back to an arbitrary move (and shuffle the same piece).
    let enforceTime = false

    const search = (board, turn, enPassant, depth, alpha, beta, maximizingColor, ply) => {
        if(enforceTime && Date.now() - startTime > timeLimitMs) return { timeout: true }

        if(ply == 1 && seen?.size && seen.has(`${boardToFen(board)}|${turn}`)) return { score: REPETITION_SCORE, move: null }

        const inCheck = isKingAttacked(board, turn, enPassant)
        const mateScore = _ => turn != maximizingColor ? (MATE - ply) : (-MATE + ply)

        if(!depth){
            // Full mate detection needs every legal move, so at leaves only do it when in check
            // (a stalemate at a leaf is rare enough to ignore).
            if(inCheck && !generateAllMoves(board, turn, enPassant).length) return { score: mateScore(), move: null }

            let s = evaluate(board, maximizingColor, enPassant, turn)

            const enemy = other(turn)
            if(isKingAttacked(board, enemy, enPassant)) s += CHECK_BONUS

            return { score: s, move: null }
        }

        const moves = generateAllMoves(board, turn, enPassant)
        if(!moves.length) return { score: inCheck ? mateScore() : 0, move: null }

        // Score each move once for ordering (captures and checks first), then sort.
        const ordering = new Map(moves.map(m => [m, moveHeuristic(board, m, turn, enPassant)]))
        moves.sort((a, b) => ordering.get(b) - ordering.get(a))

        let bestLocal = null
        const maximizing = turn == maximizingColor
        let value = maximizing ? -Infinity : Infinity

        for(const move of moves){
            const clone = cloneBoard(board)
            const nextBoard = applyMove(clone, move.from, move.to)

            const r = search(nextBoard, other(turn), enPassant, depth - 1, alpha, beta, maximizingColor, ply + 1)
            if(r.timeout) return r

            let score = r.score
            const undoesLastMove = ply == 0 && lastOwnMove && move.from == lastOwnMove.to && move.to == lastOwnMove.from && !board[move.to].piece
            if(undoesLastMove) score -= UNDO_PENALTY

            if(maximizing ? score > value : score < value){
                value = score
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
        enforceTime = depth > 1
        const r = search(rootBoard, rootTurn, rootEnPassant, depth, -Infinity, Infinity, rootTurn, 0)
        if(r.timeout) break

        bestMove = r.move || bestMove
    }

    return bestMove
}

// Parses the FEN, runs a timeboxed alpha-beta search, and returns a ready-to-play move.
// Falls back to any legal move if the search times out before finishing depth 1 (e.g. a cold start),
// so a bot never silently stalls the game by returning nothing.
//
// Two optional "personality" knobs make weaker but still sensible opponents:
//   noise          - random error (in pawns) added to every position the bot evaluates, so it
//                    misjudges close positions the way a human does
//   blunderChance  - probability of skipping the search and playing a random legal move
const searchBot = ({ fen, turn, enPassant, seen = null, lastOwnMove = null, maxDepth, timeLimitMs, evaluate, noise = 0, blunderChance = 0 }) => {
    const board = parseFen(fen)
    const legal = generateAllMoves(board, turn, enPassant)
    if(!legal.length) return null

    let move = null

    if(blunderChance && Math.random() < blunderChance){
        move = legal[Math.floor(Math.random() * legal.length)]
    }
    else {
        const noisyEvaluate = noise
            ? (b, color, ep, toMove) => evaluate(b, color, ep, toMove) + (Math.random() * 2 - 1) * noise
            : evaluate
        const seenSet = Array.isArray(seen) ? new Set(seen) : null
        move = iterativeDeepening(board, turn, enPassant, maxDepth, timeLimitMs, noisyEvaluate, seenSet, lastOwnMove) || legal[0]
    }

    const piece = board[move.from]
    if(piece?.piece?.toLowerCase() == 'p' && promotionCells[turn].includes(move.to)){
        return {...move, promotion: 'q'}
    }

    return move
}

const EVALUATORS = {
    material: evaluateMaterial,
    central: evaluateCentral,
    positional: evaluatePositional,
    master: evaluateMaster
}

// Builds a complete bot module from a profile and search settings, e.g.
//   makeEngineBot({ id, name, description, category, icon, elo }, { maxDepth: 2, timeLimitMs: 800, eval: 'central', noise: 0.5 })
const makeEngineBot = (profile, { eval: evalName = 'material', ...search }) => {
    const evaluate = EVALUATORS[evalName]
    if(!evaluate) throw new Error(`Unknown evaluator "${evalName}" for bot ${profile.id}`)

    return {
        ...profile,
        play: ({ fen, turn, enPassant, seen, lastOwnMove }) => searchBot({ fen, turn, enPassant, seen, lastOwnMove, evaluate, ...search })
    }
}

module.exports = {
    pieceValues,
    promotionCells,
    generateAllMoves,
    iterativeDeepening,
    searchBot,
    makeEngineBot,
    evaluateWeighted,
    DEFAULT_WEIGHTS,
    evaluateMaterial,
    evaluateCentral,
    evaluatePositional,
    evaluateMaster
}
