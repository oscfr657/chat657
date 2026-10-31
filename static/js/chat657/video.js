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

const resolutions = {
    'low': { width: { ideal: 640 }, height: { ideal: 360 } },
    'hd':  { width: { ideal: 1280 }, height: { ideal: 720 } },
    'fhd': { width: { ideal: 1920 }, height: { ideal: 1080 } }
};

let currentResolutionKey = 'hd';
let camera = null;

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const selfieSegmentation = new SelfieSegmentation({
    locateFile: (file) => { return `/static/js/mediapipe/selfie_segmentation/${file}`;
    }
});

selfieSegmentation.setOptions({
    modelSelection: 0,
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
        drawCoverImage(ctx, currentBackgroundImage, canvas.width, canvas.height);
    } else {
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
});

async function getMedia(resolutionKey = 'hd') {
    try {
        currentResolutionKey = resolutionKey;
        const constraints = {
            video: resolutions[resolutionKey],
            audio: true
        };
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoElement = document.createElement('video');
        videoElement.srcObject = rawStream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        await videoElement.play();
        if (camera) {
            camera.stop();
        }
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await selfieSegmentation.send({ image: videoElement });
            },
            width: resolutions[resolutionKey].width.ideal,
            height: resolutions[resolutionKey].height.ideal
        });
        camera.start();
        const processedVideoTrack = canvas.captureStream(30).getVideoTracks()[0];
        const audioTrack = rawStream.getAudioTracks()[0];
        localStream = new MediaStream([processedVideoTrack, audioTrack]);
        localVideo.srcObject = localStream;
        updatePeersTrack(processedVideoTrack);
    } catch (err) {
        console.error("Was unable to connect to media device or start background change", err);
    }
};
chatSocket.onmessage = async function(event) {
    if (!localStream) {
        await getMedia('hd');
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
            console.log(`The connection to ${peerUser} was unexpectedly lost.`);
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

async function changeResolution(resolutionKey) {
    console.log(`Change resolution to: ${resolutionKey}`);
    await getMedia(resolutionKey);
}

function updatePeersTrack(newVideoTrack) {
    for (const peerUser in peers) {
        const peerConnection = peers[peerUser];
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(newVideoTrack).catch(err => {
                console.error(`Kunde inte uppdatera videospår för ${peerUser}:`, err);
            });
        }
    }
}

function drawCoverImage(ctx, img, canvasWidth, canvasHeight) {
    const imgRatio = img.width / img.height;
    const canvasRatio = canvasWidth / canvasHeight;
    let renderWidth, renderHeight, offsetX, offsetY;
    if (canvasRatio > imgRatio) {
        renderWidth = canvasWidth;
        renderHeight = canvasWidth / imgRatio;
        offsetX = 0;
        offsetY = (canvasHeight - renderHeight) / 2;
    } else {
        renderWidth = canvasHeight * imgRatio;
        renderHeight = canvasHeight;
        offsetX = (canvasWidth - renderWidth) / 2;
        offsetY = 0;
    }
    ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
}