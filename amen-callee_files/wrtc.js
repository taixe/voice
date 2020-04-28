var recorder_g, is_recording_g = !1, localStream_g = null, callId_g, is_video_call_g = !1, blob_g;

function invokeSaveAsDialog(file, fileName) {
    if (!file) {
        throw 'Blob object is required.';
    }

    if (!file.type) {
        try {
            file.type = 'video/webm';
        } catch (e) {}
    }

    var fileExtension = (file.type || 'video/webm').split('/')[1];

    if (fileName && fileName.indexOf('.') !== -1) {
        var splitted = fileName.split('.');
        fileName = splitted[0];
        fileExtension = splitted[1];
    }

    var fileFullName = (fileName || (Math.round(Math.random() * 9999999999) + 888888888)) + '.' + fileExtension;

    if (typeof navigator.msSaveOrOpenBlob !== 'undefined') {
        return navigator.msSaveOrOpenBlob(file, fileFullName);
    } else if (typeof navigator.msSaveBlob !== 'undefined') {
        return navigator.msSaveBlob(file, fileFullName);
    }

    var hyperlink = document.createElement('a');
    hyperlink.href = URL.createObjectURL(file);
    hyperlink.download = fileFullName;

    hyperlink.style = 'display:none;opacity:0;color:transparent;';
    (document.body || document.documentElement).appendChild(hyperlink);

    if (typeof hyperlink.click === 'function') {
        hyperlink.click();
    } else {
        hyperlink.target = '_blank';
        hyperlink.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        }));
    }

    (window.URL || window.webkitURL).revokeObjectURL(hyperlink.href);
}
  wr_save_recording = function(callId, fileName) {
    invokeSaveAsDialog(blob_g, fileName);
  };

  wr_delete_recording = function(callId) {
    blob_g = null
  };

var stopCallRecording = function() {
    is_recording_g && (recorder_g.stopRecording(function() {
        blob_g = recorder_g.getBlob(); recorder_g = localStream_g = callId_g = null
    }),
    is_recording_g = !1)
}


