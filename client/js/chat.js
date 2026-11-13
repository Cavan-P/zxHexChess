// Messages come from other players, so they're always inserted as text, never as HTML.
export const addChatMessage = (username, text, isSelf, { bot = false } = {}) => {
    const chatBox = document.getElementById('chat-box')
    const div = document.createElement('div')
    div.className = `msg ${isSelf ? 'user' : 'other'}${bot ? ' bot' : ''}`

    const name = document.createElement('span')
    name.className = 'username'
    name.textContent = username

    const body = document.createElement('span')
    body.className = 'text'
    body.textContent = text

    div.append(name, body)
    chatBox.appendChild(div)

    chatBox.scrollTop = chatBox.scrollHeight
}

export const addSystemMessage = text => {
    const chatBox = document.getElementById('chat-box')
    const div = document.createElement('div')
    div.className = 'msg system'
    div.textContent = text
    chatBox.appendChild(div)
    chatBox.scrollTop = chatBox.scrollHeight
}
