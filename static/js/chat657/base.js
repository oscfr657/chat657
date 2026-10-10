const currentUser = document.querySelector('#current-user').textContent;
const chatUsers = document.querySelector('#chat-users');

const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

const roomSocket = new WebSocket(
    wsProtocol
    + window.location.host
    + '/ws/chat/'
    + roomName
    + '/'
);

// Handling incoming WebSocket messages
roomSocket.onmessage = async function(e) {
    const data = JSON.parse(e.data);
    if (data.type === 'user_list_update') {
        chatUsers.innerHTML = '';
        data.users.forEach(user => {
            if (user !== currentUser) {
                const li = document.createElement('li');
                li.textContent = user;
                chatUsers.appendChild(li);
            }
        });
    } else if (data.type === 'chat_message') {
        const new_user_div = document.createElement('div');
        if (currentUser == data.sender) {
            new_user_div.classList.add('me');
        }
        const new_user_p = document.createElement('p');
        timestamp = new Date().toLocaleString();
        new_user_p.textContent = (timestamp + ": " + data.sender + ": ");
        new_user_div.appendChild(new_user_p);
        const new_message_div = document.createElement('div');
        const new_message_p = document.createElement('p');
        new_message_p.textContent = (" " + data.message);
        new_message_div.appendChild(new_message_p);
        document.querySelector('#chat-log').appendChild(new_user_div);
        document.querySelector('#chat-log').appendChild(new_message_div);
        document.querySelector('#chat-log').scrollTop = document.querySelector('#chat-log').scrollHeight;
    }
};

// Send text messages
document.querySelector('#chat-message-submit').onclick = function() {
    const messageInputDom = document.querySelector('#chat-message-input');
    const message = messageInputDom.value;
    if (message != '') {
        roomSocket.send(JSON.stringify({
            'type': 'chat_message',
            'message': message
        }));
    }
    messageInputDom.value = '';
};
