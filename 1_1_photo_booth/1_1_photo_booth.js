// Same as previously: make the call portable across browser
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

// We don't need audio for the photo booth
var constraints = {
    video: true,
    audio: false
};


var localVideo = document.getElementById ('localVideo');
var canvas = document.getElementById('canvas');

// Get the canvas context from which we can extract data
var ctx = canvas.getContext("2d");

// Actualy call to capture media
navigator.getUserMedia (constraints, captureOK, captureKO);

// Start our application
function captureOK (stream) {
    console.log ('capture was ok');

    // Attach the stream
    localVideo.src = window.URL.createObjectURL (stream);

    // Register an event on the enter key
    document.addEventListener("keyup", function(evt) {
        // 13 : enter key
        if (13 == evt.keyCode ) {
            recordImage();
        }
    });

    // Register the event on the button
    document.getElementById('captureBtn').disabled = false;
    document.getElementById('captureBtn').addEventListener("click", recordImage);
}

function captureKO (err) {
    console.log ('Capture failed with error: ' + err);
    alert ('Capture failed with error: ' + err);
}

// Our function to record an image in the canvas
function recordImage(evt) {
    console.log("event: ");
    ctx.drawImage(localVideo, 0, 0);
}