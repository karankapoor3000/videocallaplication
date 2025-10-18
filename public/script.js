const socket = io("/");
const myPeer = new Peer(undefined, { host: "/", port: "3001" });
const videoGrid = document.getElementById("video-grid");
const myVideo = document.createElement("video");
myVideo.muted = true;
let myStream;
const peers = {};

const isAdmin = window.location.search.includes("admin=true");
const userName = prompt("Enter your name:");

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    myStream = stream;
    addVideoStream(myVideo, stream);

    myPeer.on("call", call => {
      call.answer(stream);
      const video = document.createElement("video");
      call.on("stream", userVideoStream => addVideoStream(video, userVideoStream));
    });

    socket.on("user-connected", userId => connectToNewUser(userId, stream));
  });

myPeer.on("open", id => {
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

// Helper functions
function connectToNewUser(userId, stream) {
  const call = myPeer.call(userId, stream);
  const video = document.createElement("video");
  call.on("stream", userVideoStream => addVideoStream(video, userVideoStream));
  call.on("close", () => video.remove());
  peers[userId] = call;
}

function addVideoStream(video, stream) {
  video.srcObject = stream;
  video.addEventListener("loadedmetadata", () => video.play());
  videoGrid.append(video);
}
