// ------ IMPORTS ------

import { drawBoard, populateBoardFromFen, cells } from './board.js'
import { Cell } from './cell.js'
import { Piece, pieces } from './piece.js'

// ------ GLOBALS ------

const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
let myColor

canvas.width = window.innerWidth
canvas.height = window.innerHeight

ctx.textBaseline = 'middle'
ctx.textAlign = 'center'

const cellSize = 45
const username = `User${Math.floor(Math.random()*1000)}`


// ------ SERVER CONNECTION STUFF ------

const socket = new WebSocket('ws://localhost:8000')

socket.onopen = _ => {
    console.log('Connected to server')
}

socket.onmessage = raw => handleServerMessage(JSON.parse(raw.data))

const handleServerMessage = data => {
    switch(data.type){
        case 'init': return handleInit(data.fen)
        case 'move': return handleMove(data.payload)
        case 'assignColor': return handleColorAssign(data.color)
        case 'chat': return handleChat(data)
    }
}

const handleInit = fen => {
    console.log('populating?')
    populateBoardFromFen(fen, cells, pieces, ctx)
}

const handleMove = payload => {
    console.log('Opponent moves: ', payload)
}

const handleChat = data => {
    const chatBox = document.getElementById('chat-box')
    chatBox.innerHTML += `<div>${data.username} - ${data.payload}</div>`
}

const handleColorAssign = color => {
    myColor = color
}

// ------ END SERVER STUFF ------

window.myColor = myColor

const sendChat = msg => {
    socket.send(JSON.stringify({ type: 'chat', username: username, payload: msg }))
}

document.getElementById('chat-form').addEventListener('submit', e => {
    e.preventDefault()

    const input = document.getElementById('chat-input')
    sendChat(input.value)
    input.value = ''
})

//Populate the cells array
drawBoard(cellSize, 0, 1, 5, ctx, true)


const render = _ => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    drawBoard(cellSize, 0, 1, 5, ctx)

    if(myColor == 'black'){
        ctx.save()
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate(Math.PI)
        ctx.translate(-canvas.width / 2, -canvas.height / 2)
    }

    drawBoard(cellSize, [
        '#D18B47FF',     /*  Dark cell    */
        '#E8AB6FFF',     /*  Middle cell  */
        '#FFCE9EFF'],    /*  Light cell   */
        0, 0, ctx)

    cells.forEach(cell => cell.display(!true, !true, !true, myColor))
    pieces.forEach(piece => piece.display(false, document.getElementById('pieces'), myColor))

    ctx.restore()
}

const init = _ => {
    render()

    requestAnimationFrame(init)
}

requestAnimationFrame(init)
