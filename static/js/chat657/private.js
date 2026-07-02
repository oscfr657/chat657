const currentUser = document.querySelector('#current-user').textContent;

const targetSelect = document.querySelector('#target-user');

let activeTargetUser = null; // The person we are talking to right now

const chatSocket = new WebSocket(
    'ws://'
    + window.location.host
    + '/ws/chat/'
    + roomName
    + '/'
);


// Handling incoming WebSocket messages
chatSocket.onmessage = async function(e) {
    const data = JSON.parse(e.data);
    if (data.type === 'user_list_update') {
        targetSelect.innerHTML = '<option value="">-- Select --</option>';
        data.users.forEach(user => {
            if (user !== currentUser) {
                const opt = document.createElement('option');
                opt.value = user;
                opt.textContent = user;
                targetSelect.appendChild(opt);
            }
        });
    } else if (data.type === 'private_message') {
        document.querySelector('#private-chat-log').value += (data.sender + ": " + data.message + '\n');
    }
};

// Send private message
document.querySelector('#private-message-submit').onclick = function() {
    const targetUser = targetSelect.value;
    if (!targetUser) {
        alert("Select who you want to connect with from the list above.");
        return;
    }
    const messageInputDom = document.querySelector('#private-message-input');
    const message = messageInputDom.value;
    if (message != '') {
        chatSocket.send(JSON.stringify({
            'type': 'private_message',
            'target_user': targetUser,
            'message': message
        }));
    }
    messageInputDom.value = '';
};
