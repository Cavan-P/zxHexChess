import { Game } from "./game.js";

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
