const { parseFen, boardToFen, generateFilteredLegals, isKingAttacked, promotionCells } = require('../game/moves')
const { fastMoves, forEachCover, rookRays, bishopRays, knightJumps, kingSteps, pawnCaptures, pawnForward } = require('./fastMoves')

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
// cheapest[colour][cell] is the value of that side's cheapest piece covering the cell (Infinity if
// none). Reused buffers: evaluation is never re-entered, so there's no need to allocate per call.
const NONE = Infinity
const cheapestBuffers = { white: new Float64Array(91), black: new Float64Array(91) }

const coverageMap = (board, enPassant, values) => {
    const cheapest = cheapestBuffers
    cheapest.white.fill(NONE)
    cheapest.black.fill(NONE)
    const mobility = { white: 0, black: 0 }

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const color = cell.color
        const value = cell.piece.toLowerCase() == 'k' ? 100 : (values[cell.piece.toLowerCase()] || 0)
        const covers = cheapest[color]

        forEachCover(board, i, color, enPassant, to => {
            if(board[to].color != color) mobility[color]++
            if(value < covers[to]) covers[to] = value
        })
    }

    return { cheapest, mobility }
}

// What `color` stands to lose on `cell` if the opponent captures there: the whole piece if it's
// undefended, the difference if the attacker is cheaper, nothing otherwise.
const exposure = (cell, color, value, cheapest) => {
    const enemy = other(color)
    if(cheapest[enemy][cell] == NONE) return 0
    if(cheapest[color][cell] == NONE) return value
    return Math.max(0, value - cheapest[enemy][cell])
}

// The six corner cells, where a lone king is easiest to mate.
const CORNERS = [[5, -5, 0], [5, 0, -5], [0, 5, -5], [-5, 5, 0], [-5, 0, 5], [0, -5, 5]]

const hexDistanceFromCenter = coords => Math.max(Math.abs(coords[0]), Math.abs(coords[1]), Math.abs(coords[2]))
const hexDistance = (a, b) => hexDistanceFromCenter([a[0] - b[0], a[1] - b[1], a[2] - b[2]])

// How far up the board a pawn has come, 1 (home edge) to 11 (promotion edge), from its own side.
// Black's view is the board turned 180 degrees, i.e. every coordinate negated.
const pawnRank = ([q, r], color) => color == 'white' ? 6 - r - Math.max(0, q) : 6 + r - Math.max(0, -q)

// ---- Tables for the extended evaluation terms (only used by genomes that switch them on) ----
// Hex facts: a pawn's file is its q coordinate (it moves along [0,∓1,±1]); bishops never change
// the (q - r) mod 3 "tone" of their cell; a colour-c pawn on any cell in pawnCaptures[other(c)][i]
// protects cell i (the two sides' capture directions are exact opposites).
const NUM = 91
const cellCoords = parseFen('9'.repeat(10) + '1').map(c => c.coords)
const cellTone = cellCoords.map(([q, r]) => (((q - r) % 3) + 3) % 3)
const fileOf = cellCoords.map(([q]) => q + CENTER)          // 0..10
const forwardRay = {}, passedStoppers = {}, outpostStoppers = {}, shieldCells = {}, cellRank = {}
for(const c of ['white', 'black']){
    forwardRay[c] = [...Array(NUM).keys()].map(i => {
        const out = []
        for(let j = pawnForward[c][i]; j >= 0; j = pawnForward[c][j]) out.push(j)
        return out
    })
    // Cells an enemy pawn could stand on now and still, by moving down the board, block this pawn
    // or capture it on its way to promotion. None of them occupied = a passed pawn.
    passedStoppers[c] = [...Array(NUM).keys()].map(i => {
        const set = new Set(forwardRay[c][i])
        for(const f of [i, ...forwardRay[c][i]]) for(const e of pawnCaptures[c][f]){ set.add(e); forwardRay[c][e].forEach(x => set.add(x)) }
        return [...set]
    })
    // Cells an enemy pawn could stand on now and one day attack cell i from.
    outpostStoppers[c] = [...Array(NUM).keys()].map(i => {
        const set = new Set()
        for(const e of pawnCaptures[c][i]){ set.add(e); forwardRay[c][e].forEach(x => set.add(x)) }
        return [...set]
    })
    // The pawn cover in front of a king: the cell ahead of it and the two it "sees" diagonally.
    shieldCells[c] = [...Array(NUM).keys()].map(i => [pawnForward[c][i], ...pawnCaptures[c][i]].filter(j => j >= 0))
    cellRank[c] = cellCoords.map(xy => pawnRank(xy, c))
}
const kingZone = [...Array(NUM).keys()].map(i => [i, ...kingSteps[i]])
const ATTACK_UNITS = { p: 1, n: 2, b: 2, r: 3, q: 5, k: 0 }
const KING_DANGER_CAP = 20
// Officer material at the start (per side: Q, 2R, 3B, 2N at standard values), for the game phase.
const PHASE_VALUES = { n: 3, b: 3, r: 5, q: 9 }
const START_OFFICERS = 2 * (9 + 2 * 5 + 3 * 3 + 2 * 3)

