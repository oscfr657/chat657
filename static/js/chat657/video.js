const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
let localStream;
const peers = {};
const currentUser = document.querySelector('#current-user').textContent;
const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
const chatSocket = new WebSocket(
    wsProtocol
    + window.location.host
    + '/ws/chat/'
    + roomName
    + '/'
);
const rtcConfig = {
    'iceServers': [
        { 'urls': stunServerUrl }
    ]
};

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
.then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
})
.catch(error => console.error("Could not retrieve media", error));

chatSocket.onmessage = async function(event) {
    const message = JSON.parse(event.data);
    const actionType = message.type;
    const sender = message.sender;
    switch (actionType) {
        case 'user_list_update':
            const activeUsers = message.users;
            for (const peerUser in peers) {
                if (!activeUsers.includes(peerUser)) {
                    peers[peerUser].close();
                    delete peers[peerUser];
                    const videoEl = document.getElementById(`video-${peerUser}`);
                    if (videoEl) videoEl.remove();
                }
            }
            for (const user of activeUsers) {
                if (user !== currentUser && !peers[user]) {
                    await createPeerConnection(user);
                    const offer = await peers[user].createOffer();
                    await peers[user].setLocalDescription(offer);
                    chatSocket.send(JSON.stringify({ 
                        'type': 'webrtc_offer', 
                        'target_user': user,
                        'data': offer 
                    }));
                }
            }
            break;

        case 'webrtc_offer':
            await createPeerConnection(sender);
            await peers[sender].setRemoteDescription(new RTCSessionDescription(message.data));
            const answer = await peers[sender].createAnswer();
            await peers[sender].setLocalDescription(answer);
            chatSocket.send(JSON.stringify({ 
                'type': 'webrtc_answer', 
                'target_user': sender,
                'data': answer 
            }));
            break;

        case 'webrtc_answer':
            if (peers[sender]) {
                await peers[sender].setRemoteDescription(new RTCSessionDescription(message.data));
            }
            break;

        case 'webrtc_ice_candidate':
            if (peers[sender] && message.data) {
                await peers[sender].addIceCandidate(new RTCIceCandidate(message.data));
            }
            break;
    }
};

async function createPeerConnection(peerUser) {
    if (peers[peerUser]) return;
    pc = new RTCPeerConnection(rtcConfig);
    peers[peerUser] = pc;
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
    pc.onicecandidate = event => {
        if (event.candidate) {
            chatSocket.send(JSON.stringify({
                'type': 'webrtc_ice_candidate',
                'target_user': peerUser,
                'data': event.candidate
            }));
        }
    };
    pc.ontrack = (event) => {
        if (!document.getElementById(`video-${peerUser}`)) {
            const newVideo = document.createElement('video');
            newVideo.id = `video-${peerUser}`;
            newVideo.autoplay = true;
            newVideo.playsInline = true;
            newVideo.srcObject = event.streams[0];
            remoteVideosContainer.appendChild(newVideo);
        }
    };
};