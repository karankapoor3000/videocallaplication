// ================== SOCKET & PEER SETUP ==================
const socket = io("/");

// Works on both local & Render deployment
const myPeer = new Peer(undefined, {
  host: window.location.hostname,
  port: window.location.protocol === "https:" ? 443 : 3001,
  path: "/peerjs",
});

const videoGrid = document.getElementById("video-grid");
const myVideo = document.createElement("video");
myVideo.muted = true;

let myStream;
const peers = {};
const isAdmin = window.location.search.includes("admin=true");
const userName = prompt("Enter your name:");

// ================== MEDIA SETUP ==================
navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    myStream = stream;
    addVideoStream(myVideo, stream);

    // When someone calls you
    myPeer.on("call", (call) => {
      call.answer(stream);
      const video = document.createElement("video");
      call.on("stream", (userVideoStream) =>
        addVideoStream(video, userVideoStream)
      );
      call.on("close", () => video.remove());
      peers[call.peer] = call;
    });

    // When new user joins
    socket.on("user-connected", (userId) => {
      connectToNewUser(userId, stream);
    });
  })
  .catch((err) => {
    console.error("Media access error:", err);
    alert("Please allow camera and microphone access to join the meeting.");
  });

// ================== SOCKET EVENTS ==================
myPeer.on("open", (id) => {
  socket.emit("join-room", ROOM_ID, id, userName, isAdmin);
});

socket.on("join-request", ({ userId, userName }) => {
  if (!isAdmin) return;
  const approve = confirm(`${userName} wants to join — allow?`);
  socket.emit("approval-decision", { targetId: userId, approved: approve });
});

socket.on("join-approved", () => alert("✅ You have been allowed to join!"));
socket.on("join-denied", () => alert("❌ Access denied by admin"));

socket.on("permission-updated", ({ type, value }) => {
  if (type === "mic") myStream.getAudioTracks()[0].enabled = value;
  if (type === "cam") myStream.getVideoTracks()[0].enabled = value;
  alert(`Your ${type} permission is now ${value ? "enabled" : "disabled"}`);
});

// ================== FUNCTIONS ==================
function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");
  call.on("stream", (userVideoStream) =>
    addVideoStream(video, userVideoStream)
  );
  call.on("close", () => video.remove());
  peers[userId] = call;
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => video.play());
  const wrapper = document.createElement("div");
  wrapper.style.display = "inline-block";
  wrapper.style.margin = "10px";
  wrapper.append(video);
  videoGrid.append(wrapper);
}

function toggleUser(type, value) {
  if (!isAdmin) return alert("Only the admin can change permissions");
  const confirmAction = confirm(
    `Are you sure you want to change everyone's ${type}?`
  );
  if (!confirmAction) return;

  for (const userId in peers) {
    socket.emit("toggle-permission", { targetId: userId, type, value });
  }
}

// ================== MUTE / CAMERA / SHARE ==================
document.getElementById("muteBtn").addEventListener("click", () => {
  const audioTrack = myStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById("muteBtn").innerText = audioTrack.enabled
    ? "Mute"
    : "Unmute";
});

document.getElementById("camBtn").addEventListener("click", () => {
  const videoTrack = myStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  document.getElementById("camBtn").innerText = videoTrack.enabled
    ? "Camera Off"
    : "Camera On";
});

document.getElementById("shareBtn").addEventListener("click", async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });
    const videoTrack = screenStream.getVideoTracks()[0];

    // Replace video track in all active calls
    Object.values(peers).forEach((call) => {
      const sender = call.peerConnection
        .getSenders()
        .find((s) => s.track.kind === "video");
      if (sender) sender.replaceTrack(videoTrack);
    });

    // Show your screen locally
    addVideoStream(myVideo, screenStream);

    // When screen share ends → revert back to camera
    videoTrack.onended = () => {
      Object.values(peers).forEach((call) => {
        const sender = call.peerConnection
          .getSenders()
          .find((s) => s.track.kind === "video");
        if (sender)
          sender.replaceTrack(myStream.getVideoTracks()[0]);
      });
      addVideoStream(myVideo, myStream);
    };
  } catch (err) {
    console.error("Screen share error:", err);
  }
});
