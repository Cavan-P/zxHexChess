export const addChatMessage = (username, text, isSelf) => {
    const chatBox = document.getElementById('chat-box')
    const div = document.createElement('div')
    div.className = `msg ${isSelf ? 'user' : 'other'}`

    div.innerHTML = `
        <span class="username">${username}</span>
        <span class="text">${text}</span>
    `

    chatBox.appendChild(div)

    chatBox.scrollTop = chatBox.scrollHeight
}