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
async function getMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error("Could not retrieve media", err);
    }
};
chatSocket.onmessage = async function(event) {
    if (!localStream) {
        await getMedia();
    }
    const message = JSON.parse(event.data);
    const actionType = message.type;
    const sender = message.sender;
    switch (actionType) {
        case 'user_list_update':
            const activeUsers = message.users;
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
            for (const peerUser in peers) {
                if (!activeUsers.includes(peerUser)) {
                    peers[peerUser].close();
                    delete peers[peerUser];
                    const videoEl = document.getElementById(`video-${peerUser}`);
                    if (videoEl) videoEl.remove();
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
    const peerConnection = new RTCPeerConnection(rtcConfig);
    peers[peerUser] = peerConnection;
    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            console.log(`Anslutningen till ${peerUser} bröts oväntat.`);
            if (peers[peerUser]) {
                peers[peerUser].close();
                delete peers[peerUser];
            }
            const videoEl = document.getElementById(`video-${peerUser}`);
            if (videoEl) videoEl.remove();
        }
    };
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            chatSocket.send(JSON.stringify({
                'type': 'webrtc_ice_candidate',
                'target_user': peerUser,
                'data': event.candidate
            }));
        }
    };
    peerConnection.ontrack = (event) => {
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