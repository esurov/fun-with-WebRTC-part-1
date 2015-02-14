document.addEventListener("DOMContentLoaded", function(event) {

    var nickname = prompt("Enter a name for the contact list");

    if (nickname === null || nickname === "") {
        alert ("You must enter a name, to be identified on the server");
        return;
    }

    // Will hold our peer's nickname
    var peer = null;

    // Here we are using Google's public STUN server, and no TURN server
    var ice = { "iceServers": [
                {"url": "stun:stun.l.google.com:19302"}]
              };
    var pc = null; // This variable will hold the RTCPeerConnection

    document.getElementById('nickname').innerHTML = nickname;

    var constraints = {
        video: "true",
        audio: "true"
    };

    // Prevent us to receive another call or make another call while already in one
    var isInCall = false;

    // Specify if we have to create offers or answers
    var isCaller = false;

    var receivedOffer = null;

    // For portability's sake
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;
    window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;

    // Open a connection to our server
    var socket = new WebSocket('ws://192.168.1.35:4444');

    // Display an error message if the socket fails to open
    socket.onerror = function(err) {
        alert("Failed to open connection with WebSockets server.\nEither the server is down or your connection is out.");
        return;
    };

    // Provide visual feedback to the user when he is disconnected
    socket.onclose = function (evt) {
        document.getElementById("status").innerHTML = "<strong class=\"red\">disconnected!</strong>";
    };

    // When the connection is opened, the server expects us to send our nickname right away
    socket.onopen = function() {
        document.getElementById("status").innerHTML = "<strong class=\"green\">connected!</strong>";
        socket.send (JSON.stringify ({"nickname": nickname}));
    };

    // Process incomming messages from the server, can be the user list or messages from another peer
    socket.onmessage = function (msg) {
        // Parse message, JSON is used for all message transfer
        try {
            var dat = JSON.parse (msg.data);
        } catch(e) {
            console.log ("ERROR - Received wrong-formatted message from server:\n" + e);
            socket.close();
            isInCall = false;
            isCaller = false;
            return;
        }

        // Process userlist : display the names in the contact list
        if (dat.userlist) {
            var l = dat.userlist;
            var domContent = "";

            // Add each user on the list and register a callback function to initiate the call
            l.forEach (function (elem) {
                // Filter out our name from the list: we don't want to call ourselve!
                if (elem !== nickname) {
                    domContent += "<li><button onclick='navigator.callUser(\"" + elem + "\");'>" + elem + "</button></li>";
                }
            });

            // Add the generated user list to the DOM
            document.getElementById("userlist").innerHTML = domContent;
        }

        // If the message is from a peer
        else if (dat.from) {
            // When we receive the first message form a peer, we consider ourselved in a call
            if (!isInCall) {
                isInCall = true;
                peer = dat.from;
                document.getElementById('calling_status').innerHTML = peer + " is calling...";
            }

            if (dat.offer) {
                receivedOffer = dat.offer;
                startConv();
            } else if (dat.answer) {
                pc.setRemoteDescription (new RTCSessionDescription (dat.answer),
                                         function () {
                                            console.log ("Set remote description - handshake complete.");
                                            // As we are now in a call, log out from the signalling server
                                            socket.close();
                                         },
                                         function () {
                                            console.log ("Failed to set remote description - handshake failed.");
                                         });
            }
        }

        // Otherwise, this is an error
        else {
            alert ("Received a non-intended message.");
            socket.close();
            isInCall = false;
            isCaller = false;
            return;
        }
    }; // end of 'socket.onmessage()'

    // Initiate a call to a user
    navigator.callUser = function (who) {
        document.getElementById('calling_status').innerHTML = "Calling " + who + " ...";
        isCaller = true;
        peer = who;
        startConv();
    };

    // Start a call (caller) or accept a call (callee)
    function startConv() {
        if (isCaller) {
            console.log ("Initiating call...");
        } else {
            console.log ("Answering call...");
        }

        // First thing to do is acquire media stream
        navigator.getUserMedia (constraints, onMediaSuccess, onMediaError);
    }; // end of 'startConv()'

    function onMediaError (err) {
        alert ("Media was denied access: " + err);
        document.getElementById('calling_status').innerHTML = "";
        socket.close();
        isCaller = false;
        isInCall = false;
        return;
    };

    function onMediaSuccess (mediaStream) {
        // Hide the contact list and show the screens
        document.getElementById("signalling").style.display = "none";
        document.getElementById("oncall").style.display = "block";

        // Display our video on our screen
        document.getElementById("localVideo").src = URL.createObjectURL(mediaStream);

        // Create the RTCPeerConnection and add the stream to it
        pc = new window.RTCPeerConnection (ice);

        // Stream must be added to the RTCPeerConnection **before** creating the offer
        pc.addStream (mediaStream);

        pc.onaddstream = onStreamAdded;
        pc.onicecandidate = onIceCandidate;

        if (isCaller) {
            // Calling 'createOffer()' will trigger ICE Gathering process
            pc.createOffer (function (offerSDP) {
                pc.setLocalDescription (new RTCSessionDescription (offerSDP),
                                        function () {
                                            console.log ("Set local description");
                                        },
                                        function () {
                                            console.log ("Failed to set up local description");
                                        });
            },
                            function (err) {
                console.log ("Could not build the offer");
            }, constraints);

        } else {
            pc.setRemoteDescription (new RTCSessionDescription (receivedOffer),
                                     function () {
                                        pc.createAnswer (function (answerSDP) {
                                            pc.setLocalDescription (new RTCSessionDescription (answerSDP),
                                                                    function () {
                                                                        console.log ("Set local description");
                                                                    },
                                                                    function () {
                                                                        console.log ("Failed to set up local description");
                                                                    });
                                        },
                                                        function (err) {
                                            console.log ("Could not build the answer");
                                        }, constraints);

                                     },
                                     function () {
                                        console.log ("Failed to set up remote description");
                                    });
        }
    }; // end of 'onMediaSuccess()'

    function onStreamAdded (evt) {
        console.log ("Remote stream received");
        document.getElementById("remoteVideo").src = URL.createObjectURL(evt.stream);
    }; // end of 'onStreamAdded()'

    function onIceCandidate (evt) {
        // Wait for all candidates to be gathered, and send our offer to our peer
        if (evt.target.iceGatheringState === "complete") {
            console.log ("ICE Gathering complete, sending SDP to peer.");

            // Haven't found a way to use one-line condition to substitute "offer" and "answer"
            if (isCaller) {
                var offerToSend = JSON.stringify ({ "from": nickname,
                                                    "offer": pc.localDescription
                                                });
                socket.send( JSON.stringify( {"target": peer, "sdp": offerToSend}));
                console.log ("Sent our offer");
            } else {
                var answerToSend = JSON.stringify ({ "from": nickname,
                                                    "answer": pc.localDescription
                                                });
                socket.send( JSON.stringify( {"target": peer, "sdp": answerToSend}));
                console.log ("Sent our answer");
                // Once we sent our answer, our part is finished and we can log out from the signalling server
                socket.close();
            }
        }
    };

//////////////////////////
/////////// OLD //////////
//////////////////////////    

    // Register an event when the connection is opened
/*
    socket.onopen = function() {
        // Just write on the console for debugging
        console.log("Socket is opened!");

        // Tell the user we are now connected
        document.getElementById("status").innerHTML = "<strong class=\"green\">connected!</strong>";

        // Send the server our nickname, so that we can be added to the connected user list and be called by a peer
        socket.send (JSON.stringify ({"nickname": nickname}));

        // Process incomming message from the server
        socket.onmessage = function(msg) {
            // Parse message (always use JSON in our case)
            var dat = JSON.parse(msg.data);

            // If we receive the userlist from the server, display it
            if (dat.userlist) {
                var l = dat.userlist;
                var domContent = "";

                // Add each user on the list and register a callback function to initiate the call
                l.forEach (function (elem) {
                    // Filter out our name from the list: we don't want to call ourselve!
                    if (elem !== nickname) {
                        domContent += "<li><button onclick='navigator.callUser(\"" + elem + "\");'>" + elem + "</button></li>";
                    }
                });

                // Add the generated user list to the DOM
                document.getElementById("userlist").innerHTML = domContent;
            } else if (dat.from) {
                if( null === peer) {
                    // Register the peer's nickname when needed
                    peer = dat.from;
                }

                // That's for the callee receiving its caller's RTC offer, register it as remote description
                if (dat.offer) {
                    // Let's remind that at this point, the callee has not created its RTCPeerConnection, so do it
                    if (null === pc) {
                        // Hide the signalling stuff from the callee and show up the oncall stuff
                        document.getElementById( 'signalling' ).style.display = "none";
                        document.getElementById( 'oncall' ).style.display = "block";

                        // Create the RTCPeerConnection
                        pc = new window.RTCPeerConnection( ice );

                        // addStream must be called before we set either local or remote description
                        navigator.getUserMedia( constraints, function (stream) {
                            console.log ("Sending our own stream...");
                            pc.addStream( stream );
                            document.getElementById( 'localVideo' ).src = window.URL.createObjectURL( stream );
                        }, function() {
                            console.log ("Failed to get media");
                        } );


                        // Register the event to show our peer's webcam in the <video> tag and ask for ours
                        pc.onaddstream = function( evt ) {
                            console.log( 'Remote peer\'s stream received.');
                            document.getElementById( 'remoteVideo' ).src = window.URL.createObjectURL( evt.stream );
                        };

                        pc.onicecandidate = function( evt ) {
                            // We inspect the gathering state to check whether the ICE agent is done
                            if( evt.target.iceGatheringState === "complete" ) {
                                // If we have a candidate, send it to out peer
                                if( evt.candidate ) {
                                    console.log( 'Sending candidate...' );
                                    var toSend = JSON.stringify( {  "from": nickname,
                                                                    "candidate": evt.candidate
                                                                });
                                    socket.send( JSON.stringify( {"target": peer, "sdp": toSend}));
                                }
                            }
                        }

                        // Add the newly-received offer from our peer
                        pc.setRemoteDescription (new window.RTCSessionDescription (dat.offer), function() {
                            // Create the RTC answer, set it as local description and send it
                            pc.createAnswer (function (answer) {
                                pc.setLocalDescription( answer, function() {
                                    // Send our answer to our peer, so that he can call 'setRemoteDescription()'
                                    var toSend = JSON.stringify( {  "from": nickname,
                                                                            "answer": answer
                                                                        });
                                    socket.send( JSON.stringify( {"target": peer, "sdp": toSend}));
                                }, function( err ) {
                                    console.log( 'ERROR - Could not set local description from answer: ' + err );
                                } );
                            }, function (err) {
                                console.log ("Could not create answer: " + err);
                            }, constraints);
                        }, function (err) {
                            console.log ("Can't set remote description: " + err);
                        });

                    } else {
                        alert ("ERROR - The pc was already initiated, looks like there was some mistake...");
                    }
                } else if (dat.answer) {
                    // Set the answer as remote description
                    pc.setRemoteDescription (new window.RTCSessionDescription (dat.answer), function() {
                        console.log ("Received answer and set it up as remote description.");
                    }, function (err) {
                        console.log ("Can't set remote description from answer: " + err);
                    });
                } else if (dat.candidate) {
                    pc.addIceCandidate (new RTCIceCandidate (dat.candidate));
                }
                
            } else {
                console.log ("Received bad-formatted data: " + msg.data);
            }
            
        };
    };
*/


    // Function to initiate a call
/*
    navigator.callUser = function (who) {
        // Only initiate a call if the RTCPeerConnection is not defined (this prevent multiple clicks)
        if( pc === null) {
            // Create the peer connection with the ice servers we specified earlier
            // pc = new mozRTCPeerConnection( ice );
            pc = new window.RTCPeerConnection( ice );

            console.log("calling " + who);
            peer = who;

            // Just display a feedback for the user
            document.getElementById('calling_status').innerHTML = "Calling " + who + " ...";

            // Register the event to react on a new ICE candidate
            // Remember that nothing happens before the 'setLocalDescription()' method is called!

            pc.onicecandidate = function( evt ) {
                // We inspect the gathering state to check whether the ICE agent is done
                if( evt.target.iceGatheringState === "complete" ) {
                    // If we have a candidate, send it to out peer
                    if( evt.candidate ) {
                        console.log( 'Sending candidate...' );
                        var toSend = JSON.stringify( {  "from": nickname,
                                                        "candidate": evt.candidate
                                                    });
                        socket.send( JSON.stringify( {"target": peer, "sdp": toSend}));
                    }
                }
            }

            // Register the event to show our peer's webcam in the <video> tag
            pc.onaddstream = function( evt ) {
                console.log( 'YAYAYAYAYAYAYAYAYAYAYAYAYAYAYAYAYAYAYAYAYA');
                document.getElementById( 'remoteVideo' ).src = window.URL.createObjectURL( evt.stream );
            };

            // Request media
            navigator.getUserMedia( constraints, gotMedia, failedMedia );
        } else {
            console.log( "Already in a call, can't call again" );
        }
    };
*/

    // Called if the media failed to be acquired
    function failedMedia() {
        alert( 'ERROR - Media could not be acquired');
        return;
    };

    // Called when the media is acquired: start the call
/*
    function gotMedia( stream ) {
        // Add our video stream to the <video> tag
        document.getElementById( 'localVideo' ).src = window.URL.createObjectURL( stream );

        // Hide the signalling stuff and show the call stuff
        document.getElementById( 'signalling' ).style.display = "none";
        document.getElementById( 'oncall' ).style.display = "block";

        // Add out stream to the RTCPeerConnection
        pc.addStream( stream );

        // Create the offer (will start the WebRTC exchanges)
        pc.createOffer( function( offer ) {
            // Set our local description from the offer: it will allow the ICE agent to start gathering
            pc.setLocalDescription( offer, function() {
                // Send our offer to our peer, so that he can call 'setRemoteDescription()'
                var toSend = JSON.stringify( {  "from": nickname,
                                                        "offer": offer
                                                    });
                socket.send( JSON.stringify( {"target": peer, "sdp": toSend}));
            }, function( err ) {
                console.log( 'ERROR - Could not set local description: ' + err );
            } );
        }, function( err ) {
            // console.log( 'Failed to create offer: ' + err.msg );
            alert( 'ERROR - Can\'t create offer: ' + err.message );
        });
    };
*/
});