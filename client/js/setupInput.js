import { Game } from "./game.js";
import { clearSelection } from "./piece.js";
import { goLive } from "./review.js";

// Converts a pointer position on the page into the board's logical coordinate space,
// undoing the canvas scale/offset and the 180° flip used when playing Black.
const toBoardCoords = e => {
    const rect = Game.canvas.getBoundingClientRect()
    const { scale, ox, oy, dpr } = Game.view

    let x = ((e.clientX - rect.left) * dpr - ox) / scale
    let y = ((e.clientY - rect.top) * dpr - oy) / scale

    if(Game.playerColor == 'black'){
        x = 2 * Game.boardCenter.x - x
        y = 2 * Game.boardCenter.y - y
    }

    return { x, y }
}

export const setupInput = _ => {
    const updatePosition = e => {
        const { x, y } = toBoardCoords(e)
        Game.mouse.x = x
        Game.mouse.y = y
    }

    // Pointer events cover mouse, touch and pen, so the board also works on tablets and phones.
    document.addEventListener('pointermove', updatePosition)

    Game.canvas.addEventListener('pointerdown', e => {
        updatePosition(e)

        // Looking back through the game: a tap on the board returns to the live position.
        if(Game.viewPly != null){
            goLive()
            return
        }

        // Tap-to-move: with a piece selected, tapping a highlighted cell plays the move.
        const selected = Game.selectedPiece
        if(selected && Game.state == 'playing' && Game.turn == Game.playerColor){
            const cell = Game.cells.find(c => c.checkMouseHover())
            if(cell?.isLegalTarget){
                selected.tapMoveTo(cell)
                return
            }
            // Tapping anywhere that isn't one of our own pieces cancels the selection.
            const ownPiece = cell?.occupied && cell.occupiedByMyColor(Game.playerColor)
            if(!ownPiece) clearSelection()
        }

        Game.mouse.pressed = true
    })

    document.addEventListener('pointerup', e => {
        updatePosition(e)
        Game.mouse.pressed = false
    })

    document.addEventListener('pointercancel', _ => {
        Game.mouse.pressed = false
    })
}
