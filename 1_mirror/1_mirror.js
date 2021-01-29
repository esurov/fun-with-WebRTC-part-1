navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

var constraints = {
    video: true,
    audio: false
};

// var constraints = {
//     mandatory: {
//         height: {min: 320}
//     }
// };

var localVideo = document.getElementById ('localVideo');

navigator.getUserMedia (constraints, captureOK, captureKO);

function captureOK (stream) {
    console.log ('capture was ok');
    //localVideo.src = window.URL.createObjectURL (stream);
    localVideo.srcObject = stream;
    var track = stream.getVideoTracks();
    console.log ('width: ' + track[0].height);
}

function captureKO (err) {
    console.log ('Capture failed with error: ' + err);
    alert ('Capture failed with error: ' + err);
}
