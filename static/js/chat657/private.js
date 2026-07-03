const currentUser = document.querySelector('#current-user').textContent;

const targetSelect = document.querySelector('#target-user');

const startCallBtn = document.querySelector('#start-call-btn');
const localVideo = document.querySelector('#local-video');
const remoteVideo = document.querySelector('#remote-video');

let localStream;
let peerConnection;
let activeTargetUser = null; // The person we are talking to right now

const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

const chatSocket = new WebSocket(
    wsProtocol
    + window.location.host
    + '/ws/chat/'
    + roomName
    + '/'
);

// WebRTC configuration
const rtcConfig = {
    'iceServers': [
        { 'urls': stunServerUrl }
    ]
};

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
    } else if (data.type === 'webrtc_offer') {
        // Save who called
        activeTargetUser = data.sender;
        await createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.data));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        chatSocket.send(JSON.stringify({
            'type': 'webrtc_answer',
            'target_user': activeTargetUser,
            'data': peerConnection.localDescription
        }));
    } else if (data.type === 'webrtc_answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.data));
    } else if (data.type === 'webrtc_ice_candidate') {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.data));
        } catch (e) {
            console.error("Error at ICE candidate", e);
        }
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

startCallBtn.onclick = async function() {
    activeTargetUser = targetSelect.value;
    if (!activeTargetUser) {
        alert("Choose a user to call first!");
        return;
    }
    await createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    chatSocket.send(JSON.stringify({
        'type': 'webrtc_offer',
        'target_user': activeTargetUser,
        'data': peerConnection.localDescription
    }));
};

async function createPeerConnection() {
    if (!localStream) {
        await getMedia();
    }
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    peerConnection.onicecandidate = event => {
        if (event.candidate && activeTargetUser) {
            chatSocket.send(JSON.stringify({
                'type': 'webrtc_ice_candidate',
                'target_user': activeTargetUser,
                'data': event.candidate
            }));
        }
    };
    peerConnection.ontrack = event => {
        remoteVideo.srcObject = event.streams[0];
    };
};

async function getMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error("Could not retrieve media", err);
    }
};
