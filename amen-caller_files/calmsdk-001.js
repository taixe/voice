'use strict';
(function (window) {
  var rest_support_msg = "rest unsupported in current release";
  var iml_server_address;// = "wss://proxy.vox-cpaas.com:8989";

  /* Enums */
  var TransportTypes = {"socket":0, "rest":1};
  var ConnectionStates = {"initiated":0, "connected":1, "ready":2, "error":3, "closed":4}; /* state is ready after successful login */

  function get_transport_type() { return ("WebSocket" in window || window.WebSocket) ? TransportTypes["socket"] : TransportTypes["rest"]; }

  var HDR_LEN = 10;
  var __rcvBuffLen = 0, __rcvBuffer = new ArrayBuffer(0), __payloadLen=0, __msgType=0;
  var __rcvState = 0; /* 0-Header, 1-Body */
  var OneSignalId = "";


  /* TODO: create timer for each request. if response is not received before timer expires give failure response to caller */
  /* TODO: group proto enums into groups such as chat, call, stream, contacts etc and call common api for handling incoming request. */
  /* TODO: store callback for each transaction id, in order to avoid callback overriding between successive calls */
  // ### process all incoming messages.
  var processJsonMsg = function(obj, msgType, buf) {
    let callId="";
    switch(msgType) {
      case obj.proto_msgType.values.E_SIGNUP_RSP:
	      if (window.CS.transactionRespCB[buf.stSignUpRes.ullTransId])
            window.CS.transactionRespCB[buf.stSignUpRes.ullTransId](obj.imlrespcode[buf.stSignUpRes.ret].code, obj.imlrespcode[buf.stSignUpRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_ACTIVATE_RSP:
          if (window.CS.transactionRespCB[buf.stActivateRes.ullTransId])
            window.CS.transactionRespCB[buf.stActivateRes.ullTransId](obj.imlrespcode[buf.stActivateRes.ret].code, obj.imlrespcode[buf.stActivateRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_LOGIN_RSP:
        if (window.CS.transactionRespCB[buf.stLoginRes.ullTransId])
          window.CS.transactionRespCB[buf.stLoginRes.ullTransId](obj.imlrespcode[buf.stLoginRes.ret].code, obj.imlrespcode[buf.stLoginRes.ret].phrase);
        if (buf.stLoginRes.ret) {
          obj.loggedin = true;
        }
        window.CS.s3Bin = buf.stLoginRes.sBucketName;
        var d = new Date();
        window.CS.timeOffset = buf.stLoginRes.uServerTime - d.getTime(); 
        break;
      case obj.proto_msgType.values.E_GET_CONTACTS_RSP:
        if (window.CS.transactionRespCB[buf.stGetContactsRes.ullTransId])
            window.CS.transactionRespCB[buf.stGetContactsRes.ullTransId](obj.imlrespcode[buf.stGetContactsRes.ret].code, {contacts:buf.stGetContactsRes.sPhoneNums, types:buf.stGetContactsRes.stContactTypes});
        break;
      case obj.proto_msgType.values.E_IS_APP_CONTACT_RSP:
          var contacts = [], p = buf.stIsAppContactRes.sPhoneNums, profile = buf.stIsAppContactRes.stProfile;
          for (var i = 0; i< p.length; i++) {
            contacts[i] = {"mobileNumber":p[i], "name":profile[i].sUserName, "presenceMessage":profile[i].sPresenceStatusMsg, "profilePicId":profile[i].sProfilePicId};
          }
          if (window.CS.transactionRespCB[buf.stIsAppContactRes.ullTransId])
            window.CS.transactionRespCB[buf.stIsAppContactRes.ullTransId](obj.imlrespcode[buf.stIsAppContactRes.ret].code, contacts);
        break;
      case obj.proto_msgType.values.E_USER_JOINED_RQT:
          if (window.CS.transactionRespCB[buf.stUserJoinedReq.ullTransId])
            window.CS.transactionRespCB[buf.stUserJoinedReq.ullTransId](obj.contactsStatus[msgType].status, {"mobileNumber":buf.stUserJoinedReq.sJoinedUserMobNu});
        break;
      case obj.proto_msgType.values.E_ADD_NUM_RSP:
        if (window.CS.transactionRespCB[buf.stAddNumRes.ullTransId])
          window.CS.transactionRespCB[buf.stAddNumRes.ullTransId](obj.imlrespcode[buf.stAddNumRes.ret].code, obj.imlrespcode[buf.stAddNumRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_180_RINGING_RSP:
        break;
      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_180_RINGING_RQT:
          obj.call.callObj[buf.stDirectAudioVideoCall180RingingReq.sCallId].state = obj.call.RINGING_RECEIVED;
          var payload = {uVersion:obj.protoVersion, stDirectAudioVideoCall180RingingRes:{ullTransId:buf.stDirectAudioVideoCall180RingingReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stDirectAudioVideoCall180RingingReq.sCallId, retCodes:obj.proto_retCodes.values.E_200_OK}};
          send_msg(obj, false, obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_180_RINGING_RSP, payload);
          if(window.CS.call.onMessagecb)
            window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {callId:buf.stDirectAudioVideoCall180RingingReq.sCallId});
        break;
      case obj.proto_msgType.values.E_GET_PRESENCE_RSP:
        var presence = [];
        for (var i in buf.stGetPresRes.stPresence) {
          var v = {"mobileNumber": buf.stGetPresRes.stPresence[i].sPhoneNum, "isOnline":true, "lastLoginTime":buf.stGetPresRes.stPresence[i].sTime, "statusMessage":buf.stGetPresRes.stPresence[i].sPresenceStatusMsg};
          if(buf.stGetPresRes.stPresence[i].sStatus == "OFFLINE") 
            v.isOnline = false;
          presence.push(v);
        }
        if (window.CS.transactionRespCB[buf.stGetPresRes.ullTransId])
          window.CS.transactionRespCB[buf.stGetPresRes.ullTransId](obj.imlrespcode[buf.stGetPresRes.ret].code, presence);
        break;
      case obj.proto_msgType.values.E_SET_PROFILE_RSP:
        if (window.CS.transactionRespCB[buf.stSetProfileRes.ullTransId])
          window.CS.transactionRespCB[buf.stSetProfileRes.ullTransId](obj.imlrespcode[buf.stSetProfileRes.ret].code, obj.imlrespcode[buf.stSetProfileRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_GET_PROFILE_RSP:
        if (window.CS.transactionRespCB[buf.stGetProfileRes.ullTransId])
          window.CS.transactionRespCB[buf.stGetProfileRes.ullTransId](obj.imlrespcode[buf.stGetProfileRes.ret].code, {"displayName":buf.stGetProfileRes.stProfile.sUserName, "Presence":buf.stGetProfileRes.stProfile.sPresenceStatusMsg, "profilePicture":buf.stGetProfileRes.stProfile.sProfilePicId});
        break;
      case obj.proto_msgType.values.E_USER_PROFILE_CHANGED_RQT:
        if(window.CS.contacts.onpresenceupdatecb) {
          var payload = {"mobilenumber":buf.stUserProfileChangedReq.sProfileUserMobNu};
          if (buf.stUserProfileChangedReq.stProfile.sUserName)
            payload["name"] = buf.stUserProfileChangedReq.stProfile.sUserName;
          if (buf.stUserProfileChangedReq.stProfile.sPresenceStatusMsg)
            payload["message"] = buf.stUserProfileChangedReq.stProfile.sPresenceStatusMsg;
          if (buf.stUserProfileChangedReq.stProfile.sProfilePicId) 
            payload["profilePicUrl"] = buf.stUserProfileChangedReq.stProfile.sProfilePicId;
          window.CS.contacts.onpresenceupdatecb(obj.contactsStatus[msgType].status, payload);
        }
        var payload = {uVersion:obj.protoVersion, stUserProfileChangedRes:{ullTransId:buf.stUserProfileChangedReq.stHdrs.ullTransId, sMobNu:obj.localUser, sProfileUserMobNu:buf.stUserProfileChangedReq.sProfileUserMobNu, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_USER_PROFILE_CHANGED_RSP, payload);
        break;
      case obj.proto_msgType.values.E_CHAT_RQT:
        var payload = {uVersion:obj.protoVersion, stChatRes:{ullTransId:buf.stChatReq.stHdrs.ullTransId, sMobNu:obj.localUser, uChatID:buf.stChatReq.uChatID, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_CHAT_RSP, payload);
        window.CS.chat.sendChatResponse(buf.stChatReq);
        window.CS.chat.sendDelivered(buf.stChatReq.stHdrs.sMobNu, buf.stChatReq.uChatID, 0, function(req, resp){});
        if (window.CS.chat.onMessagecb) {
          var data = {"remoteUser":buf.stChatReq.stHdrs.sMobNu, "data":buf.stChatReq.data, "timestamp":buf.stChatReq.uSendTime, "id":buf.stChatReq.uChatID, "sequence":buf.stChatReq.uSeqNum, "size":buf.stChatReq.dataLen, "chattype":obj.chatType[buf.stChatReq.stChatType].type};
          if (buf.stChatReq.sContentType)
            data.contenttype = buf.stChatReq.sContentType;
          if (buf.stChatReq.sThumbnailUrl)
            data.thumbnail = buf.stChatReq.sThumbnailUrl;
          window.CS.chat.onMessagecb(obj.chatRequestType[obj.proto_msgType.values.E_CHAT_RQT], data);
        }
        break;
      case obj.proto_msgType.values.E_CHAT_RSP:
        var data = obj.imlrespcode[buf.stChatRes.ret].phrase;
        if (window.CS.respData[buf.stChatRes.ullTransId]) {
          data = {"status":obj.imlrespcode[buf.stChatRes.ret].phrase, "url":window.CS.respData[buf.stChatRes.ullTransId].fileName}; 
        }
        if (window.CS.transactionRespCB[buf.stChatRes.ullTransId])
          window.CS.transactionRespCB[buf.stChatRes.ullTransId](obj.imlrespcode[buf.stChatRes.ret].code, data);

        if (window.CS.chat.onMessagecb)
          window.CS.chat.onMessagecb(obj.chatRequestType[obj.proto_msgType.values.E_CHAT_RSP], {"id":buf.stChatRes.uChatID, "status":obj.imlrespcode[buf.stChatRes.ret].code, "remoteUser":buf.stChatRes.sMobNu});
        break;
      case obj.proto_msgType.values.E_GET_MY_PENDING_NOTIFICATIONS_RSP:
        if (window.CS.transactionRespCB[buf.stGetMyPendingNotificationsRes.ullTransId])
          window.CS.transactionRespCB[buf.stGetMyPendingNotificationsRes.ullTransId](obj.imlrespcode[buf.stGetMyPendingNotificationsRes.ret].code, obj.imlrespcode[buf.stGetMyPendingNotificationsRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_IS_TYPING_RQT:
        var payload = {uVersion:obj.protoVersion, stIsTypingRes:{ullTransId:buf.stIsTypingReq.stHdrs.ullTransId, eReturnCode:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_IS_TYPING_RSP, payload);
        if (window.CS.chat.onMessagecb)
          window.CS.chat.onMessagecb(obj.chatRequestType[obj.proto_msgType.values.E_IS_TYPING_RQT], {"remoteUser":buf.stIsTypingReq.sDstMobNu, "groupId":buf.stIsTypingReq.sGroupID});
        break;
      case obj.proto_msgType.values.E_CHAT_DELIVERY_RQT:
        console.log("chat delivered");
        var payload = {uVersion:obj.protoVersion, stChatDeliveryRes:{ullTransId:buf.stChatDeliveryReq.stHdrs.ullTransId, sMobNu:obj.localUser, uChatID:buf.stChatDeliveryReq.uChatID, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_CHAT_DELIVERY_RSP, payload);
        if (window.CS.chat.onMessagecb)
          window.CS.chat.onMessagecb(obj.chatRequestType[obj.proto_msgType.values.E_CHAT_DELIVERY_RQT], {"id":buf.stChatDeliveryReq.uChatID, "time":buf.stChatDeliveryReq.uDeliveryTime, "remoteUser":buf.stChatDeliveryReq.stHdrs.sMobNu});
        break;
      case obj.proto_msgType.values.E_CHAT_READ_RQT:
        console.log("chat read");
        var payload = {uVersion:obj.protoVersion, stChatReadRes:{ullTransId:buf.stChatReadReq.stHdrs.ullTransId, sMobNu:obj.localUser, uChatID:buf.stChatReadReq.uChatID, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_CHAT_READ_RSP, payload);
        if (window.CS.chat.onMessagecb)
          window.CS.chat.onMessagecb(obj.chatRequestType[obj.proto_msgType.values.E_CHAT_READ_RQT], {"id":buf.stChatReadReq.uChatID, "time":buf.stChatReadReq.uReadTime, "remoteUser":buf.stChatReadReq.stHdrs.sMobNu});
        break;
      case obj.proto_msgType.values.E_CHAT_DELIVERY_RSP:
        if (window.CS.transactionRespCB[buf.stChatDeliveryRes.ullTransId])
          window.CS.transactionRespCB[buf.stChatDeliveryRes.ullTransId](obj.imlrespcode[buf.stChatDeliveryRes.ret].code, obj.imlrespcode[buf.stChatDeliveryRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_GET_CHAT_HISTORY_LIST_RSP:
          var history = [], listArr = buf.stGetChatHistoryListRes.stChatHistoryList;
          var listLen = listArr.length;
          for (var i = 0 ; i < listLen ; i++) {
            history[i] = {"id":listArr[i].sChatID, "src":listArr[i].ssrcMobNu, "dst":listArr[i].sDstMobNu, "sequenceNo":listArr[i].ullSeqNum, "sentTimestamp":listArr[i].ullMessageTime, "chatType":obj.chatType[listArr[i].eChatType].type , "reportsRequested":listArr[i].uReportsReq, "data":listArr[i].sData, "contentType":listArr[i].sContentType, "thumbUrl":listArr[i].sThumbnailUrl, "messageStatus":obj.chatStatus[listArr[i].eStatus].status, "deliveredTimestamp":listArr[i].ullDeliveryTime, "readTimestamp":listArr[i].ullReadTime};
            if(listArr[i].sThumbnailUrl) {
              history[i].thumbnail = listArr[i].sThumbnailUrl;
            }
          }
        if (window.CS.transactionRespCB[buf.stGetChatHistoryListRes.ullTransId])
          window.CS.transactionRespCB[buf.stGetChatHistoryListRes.ullTransId](obj.imlrespcode[buf.stGetChatHistoryListRes.eReturnCode].code, {"totalMessages":buf.stGetChatHistoryListRes.sTotalNumberOfEntries, "pageSize":buf.stGetChatHistoryListRes.sPageSize, "history":history});
        break;
      case obj.proto_msgType.values.E_GET_CALL_HISTORY_LIST_RSP:
          var history = [], listArr = buf.stGetCallHistoryListRes.stCallHistoryList;
          var listLen = listArr.length;
          for (var i = 0 ; i < listLen ; i++) {
            history[i] = {"id":listArr[i].sCallID, "src":listArr[i].ssrcMobNu, "dst":listArr[i].sDstMobNu, "callType":obj.callType[listArr[i].eCallType].type, "direction":obj.direction[listArr[i].eDirection].type, "status":obj.callStatus[listArr[i].eStatus].status, "startTime":listArr[i].ullStartTime, "endTime":listArr[i].ullEndTime};
          }
        if (window.CS.transactionRespCB[buf.stGetCallHistoryListRes.ullTransId])
          window.CS.transactionRespCB[buf.stGetCallHistoryListRes.ullTransId](obj.imlrespcode[buf.stGetCallHistoryListRes.eReturnCode].code, {"totalMessages":buf.stGetCallHistoryListRes.sTotalNumberOfEntries, "pageSize":buf.stGetCallHistoryListRes.sPageSize, "history":history});
        break;
      case obj.proto_msgType.values.E_GET_RECENT_CONVERSATION_LIST_RSP:
          var history = [], listArr = buf.stGetRecentConversationListRes.stConversationList;
          for (var i=0; i < listArr.length; i++) {
            history[i] = {"messageType":obj.recentMsgType[listArr[i].eConversationType].type};

            if (listArr[i].stChatHistoryList) {
              var e = listArr[i].stChatHistoryList;
              history[i]["chat"] = {"id":e.sChatID, "src":e.ssrcMobNu, "dst":e.sDstMobNu, "sequenceNo":e.ullSeqNum, "sentTimestamp":e.ullMessageTime, "chatType":obj.chatType[e.eChatType].type , "reportsRequested":e.uReportsReq, "data":e.sData, "contentType":e.sContentType, "thumbUrl":e.sThumbnailUrl, "messageStatus":obj.chatStatus[e.eStatus].status, "deliveredTimestamp":e.ullDeliveryTime, "readTimestamp":e.ullReadTime};
            } 

            if (listArr[i].stCallHistoryList) {
              var e = listArr[i].stCallHistoryList;
              history[i]["call"] = {"callId":e.sCallID, "src":e.ssrcMobNu, "dst":e.sDstMobNu, "callType":obj.callType[e.eCallType].type, "direction":obj.direction[e.eDirection].type, "status":obj.callStatus[e.eStatus].status, "startTime":e.ullStartTime, "endTime":e.ullEndTime};
            }
          }
          if (window.CS.transactionRespCB[buf.stGetRecentConversationListRes.ullTransId])
            window.CS.transactionRespCB[buf.stGetRecentConversationListRes.ullTransId](obj.imlrespcode[buf.stGetRecentConversationListRes.eReturnCode].code, {"totalMessages":buf.stGetRecentConversationListRes.sTotalNumberOfEntries, "pageSize":buf.stGetRecentConversationListRes.sPageSize, "list":history});
          break;
      case obj.proto_msgType.values.E_CHAT_READ_RSP:
          if (window.CS.transactionRespCB[buf.stChatReadRes.ullTransId])
            window.CS.transactionRespCB[buf.stChatReadRes.ullTransId](obj.imlrespcode[buf.stChatReadRes.ret].code, obj.imlrespcode[buf.stChatReadRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_DELETE_NUM_RSP:
        if (window.CS.transactionRespCB[buf.stDeleteNumRes.ullTransId])
          window.CS.transactionRespCB[buf.stDeleteNumRes.ullTransId](obj.imlrespcode[buf.stDeleteNumRes.ret].code, obj.imlrespcode[buf.stDeleteNumRes.ret].phrase);
	break;
				
      case obj.proto_msgType.values.E_INCOMING_CALL_START_RQT:
        callId = buf.stIncomingCallStartReq.sCallId;
        obj.call.remoteUser = buf.stIncomingCallStartReq.stHdrs.sMobNu;
        obj.call.stIncomingCallStartReq = buf.stIncomingCallStartReq;

        obj.call.isVideoCall = obj.proto_callType.values.E_VIDEOCALL == buf.stIncomingCallStartReq.stCallType;

        var payload = {uVersion:obj.protoVersion, stIncomingCallStartRes:{ullTransId:buf.stIncomingCallStartReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stIncomingCallStartReq.sCallId, sDstNumber: buf.stIncomingCallStartReq.sDstMobNu, sBrandPin: buf.stIncomingCallStartReq.sBrandPin, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_INCOMING_CALL_START_RSP, payload);

	obj.call.callObj[callId] = {state:obj.call.states.OFFER_RECEIVED, remoteUser:obj.call.remoteUser, type:"PSTN", direction:"IN", isMuted:false, iceCandidates:[], isVideoCall:obj.call.isVideoCall, is_record_callTrue:false, media_server_id:buf.stIncomingCallStartReq.sMediaServerId};
					
        if (window.CS.call.onMessagecb)
           window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, "isVideoCall":obj.call.isVideoCall, callId:callId, isCallActive:buf.stIncomingCallStartReq.sCallActive, startTime:buf.stIncomingCallStartReq.sStartTime});
        break;


      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_START_RQT:
        callId = buf.stDirectAudioVideoCallStartReq.sCallId;
        obj.call.remoteUser = buf.stDirectAudioVideoCallStartReq.stHdrs.sMobNu;
        obj.call.stDirectAudioVideoCallStartReq = buf.stDirectAudioVideoCallStartReq;

        obj.call.isVideoCall = obj.proto_callType.values.E_VIDEOCALL == buf.stDirectAudioVideoCallStartReq.stCallType;

        var payload = {uVersion:obj.protoVersion, stDirectAudioVideoCallStartRes:{ullTransId:buf.stDirectAudioVideoCallStartReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stDirectAudioVideoCallStartReq.sCallId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_START_RSP, payload);

        var payload = {uVersion:obj.protoVersion, stDirectAudioVideoCall180RingingReq:{stHdrs:{sMobNu:window.CS.localUser, sClientId:window.CS.clientId, ullTransId:randNum()}, sDstMobNu:window.CS.call.remoteUser, stCallType:window.CS.proto_callType.values.E_VIDEOCALL, sCallId:callId}};
        if (obj.proto_callType.values.E_VOICECALL == buf.stDirectAudioVideoCallStartReq.stCallType)
          payload.stDirectAudioVideoCall180RingingReq.stCallType = obj.proto_callType.values.E_VOICECALL;

        var is_busy = false;
        for (var cobj in obj.call.callObj) {
          if ((obj.call.callObj[cobj].state != obj.call.states.IDLE) && (obj.call.callObj[cobj].state != obj.call.states.ENDED)) 
            is_busy = true;
        }
        payload.stDirectAudioVideoCall180RingingReq.bIsCallWaiting = is_busy;
        obj.call.callObj[callId] = {state:obj.call.states.OFFER_RECEIVED, remoteUser:obj.call.remoteUser, type:"IP", direction:"IN", isMuted:false, iceCandidates:[], isVideoCall:obj.call.isVideoCall, is_record_callTrue:false};
        send_msg(obj, false, obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_180_RINGING_RQT, payload);
        if(window.CS.call.onMessagecb)
          window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, "isVideoCall":obj.call.isVideoCall, callId:callId, isCallActive:buf.stDirectAudioVideoCallStartReq.sCallActive, startTime:buf.stDirectAudioVideoCallStartReq.sStartTime});
        break;
      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_START_RSP:
      case obj.proto_msgType.values.E_CALL_START_RSP:
        break;
     case obj.proto_msgType.values.E_CALL_ANSWER_RQT:
        obj.call.callObj[buf.stCallAnswerReq.sCallId].state = obj.call.states.CONNECTED;
        obj.call.activeCallId = buf.stCallAnswerReq.sCallId;
        if(window.CS.call.onMessagecb)
          window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, callId:buf.stCallAnswerReq.sCallId});
        console.log("answer_rqt");
	wr_recv_rem_answer(buf.stCallAnswerReq.sSdp, buf.stCallAnswerReq.sCallId, "answer");
        var payload = {uVersion:obj.protoVersion, stCallAnswerRes:{ullTransId:buf.stCallAnswerReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stCallAnswerReq.sCallId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_CALL_ANSWER_RSP, payload);
        break;
     case obj.proto_msgType.values.E_CALL_SESSION_IN_PROGRESS_SDP_RQT:
        console.log("session in progress request");
        obj.call.callObj[buf.stCallSessionInProgressSdpReq.sCallId].state = obj.call.states.CONNECTED;
        obj.call.activeCallId = buf.stCallSessionInProgressSdpReq.sCallId;
	wr_recv_rem_answer(buf.stCallSessionInProgressSdpReq.sSdp, buf.stCallSessionInProgressSdpReq.sCallId, "pranswer");
        if(obj.call.callObj[buf.stCallSessionInProgressSdpReq.sCallId].state != obj.call.states.CONNECTED && window.CS.call.onMessagecb)
          window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, callId:buf.stCallSessionInProgressSdpReq.sCallId});
        var payload = {uVersion:obj.protoVersion, stCallSessionInProgressSdpRes:{ullTransId:buf.stCallSessionInProgressSdpReq.stHdrs.ullTransId, sMobNu:obj.localUser, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_CALL_SESSION_IN_PROGRESS_SDP_RSP, payload);
        break;
     case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_ANSWER_RQT:
        obj.call.callObj[buf.stDirectAudioVideoCallAnswerReq.sCallId].state = obj.call.states.CONNECTED;
        obj.call.activeCallId = buf.stDirectAudioVideoCallAnswerReq.sCallId;
        if(window.CS.call.onMessagecb)
          window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, callId:buf.stDirectAudioVideoCallAnswerReq.sCallId});
	wr_recv_rem_answer(buf.stDirectAudioVideoCallAnswerReq.sSdp, buf.stDirectAudioVideoCallAnswerReq.sCallId, "answer");
        var payload = {uVersion:obj.protoVersion, stDirectAudioVideoCallAnswerRes:{ullTransId:buf.stDirectAudioVideoCallAnswerReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stDirectAudioVideoCallAnswerReq.sCallId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_ANSWER_RSP, payload);
        break;
      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_ANSWER_RSP:
        console.log("received answer response");
        if (window.CS.transactionRespCB[buf.stDirectAudioVideoCallAnswerRes.ullTransId])
          window.CS.transactionRespCB[buf.stDirectAudioVideoCallAnswerRes.ullTransId](obj.imlrespcode[buf.stDirectAudioVideoCallAnswerRes.ret].code, obj.imlrespcode[buf.stDirectAudioVideoCallAnswerRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_INCOMING_CALL_ENDED_RQT:
        // Prasun: Venu change stDirectAudioVideoCallEndReq to stIncomingCallEndedReq and change parameter appropriately
        callId = buf.stIncomingCallEndedReq.sCallId;
        obj.call.activeCallId = "";
        if(!obj.call.callObj[callId])
           return;
        obj.call.callObj[callId].state = obj.call.states.ENDED;
        obj.call.remoteUser = buf.stIncomingCallEndedReq.stHdrs.sMobNu; /* TODO: move remoteUser to callObj */
        window.CS.call.onMessagecb && window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, callId:callId});
        var payload = {uVersion:obj.protoVersion, stIncomingCallEndedRes:{ullTransId:buf.stIncomingCallEndedReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:callId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_INCOMING_CALL_ENDED_RSP, payload);
        wr_recv_rem_end();
        break;

      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_END_RQT:
        callId = buf.stDirectAudioVideoCallEndReq.sCallId;
        obj.call.activeCallId = "";
        if(!obj.call.callObj[callId])
           return;
        obj.call.callObj[callId].state = obj.call.states.ENDED;
        obj.call.remoteUser = buf.stDirectAudioVideoCallEndReq.stHdrs.sMobNu; /* TODO: move remoteUser to callObj */
        window.CS.call.onMessagecb && window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, callId:callId});
        var payload = {uVersion:obj.protoVersion, stDirectAudioVideoCallEndRes:{ullTransId:buf.stDirectAudioVideoCallEndReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:callId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_END_RSP, payload);
        wr_recv_rem_end();
        break;
      
      case obj.proto_msgType.values.E_CALL_ENDED_RQT:
        callId = buf.stCallEndedReq.sCallId;
        obj.call.activeCallId = "";
        if(!obj.call.callObj[callId])
           return;
        obj.call.callObj[callId].state = obj.call.states.ENDED;
        obj.call.remoteUser = buf.stCallEndedReq.stHdrs.sMobNu; /* TODO: move remoteUser to callObj */
        window.CS.call.onMessagecb && window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":obj.call.remoteUser, callId:callId});
        var payload = {uVersion:obj.protoVersion, stCallEndedRes:{ullTransId:buf.stCallEndedReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:callId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_CALL_ENDED_RSP, payload);
        wr_recv_rem_end();
        break;
      case obj.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_END_RSP:
        if (window.CS.transactionRespCB[buf.stDirectAudioVideoCallEndRes.ullTransId])
          window.CS.transactionRespCB[buf.stDirectAudioVideoCallEndRes.ullTransId](obj.imlrespcode[buf.stDirectAudioVideoCallEndRes.ret].code, obj.imlrespcode[buf.stDirectAudioVideoCallEndRes.ret].phrase);
      case obj.proto_msgType.values.E_IS_APP_ON_FOCUS_RSP:
      case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_DIRECT_AV_CALL_RSP:
      case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_CALL_RSP:
        break;

      case obj.proto_msgType.values.E_INCOMING_CALL_END_RSP:
        if (window.CS.transactionRespCB[buf.stIncomingCallEndRes.ullTransId])
          window.CS.transactionRespCB[buf.stIncomingCallEndRes.ullTransId](obj.imlrespcode[buf.stIncomingCallEndRes.ret].code, obj.imlrespcode[buf.stIncomingCallEndRes.ret].phrase);
      //case obj.proto_msgType.values.E_IS_APP_ON_FOCUS_RSP:
      //case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_DIRECT_AV_CALL_RSP:
      //case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_CALL_RSP:
        break;

      case obj.proto_msgType.values.E_USER_PRESENCE_CHANGED_RQT:
        window.CS.contacts.onpresenceupdatecb && window.CS.contacts.onpresenceupdatecb(obj.contactsStatus[msgType].status, {"user":buf.stUserPresenceChangedReq.stPresence.sPhoneNum, "isOnline":buf.stUserPresenceChangedReq.stPresence.sStatus == "ONLINE", "time":buf.stUserPresenceChangedReq.stPresence.sTime, "message":buf.stUserPresenceChangedReq.stPresence.sPresenceStatusMsg});
        var payload = {uVersion:obj.protoVersion, stUserPresenceChangedRes:{ullTransId:buf.stUserPresenceChangedReq.stHdrs.ullTransId, sMobNu:obj.localUser, retCodes:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_USER_PRESENCE_CHANGED_RSP, payload);
        break;
      case obj.proto_msgType.values.E_USER_PENDING_NOTIFICATIONS_RQT:
        var payload = {uVersion:obj.protoVersion, stUserPendingNotificationsRes:{ullTransId:buf.stUserPendingNotificationsReq.stHdrs.ullTransId, sMobNu:obj.localUser, retCodes:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_GET_MY_PENDING_NOTIFICATIONS_RSP, payload);
        break;
      case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_INCOMING_CALL_RQT:
        console.log("remote ice received");
        wr_recv_rem_ice(buf.stSendIceCandidatesInIncomingCallReq, buf.stSendIceCandidatesInIncomingCallReq.sCallId);
        var payload = {uVersion:obj.protoVersion, stSendIceCandidatesInIncomingCallRes:{ullTransId:buf.stSendIceCandidatesInIncomingCallReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stSendIceCandidatesInIncomingCallReq.sCallId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_INCOMING_CALL_RSP, payload);
        break;
      case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_DIRECT_AV_CALL_RQT:
        console.log("remote ice received");
        wr_recv_rem_ice(buf.stSendIceCandidatesInDirectAVCallReq, buf.stSendIceCandidatesInDirectAVCallReq.sCallId);
        var payload = {uVersion:obj.protoVersion, stSendIceCandidatesInDirectAVCallRes:{ullTransId:buf.stSendIceCandidatesInDirectAVCallReq.stHdrs.ullTransId, sMobNu:obj.localUser, sCallId:buf.stSendIceCandidatesInDirectAVCallReq.sCallId, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_DIRECT_AV_CALL_RSP, payload);
        break;
      case obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_CALL_RQT:
          wr_recv_rem_ice(buf.stSendIceCandidatesInCallReq, buf.stSendIceCandidatesInCallReq.sCallId);
          var payload = {uVersion:obj.protoVersion, stSendIceCandidatesInCallRes:{ullTransId:buf.stSendIceCandidatesInCallReq.stHdrs.ullTransId, sMobNu:obj.localUser, sDstNumber:buf.stSendIceCandidatesInCallReq.sDstNumber, ret:obj.proto_retCodes.values.E_200_OK}};
          send_msg(obj, false, obj.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_CALL_RSP, payload);
        break;
      case obj.proto_msgType.values.E_CALL_INFO_SYNC_RQT:
        callId = buf.stCallInfoSyncReq.sCallID;
        obj.call.activeCallId = "";
        window.CS.call.onMessagecb && window.CS.call.onMessagecb(obj.callEventCode[msgType].code, {"caller":buf.stCallInfoSyncReq.ssrcMobNu, callId:callId, callee:buf.stCallInfoSyncReq.sDstMobNu, callType:obj.callType[buf.stCallInfoSyncReq.eCallType].type, callStatus:obj.callStatus[buf.stCallInfoSyncReq.eStatus].status, startTime:buf.stCallInfoSyncReq.ullStartTime, endTime:buf.stCallInfoSyncReq.ullEndTime, answerTime:buf.stCallInfoSyncReq.ullAnswerTime});
        var payload = {uVersion:obj.protoVersion, stCallInfoSyncRes:{ullTransId:buf.stCallInfoSyncReq.stHdrs.ullTransId, eReturnCode:obj.proto_retCodes.values.E_200_OK, sReturnPhrase:"OK"}};
        send_msg(obj, false, obj.proto_msgType.values.E_CALL_INFO_SYNC_RSP, payload);
        break;
      case obj.proto_msgType.values.E_LOGIN_ELSE_WHERE_NOTIFICATION_RQT:
        var payload = {uVersion:obj.protoVersion, stLoginElseWhereNotificationRes:{ullTransId:buf.stLoginElseWhereNotificationReq.stHdrs.ullTransId, eReturnCode:obj.proto_retCodes.values.E_200_OK, sReturnPhrase:"OK"}};
        send_msg(obj, false, obj.proto_msgType.values.E_LOGIN_ELSE_WHERE_NOTIFICATION_RSP, payload);
        break;
      case obj.proto_msgType.values.E_REGISTER_SIP_USER_RSP:
        if (window.CS.transactionRespCB[buf.stRegisterSipUserRes.ullTransId])
          window.CS.transactionRespCB[buf.stRegisterSipUserRes.ullTransId](obj.imlrespcode[buf.stRegisterSipUserRes.ret].code, obj.imlrespcode[buf.stRegisterSipUserRes.ret].phrase);
        break;
      case obj.proto_msgType.values.E_SIP_USER_EVENT_RQT:
        if (window.CS.transactionRespCB[buf.stSipUserEventReq.ullTransId])
          window.CS.transactionRespCB[buf.stSipUserEventReq.ullTransId](obj.imlrespcode[buf.stSipUserEventReq.ret].code, obj.imlrespcode[buf.stSipUserEventReq.ret].phrase);
        var payload = {uVersion:obj.protoVersion, stSipUserEventRes:{ullTransId:buf.stSipUserEventReq.stHdrs.ullTransId, sMobNu:obj.localUser, ret:obj.proto_retCodes.values.E_200_OK}};
        send_msg(obj, false, obj.proto_msgType.values.E_SIP_USER_EVENT_RSP, payload);
        break;
      case obj.proto_msgType.values.stCallEndRes:
        if (window.CS.transactionRespCB[buf.stCallEndRes.ullTransId])
          window.CS.transactionRespCB[buf.stCallEndRes.ullTransId](obj.imlrespcode[buf.stCallEndRes.ret].code, obj.imlrespcode[buf.stCallEndRes.ret].phrase);
        break;

      default:
           console.log("un handled message received "+msgType);
        break;
    }
  };

  // ### IO apis
  var send_on_socket = function(obj, body) {
    if(obj.ws.readyState == 1)
      obj.ws.send(body.body);
    else {
      console.log("ws send failed connection state: "+obj.ws.readyState);
    }
  };

  var send_on_rest = function(obj, body) {
    console.log(rest_support_msg);
  };

  var send_internal = function (obj, msg) {
    if (!msg["is_provisional"] && obj.connectionState != ConnectionStates["connected"]) {
      console.log("Unable to send message before login completes");
      return;
    }

    if(obj.transportType == TransportTypes["socket"]) {
      send_on_socket(obj, msg); 
    } else {
      send_on_rest(obj, msg); 
    }
  };

  var send_queued_msgs = function(obj) {
    while (obj.msg_queue.length > 0) {
      send_internal(obj, obj.msg_queue.shift());
    }
  };

  var toInt32 = function(num) {
    var arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
    var view = new DataView(arr);
    view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
    return arr;
  };

  var send_msg = function(obj, is_provisional, evtype, json_body) {
    console.log("send_msg: "+ obj)
    console.log("is_provisional: "+ is_provisional)
    console.log("evtype: "+ evtype)
    console.log("json_body: "+ json_body)
    var bodyBuffer = obj.proto_msg.encode(obj.proto_msg.create(json_body)).finish();
    
    var tmp = new ArrayBuffer(10+bodyBuffer.length);
    var view = new DataView(tmp);
    view.setUint32(0, evtype, false);
    view.setUint32(4, bodyBuffer.length, false);
    view.setUint8(8, '\r'.charCodeAt(0), false);
    view.setUint8(9, '\n'.charCodeAt(0), false);
    var li;
    for (li=0; li<bodyBuffer.length; li++) {
      view.setUint8(10+li, bodyBuffer[li], false);
    }

    var body = tmp;
    console.log("body: "+ body)
    if (obj.connectionState != ConnectionStates["connected"] && !is_provisional) {
      obj.msg_queue.push({"is_provisional":is_provisional, "body":body});
    } else {
      //send_queued_msgs(obj);
      if(obj.ws.readyState != 1) {
        obj.reconnectTimeout = 300;
        connect_to_iml_server();
      }
      send_internal(obj, {"is_provisional":is_provisional, "body":body});
    }
  };

  var signup = function(obj, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;

    var sha256 = new jsSHA('SHA-256', 'TEXT');
    sha256.update(obj.localUser+obj.OAuthToken);
    var hash = sha256.getHash("HEX");

    var payload = {uVersion:obj.protoVersion, stSignUpReq:{stHdrs:{sMobNu:obj.localUser, sClientId:obj.clientId, ullTransId:tmpid}, sPassHash:hash, sAuth:"auth string", sAppName:"web-sdk", stOSName:obj.proto_osType.values.E_WEB, sOSVersion:obj.osVersion}};

    if (window.CS.appId)
      payload.stSignUpReq.sAppDetails = {sAppName:'', sCustomerId:'', sAppId:window.CS.appId, sAppSecret:''};

    send_msg(obj, true, obj.proto_msgType.values.E_SIGNUP_RQT, payload);
  };

  var activate = function(obj, user, otp, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:obj.protoVersion, stActivateReq:{stHdrs:{sMobNu:user, sClientId:obj.clientId, ullTransId:tmpid}, sActCode:otp}};

    if (window.CS.appId){
      payload.stActivateReq.sAppDetails = {sAppName:'', sCustomerId:'', sAppId:window.CS.appId, sAppSecret:''};
    }
    send_msg(obj, true, obj.proto_msgType.values.E_ACTIVATE_RQT, payload);
  };

  var login = function(obj, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;

    var sha256 = new jsSHA('SHA-256', 'TEXT');
    sha256.update(obj.localUser+obj.OAuthToken);
    var hash = sha256.getHash("HEX");

    var payload = {uVersion:obj.protoVersion, stLoginReq:{stHdrs:{sMobNu:obj.localUser, sClientId:obj.clientId, ullTransId:tmpid}, sPassHash:hash, sAuth:"auth string", stOSName:obj.proto_osType.values.E_WEB, sOSVersion:obj.osVersion, sPushDevToken:"", sAppName:"appName", sDeviceId:window.CS.deviceId}};

    if (window.CS.appId){
      payload.stLoginReq.sAppDetails = {sAppName:'', sCustomerId:'', sAppId:window.CS.appId, sAppSecret:''};
    }
    console.log("login: " + obj)
    send_msg(obj, true, obj.proto_msgType.values.E_LOGIN_RQT, payload);
  };

  var getContacts = function(obj, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:obj.super.protoVersion, stGetContactsReq:{stHdrs:{sMobNu:obj.super.localUser, sClientId:obj.super.clientId, ullTransId:tmpid}}};
    send_msg(obj.super, false, obj.super.proto_msgType.values.E_GET_CONTACTS_RQT, payload);
  };

  var _mergeBuffer = function(b1, b2) {
    var tmp = new Uint8Array(b1.byteLength + b2.byteLength);
    tmp.set(new Uint8Array(b1), 0);
    tmp.set(new Uint8Array(b2), b1.byteLength);
    return tmp.buffer;
  };


  var iml_reentrant = function(obj, buf) {
     switch (__rcvState) {
      case 0: { //Header
        if (__rcvBuffLen + buf.byteLength >= HDR_LEN) {
          __rcvBuffer = _mergeBuffer(__rcvBuffer, buf.slice(0, HDR_LEN - __rcvBuffLen));
          __rcvBuffLen = HDR_LEN;
          var dv = new DataView(__rcvBuffer);
          __msgType = dv.getUint32(0);
          __payloadLen = dv.getUint32(4);
          __rcvBuffer = new ArrayBuffer(0);
          __rcvBuffLen = 0;
          __rcvState = 1;
          return HDR_LEN;
        } else {
          __rcvBuffer = _mergeBuffer(__rcvBuffer, buf);
          __rcvBuffLen += buf.byteLength;
          return buf.byteLength;
        }
      }break;
      case 1: { //Body
        if (__rcvBuffLen + buf.byteLength >= __payloadLen) {
           __rcvBuffer = _mergeBuffer(__rcvBuffer, buf.slice(0, __payloadLen - __rcvBuffLen));
           var rbuf = new Uint8Array(__rcvBuffer);
           try{
             var decoded = obj.proto_msg.decode(rbuf);
             processJsonMsg(obj, __msgType, decoded);
           } catch(error){
             console.log("error decoding message "+error);
           } finally {
             __rcvBuffer = new ArrayBuffer(0);
             __rcvBuffLen = 0;
             __rcvState = 0;
             return __payloadLen - __rcvBuffLen;
           }
        } else {
           __rcvBuffer = _mergeBuffer(__rcvBuffer, buf);
           __rcvBuffLen += buf.byteLength;
           return buf.byteLength;
        }
      }break;
    }   
  }; 

  var consumeBuffer = function(obj, buf) {
    var buflen = 0;
    while(buf.byteLength > 0) {
      buflen = iml_reentrant(obj, buf);
      if(buflen > 0) {
        buf = buf.slice(buflen);
      }
    }
    return;
  };


  var printBuf = function(buf) {
    var i;
    for (i=0; i<buf.byteLength; i++) {
      var dv = new DataView(buf);
      console.log(dv.getUint8(i));
    }
  };


  var connect_to_iml_server = function() {
    var obj = window.CS;
    if (!obj.reconnectTimeout) {
      obj.reconnectTimeout = 300;
    }

    if (obj.transportType == TransportTypes["socket"]) {
   
      if(obj.connectionState == ConnectionStates["initiated"]) {
        return;
      }

      //console.log("Connecting to server "+new Date().toLocaleString());
      var ws = new WebSocket(iml_server_address);
      obj.connectionState = ConnectionStates["initiated"];
      ws.binaryType = 'arraybuffer';

      ws.onopen = function() {
        var obj = window.CS;
        obj.connectionState = ConnectionStates["connected"];
	obj.reconnectTimeout = 300;

        console.log("websocket connected 1");
        obj.connReady = true;
        if(obj.localUser != null && obj.OAuthToken != null) {
          if(obj.loggedin = true) {
            login(obj, undefined);
          }
        }
        send_queued_msgs(obj);
      };

      ws.onmessage = function (evt) { 
	consumeBuffer(obj, evt.data);
      };

      ws.onerror = function(evt) {
/*
        var obj = window.CS;
	console.log("Error on websocket!. attempting to reconnect");
        if(obj.connectionState != ConnectionStates["initiated"]) { 
          if(obj.tid) {
            clearTimeout(obj.tid);
          } 
          obj.tid = setTimeout(connect_to_iml_server, obj.reconnectTimeout); // Try connecting to server immediately if connection is lost
	  obj.reconnectTimeout = 2*obj.reconnectTimeout;
        }
        obj.connectionState = ConnectionStates["error"];
*/
      };

      ws.onclose = function(evt) {
        var obj = window.CS;
	console.log("websocket connection closed!. attempting to reconnect");
        if(obj.tid) {
          clearTimeout(obj.tid);
        } 
        obj.tid = setTimeout(connect_to_iml_server, obj.reconnectTimeout); // Try connecting to server immediately if connection is lost
	obj.reconnectTimeout = 2*obj.reconnectTimeout;
        if (obj.reconnectTimeout > 300000) {
          obj.reconnectTimeout = 300000;
        }
        obj.connectionState = ConnectionStates["closed"];
      };

      window.onbeforeunload = function(event) { 
        if(this.connectionState == ConnectionStates["connected"]) {
          ws.close(); 
        }
      };

      obj.ws = ws;
    } else {
      login(obj, undefined);
    }
  };

  /* Stream Constructor */
  var Stream = function() {
  };

  Stream.prototype.init = function (parent) {
    this.super = parent;
    //console.log("stream initialized");
  };

  /* Call Constructor */
  var Call = function() {
    this.activeCallId = this.remoteUser = "";
    this.states = {IDLE:1, OFFER_SENT:2, OFFER_RECEIVED:3, RINGING_RECEIVED:4, CONNECTED:5, ENDED:6};
    this.callObj = {}; // callId:{state:1, direction:IN/OUT, remoteUser:1, isMuted:true/false, iceCandidates:[]}
  };

  Call.prototype.init = function (parent) {
    this.super = parent;
  };

  /* Contacts Constructor */
  var Contacts = function() {
  };

  Contacts.prototype.init = function (parent) {
    this.super = parent;
  };

  Contacts.prototype.setProfile = function(displayName, statusMessage, profilePhoto, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stSetProfileReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, stProfile:{sUserName:displayName}}};
    if (statusMessage && statusMessage != "")
      payload.stSetProfileReq.stProfile.sPresenceStatusMsg = statusMessage;
    if (profilePhoto && profilePhoto != "")
      payload.stSetProfileReq.stProfile.sProfilePicId = profilePhoto;
    send_msg(this.super, false, this.super.proto_msgType.values.E_SET_PROFILE_RQT, payload);
  };

  Contacts.prototype.getProfile = function(userId, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stGetProfileReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sMobNum:userId}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_GET_PROFILE_RQT, payload);
  };

  Contacts.prototype.getContacts = function(cb) {
    getContacts(this, cb);
  };

  Contacts.prototype.isAppContacts = function(contacts, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stIsAppContactReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, uCount:contacts.length, sPhoneNums:contacts}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_IS_APP_CONTACT_RQT, payload);
  };

  Contacts.prototype.onMessage = function(cb) {
    this.onpresenceupdatecb = cb;
  };

  Contacts.prototype.addContact = function(contact, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stAddNumReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, uCount:1, sPhoneNums:[contact], stContactTypes:[this.super.contact_type.values.E_CUSTOM_CONTACT]}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_ADD_NUM_RQT, payload);
  };

  Contacts.prototype.removeContact = function(contact, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stDeleteNumReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sPhoneNums:contact}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_DELETE_NUM_RQT, payload);
  };

  Contacts.prototype.getPresence = function(contactsList, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stGetPresReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sPhoneNums:contactsList}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_GET_PRESENCE_RQT, payload);
  };

  /* Chat Constructor */
  var Chat = function() {
    this.chatSeqNo = 1;
  };

  Chat.prototype.init = function (parent) {
    this.super = parent;
    //console.log("chat initialized");
  };

  Chat.prototype.onMessage = function (cb) {
    this.onMessagecb = cb;
    //console.log("chat on message callback initialized");
  };


  Chat.prototype.ChatType = {TEXT_PLAIN:1, TEXT_HTML:2, LOCATION:3, IMAGE:4, VIDEO:5, CONTACT:6, DOCUMENT:7};
  Chat.prototype.ChatFileType = {IMAGE:4, VIDEO:5, DOCUMENT:7};

  Call.prototype.getHistory= function (recipient, pageSize, offset, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stGetCallHistoryListReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sPageSize:pageSize, sOffset:offset}};
    if (recipient) {
      payload.stGetCallHistoryListReq["sDstMobNu"] = recipient;
    }
    send_msg(this.super, false, this.super.proto_msgType.values.E_GET_CALL_HISTORY_LIST_RQT, payload);
  }

  Chat.prototype.getHistory = function (recipient, pageSize, offset, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stGetChatHistoryListReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sPageSize:pageSize, sOffset:offset}};
    if (recipient) {
      payload.stGetChatHistoryListReq["sDstMobNu"] = recipient;
    }
    send_msg(this.super, false, this.super.proto_msgType.values.E_GET_CHAT_HISTORY_LIST_RQT, payload);
  };

  Chat.prototype.sendReadReceipt = function (recipient, chatId, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stChatReadReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:recipient, uChatID:chatId.toString(), uReadTime:Math.floor(Date.now())}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_CHAT_READ_RQT, payload);
  };

  Chat.prototype.sendDelivered = function (recipient, chatId, reports, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stChatDeliveryReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:recipient, uChatID:chatId.toString(), uDeliveryTime:Math.floor(Date.now()), reports_req:reports}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_CHAT_DELIVERY_RQT, payload);
  };

  Contacts.prototype.getRecentContacts = function (pageSize, offset, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stGetRecentConversationListReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sPageSize:pageSize, sOffset:offset}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_GET_RECENT_CONVERSATION_LIST_RQT, payload);
  };

  Chat.prototype.sendMessage = function (recipient, msg, type, reports, cb) {
    if (!this.super.localUser) {
      cb("400", "User not logged in!");
      return;
    }

    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    this.chatSeqNo++;
    var chatId = generate_token(16);
    var sentTime = Math.floor(Date.now());

    if (msg.length > 4000)
      msg = msg.slice(0, 4000);
    var payload = {uVersion:this.super.protoVersion, stChatReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:recipient, uChatID:chatId, uSeqNum:this.chatSeqNo, uSendTime:sentTime, stChatType:type, dataLen:msg.length, reports_req:reports, data:msg}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_CHAT_RQT, payload);
    return {"id":chatId, "sentTime":sentTime};
  };

  var dataURItoBlob = function(dataURI) {
    var binary = atob(dataURI.split(',')[1]);
    var array = [];
    for(var i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    var data = new Blob([new Uint8Array(array)], {type: 'image/png'});

    return data;
  };

  var createThumbnail = function(file, fileName, contentType, dLocation, tmpid, recipient, chatId, sentTime, chatFileType, reports) {
        console.log('An image has been loaded');

        // Load the image
        var reader = new FileReader();
        reader.onload = function (readerEvent) {
            var image = new Image();
            image.onload = function (imageEvent) {

                // Resize the image
                var canvas = document.createElement('canvas'),
                    max_size = 200,// TODO : pull max size from a site config
                    width = image.width,
                    height = image.height;
                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(image, 0, 0, width, height);
                var dataUrl = canvas.toDataURL('image/png');
                var resizedImage = dataURItoBlob(dataUrl);

                //var prev = document.getElementById('pr').appendChild(canvas);

                var photoKey = "thumb_"+fileName;
                window.CS.s3.upload({
                    Key: photoKey,
                    Body: resizedImage,
                    ACL: 'public-read'
                  }, function(err, data) {
                    if (err) {
                      return alert('There was an error uploading your photo: ', err.message);
                    }

                    var payload = {uVersion:window.CS.protoVersion, stChatReq:{stHdrs:{sMobNu:window.CS.localUser, sClientId:window.CS.clientId, ullTransId:tmpid}, sDstMobNu:recipient, uChatID:chatId, uSeqNum:window.CS.chat.chatSeqNo, uSendTime:sentTime, stChatType:chatFileType, dataLen:file.size, reports_req:reports, data:dLocation, sThumbnailUrl:photoKey}};
                    if (contentType)
                      payload.stChatReq.sContentType = contentType; 
    
                    send_msg(window.CS, false, window.CS.proto_msgType.values.E_CHAT_RQT, payload);
                    console.log("chat file sent out to server");
                });   
            }
            image.src = readerEvent.target.result;
        }
        reader.readAsDataURL(file);
  };


  Chat.prototype.getMediaURLPrefix = function () {
    return "https://"+window.CS.s3Bin+".s3.ap-southeast-1.amazonaws.com/";
  };

  Chat.prototype.sendPhoto = function (recipient, file, cb) {
    CA.chat.sendFile(recipient, CS.chat.ChatFileType.IMAGE, file.type, "", file, true, cb);
  }

  Chat.prototype.sendVideo = function (recipient, file, thumbnail, cb) {
    CA.chat.sendFile(recipient, CS.chat.ChatFileType.VIDEO, file.type, thumbnail, file, true, cb);
  }

  Chat.prototype.sendFile = function (recipient, file, thumbnail, cb) {
    CA.chat.sendFile(recipient, CS.chat.ChatFileType.DOCUMENT, file.type, thumbnail, file, true, cb);
  }

  Chat.prototype.sendFile = function (recipient, chatFileType, contentType, thumbnailUrl, file, reports, cb) {
    if( !chatFileType || chatFileType == "" || !file || file == "" ) {
      cb(400, "invalid input. chatFileType or file content is empty");
      return -1;
    }

    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    this.chatSeqNo++;
    var chatId = generate_token(16);
    var sentTime = Math.floor(Date.now());

    var photoKey = generate_token(15)+'_'+file.name;
    window.CS.s3.upload({
        Key: photoKey,
        Body: file,
        ACL: 'public-read'
      }, function(err, data) {
        if (err) {
          return alert('There was an error uploading your photo: ', err.message);
        }
        window.CS.respData[tmpid] = {"fileName":photoKey};

        if(file.type.match(/image.*/)) {
          createThumbnail(file, photoKey, contentType, data.Key, tmpid, recipient, chatId, sentTime, chatFileType, reports);
        } else {
          var payload = {uVersion:window.CS.protoVersion, stChatReq:{stHdrs:{sMobNu:window.CS.localUser, sClientId:window.CS.clientId, ullTransId:tmpid}, sDstMobNu:recipient, uChatID:chatId, uSeqNum:window.CS.chat.chatSeqNo, uSendTime:sentTime, stChatType:chatFileType, dataLen:file.size, reports_req:reports, data:data.Key}};
          if (contentType)
            payload.stChatReq.sContentType = contentType; 
    
          if (thumbnailUrl && thumbnailUrl != "")
            payload.stChatReq.sThumbnailUrl = thumbnailUrl;

          send_msg(window.CS, false, window.CS.proto_msgType.values.E_CHAT_RQT, payload);
        }
    });   

    return {"id":chatId, "sentTime":sentTime, "url":photoKey};
  }

  Chat.prototype.getPendingChat = function (cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stGetMyPendingNotificationsReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sPendingNotificationType:this.super.proto_pendingNotifType.values.E_CHAT_REQUEST}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_GET_MY_PENDING_NOTIFICATIONS_RQT, payload);
  };

  Chat.prototype.sendIsTyping = function (receipient, groupId) {
    var tmpid = randNum();
    var payload = {uVersion:this.super.protoVersion, stIsTypingReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:receipient, sGroupID:groupId}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_IS_TYPING_RQT, payload);
  };


  Chat.prototype.sendChatResponse = function (msg) {
    var payload = {uVersion:this.super.protoVersion, stChatRes:{ullTransId:msg.stHdrs.ullTransId, sMobNu:this.super.localUser, uChatID:msg.uChatID.toString(), ret:this.super.proto_retCodes.values.E_200_OK}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_CHAT_RSP, payload);
  };

  Call.prototype.onMessage = function (cb) {
    this.onMessagecb = cb;
    //console.log("call on message callback initialized");
  };

  function generate_token(length){
      var a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890".split("");
      var b = [];  
      for (var i=0; i<length; i++) {
          var j = (Math.random() * (a.length-1)).toFixed(0);
          b[i] = a[j];
      }
      return b.join("");
  }
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

  Call.prototype.startCall = function (remoteUser, localUiElem, remoteUiElem, isVideoCall, cb, isCallRecord) {
    if (5 != arguments.length && 6 != arguments.length) {
      console.log("invalid arguments list");
      return -1;
    }

    if (arguments.length == 5)
      isCallRecord = false;

    if (!this.super.localUser) {
      cb("400", "User not logged in!");
      return -1;
    }

    this.isVideoCall = isVideoCall;
    this.remoteUser = remoteUser;
    let callId = uuidv4();
    wr_send_rem_call(this, callId, isVideoCall, localUiElem, remoteUiElem);
    this.callObj[callId] = {state:this.states.OFFER_SENT, remoteUser:remoteUser, type:"IP", direction:"OUT", isMuted:false, isVideoCall:isVideoCall, iceCandidates:[], is_record_callTrue:isCallRecord};

    window.CS.call.callToCb = cb;
    return callId;
  };

  Call.prototype.saveRecording = function(callId, fileName, cb) {
      wr_save_recording(callId, fileName);
  };

  Call.prototype.deleteRecording = function(callId, cb) {
      wr_delete_recording(callId);
  }

  Call.prototype.RegisterPSTN = function (username, password, cb) {
    var obj = window.CS;
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    var payload = {uVersion:this.super.protoVersion, stRegisterSipUserReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sUserName:username, sPassword:password, sSipServerAddress:"123", sSipServerPort:123, sBrandPin:"54054", sAppId:"webapp", stOSName:obj.proto_osType.values.E_WEB}};
    send_msg(this.super, false, this.super.proto_msgType.values.E_REGISTER_SIP_USER_RQT, payload);
  };

  Call.prototype.startPSTNCall = function (remoteUser, localUiElem, remoteUiElem, cb) { //TODO: no need to take remoteUiElement. remove it
    remoteUser = remoteUser.replace("+", "")
    this.isVideoCall = false;
    this.remoteUser = remoteUser;
    let callId = generate_token(16);
    wr_send_rem_call(this, callId, false, localUiElem, remoteUiElem);
    this.callObj[callId] = {state:this.states.OFFER_SENT, remoteUser:remoteUser, type:"PSTN", direction:"OUT", isMuted:false, iceCandidates:[], isVideoCall:false, is_record_callTrue:false}; 

    window.CS.call.callToCb = cb;
    return callId;
  };

  Call.prototype.decline = function (callId, cb) {
    if (!this.callObj[callId]) {
      cb(400, "Unknown callId");
      return;
    }

    this.declinecb = cb;
    this.callObj[callId].state = this.states.ENDED;
    window.CS.call.end(callId, "User busy", function(ret, resp){console.log("user busy ret "+ret)});
  };

  Call.prototype.answer = function (callId, localUiElem, remoteUiElem, cb) {
    this.answercb = cb;
    this.callObj[callId].state = this.states.CONNECTED;
    if (this.activeCallId != ""){
      let tmpid = this.activeCallId;
      window.CS.call.end(tmpid, "Switched to another call", function(ret, resp){});
      delete this.callObj[tmpid];
    }
    this.activeCallId = callId;
    
    var sdp;
    if (this.callObj[callId]['type'] == 'IP') {
      sdp = this.stDirectAudioVideoCallStartReq;
    } else {
      sdp = this.stIncomingCallStartReq;
    }
    wr_recv_rem_offer(callId, localUiElem, this.isVideoCall, remoteUiElem, sdp);
  };

  Call.prototype.sendAnswer = function (callId, sdp, cb) {
    //this.onSendAnswerRecvCB = cb;
    if (window.CS.call.callObj[callId].type== 'IP' ) 
    {
      var tmpid = randNum();
      window.CS.transactionRespCB[tmpid] = cb;
      var payload = {uVersion:this.super.protoVersion, stDirectAudioVideoCallAnswerReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:this.remoteUser, stCallType:this.super.proto_callType.values.E_VIDEOCALL, sCallId:callId, sSdp:sdp}};

      if (!window.CS.call.isVideoCall)
        payload.stDirectAudioVideoCallAnswerReq.stCallType = this.super.proto_callType.values.E_VOICECALL;
      send_msg(this.super, false, this.super.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_ANSWER_RQT, payload);
      console.log("sent answer");
    }
    else if(window.CS.call.callObj[callId].type == 'PSTN' )
    {
      var tmpid = randNum();
      window.CS.transactionRespCB[tmpid] = cb;
      var payload = {uVersion:this.super.protoVersion, stIncomingCallAnswerReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:this.remoteUser, stCallType:this.super.proto_callType.values.E_PSTNCALL, sCallId:callId, sSdp:sdp, ullAnswerTime: Math.floor(Date.now()), sMediaServerId: window.CS.call.callObj[callId]['media_server_id']}};

      if (!window.CS.call.isVideoCall)
        payload.stIncomingCallAnswerReq.stCallType = this.super.proto_callType.values.E_VOICECALL;
      send_msg(this.super, false, this.super.proto_msgType.values.E_INCOMING_CALL_ANSWER_RQT, payload);
      console.log("sent pstn answer");
    }
  };

  Call.prototype.sendIce = function (remoteUser, ice,  jsoncandidates, callId, cb) {
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    if(window.CS.call.callObj[callId].type == "IP") {
      var payload = {uVersion:this.super.protoVersion, stSendIceCandidatesInDirectAVCallReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstNumber:remoteUser, sCallId:callId.toString(), sIceCandidates:[ice], sJsonIceCandidates:[jsoncandidates]}};
      send_msg(this.super, false, this.super.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_DIRECT_AV_CALL_RQT, payload);
    } else if (window.CS.call.callObj[callId].type == "PSTN") {
      var payload = {uVersion:this.super.protoVersion, stSendIceCandidatesInIncomingCallReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstNumber:remoteUser, sCallId:callId.toString(), sIceCandidates:[ice], sJsonIceCandidates:[jsoncandidates], sDirection:this.super.direction_enum.values.E_TO_SERVER, sMediaServerId:window.CS.call.callObj[callId]['media_server_id']}};
      send_msg(this.super, false, this.super.proto_msgType.values.E_SEND_ICE_CANDIDATES_IN_INCOMING_CALL_RQT, payload);
    }
  };

  Call.prototype.end = function (callId, reason, cb) { //TODO: prasun end call based on call type (pstn/IP)
    if (!this.callObj[callId]) {
      cb(400, "Unknown callId");
      return;
    }

    this.activeCallId = "";
    this.callObj[callId].state = this.states.ENDED;
    var tmpid = randNum();
    window.CS.transactionRespCB[tmpid] = cb;
    wr_send_rem_call_end(callId);
    if (this.callObj[callId]['type'] == "PSTN") {
       /// Prasun: Venu add media server id to payload param
       var payload = {uVersion:this.super.protoVersion, stIncomingCallEndReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:this.callObj[callId].remoteUser, stCallType:this.super.proto_callType.values.E_PSTNCALL, sCallId:callId, sBrandPin:"54054", sStopTime: Math.floor(Date.now()), sMediaServerId: window.CS.call.callObj[callId]['media_server_id']}};
       send_msg(this.super, false, this.super.proto_msgType.values.E_INCOMING_CALL_END_RQT, payload);
    }
    else if (this.callObj[callId]['type'] == "IP") {
       var payload = {uVersion:this.super.protoVersion, stDirectAudioVideoCallEndReq:{stHdrs:{sMobNu:this.super.localUser, sClientId:this.super.clientId, ullTransId:tmpid}, sDstMobNu:this.callObj[callId].remoteUser, stCallType:this.super.proto_callType.values.E_VIDEOCALL, sCallId:callId, sStopTime:Math.floor(Date.now())}};
       if (!window.CS.call.isVideoCall)
         payload.stDirectAudioVideoCallEndReq.stCallType = this.super.proto_callType.values.E_VOICECALL;
       send_msg(this.super, false, this.super.proto_msgType.values.E_DIRECT_AUDIO_VIDEO_CALL_END_RQT, payload);
    }
  };


  Call.prototype.mute = function (callId, bool, cb) {
    if (bool) {
       wr_set_local_mute(this, callId, cb);
       window.CS.call.callObj[callId].isMuted = true;
    }
    else {
       wr_set_local_unmute(this, callId, cb);
       window.CS.call.callObj[callId].isMuted = false;
    }
  };

  Call.prototype.isMuted = function(callId, bool, cb) {
    return CS.call.callObj[callId].isMuted;
  }

  var initHouseVars = function(obj){
    obj.protoVersion       = 1;
    obj.clientId           = 0;
    obj.transactionRespCB  = {};
    obj.respData           = {};
    obj.s3Bin              = "";
    obj.osName             = "Web";
    obj.osVersion          = "-"; //TODO: fill browser information
  };

  var loadProto = function (obj){
    protobuf.load("/res/iml.json", function(err, root) {
      if (err) throw err;
      obj.proto_root         = root;
      obj.proto_msg          = root.lookup("msg");
      obj.proto_osType       = root.lookup("osType");
      obj.proto_retCodes     = root.lookup("retCodes");
      obj.proto_msgType      = root.lookup("msgType");
      obj.proto_pendingNotifType = root.lookup("pendingNotificationType");
      obj.proto_chatType     = root.lookup("chatType");
      obj.proto_callType     = root.lookup("callType");
      obj.proto_isFocusStatus= root.lookup("appFocusStatus");
      obj.direction_enum = root.lookup("sendDirection");
      obj.contact_type = root.lookup("contactType");

      obj.contactsStatus = {293:{status:"PresenceUpdate"},
                              81:{status:"ProfileChanged"},
                              5:{status:"UserJoined"}
      };

      obj.chatRequestType = {
                             9:"NEW-MESSAGE", //window.CS.proto_msgType.values.E_CHAT_RQT
                             10:"SENT", //window.CS.proto_msgType.values.E_CHAT_RSP
                             11:"DELIVERED", //window.CS.proto_msgType.values.E_CHAT_DELIVERY_RQT
                             13:"READ", //window.CS.proto_msgType.values.E_CHAT_READ_RSP
                             307:"IS-COMPOSING" //window.CS.proto_msgType.values.E_IS_TYPING_RQT
      };

      obj.recentMsgType = {0:{type:"UNKNOWN"},
                           1:{type:"CHAT"},
                           2:{type:"GROUP-CHAT"},
                           3:{type:"CALL"}
      };

      obj.chatStatus = {0:{status:"Unknown"}, 
                     1:{status:"SENT"}, 
                     2:{status:"DELIVERED"}, 
                     3:{status:"READ"} 
      };

      obj.chatType = {0:{type:"Unknown"}, 
                     1:{type:"Text"}, 
                     2:{type:"html"},
                     3:{type:"location"},
                     4:{type:"image"},
                     5:{type:"video"},
                     6:{type:"contact"},
                     7:{type:"document"}
                     };   

      obj.direction = {0:{type:"Unknown"},
                       1:{type:"Outgoing"},
                       2:{type:"Incoming"}
      };

      obj.callStatus = {0:{status:"Unknown"}, 
                        1:{status:"Missed"},
                        2:{status:"Answered"}
      };

      obj.callType = {0:{type:"Unknown"}, 
                      1:{type:"Audio"},
                      2:{type:"Video"},
                      3:{type:"Live-Location"},
                      4:{type:"Pstn"}
      };

      obj.callEventCode = {187:{code:"PSTN-OFFER", phrase:"PSTN Call offer received"}, 
                     193:{code:"ANSWERED", phrase:"Call answered received"}, 
                     195:{code:"OFFER", phrase:"Call offer received"}, 
                     197:{code:"ANSWERED", phrase:"Call answered received"}, 
                     199:{code:"END", phrase:"Call end received"},
                     205:{code:"END", phrase:"Call end received"},
                     241:{code:"PSTN-OFFER", phrase:"PSTN Call offer received"},
                     249:{code:"PSTN-END", phrase:"PSTN Call end received"},
                     295:{code:"RINGING", phrase:"Remote party ringing"},
                     313:{code:"CALLHISTORYSYNC", phrase:"Call history synchronized"}
                     };   


      obj.imlrespcode = {1:{code:200, phrase:"OK"}, 
                     2:{code:202, phrase:"Created"}, 
                     6:{code:204, phrase:"Resend Activation Code"}, 
                     3:{code:401, phrase:"Unauthorized"}, 
                     7:{code:403, phrase:"Forbiddon"}, 
                     4:{code:409, phrase:"NotAllowed"}, 
                     11:{code:499, phrase:"User Attached"}, 
                     5:{code:500, phrase:"Internal Error"}, 
                     10:{code:703, phrase:"Limit exceeded"}
                     };   

      obj.protoLoad = true;
    });
  };

  var AcceptedDelay = 500;
  var RetryMax = 3;
  var RetryCount = 0;

  /* Connect Arena SDK global constructor */
  var CS = function () {
    this.transportType = get_transport_type(); /* Socket */

    if(this.transportType == TransportTypes["rest"]){ alert(rest_support_msg);};

    this.localuser = "";
    this.OAuthToken = ""
    this.localUser = null;
    this.OAuthToken = null;
    this.msg_queue = [];

    loadProto(this);
    initHouseVars(this); //TODO: increment id's for every request.

    /* Modules */
    this.chat = new Chat();
    this.chat.init(this);

    this.contacts = new Contacts();
    this.contacts.init(this);

    this.call = new Call();
    this.call.init(this);

    this.stream = new Stream();
    this.stream.init(this);

    //setTimeout(connect_to_iml_server, 100);
    this.subModulesLoadComplete = true;
    return;
  };

  var checkInitComplete = function(obj) {
    obj = window.CS;
    if (obj.protoLoad && obj.connReady) {
      clearInterval(obj.intervalTimer); 
      $(window).on("blur focus", function(e) {
          var prevType = $(this).data("prevType");
      
          if (prevType != e.type) {   //  reduce double fire issues
              switch (e.type) {
                  case "blur":
                       updateIsFocusStat(true);
                      break;
                  case "focus":
                       updateIsFocusStat(false);
                      break;
              }
          }
      
          $(this).data("prevType", e.type);
      })

      obj.initCb(200, "SDK initialized");
    }
  };

  function getCookie(cname) {
      var name = cname + "=";
      var decodedCookie = decodeURIComponent(document.cookie);
      var ca = decodedCookie.split(';');
      for(var i = 0; i <ca.length; i++) {
          var c = ca[i];
          while (c.charAt(0) == ' ') {
              c = c.substring(1);
          }
          if (c.indexOf(name) == 0) {
              return c.substring(name.length, c.length);
          }
      }
      return "";
  }

  function setCookie(cname, cvalue, exdays) {
      var d = new Date();
      d.setTime(d.getTime() + (exdays*24*60*60*1000));
      var expires = "expires="+ d.toUTCString();
      document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
  }

  CS.prototype.askPushNotificationPermission = function(){
    OneSignal.push(function() {
      OneSignal.showHttpPrompt();
    });
  }

  /** * Connect Arena's Calm SDK.
  * Pass login credentials if available or null to signup
  * @constructor
  */
  //config = {s3Bucket:"", s3Region:"", s3IdentityPoolId:"", webrtc:{stun:"", turn:"", turnUser:"", turnPassword:""}}
  CS.prototype.initialize = function (config, cb) {
    this.version = "0.4.10.2"; 
    window.CS.timeOffset = 0;

    if (arguments.length > 0) {
      this.initCb = arguments[arguments.length -1];
    }

    this.intervalTimer = setInterval(function(){ checkInitComplete(this) }, 200);


    var albumBucketName = 'iamlivedemo1'; /* read bucket from login response */
    var bucketRegion = 'ap-southeast-1';
    var IdentityPoolId = 'ap-southeast-1:cea94880-b040-46f5-8f91-550a9381142d';
    //var OneSignalId = '59065d0c-ae2e-4859-be70-408170477ce7';
    //OneSignalId = 'f0b481a9-0cbc-4094-94da-2ed9cdc127d9';
    iml_server_address = "wss://proxy.vox-cpaas.com:8989";
    window.CS.rtcservers = {};
    window.CS.rtcservers.stun = 'stun:stun.l.google.com:19302';
    window.CS.rtcservers.turn = 'turn:34.253.104.58:3478?transport=udp';
    window.CS.rtcservers.turnUser = 'testuser';
    window.CS.rtcservers.turnPassword = 'test';
    window.CS.appId = '';
    window.CS.jsonPath = '/res/iml4.json';
    
    if (arguments.length == 2) {
       var config = arguments[0];
       albumBucketName = config.s3Bucket || albumBucketName;
       bucketRegion = config.s3Region || bucketRegion;
       IdentityPoolId = config.s3IdentityPoolId || IdentityPoolId;
       window.CS.appId = config.appId || window.CS.appId;
       window.CS.jsonPath = config.jsonpath || window.CS.jsonPath;
       //OneSignalId = config.OneSignalId || OneSignalId;
       //if (config.imlDomain && config.imlPort)
       //  iml_server_address = "wss://"+config.imlDomain+":"+config.imlPort;
       if (config.webrtc) {
         CS.rtcservers.stun = config.webrtc.stun || CS.stun;
         CS.rtcservers.turn = config.webrtc.turn || CS.turn;
         CS.rtcservers.turnUser = config.webrtc.turnUser || CS.turnUser;
         CS.rtcservers.turnPassword = config.webrtc.turnPassword || CS.turnPassword;
       }
    }

    window.CS.servers = {
      'iceServers': [
         {'urls': window.CS.rtcservers.stun},
         {
          'urls': window.CS.rtcservers.turn,
          'username': window.CS.rtcservers.turnUser,
          'credential': window.CS.rtcservers.turnPassword 
         },
      ]
    }; 

    AWS.config.update({
      region: bucketRegion,
      credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IdentityPoolId
      })
    });
    
    this.s3 = new AWS.S3({
      apiVersion: '2006-03-01',
      params: {Bucket: albumBucketName}
    });

    setTimeout(connect_to_iml_server, 100);

    if (OneSignalId) {
    // initialize OneSignal
    var OneSignal = window.OneSignal || [];
      OneSignal.push(["init", {
        appId: OneSignalId,
        autoRegister: false,
        notifyButton: {
          enable: false
        }
      }]);
    }

    let ret = getCookie('iml_dev_id');
    console.log("device id cookie returned is:");
    console.log(ret);
    if (ret) {
      window.CS.deviceId = ret;
      console.log("setting device id");
    } else {
      window.CS.deviceId = randNum();
      window.CS.deviceId = window.CS.deviceId.toString();
      setCookie('iml_dev_id', window.CS.deviceId, 9999);
      console.log("created device id:");
      console.log(window.CS.deviceId);
    }

    window.CS.clientId = "iamlive_web";
  };

  CS.prototype.logout = function () {
    this.ws.close();
  };


  function sha256(str) {
    // We transform the string into an arraybuffer.

    var sha256 = new jsSHA('SHA-256', 'TEXT');
    sha256.update(str);
    var hash = sha256.getHash("HEX");
    return hash;
    //var buffer = new TextEncoder("utf-8").encode(str);
    //return crypto.subtle.digest("SHA-256", buffer).then(function (hash) {
    //  return hex(hash);
    //});
  }
  
  function hex(buffer) {
    var hexCodes = [];
    var view = new DataView(buffer);
    for (var i = 0; i < view.byteLength; i += 4) {
      // Using getUint32 reduces the number of iterations needed (we process 4 bytes each time)
      var value = view.getUint32(i)
      // toString(16) will give the hex representation of the number without padding
      var stringValue = value.toString(16)
      // We use concatenation and slice for padding
      var padding = '00000000'
      var paddedValue = (padding + stringValue).slice(-padding.length)
      hexCodes.push(paddedValue);
    }
  
    // Join all the hex strings into one
    return hexCodes.join("");
  }

  CS.prototype.createTempUser = function (loginId, password, cb) {
    //let tmp_userId = getCookie('iml_user_id');
    //let tmp_pass = getCookie('iml_user_pass');
    //if (tmp_userId && tmp_pass) {
    //  cb(200, {"user":tmp_userId, "pass":tmp_pass});
    //} else {
    //  setCookie('iml_user_id', loginId, 9999);
    //  setCookie('iml_user_pass', password, 9999);

      $.ajax({
        type: "POST",
        dataType: "json",
        url: "https://proxy.vox-cpaas.com:9295/api/createuser",
        data: "username="+loginId+"&password="+password,
        success: function(data){
          if (data == "Created")
            cb(200, {"user":loginId, "pass":password});
          else
            cb(500, "Internal Error");
        },
        failure: function(){cb(500, "Internal Error");}
      });
    //}
  };

  CS.prototype.signup = function (loginId, OAuthToken, cb) {
    this.localUser = loginId; 
    this.OAuthToken = OAuthToken;
    signup(this, cb);
  };

  CS.prototype.activate = function (loginId, otp, cb) {
    activate(this, loginId, otp, cb);
  };


  CS.prototype.send_msg = send_msg;

  function randNum(){
    return Math.ceil(Math.random()* 1000000000);
  };

  CS.prototype.login = function (loginId, OAuthToken, cb) {
    this.localUser = loginId; 
    this.OAuthToken = OAuthToken;
    //this.pushToken = pushToken;

    // try{

    //   OneSignal.push(["addListenerForNotificationOpened", function(data) {
    //    	console.log("Received NotificationOpened:");
    //    	console.log(data);
	
    //   const promiseChain = clients.matchAll({
    //     type: 'window',
    //     includeUncontrolled: true
    //   })
    //   .then((windowClients) => {
    //     let matchingClient = null;

    //     for (let i = 0; i < windowClients.length; i++) {
    //       const windowClient = windowClients[i];
    //       console.log(winowClient);
    //     }

    //   });

    //   event.waitUntil(promiseChain);

    //   }]);
    // }catch(e){
    //  console.log("one signal error "+e.message);
    // }finally{
    // };

    login(this, cb);

    //try{
    //  OneSignal.push(function() {
    //    OneSignal.getUserId().then(function(userId) {
    //      console.log("OneSignal User ID:", userId);
    //      if (userId)
    //        window.CS.pushToken = userId;
    //      login(window.CS, cb);
    //    }).catch(function(){
    //      login(window.CS, cb);
    //    });
    //  });
    //} catch (err) {
    //  login(this, cb);
    //}
  };

  function updateIsFocusStat(state) {
    var tmpid = randNum();
    var payload = {uVersion:window.CS.protoVersion, stIsAppInFocusReq:{stHdrs:{sMobNu:window.CS.localUser, sClientId:window.CS.clientId, ullTransId:tmpid}}};
    if (state)
       payload.stIsAppInFocusReq.eStatus = window.CS.proto_isFocusStatus.values.E_IN_FOCUS;
    else
       payload.stIsAppInFocusReq.eStatus = window.CS.proto_isFocusStatus.values.E_OUT_FOCUS;
    try{
    send_msg(window.CS, false, window.CS.proto_msgType.values.E_IS_APP_ON_FOCUS_RQT, payload);
    }catch(e){}
  };



  window.CS = new CS();

})(window, undefined);
