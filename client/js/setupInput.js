import { Game } from "./game.js";
import { clearSelection } from "./piece.js";
import { goLive } from "./review.js";
import { canPremove, setPremove, cancelPremove } from "./premove.js";

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

        const cell = Game.cells.find(c => c.checkMouseHover())
        const ownPiece = cell?.occupied && cell.occupiedByMyColor(Game.playerColor)
        const myTurn = Game.state == 'playing' && Game.turn == Game.playerColor
        const premoving = canPremove()

        // Tap-to-move: with a piece selected, tapping a highlighted cell plays the move (or, during
        // the opponent's turn, queues it as a premove).
        const selected = Game.selectedPiece
        if(selected && (myTurn || premoving)){
            if(cell?.isLegalTarget){
                if(myTurn) selected.tapMoveTo(cell)
                else { setPremove(selected.currentCell.num, cell.num); clearSelection() }
                return
            }
            // Tapping anywhere that isn't one of our own pieces cancels the selection.
            if(!ownPiece) clearSelection()
        }

        // Tapping an empty cell (or an enemy piece) clears a queued premove.
        if(Game.premove && !ownPiece) cancelPremove()

        Game.mouse.pressed = true
    })

    document.addEventListener('pointerup', e => {
        updatePosition(e)
        Game.mouse.pressed = false
    })

    document.addEventListener('pointercancel', _ => {
        Game.mouse.pressed = false
    })

    // Right-click or Esc also cancels a premove (and any selection).
    Game.canvas.addEventListener('contextmenu', e => {
        e.preventDefault()
        cancelPremove()
        clearSelection()
    })
    document.addEventListener('keydown', e => {
        if(e.key == 'Escape'){ cancelPremove(); clearSelection() }
    })
}
