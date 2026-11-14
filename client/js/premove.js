import { Game } from './game.js'

// Premoves: while the opponent is thinking you can queue one move. It plays the instant your turn
// starts if it's still legal (checked against the server's legal-move list), otherwise it's dropped.

// Gliński geometry in cube coordinates (taken from the server's move generator).
const ROOK_DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]]
const BISHOP_DIRS = [[2, -1, -1], [1, 1, -2], [-1, 2, -1], [-2, 1, 1], [-1, -1, 2], [1, -2, 1]]
const KNIGHT = [[1, -3, 2], [-1, -2, 3], [1, 2, -3], [-1, 3, -2], [2, -3, 1], [3, -2, -1], [3, -1, -2], [2, 1, -3], [-2, -1, 3], [-3, 1, 2], [-3, 2, 1], [-2, 3, -1]]
const KING = [...ROOK_DIRS, ...BISHOP_DIRS]
const PAWN = {
    white: { forward: [0, -1, 1], captures: [[1, -1, 0], [-1, 0, 1]], start: [56, 61, 62, 66, 68, 71, 74, 76, 80] },
    black: { forward: [0, 1, -1], captures: [[1, 0, -1], [-1, 1, 0]], start: [10, 14, 16, 19, 22, 24, 28, 29, 34] }
}

const cellAt = (q, r, s) => Game.cells.find(c => c.q == q && c.r == r && c.s == s)
const offset = (cell, [dq, dr, ds], k = 1) => cellAt(cell.q + dq * k, cell.r + dr * k, cell.s + ds * k)

const isOwn = (cell, color) => cell.occupied && cell.occupiedByMyColor(color)

// Where a piece could possibly go by the time it's your turn. The board will change in between, so
// sliders ignore blockers; only cells holding your own pieces are ruled out.
export const premoveTargets = piece => {
    const from = piece.currentCell
    const color = Game.playerColor
    const targets = []
    const add = cell => { if(cell && !isOwn(cell, color)) targets.push(cell.num) }

    switch(piece.piece.toLowerCase()){
        case 'p': {
            const p = PAWN[color]
            add(offset(from, p.forward))
            if(p.start.includes(from.num)) add(offset(from, p.forward, 2))
            p.captures.forEach(d => add(offset(from, d)))
            break
        }
        case 'n': KNIGHT.forEach(d => add(offset(from, d))); break
        case 'k': KING.forEach(d => add(offset(from, d))); break
        default: {
            const dirs = piece.piece.toLowerCase() == 'r' ? ROOK_DIRS : piece.piece.toLowerCase() == 'b' ? BISHOP_DIRS : KING
            for(const d of dirs) for(let k = 1; ; k++){
                const cell = offset(from, d, k)
                if(!cell) break
                add(cell)
            }
        }
    }
    return targets
}

export const canPremove = _ =>
    Game.state == 'playing' && Game.viewPly == null &&
    (Game.playerColor == 'white' || Game.playerColor == 'black') && Game.turn != Game.playerColor

export const setPremove = (from, to) => { Game.premove = { from, to } }
export const cancelPremove = _ => { Game.premove = null }

// Called when your turn starts: play the queued move if it's legal now.
export const executePremove = _ => {
    const premove = Game.premove
    Game.premove = null
    if(!premove || Game.turn != Game.playerColor || Game.state != 'playing' || Game.viewPly != null) return

    if(!Game.legalMap?.[premove.from]?.includes(premove.to)) return
    const piece = Game.pieces.find(p => p.currentCell?.num == premove.from)
    const cell = Game.cells[premove.to]
    if(piece && cell) piece.tapMoveTo(cell, 'q')     // premoved pawns promote to a queen
}
