// ------ IMPORTS ------

import { Game } from './game.js'
import { setupInput } from './setupInput.js'
import { setupNetwork, sendChatMessage } from './network.js'
import { drawBoard, populateBoardFromFen} from './board.js'
import { Cell } from './cell.js'
import { Piece } from './piece.js'

// ------ GLOBALS ------

Game.canvas = document.getElementById('canvas')
Game.ctx = Game.canvas.getContext('2d')

Game.pieceSprite = document.getElementById('pieces')

Game.canvas.width = Game.canvas.clientWidth
Game.canvas.height = Game.canvas.clientHeight

Game.ctx.textBaseline = 'middle'
Game.ctx.textAlign = 'center'

setupInput()
setupNetwork(populateBoardFromFen)

document.getElementById('chat-form').addEventListener('submit', e => {
    e.preventDefault()

    const input = document.getElementById('chat-input')
    const text = input.value.trim()

    if(!text.length) return

    sendChatMessage(text)

    input.value = ''
})

//Populate the cells array
drawBoard(0, 1, 5, true)

Game.boardCenter = {
    x: Math.min(...Game.cells.map(cell => cell.x)) +
      (Math.max(...Game.cells.map(cell => cell.x)) - Math.min(...Game.cells.map(cell => cell.x))) / 2,

    y: Math.min(...Game.cells.map(cell => cell.y)) +
      (Math.max(...Game.cells.map(cell => cell.y)) - Math.min(...Game.cells.map(cell => cell.y))) / 2
}

const render = _ => {
    Game.ctx.clearRect(0, 0, Game.canvas.width, Game.canvas.height)

    Game.ctx.save()

    drawBoard(0, 1, 5)

    if(Game.playerColor == 'black'){
        Game.ctx.translate(Game.boardCenter.x, Game.boardCenter.y)
        Game.ctx.rotate(Math.PI)
        Game.ctx.translate(-Game.boardCenter.x, -Game.boardCenter.y)
    }

    drawBoard([
        '#D18B47FF',     /*  Dark cell    */
        '#E8AB6FFF',     /*  Middle cell  */
        '#FFCE9EFF'],    /*  Light cell   */
        0, 0)
    
    Game.cells.forEach(cell => cell.update())

    const hoveredOccupied = Game.cells.some(cell => cell.hovering && cell.occupied)
    Game.canvas.style.cursor = hoveredOccupied ? 'pointer' : 'default'

    Game.cells.forEach(cell => cell.display(!true, !true, !true, Game.playerColor))
    Game.pieces.forEach(piece => piece.display(!true, Game.playerColor))

    Game.ctx.restore()
}

const init = _ => {
    render()

    requestAnimationFrame(init)
}

requestAnimationFrame(init)
