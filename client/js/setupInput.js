import { Game } from "./game.js";

const getLogicalMousePos = (x, y) => {
    if(Game.playerColor != 'black') return { x, y }

    const cx = Game.boardCenter.x
    const cy = Game.boardCenter.y

    return {
        x: cx - (x - cx),
        y: cy - (y - cy)
    }
}

export const setupInput = _ => {

    document.addEventListener('mousemove', e => {
        const rect = Game.canvas.getBoundingClientRect()

        const rawX = e.clientX - rect.left
        const rawY = e.clientY - rect.top

        if(Game.playerColor == 'black'){
            const cx = Game.boardCenter.x
            const cy = Game.boardCenter.y

            Game.mouse.x = cx - (rawX - cx)
            Game.mouse.y = cy - (rawY - cy)
        }
        else{
            Game.mouse.x = rawX
            Game.mouse.y = rawY
        }

        
    
    })

    document.addEventListener('mousedown', _ => {
        Game.mouse.pressed = true
    })
    document.addEventListener('mouseup', _ => {
        Game.mouse.pressed = false
    })
}