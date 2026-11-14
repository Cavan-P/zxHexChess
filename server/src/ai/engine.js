const { parseFen, boardToFen, generateFilteredLegals, generateLegalMoves, isKingAttacked, promotionCells } = require('../game/moves')

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
const hexDistance = (a, b) => hexDistanceFromCenter([a[0] - b[0], a[1] - b[1], a[2] - b[2]])

// How far up the board a pawn has come, 1 (home edge) to 11 (promotion edge), from its own side.
// Black's view is the board turned 180 degrees, i.e. every coordinate negated.
const pawnRank = ([q, r], color) => color == 'white' ? 6 - r - Math.max(0, q) : 6 + r - Math.max(0, -q)

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
    const material = { white: 0, black: 0 }        // everything but kings
    const officers = { white: 0, black: 0 }        // everything but kings and pawns
    const kings = {}
    const pawnAdvance = weights.pawnAdvanceWeight ?? 0.03

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
        material[cell.color] += v
        if(lower == 'k') kings[cell.color] = cell.coords
        else if(lower != 'p') officers[cell.color] += v

        // Pawns are worth a little more the closer they get to promoting, so bots have a reason
        // to push them (and a plan in endgames) instead of shuffling pieces around.
        if(lower == 'p'){
            const rank = pawnRank(cell.coords, cell.color)
            score += sign * ((rank - 1) * pawnAdvance + (rank >= 9 ? 0.25 : 0))
        }

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

    // "Mop-up": when one side is clearly ahead and the other has little left, the winner wants the
    // losing king on the edge of the board and its own king close by - that's how mates happen.
    // Without this a winning bot sees no way to make progress and drifts (or repeats into a draw).
    const lead = material[maximizingColor] - material[enemyColor]
    if(Math.abs(lead) >= 4 && kings.white && kings.black){
        const winner = lead > 0 ? maximizingColor : enemyColor
        const loser = other(winner)
        if(officers[loser] <= 10){
            const mopUp = (weights.mopUpWeight ?? 1) * (
                0.15 * hexDistanceFromCenter(kings[loser]) +
                0.1 * (2 * CENTER - hexDistance(kings[winner], kings[loser]))
            )
            score += winner == maximizingColor ? mopUp : -mopUp
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

const MATERIAL_WEIGHTS = { ...DEFAULT_WEIGHTS, centralityWeight: 0.02, mobilityWeight: 0, kingSafetyWeight: 0 }
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

// Is `color`'s king attacked? Instead of generating moves for every enemy piece, stand on the
// king's cell and move outward as each piece type: if a rook-move from the king lands on an enemy
// rook or queen, that piece attacks the king, and likewise for bishops, knights, kings and pawns.
// (Every Gliński piece attacks symmetrically, so this is exact.) About 5 move generations instead of ~16.
const SUPER_PIECES = [['r', 'rq'], ['b', 'bq'], ['n', 'n'], ['k', 'k'], ['p', 'p']]

const kingAttacked = (board, color) => {
    let kingCell = -1
    for(let i = 0; i < board.length; i++){
        const c = board[i]
        if(c.color == color && (c.piece == 'k' || c.piece == 'K')){ kingCell = i; break }
    }
    if(kingCell < 0) return false

    const probe = board.slice()
    for(const [as, attackers] of SUPER_PIECES){
        probe[kingCell] = { ...board[kingCell], piece: as }
        for(const to of generateLegalMoves(probe, kingCell, color, null)){
            const target = board[to]
            if(target.piece && target.color != color && attackers.includes(target.piece.toLowerCase())) return true
        }
    }
    return false
}

// Plays a move on a copy of the board, sharing every untouched cell with the original (search
// never mutates cells, so copying all 91 of them for every move was pure overhead).
const playOnCopy = (board, from, to) => {
    const next = board.slice()
    const moving = board[from]
    next[to] = { piece: moving.piece, color: moving.color, cell: to, coords: board[to].coords }
    next[from] = { piece: '', color: '', cell: from, coords: moving.coords }
    return next
}

// Pseudo-legal moves (may leave the king in check; the search rejects those when it gets there).
const pseudoMoves = (board, turn, enPassant) => {
    const moves = []
    for(let i = 0; i < board.length; i++){
        if(board[i].color != turn) continue
        for(const to of generateLegalMoves(board, i, turn, enPassant)) moves.push({ from: i, to })
    }
    return moves
}

const hasLegalMove = (board, turn) => pseudoMoves(board, turn, null).some(m => !kingAttacked(playOnCopy(board, m.from, m.to), turn))

// Captures first, most valuable victim with the least valuable attacker ("MVV-LVA").
const orderScore = (board, move) => {
    const victim = board[move.to].piece
    if(!victim) return 0
    const attacker = board[move.from].piece.toLowerCase()
    return 100 * (pieceValues[victim.toLowerCase()] || 0) - (pieceValues[attacker] || 0) + 1000
}

const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2

// Repeating an earlier position counts as a draw, scored just below level so a bot that's ahead
// avoids it (no more shuffling the same piece back and forth) and a bot that's behind welcomes it.
const REPETITION_SCORE = -0.1

// Moving a piece back onto a cell it stood on in its last few moves (A->B->A, or A->B->C->A) is
// rarely the best idea; this nudge stops bots from shuffling pieces around when nothing stands out.
const SHUFFLE_PENALTY = 0.75

// `seen` (optional) is a Set of "fen|turn" keys for positions that already happened in the game.
// `recentOwnMoves` (optional) is the side to move's last few moves, oldest first, as [{ from, to }].
// `quiescence` (optional) keeps searching captures past the depth limit (see `quiesce`).
const QUIESCENCE_DEPTH = 6

const iterativeDeepening = (rootBoard, rootTurn, rootEnPassant, maxDepth, timeLimitMs, evaluate, seen = null, recentOwnMoves = [], quiescence = false) => {
    // Cells each of our pieces has recently stood on, traced back through our own recent moves.
    const recentCells = from => {
        const cells = new Set()
        let cell = from
        for(let i = recentOwnMoves.length - 1; i >= 0; i--){
            if(recentOwnMoves[i].to == cell){
                cell = recentOwnMoves[i].from
                cells.add(cell)
            }
        }
        return cells
    }

    let bestMove = null
    const startTime = Date.now()

    // The time limit only applies once depth 1 is done: a bot must always finish at least a
    // one-move search, or it would fall back to an arbitrary move (and shuffle the same piece).
    let enforceTime = false

    // Transposition table: positions already searched this move, keyed by board + side to move.
    // The same position is often reached by different move orders; this skips re-searching it and
    // remembers which move was best, so later passes try that move first.
    const table = new Map()
    const sameMove = (a, b) => a && b && a.from == b.from && a.to == b.to

    const staticScore = (board, turn, maximizingColor, enPassant) => {
        let s = evaluate(board, maximizingColor, enPassant, turn)
        if(kingAttacked(board, other(turn))) s += CHECK_BONUS
        return s
    }

    // Quiescence search: at the depth limit, keep playing out captures until the position is
    // quiet, so the bot never stops halfway through a trade ("I won a pawn!" - and then the
    // recapture it didn't look at takes a knight). The side to move may also "stand pat" and
    // decline to capture, so this only ever finds captures that actually help.
    const quiesce = (board, turn, alpha, beta, maximizingColor, ply, qDepth) => {
        if(enforceTime && Date.now() - startTime > timeLimitMs) return { timeout: true }
        if(kingAttacked(board, other(turn))) return { illegal: true }

        const maximizing = turn == maximizingColor
        const standPat = staticScore(board, turn, maximizingColor, null)

        if(kingAttacked(board, turn) && !hasLegalMove(board, turn)){
            return { score: turn != maximizingColor ? (MATE - ply) : (-MATE + ply) }
        }

        if(!qDepth) return { score: standPat }

        let value = standPat
        if(maximizing){ if(value >= beta) return { score: value }; alpha = Math.max(alpha, value) }
        else { if(value <= alpha) return { score: value }; beta = Math.min(beta, value) }

        const captures = pseudoMoves(board, turn, null).filter(m => board[m.to].piece)
        captures.sort((a, b) => orderScore(board, b) - orderScore(board, a))

        for(const move of captures){
            const r = quiesce(playOnCopy(board, move.from, move.to), other(turn), alpha, beta, maximizingColor, ply + 1, qDepth - 1)
            if(r.timeout) return r
            if(r.illegal) continue

            if(maximizing ? r.score > value : r.score < value) value = r.score
            if(maximizing) alpha = Math.max(alpha, value)
            else beta = Math.min(beta, value)
            if(beta <= alpha) break
        }

        return { score: value }
    }

    const search = (board, turn, enPassant, depth, alpha, beta, maximizingColor, ply) => {
        if(enforceTime && Date.now() - startTime > timeLimitMs) return { timeout: true }

        // The previous move left its own king in check: not a legal position.
        if(ply > 0 && kingAttacked(board, other(turn))) return { illegal: true }

        // Any position (at any depth) that already happened in the game counts as a draw by
        // repetition - including ones the opponent could steer back into with their reply.
        const fen = ply > 0 ? boardToFen(board) : null
        if(fen && seen?.size && seen.has(`${fen}|${turn}`)) return { score: REPETITION_SCORE, move: null }

        const inCheck = kingAttacked(board, turn)
        const mateScore = _ => turn != maximizingColor ? (MATE - ply) : (-MATE + ply)

        if(!depth && quiescence && ply > 0) return quiesce(board, turn, alpha, beta, maximizingColor, ply, QUIESCENCE_DEPTH)

        if(!depth){
            // Full mate detection needs a legal move search, so at leaves only do it when in check
            // (a stalemate at a leaf is rare enough to ignore).
            if(inCheck && !hasLegalMove(board, turn)) return { score: mateScore(), move: null }

            let s = evaluate(board, maximizingColor, enPassant, turn)

            const enemy = other(turn)
            if(kingAttacked(board, enemy)) s += CHECK_BONUS

            return { score: s, move: null }
        }

        const key = fen ? fen + turn : null
        const cached = key && table.get(key)
        if(cached && cached.depth >= depth){
            if(cached.flag == TT_EXACT) return { score: cached.score, move: cached.move }
            if(cached.flag == TT_LOWER && cached.score >= beta) return { score: cached.score, move: cached.move }
            if(cached.flag == TT_UPPER && cached.score <= alpha) return { score: cached.score, move: cached.move }
        }

        const moves = pseudoMoves(board, turn, ply == 0 ? enPassant : null)

        // At the root, shuffle before sorting so equally-good moves are chosen at random.
        // Otherwise ties go to whichever piece comes first on the board, and a bot with nothing
        // better to do keeps moving that same piece (often a back-rank rook) around.
        if(ply == 0){
            for(let i = moves.length - 1; i > 0; i--){
                const j = Math.floor(Math.random() * (i + 1))
                ;[moves[i], moves[j]] = [moves[j], moves[i]]
            }
        }

        const hint = cached?.move || (ply == 0 ? bestMove : null)
        const ordering = new Map(moves.map(m => [m, sameMove(m, hint) ? 1e9 : orderScore(board, m)]))
        moves.sort((a, b) => ordering.get(b) - ordering.get(a))

        const alphaStart = alpha, betaStart = beta
        let bestLocal = null
        let legalCount = 0
        const maximizing = turn == maximizingColor
        let value = maximizing ? -Infinity : Infinity

        for(const move of moves){
            const nextBoard = playOnCopy(board, move.from, move.to)

            // En passant only lasts one move, so children search without it.
            const r = search(nextBoard, other(turn), null, depth - 1, alpha, beta, maximizingColor, ply + 1)
            if(r.timeout) return r
            if(r.illegal) continue
            legalCount++

            let score = r.score
            if(ply == 0 && !board[move.to].piece && recentCells(move.from).has(move.to)) score -= SHUFFLE_PENALTY

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

        if(!legalCount) return { score: inCheck ? mateScore() : 0, move: null }

        if(key){
            const flag = value <= alphaStart ? TT_UPPER : value >= betaStart ? TT_LOWER : TT_EXACT
            table.set(key, { depth, score: value, flag, move: bestLocal })
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
// `timeBudgetMs` (optional) caps thinking time when the bot is on a clock.
const searchBot = ({ fen, turn, enPassant, seen = null, recentOwnMoves = null, lastOwnMove = null, maxDepth, timeLimitMs, timeBudgetMs = null, evaluate, noise = 0, blunderChance = 0, quiescence = false }) => {
    if(timeBudgetMs != null) timeLimitMs = Math.min(timeLimitMs, timeBudgetMs)
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
        const recent = recentOwnMoves || (lastOwnMove ? [lastOwnMove] : [])
        move = iterativeDeepening(board, turn, enPassant, maxDepth, timeLimitMs, noisyEvaluate, seenSet, recent, quiescence) || legal[0]
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
        play: state => searchBot({ ...state, evaluate, ...search })
    }
}

module.exports = {
    kingAttacked,
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
