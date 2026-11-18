// A table-driven move generator for the engine's search.
//
// moves.js is written for clarity: each step along a line builds a "q,r,s" string key and looks it
// up. That's fine for checking a player's move, but a search makes millions of these calls and
// spent ~75% of its time there. This generator precomputes, once, every cell's neighbours in each
// direction, knight jumps and pawn steps - all derived from moves.js itself - and then just walks
// arrays. It produces exactly the same moves as moves.generateLegalMoves (pseudo-legal: it does not
// check whether the mover's own king is left in check); test/engine.test.js checks that on
// thousands of random positions.

const moves = require('../game/moves')
const { coordToIndex, NUM_CELLS, pawnStartCells, parseFen, boardToFen, generateLegalMoves } = moves

const coords = parseFen('9'.repeat(10) + '1').map(c => c.coords)

const ray = (i, [dq, dr, ds]) => {
    const [q, r, s] = coords[i]
    const out = []
    for(let k = 1; ; k++){
        const j = coordToIndex(q + dq * k, r + dr * k, s + ds * k)
        if(j == undefined) return out
        out.push(j)
    }
}
const step = (i, [dq, dr, ds]) => {
    const [q, r, s] = coords[i]
    const j = coordToIndex(q + dq, r + dr, s + ds)
    return j == undefined ? -1 : j
}

const ROOK_DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]]
const BISHOP_DIRS = [[2, -1, -1], [1, 1, -2], [-1, 2, -1], [-2, 1, 1], [-1, -1, 2], [1, -2, 1]]

const cells = [...Array(NUM_CELLS).keys()]
const rookRays = cells.map(i => ROOK_DIRS.map(d => ray(i, d)).filter(r => r.length))
const bishopRays = cells.map(i => BISHOP_DIRS.map(d => ray(i, d)).filter(r => r.length))
const queenRays = cells.map(i => [...rookRays[i], ...bishopRays[i]])

// Knight and king jumps straight from the real generator on an otherwise empty board.
const jumps = letter => cells.map(i => {
    const board = parseFen(boardToFen(cells.map(j => ({ piece: j == i ? letter : '' }))))
    return generateLegalMoves(board, i, 'white', null)
})
const knightJumps = jumps('N')
const kingSteps = jumps('K')

const PAWN = {
    white: { forward: [0, -1, 1], captures: [[1, -1, 0], [-1, 0, 1]] },
    black: { forward: [0, 1, -1], captures: [[1, 0, -1], [-1, 1, 0]] }
}
const pawnForward = {}, pawnDouble = {}, pawnCaptures = {}
for(const color of ['white', 'black']){
    const { forward, captures } = PAWN[color]
    pawnForward[color] = cells.map(i => step(i, forward))
    pawnDouble[color] = cells.map(i => pawnStartCells[color].includes(i) ? step(i, forward.map(x => x * 2)) : -1)
    pawnCaptures[color] = cells.map(i => captures.map(d => step(i, d)).filter(j => j >= 0))
}

const slide = (board, rays, color, out) => {
    for(const r of rays){
        for(const j of r){
            const t = board[j]
            if(!t.piece){ out.push(j); continue }
            if(t.color != color) out.push(j)
            break
        }
    }
    return out
}

// Same contract as moves.generateLegalMoves(board, cell, color, enPassant).
const fastMoves = (board, i, color, enPassant) => {
    const piece = board[i]
    if(!piece || !piece.piece) return []
    const out = []

    switch(piece.piece.toLowerCase()){
        case 'p': {
            const f = pawnForward[color][i]
            if(f >= 0 && !board[f].piece){
                out.push(f)
                const d = pawnDouble[color][i]
                if(d >= 0 && !board[d].piece) out.push(d)
            }
            for(const c of pawnCaptures[color][i]){
                const t = board[c]
                if(t.piece && t.color != color) out.push(c)
            }
            if(enPassant && enPassant.color != color){
                for(const c of pawnCaptures[color][i]) if(c == enPassant.captureCell) out.push(c)
            }
            return out
        }
        case 'n':
            for(const j of knightJumps[i]){ const t = board[j]; if(!t.piece || t.color != color) out.push(j) }
            return out
        case 'k':
            for(const j of kingSteps[i]){ const t = board[j]; if(!t.piece || t.color != color) out.push(j) }
            return out
        case 'r': return slide(board, rookRays[i], color, out)
        case 'b': return slide(board, bishopRays[i], color, out)
        case 'q': return slide(board, queenRays[i], color, out)
        default: return out
    }
}

// Every cell piece `i` (of `color`) attacks or guards, treating all other pieces as capturable -
// i.e. fastMoves on a board where every piece is "neutral", without building that board.
// Calls visit(target) for each cell.
const forEachCover = (board, i, color, enPassant, visit) => {
    const piece = board[i].piece
    switch(piece.toLowerCase()){
        case 'p': {
            const f = pawnForward[color][i]
            if(f >= 0 && !board[f].piece){
                visit(f)
                const d = pawnDouble[color][i]
                if(d >= 0 && !board[d].piece) visit(d)
            }
            for(const c of pawnCaptures[color][i]) if(board[c].piece) visit(c)
            if(enPassant && enPassant.color != color){
                for(const c of pawnCaptures[color][i]) if(c == enPassant.captureCell) visit(c)
            }
            return
        }
        case 'n': for(const j of knightJumps[i]) visit(j); return
        case 'k': for(const j of kingSteps[i]) visit(j); return
        case 'r': case 'b': case 'q': {
            const rays = piece.toLowerCase() == 'r' ? rookRays[i] : piece.toLowerCase() == 'b' ? bishopRays[i] : queenRays[i]
            for(const r of rays) for(const j of r){ visit(j); if(board[j].piece) break }
            return
        }
    }
}

module.exports = { fastMoves, forEachCover, rookRays, bishopRays, knightJumps, kingSteps, pawnCaptures, pawnForward }