navigator.sayswho = (function(){
    var ua= navigator.userAgent, tem, 
    M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    if(/trident/i.test(M[1])){
        tem=  /\brv[ :]+(\d+)/g.exec(ua) || [];
        return 'IE '+(tem[1] || '');
    }
    if(M[1]=== 'Chrome'){
        tem= ua.match(/\b(OPR|Edge)\/(\d+)/);
        if(tem!= null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
    M= M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];
    if((tem= ua.match(/version\/(\d+)/i))!= null) M.splice(1, 1, tem[1]);
    return M.join(' ');
})();

function mozVidFreezeModSdp(sdp){
  try {
    console.log(sdp);
    var m = sdp.match(/m=video.*/g);
    if (!m) {
      return sdp;
    }
    console.log("sdp match");
    console.log(m);
    m=m[0];
    // get all video payload type numbers
    nums = m.match(/[0-9 ]*$/)[0].trim().split(' ');

    for (var nu in nums){
      // get rtp maps with video pts
      var sstr = "a=rtpmap:"+nums[nu]+" VP8/90000";
      var vpln = sdp.search(sstr);
      if (vpln == -1) {
        sstr = "a=rtpmap:"+nums[nu]+" VP9/90000";
        vpln = sdp.search("a=rtpmap:"+nums[nu]+" VP9/90000");
      }
      if (vpln == -1)
        continue; // skip pts that doesnt belong to vp8 or vp9

      var regex = new RegExp("a=fmtp:"+nums[nu]+".*");
      var st = sdp.match(regex);
      if (st) {
        var st = st[0];
        console.log(st);
        if (st) {
          if (st.search("max-fs") == -1) {
            var rep = st.replace('a=fmtp:'+nums[nu]+' ', 'a=fmtp:'+nums[nu]+' max-fs=12288;');
            sdp = sdp.replace(st, rep);
          }
        }
      } else {
        console.log("src:"+sstr);
        console.log("dst:"+sstr+"\r\na=fmtp:"+nums[nu]+" max-fs=12288");
        sdp = sdp.replace(sstr, sstr+"\r\na=fmtp:"+nums[nu]+" max-fs=12288");  
      }
    }
    console.log(sdp);
  } catch (err){console.log("Err "+err);}
  return sdp;
}

  var wr_recv_rem_offer = function(callId, localUiElem, isVideoCall, remoteUiElem, rqt) {
    var obj = window.CS.call;
    obj.localUiElem = document.getElementById(localUiElem);
    obj.remoteUiElem = document.getElementById(remoteUiElem);
    if (navigator.sayswho == "Firefox 56" || navigator.sayswho == "Firefox 57")
      obj.remoteSDP = mozVidFreezeModSdp(rqt.sSdp);
    else
      obj.remoteSDP = rqt.sSdp;
    console.log("wr_recv_rem_offer");

    navigator.mediaDevices.getUserMedia({audio:true, video:isVideoCall}).then(function(localStream){wr_get_local_stream_to_answer(localStream, callId);}).catch(getUserMediaFailed);
  };

  var getUserMediaFailed = function(error) {
      console.log("Get User Media Failed: ", error);
      //alert("Unable to get media! Check if another application locked audio/video driver?");
      //window.CS.call.callToCb(503, "Unable to get user media! Check if another application locked the audio/video driver");
  };

  var wr_on_error = function(error) {
      console.log("error: ", error);
  };

  var wr_recv_rem_end = function () {
    var obj = window.CS.call;
    if(obj.peerConnection) {
      obj.localStream.getTracks().forEach(function(track) { track.stop(); });
      obj.peerConnection.close();
      obj.peerConnection = null;
    }

    if (obj.localUiElem)
      obj.localUiElem.srcObject = undefined;
    if (obj.remoteUiElem)
      obj.remoteUiElem.srcObject = undefined;

    stopCallRecording();
  };

  var wr_recv_rem_ice = function (resp, callId) {
    console.log("received remote ice ");
    if (resp.sJsonIceCandidates.length == 0) {
      return;
    }
    var obj = window.CS.call;
    for (var i=0; i<resp.sJsonIceCandidates.length; i++) {
      var tmp = JSON.parse(resp.sJsonIceCandidates[i]).ice;
      console.log("received remote ice "+tmp);
      if (obj.peerConnection) {
          obj.peerConnection.addIceCandidate(new RTCIceCandidate(tmp));
      } else {
        console.log("ice candidate before peer connection creation");
        obj.callObj[callId].iceCandidates.push(tmp);
      }      
    }
  };


  var wr_recv_rem_answer = function (sdp, callId, type) {
    //sdp = sdp.replace(/172.31.36.89/ig, '52.26.193.237');
    var obj = window.CS.call;
    if(obj.peerConnection) {
      console.log(" received answer sdp as received modification "+sdp);
      if (navigator.sayswho == "Firefox 56" || navigator.sayswho == "Firefox 57") {
        sdp = mozVidFreezeModSdp(sdp);
        console.log(" received answer sdp after modification "+sdp);
      }
      obj.peerConnection.setRemoteDescription(new RTCSessionDescription({"type": type, "sdp":sdp}));
      var icelen = obj.callObj[callId].iceCandidates.length;
      for (var i = 0 ; i < icelen ; i++) {
        var candidate = obj.callObj[callId].iceCandidates.pop();
        obj.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
    if (type == "pranswer") {
        for (i in localice) {
          obj.sendIce(localice[i].remoteUser, localice[i].candidate, localice[i].tmp, localice[i].callId, function(ret, resp) {
            console.log("response from sendicetoserver "+ret);
          });
        }
    }
  }


  var wr_handleError = function (event){};

  var wr_gotRemoteStream = function (event, callId){
    var obj = window.CS.call;
    if (obj.remoteUiElem.srcObject !== event.stream) {
      obj.remoteUiElem.srcObject = event.stream;
      console.log("Received remote stream");
      if( callId && window.CS.call.callObj[callId].is_record_callTrue ) { 
        console.log(event.stream.getAudioTracks()),
        config = {};
        config = obj.callObj[callId].isVideoCall? {
            type: "video",
            mimeType: "video/webm"
          } : {
            type: "audio",
            mimeType: "audio/webm"
          };
        recorder_g = RecordRTC([event.stream, obj.localStream], config);
        is_recording_g = true;
        recorder_g.startRecording();
       }
    }
  };

  var wr_get_local_sdp = function (description, callId){
    var obj = window.CS.call;
    console.log(" local sdp "+description.sdp);
    obj.peerConnection.setLocalDescription(description).then(function(){sendLocalSDPOffer(callId);}).catch(wr_on_error);
  };

  function randNum(){
    return Math.ceil(Math.random()* 1000000000);
  };

  var sendLocalSDPOffer = function(callId){
    var obj = window.CS.call;
    var tmpid = randNum();
    if(obj.callObj[callId].type == "IP") {
      var payload = {uVersion:obj.super.protoVersion, stDirectAudioVideoCallStartReq:{stHdrs:{sMobNu:obj.super.localUser, sClientId:obj.super.clientId, ullTransId:tmpid}, sDstMobNu:obj.remoteUser, stCallType:obj.super.proto_callType.values.E_VIDEOCALL, sCallId:callId, sSdp:obj.peerConnection.localDescription.sdp, sCallActive:true, sStartTime:Math.floor(Date.now())}};
      if (!obj.isVideoCall)
        payload.stDirectAudioVideoCallStartReq.stCallType = obj.super.proto_callType.values.E_VOICECALL;
      window.CS.send_msg(obj.super, false, obj.super.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_START_RQT, payload);
    } else if (obj.callObj[callId].type == "PSTN") {
      var payload = {uVersion:obj.super.protoVersion, stCallStartReq:{stHdrs:{sMobNu:obj.super.localUser, sClientId:obj.super.clientId, ullTransId:tmpid}, sDstMobNu:obj.remoteUser, stCallType:obj.super.proto_callType.values.E_VOICECALL, sCallId:callId, sSdp:obj.peerConnection.localDescription.sdp}};
      window.CS.send_msg(obj.super, false, obj.super.proto_msgType.values.E_CALL_START_RQT, payload);
    }
  };

  var wr_send_remote_answer = function (description, callId){
    var obj = window.CS.call;
    obj.peerConnection.setLocalDescription(description).then(function(){sendAnswerSDP(callId);}).catch(wr_on_error);

    var icelen = obj.callObj[callId].iceCandidates.length;
    console.log("send_remote_answer iceCandidates len "+icelen);
    for (var i = 0 ; i < icelen ; i++) {
      var candidate = obj.callObj[callId].iceCandidates.pop();
      obj.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("callee adding ice "+i);
    }
  };

  var sendAnswerSDP = function(callId){
    var obj = window.CS.call;
    obj.sendAnswer(callId, obj.peerConnection.localDescription.sdp, function(err, resp) {
      console.log("answer sent "+err);
    });
  };

  var wr_send_rem_call_end = function() {
    var obj = window.CS.call;

    if(obj.localStream)
      obj.localStream.getTracks().forEach(function(track) { track.stop(); });

    stopCallRecording();

    if(obj.peerConnection) {
      obj.peerConnection.close();
      obj.peerConnection = null;
      obj.localUiElem.srcObject = undefined;
      obj.remoteUiElem.srcObject = undefined;
    }
  };

  window.CS.servers = {
    'iceServers': [
       {'urls': window.CS.stun},
       {
        'urls': window.CS.turn,
        'username': window.CS.turnUser,
        'credential': window.CS.turnPassword 
       },
    ]
  };

  var wr_get_local_stream_to_answer = function(localStream, callId) {
    var obj = window.CS.call;
    obj.localUiElem.srcObject = localStream;
    obj.localStream = localStream;
    console.log("wr_get_local_stream_to_answer");

    obj.peerConnection = new RTCPeerConnection(window.CS.servers);
    obj.peerConnection.onicecandidate = function (event) {
      if (event.candidate) {
        var tmp = JSON.stringify({'ice':event.candidate});
        console.log("local ice candidate "+tmp);
        obj.sendIce(obj.remoteUser, event.candidate.candidate, tmp, callId, function(ret, resp) {
        });
      }
    };

    obj.peerConnection.onaddstream = function(event){wr_gotRemoteStream(event, callId);};
    //obj.peerConnection.ontrack = wr_gotRemoteStream;
    obj.peerConnection.onsignalingstatechange = function(event) {
      //console.log("---------------->>>  Call state changed to ");
      //console.dir(event);
      //var state = obj.peerConnection.iceConnectionState;
      //console.log(state);
    };
    obj.peerConnection.addStream(localStream);
    obj.peerConnection.setRemoteDescription(new RTCSessionDescription({"type":"offer", "sdp":obj.remoteSDP}));
    //localStream.getTracks().forEach(
    //  function(track) {
    //    obj.peerConnection.addTrack(track, localStream);
    //  }
    //);
    obj.peerConnection.createAnswer().then(function(description){wr_send_remote_answer(description, callId);}).catch(wr_handleError);
  };

  var localice = [];
  var wr_create_local_stream_to_offer = function(localStream, callId) {
    var obj = window.CS.call;
    obj.localUiElem.srcObject = localStream;
    obj.localStream = localStream;

    obj.peerConnection = new RTCPeerConnection(window.CS.servers);
    console.log("created peer connection");
    obj.peerConnection.onicecandidate = function (event) {
      if (event.candidate) {
        var tmp = JSON.stringify({'ice':event.candidate});
        console.log("local ice "+tmp);
        if (obj.callObj[callId].type == "IP") {
          obj.sendIce(obj.remoteUser, event.candidate.candidate, tmp, callId, function(ret, resp) {
            console.log("response from sendicetoserver "+ret);
          });
        } else {
          localice.push({remoteUser:obj.remoteUser, candidate:event.candidate.candidate, tmp:tmp, callId:callId});
        }
      }
    };

    obj.peerConnection.onaddstream = function(event){wr_gotRemoteStream(event, callId);};
    //obj.peerConnection.ontrack = wr_gotRemoteStream;
    obj.peerConnection.onsignalingstatechange = function(event) {
      //console.log("---------------->>>  Call state changed to ");
      //console.dir(event);
      //var state = obj.peerConnection.iceConnectionState;
      //console.log(state);
    };
    obj.peerConnection.addStream(localStream);
    //localStream.getTracks().forEach(
    //  function(track) {
    //    obj.peerConnection.addTrack(track, localStream);
    //  }
    //);
    //obj.peerConnection.createOffer(wr_get_local_sdp, wr_handleError);
    obj.peerConnection.createOffer().then(function(description){wr_get_local_sdp(description, callId);}).catch(wr_handleError);
  };

  var wr_send_rem_call = function(obj, callId, isVideoCall, localUiElem, remoteUiElem) {
    obj.localUiElem = document.getElementById(localUiElem);
    obj.remoteUiElem = document.getElementById(remoteUiElem);
    navigator.mediaDevices.getUserMedia({audio:true, video:isVideoCall}).then(function(localStream){wr_create_local_stream_to_offer(localStream, callId);}).catch(getUserMediaFailed);
  };


  var wr_set_local_mute = function(obj, callId, cb) {
    var senders = obj.peerConnection.getSenders();
    senders.forEach(function(element) {
      if (element.track.kind == "audio")
        element.track.enabled = false;
    });
    cb(100, "Ok");
  };

  var wr_set_local_unmute = function(obj, callId, cb) {
    var senders = obj.peerConnection.getSenders();
    senders.forEach(function(element) {
      if (element.track.kind == "audio")
        element.track.enabled = true;
    });
    cb(100, "Ok");
  };


