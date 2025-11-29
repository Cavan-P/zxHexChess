import { Game } from "./game.js";

export const setupInput = _ => {
    document.addEventListener('mousemove', e => {
        const rect = Game.canvas.getBoundingClientRect();
        Game.mouse.x = (e.clientX - rect.left);
        Game.mouse.y = (e.clientY - rect.top);
    
    })

    document.addEventListener('onmousedown', _ => {
        Game.mouse.pressed = true
    })
    document.addEventListener('onmouseup', _ => {
        Game.mouse.pressed = false
    })
}