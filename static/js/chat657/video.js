const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById(`videoGrid`);
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

let currentBackgroundImage = null;

function changeBackground(imageUrl) {
    if (!imageUrl) {
        currentBackgroundImage = null;
    } else {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl;
        img.onload = () => {
            currentBackgroundImage = img;
        };
    }
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => { return `/static/js/mediapipe/selfie_segmentation/${file}`;
    }
});

selfieSegmentation.setOptions({
    modelSelection: 1,
});

selfieSegmentation.onResults((results) => {
    canvas.width = results.image.width;
    canvas.height = results.image.height;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentBackgroundImage) {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(currentBackgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
});

async function getMedia() {
    try {
        const rawStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const videoElement = document.createElement('video');
        videoElement.srcObject = rawStream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        await videoElement.play();

        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await selfieSegmentation.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });
        camera.start();

        const processedVideoTrack = canvas.captureStream(30).getVideoTracks()[0];
        const audioTrack = rawStream.getAudioTracks()[0];
        localStream = new MediaStream([processedVideoTrack, audioTrack]);
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error("Kunde inte hämta media eller starta bakgrundsbyte", err);
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
            const newRemoteDiv = document.createElement('div');
            newRemoteDiv.id = `user-${peerUser}`;
            const newUserName = document.createElement('p');
            newUserName.id = `name-${peerUser}`;
            newUserName.innerText = `${peerUser}`;
            const newVideo = document.createElement('video');
            newVideo.id = `video-${peerUser}`;
            newVideo.autoplay = true;
            newVideo.playsInline = true;
            newVideo.srcObject = event.streams[0];
            newRemoteDiv.appendChild(newUserName);
            newRemoteDiv.appendChild(newVideo);
            remoteVideosContainer.appendChild(newRemoteDiv);
        }
    };
};