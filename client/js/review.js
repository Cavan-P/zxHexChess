import { Game } from './game.js'
import { populateBoardFromFen } from './board.js'
import { clearSelection } from './piece.js'

// Stepping back and forth through the game. Game.positions[n] is the position after n moves
// (n = 0 is the start); Game.viewPly is the one on screen, or null when showing the live game.

export const lastPly = _ => Math.max(0, (Game.positions?.length || 1) - 1)
export const isReviewing = _ => Game.viewPly != null

const showPosition = ply => {
    clearSelection()
    Game.draggedPiece = null
    populateBoardFromFen(Game.positions[ply])
    const move = Game.plyMoves?.[ply - 1]
    Game.lastMove = move ? { from: move.from, to: move.to } : null
    Game.check = move?.check ?? null
}

export const showPly = ply => {
    if(!Game.positions?.length) return
    Game.premove = null
    ply = Math.max(0, Math.min(lastPly(), ply))
    if(ply == lastPly()) return goLive()
    Game.viewPly = ply
    showPosition(ply)
    Game.onReviewChanged?.()
}

export const goLive = _ => {
    if(Game.viewPly == null && Game.positions?.length) { Game.onReviewChanged?.(); return }
    Game.viewPly = null
    if(Game.positions?.length) showPosition(lastPly())
    Game.onReviewChanged?.()
}

export const step = delta => showPly((Game.viewPly ?? lastPly()) + delta)

export const setupReview = _ => {
    const on = (id, fn) => document.getElementById(id).onclick = fn
    on('review-first', _ => showPly(0))
    on('review-prev', _ => step(-1))
    on('review-next', _ => step(1))
    on('review-last', goLive)

    // Arrow keys step through the game (not while typing in a box).
    document.addEventListener('keydown', e => {
        if(document.getElementById('layout').classList.contains('hidden')) return
        if(['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
        const actions = { ArrowLeft: _ => step(-1), ArrowRight: _ => step(1), Home: _ => showPly(0), End: goLive, ArrowUp: _ => showPly(0), ArrowDown: goLive }
        if(!actions[e.key]) return
        e.preventDefault()
        actions[e.key]()
    })
}
