const socket = new WebSocket('ws://localhost:8000')

socket.onopen = _ => {
    console.log('Connected to server')
}

socket.onmessage = msg => {
    const data = JSON.parse(msg.data)

    if(data.type == 'move'){
        console.log('Opponent moves:', data.payload)
    }
    else if(data.type == 'chat'){
        const chatBox = document.getElementById('chat-box')
        chatBox.innerHTML += `<div>${data.username} - ${data.payload}</div>`
    }
}

// ---- Imports ----

import { drawBoard } from './board.js'

const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

canvas.width = window.innerWidth
canvas.height = window.innerHeight

ctx.textBaseline = 'middle'
ctx.textAlign = 'center'

const cellSize = 45

let username = prompt("Enter your username") || `User${Math.floor(Math.random()*1000)}`


const sendChat = msg => {
    socket.send(JSON.stringify({ type: 'chat', username: username, payload: msg }))
}

document.getElementById('chat-form').addEventListener('submit', e => {
    e.preventDefault()

    const input = document.getElementById('chat-input')
    sendChat(input.value)
    input.value = ''
})

const init = _ => {
    drawBoard(cellSize, 0, 1, 5, ctx)
    drawBoard(cellSize, [
        '#D18B47FF',     /*  Dark cell    */
        '#E8AB6FFF',     /*  Middle cell  */
        '#FFCE9EFF'],    /*  Light cell   */
        0, 0, ctx)

    requestAnimationFrame(init)
}

requestAnimationFrame(init)
