const socket = new WebSocket('ws://localhost:8000')

socket.onopen = _ => {
    console.log('Connected to server')
}

socket.onmessage = msg => {
    console.log('Server says:', msg.data)
}