// 1 = all officers on the board (middlegame), 0 = none left (pure endgame).
const gamePhase = board => {
    let officers = 0
    for(let i = 0; i < board.length; i++){
        const p = board[i].piece
        if(p) officers += PHASE_VALUES[p.toLowerCase()] || 0
    }
    return Math.min(1, officers / START_OFFICERS)
}

// coverageMap plus what the extended terms need: mobility per piece type and how hard each king's
// zone (its cell and every cell it could step to) is attacked, in ATTACK_UNITS.
const extendedCoverage = { mobByType: { white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } }, zoneUnits: { white: 0, black: 0 } }
const zoneMarks = new Uint8Array(NUM)       // bit 1: in white king's zone, bit 2: black's
const coverageMapExtended = (board, enPassant, values) => {
    const cheapest = cheapestBuffers
    cheapest.white.fill(NONE)
    cheapest.black.fill(NONE)
    const mobility = { white: 0, black: 0 }
    const { mobByType, zoneUnits } = extendedCoverage
    for(const c of ['white', 'black']){ const m = mobByType[c]; m.p = m.n = m.b = m.r = m.q = m.k = 0; zoneUnits[c] = 0 }

    zoneMarks.fill(0)
    for(let i = 0; i < board.length; i++){
        const p = board[i].piece
        if(p == 'K') for(const j of kingZone[i]) zoneMarks[j] |= 1
        else if(p == 'k') for(const j of kingZone[i]) zoneMarks[j] |= 2
    }

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const color = cell.color
        const lower = cell.piece.toLowerCase()
        const value = lower == 'k' ? 100 : (values[lower] || 0)
        const covers = cheapest[color]
        const enemyZone = color == 'white' ? 2 : 1
        const units = ATTACK_UNITS[lower]
        const byType = mobByType[color]
        let zoneHits = 0

        forEachCover(board, i, color, enPassant, to => {
            if(board[to].color != color){ mobility[color]++; byType[lower]++ }
            if(value < covers[to]) covers[to] = value
            if(zoneMarks[to] & enemyZone) zoneHits++
        })
        // Pawn pushes aren't attacks: count only the two capture cells for pawns.
        if(lower == 'p'){
            zoneHits = 0
            for(const j of pawnCaptures[color][i]) if(zoneMarks[j] & enemyZone) zoneHits++
        }
        zoneUnits[other(color)] += zoneHits * units
    }

    return { cheapest, mobility, mobByType, zoneUnits }
}

// Which optional terms a weights object switches on, worked out once per object.
const compiledWeights = new WeakMap()
const EXTENDED_KEYS = ['passedPawnWeight', 'isolatedPawnWeight', 'doubledPawnWeight', 'protectedPawnWeight', 'kingDangerWeight', 'kingShieldWeight',
    'kingCentralityEnd', 'bishopSetWeight', 'rookOpenWeight', 'rookHalfOpenWeight', 'knightOutpostWeight', 'threatWeight', 'tempoWeight', 'tradeDownWeight']
const compileWeights = weights => {
    let cw = compiledWeights.get(weights)
    if(cw) return cw
    cw = {}
    for(const k of EXTENDED_KEYS) cw[k] = weights[k] || 0
    cw.centralityBonus = weights.centralityBonus || null
    cw.mobilityBonus = weights.mobilityBonus || null
    cw.end = weights.end || null
    cw.extended = Boolean(cw.end || cw.centralityBonus || cw.mobilityBonus || EXTENDED_KEYS.some(k => cw[k]))
    cw.pv = { p: 0, n: 0, b: 0, r: 0, q: 0 }    // per-call scratch for tapered piece values
    compiledWeights.set(weights, cw)
    return cw
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

    // Genomes with the newer knobs get the extended evaluation; every other weights object (all the
    // hand-written tiers, Ada v1) runs exactly the original code below - see test/evalBaseline.test.js.
    const cw = compileWeights(weights)
    const ext = cw.extended
    let pv = weights.pieceValues
    let pawnAdvance = weights.pawnAdvanceWeight ?? 0.03
    let passedW = cw.passedPawnWeight
    let phase = 1
    if(ext){
        phase = gamePhase(board)
        if(cw.end){
            // Tapered evaluation: blend midgame and endgame values by how much material is left.
            const mid = weights.pieceValues, end = cw.end.pieceValues || mid, out = cw.pv, f = 1 - phase
            out.p = phase * mid.p + f * (end.p ?? mid.p)
            out.n = phase * mid.n + f * (end.n ?? mid.n)
            out.b = phase * mid.b + f * (end.b ?? mid.b)
            out.r = phase * mid.r + f * (end.r ?? mid.r)
            out.q = phase * mid.q + f * (end.q ?? mid.q)
            pv = out
            pawnAdvance = phase * pawnAdvance + (1 - phase) * (cw.end.pawnAdvanceWeight ?? pawnAdvance)
            passedW = phase * passedW + (1 - phase) * (cw.end.passedPawnWeight ?? passedW)
        }
    }

    const { cheapest, mobility, mobByType, zoneUnits } = ext ? coverageMapExtended(board, enPassant, weights.pieceValues) : coverageMap(board, enPassant, weights.pieceValues)
    const enemyColor = other(maximizingColor)
    const worstExposure = { white: 0, black: 0 }
    const material = { white: 0, black: 0 }        // everything but kings
    const officers = { white: 0, black: 0 }        // everything but kings and pawns
    const kings = {}
    const kingCells = {}

    if(weights.mobilityWeight){
        score += (mobility[maximizingColor] - mobility[enemyColor]) * weights.mobilityWeight
    }

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell?.piece) continue

        const lower = cell.piece.toLowerCase()
        const friendly = cell.color == maximizingColor
        const sign = friendly ? 1 : -1

        const v = lower == 'k' ? 0 : (pv[lower] || 0)
        score += sign * v
        material[cell.color] += v
        if(lower == 'k'){ kings[cell.color] = cell.coords; kingCells[cell.color] = i }
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

        if(ext && cw.centralityBonus && lower != 'k' && lower != 'p'){
            score += sign * (CENTER - hexDistanceFromCenter(cell.coords)) * (cw.centralityBonus[lower] || 0)
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
            // ...and boxed in: every cell the losing king could step to safely is one more escape.
            let escapes = 0
            for(const j of kingSteps[kingCells[loser]]){
                if(board[j].color != loser && cheapest[winner][j] == NONE) escapes++
            }
            const cornerDistance = Math.min(...CORNERS.map(c => hexDistance(c, kings[loser])))
            const mopUp = (weights.mopUpWeight ?? 1) * (
                0.15 * hexDistanceFromCenter(kings[loser]) +
                0.1 * (2 * CENTER - hexDistance(kings[winner], kings[loser])) +
                0.12 * (12 - escapes) +
                0.04 * (CENTER - cornerDistance)
            )
            score += winner == maximizingColor ? mopUp : -mopUp
        }
    }

    if(weights.kingSafetyWeight){
        const k = kings[maximizingColor]
        if(k){
            let defenders = 0
            for(let i = 0; i < board.length; i++){
                const cell = board[i]
                if(!cell.piece || cell.color != maximizingColor || i == kingCells[maximizingColor]) continue
                const [q, r, s] = cell.coords
                if(Math.max(Math.abs(q - k[0]), Math.abs(r - k[1]), Math.abs(s - k[2])) <= 2) defenders++
            }
            score += defenders * weights.kingSafetyWeight
        }
    }

    if(ext) score += extendedTerms(board, maximizingColor, toMove, cw, { phase, pv, passedW, cheapest, mobByType, zoneUnits, material, kingCells })

    return score
}

// The newer evaluation terms, from `maximizingColor`'s point of view. Each is skipped when its
// weight is 0. See genome.js for what each knob means and its range.
const pawnFiles = { white: new Int8Array(11), black: new Int8Array(11) }
const pawnAt = { white: new Uint8Array(NUM), black: new Uint8Array(NUM) }   // 1 where that side has a pawn
const anyAt = (cells, at) => { for(let k = 0; k < cells.length; k++) if(at[cells[k]]) return true; return false }
const extendedTerms = (board, me, toMove, cw, { phase, pv, passedW, cheapest, mobByType, zoneUnits, material, kingCells }) => {
    const enemy = other(me)
    let score = 0
    const side = c => c == me ? 1 : -1

    // Per-piece mobility, on top of the shared mobility weight.
    if(cw.mobilityBonus){
        for(const k of ['n', 'b', 'r', 'q']){
            const w = cw.mobilityBonus[k]
            if(w) score += (mobByType[me][k] - mobByType[enemy][k]) * w
        }
    }

    // King danger: attacks on the cells around each king, squared (one attacker is nothing, four
    // usually means mate). Fades out as material comes off.
    if(cw.kingDangerWeight){
        const d = c => Math.min(KING_DANGER_CAP, zoneUnits[c]) ** 2
        score += (d(enemy) - d(me)) * cw.kingDangerWeight * phase
    }

    if(cw.tempoWeight) score += toMove == me ? cw.tempoWeight : -cw.tempoWeight

    // Trading down when ahead: a lead counts for more the fewer pieces are left.
    if(cw.tradeDownWeight){
        const start = 2 * (9 * pv.p + 2 * pv.n + 3 * pv.b + 2 * pv.r + pv.q)
        const lead = material[me] - material[enemy]
        score += lead * Math.max(0, 1 - (material.white + material.black) / start) * cw.tradeDownWeight
    }

    const needPawns = passedW || cw.isolatedPawnWeight || cw.doubledPawnWeight || cw.protectedPawnWeight || cw.knightOutpostWeight || cw.rookOpenWeight || cw.rookHalfOpenWeight || cw.kingShieldWeight
    const needPieces = needPawns || cw.bishopSetWeight || cw.threatWeight
    if(!needPieces && !cw.kingCentralityEnd) return score

    pawnFiles.white.fill(0)
    pawnFiles.black.fill(0)
    pawnAt.white.fill(0)
    pawnAt.black.fill(0)
    for(let i = 0; i < board.length; i++){
        const p = board[i].piece
        if(p == 'P'){ pawnFiles.white[fileOf[i]]++; pawnAt.white[i] = 1 }
        else if(p == 'p'){ pawnFiles.black[fileOf[i]]++; pawnAt.black[i] = 1 }
    }

    const tones = { white: 0, black: 0 }       // bit per bishop tone still on the board
    const threats = { white: 0, black: 0 }     // pieces attacked by something cheaper

    for(let i = 0; i < board.length; i++){
        const cell = board[i]
        if(!cell.piece) continue
        const c = cell.color, e = other(c), s = side(c)
        const lower = cell.piece.toLowerCase()

        if(cw.threatWeight && lower != 'k'){
            const v = pv[lower] || 0
            if(cheapest[e][i] < v) threats[c]++
        }

        if(lower == 'p'){
            if(passedW && !anyAt(passedStoppers[c][i], pawnAt[e])){
                const r = cellRank[c][i] - 1
                score += s * r * r * passedW
            }
            const f = fileOf[i]
            if(cw.isolatedPawnWeight && !(f > 0 && pawnFiles[c][f - 1]) && !(f < 10 && pawnFiles[c][f + 1])) score -= s * cw.isolatedPawnWeight
            if(cw.protectedPawnWeight && anyAt(pawnCaptures[e][i], pawnAt[c])) score += s * cw.protectedPawnWeight
        }
        else if(lower == 'b') tones[c] |= 1 << cellTone[i]
        else if(lower == 'n'){
            if(cw.knightOutpostWeight && cellRank[c][i] >= 5 && anyAt(pawnCaptures[e][i], pawnAt[c]) && !anyAt(outpostStoppers[c][i], pawnAt[e])){
                score += s * cw.knightOutpostWeight
            }
        }
        else if(lower == 'r' && (cw.rookOpenWeight || cw.rookHalfOpenWeight)){
            const mine = pawnAt[c], their = pawnAt[e]
            for(const ray of rookRays[i]){
                let own = false, theirs = false
                for(let k = 0; k < ray.length; k++){ const j = ray[k]; if(mine[j]) { own = true; break } if(their[j]) theirs = true }
                if(!own) score += s * (theirs ? cw.rookHalfOpenWeight : cw.rookOpenWeight)
            }
        }
    }

    if(cw.doubledPawnWeight){
        for(let f = 0; f < 11; f++){
            if(pawnFiles[me][f] > 1) score -= (pawnFiles[me][f] - 1) * cw.doubledPawnWeight
            if(pawnFiles[enemy][f] > 1) score += (pawnFiles[enemy][f] - 1) * cw.doubledPawnWeight
        }
    }

    if(cw.bishopSetWeight){
        if(tones[me] == 7) score += cw.bishopSetWeight
        if(tones[enemy] == 7) score -= cw.bishopSetWeight
    }

    if(cw.threatWeight) score += (threats[enemy] - threats[me]) * cw.threatWeight

    for(const c of ['white', 'black']){
        const k = kingCells[c]
        if(k == null) continue
        if(cw.kingShieldWeight){
            let shield = 0
            for(const j of shieldCells[c][k]) if(pawnAt[c][j]) shield++
            score += side(c) * shield * cw.kingShieldWeight * phase
        }
        if(cw.kingCentralityEnd){
            score += side(c) * (CENTER - hexDistanceFromCenter(cellCoords[k])) * cw.kingCentralityEnd * (1 - phase)
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

const kingAttacked = (board, color) => {
    let kingCell = -1
    for(let i = 0; i < board.length; i++){
        const c = board[i]
        if(c.color == color && (c.piece == 'k' || c.piece == 'K')){ kingCell = i; break }
    }
    if(kingCell < 0) return false

    const enemyIs = (j, letters) => {
        const t = board[j]
        return t.piece && t.color != color && letters.includes(t.piece.toLowerCase())
    }
    const slideHits = (rays, letters) => {
        for(const r of rays) for(const j of r){
            if(!board[j].piece) continue
            if(enemyIs(j, letters)) return true
            break
        }
        return false
    }

    return slideHits(rookRays[kingCell], 'rq') || slideHits(bishopRays[kingCell], 'bq') ||
        knightJumps[kingCell].some(j => enemyIs(j, 'n')) ||
        kingSteps[kingCell].some(j => enemyIs(j, 'k')) ||
        pawnCaptures[color][kingCell].some(j => enemyIs(j, 'p'))
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
        for(const to of fastMoves(board, i, turn, enPassant)) moves.push({ from: i, to })
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

// Blind spots: a human-style way to be weaker. Each move has a chance of simply not being
// noticed - by the bot for its own moves (so it misses a mate in 1 or a free piece) and for yours
// (so it walks into a capture it never saw coming). Which moves are invisible is decided once per
// turn, so the bot is consistently blind to them while it thinks. Captures stand out more than
// quiet moves, long moves are easier to miss, and when in check every option gets a proper look.
const blindSpotCheck = (oversight, seed) => (board, move, inCheck) => {
    let p = oversight
    if(board[move.to].piece) p *= 0.6
    if(inCheck) p *= 0.3
    const [fq, fr] = board[move.from].coords, [tq, tr] = board[move.to].coords
    if(Math.max(Math.abs(fq - tq), Math.abs(fr - tr), Math.abs(fq + fr - tq - tr)) >= 3) p *= 1.3

    let h = (seed ^ Math.imul(move.from + 1, 0x9E3779B1) ^ Math.imul(move.to + 1, 0x85EBCA77)) >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D) >>> 0
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B) >>> 0
    h = (h ^ (h >>> 16)) >>> 0
    return h / 4294967296 < Math.min(p, 0.9)
}

// Opening variety: early in the game, any move within this many pawns of the best one can be
// played (closer ones more often), so engine-vs-engine games don't follow the same 20 moves every
// time. It fades out over the first OPENING_PLIES half-moves and never gives up a forced mate.
const VARIETY_MARGIN = 0.15

// Pruning helpers (see null-move pruning and late move reductions in the search).
const NULL_WINDOW = 0.001
const hasOfficers = (board, color) => {
    for(let i = 0; i < board.length; i++){
        const c = board[i]
        if(c.color == color && c.piece && 'nbrqNBRQ'.includes(c.piece)) return true
    }
    return false
}
const OPENING_PLIES = 16

const iterativeDeepening = (rootBoard, rootTurn, rootEnPassant, maxDepth, timeLimitMs, evaluate, seen = null, recentOwnMoves = [], quiescence = false, oversight = 0, { variety = 0, extendChecks = false, prune = false, checkBonus = CHECK_BONUS } = {}) => {
    const nullMoves = prune === true || prune == 'null'
    // Reductions would cut short exactly the near-best alternatives opening variety picks from,
    // so they only start once the opening is over.
    const reductions = (prune === true || prune == 'lmr') && !variety
    // Root moves scored within `variety` of the best, from the last finished iteration.
    let rootScores = null
    let iterationScores = null
    let rootDepth = 0
    const isBlind = oversight ? blindSpotCheck(oversight, (Math.random() * 4294967296) >>> 0) : null
    // Splits moves into the ones this bot notices and the ones it doesn't. The unnoticed ones are
    // only looked at if none of the noticed ones turn out to be legal.
    const noticed = (board, moves, inCheck) => {
        if(!isBlind) return { moves, visible: moves.length }
        const seen = [], missed = []
        for(const m of moves) (isBlind(board, m, inCheck) ? missed : seen).push(m)
        return { moves: seen, missed, visible: seen.length }
    }

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

    // Move ordering memory: "killer" quiet moves that caused a cutoff at each depth, and a history
    // score for every from->to pair that has caused cutoffs anywhere. Trying good moves first lets
    // alpha-beta prune far more of the tree.
    const killers = []
    const history = new Int32Array(91 * 91)
    const quietScore = (m, ply) => {
        const k = killers[ply]
        if(k && sameMove(m, k[0])) return 900
        if(k && sameMove(m, k[1])) return 800
        return Math.min(700, history[m.from * 91 + m.to])
    }

    const staticScore = (board, turn, maximizingColor, enPassant) => {
        let s = evaluate(board, maximizingColor, enPassant, turn)
        if(kingAttacked(board, other(turn))) s += checkBonus
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

        const captures = noticed(board, pseudoMoves(board, turn, null).filter(m => board[m.to].piece), false).moves
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

    const search = (board, turn, enPassant, depth, alpha, beta, maximizingColor, ply, allowNull = true) => {
        if(enforceTime && Date.now() - startTime > timeLimitMs) return { timeout: true }

        // The previous move left its own king in check: not a legal position.
        if(ply > 0 && kingAttacked(board, other(turn))) return { illegal: true }

        // Any position (at any depth) that already happened in the game counts as a draw by
        // repetition - including ones the opponent could steer back into with their reply.
        const fen = ply > 0 ? boardToFen(board) : null
        if(fen && seen?.size && seen.has(`${fen}|${turn}`)) return { score: REPETITION_SCORE, move: null }

        const inCheck = kingAttacked(board, turn)
        const mateScore = _ => turn != maximizingColor ? (MATE - ply) : (-MATE + ply)

        // Check extension: when a side is in check, look one move further. Checks are forcing, so
        // this costs little and lets the search see long mating attacks through to the end.
        if(extendChecks && inCheck && ply > 0 && ply < rootDepth * 2 + 2) depth++

        if(!depth && quiescence && ply > 0) return quiesce(board, turn, alpha, beta, maximizingColor, ply, QUIESCENCE_DEPTH)

        if(!depth){
            // Full mate detection needs a legal move search, so at leaves only do it when in check
            // (a stalemate at a leaf is rare enough to ignore).
            if(inCheck && !hasLegalMove(board, turn)) return { score: mateScore(), move: null }

            let s = evaluate(board, maximizingColor, enPassant, turn)

            const enemy = other(turn)
            if(kingAttacked(board, enemy)) s += checkBonus

            return { score: s, move: null }
        }

        const key = fen ? fen + turn : null
        const cached = key && table.get(key)
        if(cached && cached.depth >= depth){
            if(cached.flag == TT_EXACT) return { score: cached.score, move: cached.move }
            if(cached.flag == TT_LOWER && cached.score >= beta) return { score: cached.score, move: cached.move }
            if(cached.flag == TT_UPPER && cached.score <= alpha) return { score: cached.score, move: cached.move }
        }

        // Null-move pruning: let the side to move "pass". If the position is still so good that
        // the opponent can't bring it back within the window even with a free move, searching it
        // properly is a waste of time. Skipped in check, right after another pass, and when only
        // pawns are left (where passing can genuinely be better than any move: zugzwang).
        const maximizing = turn == maximizingColor
        if(nullMoves && allowNull && ply > 0 && depth >= 3 && !inCheck && Number.isFinite(maximizing ? beta : alpha) && hasOfficers(board, turn)
            // Only worth trying when the position already looks good for the side to move.
            && (maximizing ? staticScore(board, turn, maximizingColor, null) >= beta : staticScore(board, turn, maximizingColor, null) <= alpha)){
            const R = depth >= 6 ? 3 : 2
            const r = maximizing
                ? search(board, other(turn), null, depth - 1 - R, beta - NULL_WINDOW, beta, maximizingColor, ply + 1, false)
                : search(board, other(turn), null, depth - 1 - R, alpha, alpha + NULL_WINDOW, maximizingColor, ply + 1, false)
            if(r.timeout) return r
            if(!r.illegal && Math.abs(r.score) < MATE - 1000){
                if(maximizing && r.score >= beta) return { score: beta, move: null }
                if(!maximizing && r.score <= alpha) return { score: alpha, move: null }
            }
        }

        const { moves, missed } = noticed(board, pseudoMoves(board, turn, ply == 0 ? enPassant : null), inCheck)

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
        const ordering = new Map(moves.map(m => [m, sameMove(m, hint) ? 1e9 : (board[m.to].piece ? orderScore(board, m) : quietScore(m, ply))]))
        moves.sort((a, b) => ordering.get(b) - ordering.get(a))

        const alphaStart = alpha, betaStart = beta
        let bestLocal = null
        let legalCount = 0
        let value = maximizing ? -Infinity : Infinity

        // Moves the bot didn't notice go last, and only count if nothing it did notice was legal.
        const visibleCount = moves.length
        if(missed?.length) moves.push(...missed)

        for(let i = 0; i < moves.length; i++){
            const move = moves[i]
            if(i >= visibleCount && legalCount) break
            const nextBoard = playOnCopy(board, move.from, move.to)

            // Late move reductions: moves are ordered best-first, so a quiet move far down the
            // list is rarely the best. Look at it one move shallower with a narrow window first,
            // and only search it properly if it turns out better than expected.
            let r = null
            const quiet = !board[move.to].piece && !(board[move.from].piece.toLowerCase() == 'p' && promotionCells[turn].includes(move.to))
            // Checks are never reduced: they're the forcing moves tactics are made of.
            if(reductions && ply > 0 && depth >= 3 && i >= 3 && i < visibleCount && quiet && !inCheck && Number.isFinite(maximizing ? alpha : beta)
                && !kingAttacked(nextBoard, other(turn))){
                const reduction = i >= 8 && depth >= 5 ? 2 : 1
                r = maximizing
                    ? search(nextBoard, other(turn), null, depth - 1 - reduction, alpha, alpha + NULL_WINDOW, maximizingColor, ply + 1)
                    : search(nextBoard, other(turn), null, depth - 1 - reduction, beta - NULL_WINDOW, beta, maximizingColor, ply + 1)
                if(r.timeout) return r
                // Promising after all (or illegal): fall through to the full search.
                if(r.illegal || (maximizing ? r.score > alpha : r.score < beta)) r = null
            }

            // En passant only lasts one move, so children search without it.
            if(!r) r = search(nextBoard, other(turn), null, depth - 1, alpha, beta, maximizingColor, ply + 1)
            if(r.timeout) return r
            if(r.illegal) continue
            legalCount++

            let score = r.score
            if(ply == 0 && !board[move.to].piece && recentCells(move.from).has(move.to)) score -= SHUFFLE_PENALTY

            if(maximizing ? score > value : score < value){
                value = score
                bestLocal = move
            }
            if(ply == 0 && variety && score > alpha) iterationScores.push({ move, score })

            // With opening variety on, the root keeps its window open a little below the best
            // score, so moves that are nearly as good get exact scores too.
            if(maximizing){
                alpha = Math.max(alpha, ply == 0 && variety ? value - variety : value)
            }
            else {
                beta = Math.min(beta, value)
            }

            if(beta <= alpha){
                if(!board[move.to].piece){
                    const k = killers[ply] || (killers[ply] = [null, null])
                    if(!sameMove(move, k[0])){ k[1] = k[0]; k[0] = move }
                    history[move.from * 91 + move.to] += depth * depth
                }
                break
            }
        }

        if(!legalCount) return { score: inCheck ? mateScore() : 0, move: null }

        if(key){
            const flag = value <= alphaStart ? TT_UPPER : value >= betaStart ? TT_LOWER : TT_EXACT
            table.set(key, { depth, score: value, flag, move: bestLocal })
        }

        return { score: value, move: bestLocal }
    }

    let bestScore = null
    for(let depth = 1; depth <= maxDepth; depth++){
        enforceTime = depth > 1
        rootDepth = depth
        iterationScores = []
        const r = search(rootBoard, rootTurn, rootEnPassant, depth, -Infinity, Infinity, rootTurn, 0)
        if(r.timeout) break

        bestMove = r.move || bestMove
        bestScore = r.score
        rootScores = iterationScores

        // Found a forced mate: looking deeper can't find a faster one.
        if(r.score > MATE - 1000) break
    }

    // Pick among the near-best moves, weighting each by how close it is to the best.
    if(variety && rootScores?.length && bestScore != null && Math.abs(bestScore) < MATE - 1000){
        // King walks don't count as variety (unless the king move really is the best one).
        const close = rootScores.filter(c => c.score > bestScore - variety &&
            (c.move == bestMove || rootBoard[c.move.from].piece.toLowerCase() != 'k'))
        const weights = close.map(c => 1 - (bestScore - c.score) / variety * 0.8)
        let pick = Math.random() * weights.reduce((a, b) => a + b, 0)
        for(let i = 0; i < close.length; i++){
            pick -= weights[i]
            if(pick <= 0) return close[i].move
        }
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
//   oversight      - 0-1, how often a move goes unnoticed (see blindSpotCheck): the human way to
//                    miss a mate in 1 or hang a piece
// `timeBudgetMs` (optional) caps thinking time when the bot is on a clock.
const searchBot = ({ fen, turn, enPassant, seen = null, recentOwnMoves = null, lastOwnMove = null, ply = null, maxDepth, timeLimitMs, timeBudgetMs = null, evaluate, noise = 0, blunderChance = 0, quiescence = false, oversight = 0, prune = null, checkBonus = CHECK_BONUS }) => {
    if(timeBudgetMs != null) timeLimitMs = Math.min(timeLimitMs, timeBudgetMs)
    const board = parseFen(fen)

    // The stronger bots (4+ moves deep) get the full treatment: a deeper search as pieces come off
    // (with fewer pieces each move is far cheaper, so the time limit becomes the real cap), check
    // extensions, late move reductions, and some variety in the opening.
    //
    // Null-move pruning is available too (prune: 'null' or true) but is off: in test matches at 1s
    // a move, reductions alone scored 8.5/12 against the old search, null-move 8/12, both 7/12.
    const strong = maxDepth >= 4
    let depthLimit = maxDepth
    if(strong){
        const pieces = board.filter(c => c.piece && c.piece.toLowerCase() != 'k').length
        depthLimit += pieces <= 6 ? 8 : pieces <= 10 ? 5 : pieces <= 16 ? 2 : 0
    }
    const variety = strong && ply != null && ply < OPENING_PLIES ? VARIETY_MARGIN * (1 - ply / OPENING_PLIES) : 0
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
        move = iterativeDeepening(board, turn, enPassant, depthLimit, timeLimitMs, noisyEvaluate, seenSet, recent, quiescence, oversight, { variety, extendChecks: strong, prune: prune ?? (strong ? 'lmr' : false), checkBonus }) || legal[0]
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
    PRESET_WEIGHTS: { material: MATERIAL_WEIGHTS, central: CENTRAL_WEIGHTS, positional: POSITIONAL_WEIGHTS, master: MASTER_WEIGHTS },
    evaluateMaterial,
    evaluateCentral,
    evaluatePositional,
    evaluateMaster
}
