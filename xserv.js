/***
 Xserv

 Copyright (C) 2015 Giovanni Amati

 This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 You should have received a copy of the GNU General Public License along with this program. If not, see http://www.gnu.org/licenses/.
***/

// version 1.0.0

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
	// AMD
	define([], function() {
	    return (root.Xserv = factory());
	});
    } else if (typeof exports === 'object') {
	// Node, CommonJS-like
	module.exports = factory();
    } else {
	// Browser globals (root is window)
	root.Xserv = factory();
    }
}(this, function () {
    
    (function () {
	
	function Xserv(app_id) {
	    this.app_id = app_id;
	    this.conn = null;
	    this.user_data = {};
	    this.reconnect_interval = Xserv.DEFAULT_RI;
	    this.instanceUUID = Xserv.Utils.generateUUID();
	    this.is_auto_reconnect = false;
	    // TLS
	    this.secure = true;
	    // callbacks
	    this.callbacks = {};
	}
	
	var prototype = Xserv.prototype;
	
	// private
	
	var reConnect = function() {
	    if (this.is_auto_reconnect && this.reconnect_interval > 0) {
		setTimeout(function() { 
		    this.connect(true); 
		}.bind(this), this.reconnect_interval);
	    }
	};
	
	var handshake = function() {
	    var bw = Xserv.Utils.getBrowser();
	    var tz = Xserv.Utils.getTimeZoneData();
	    
	    var model = bw || '';
	    var os = 'Browser';
	    if (model.length > 45) {
		model = model.substring(0, 45);
	    }
	    if (os.length > 45) {
		os = os.substring(0, 45);
	    }
	    var lang = navigator.language || navigator.userLanguage;
	    lang = lang.replace('_', '-');
	    
	    var stat = {uuid: this.instanceUUID,
			model: model,
			os: os,
			tz_offset: tz.tz_offset,
			tz_dst: tz.tz_dst,
	                lang: lang};
	    this.conn.send(JSON.stringify(stat));
	};
	
	var send = function(json) {
	    if (!this.isConnected()) return;
	    
	    if (json.op == Xserv.OP_SUBSCRIBE && Xserv.isPrivateTopic(json.topic) && json.auth) {
		var endpoint = json.auth.endpoint || 
		    Xserv.Utils.format(Xserv.DEFAULT_AUTH_URL, {'$1': this.secure ? 's' : '', 
								'$2': Xserv.HOST, 
								'$3': this.secure ? Xserv.TLS_PORT : Xserv.PORT});
		
		var headers = json.auth.headers || {};
		headers["X-Xserv-AppId"] = this.app_id;
		
		var params = json.auth.params || {};
		var user = params.user || "";
		
		var payload = $.extend({
		    socket_id : this.getSocketId(),
		    topic: json.topic
		}, params);
		
		var request = {cache: false, 
			       crossDomain: true,
			       type: 'get', 
			       url: endpoint,
			       headers: headers,
			       data: $.param(payload),
			       dataType: 'json'};
		
		$.ajax(request)
		    .always(function(data_sign) {
			delete json.auth;
			
			if (data_sign) {
			    json.arg1 = user;
			    json.arg2 = data_sign.data;
			    json.arg3 = data_sign.sign;
			}
			
			this.conn.send(JSON.stringify(json));
		    }.bind(this));
	    } else {
		this.conn.send(JSON.stringify(json));
	    }
	};
	
	var manageMessage = function(event) {
	    var json = null;
	    try {
		json = JSON.parse(event.data);
	    } catch(e) {
	    }
	    
	    if (json) {
		if (!json.op) {
		    // messages
		    
		    if (this.receive_messages) {
			this.receive_messages(json);
		    }
		} else if (json.op) {
		    // operations
		    
		    json.data = Xserv.Utils.Base64.decode(json.data);
		    try {
			json.data = JSON.parse(json.data);
		    } catch(e) {
		    }
		    
		    json.name = stringifyOp(json.op);
		    
		    if (json.op == Xserv.OP_HANDSHAKE) {
			// handshake
			
			if (json.rc == Xserv.RC_OK) {
			    if (!Xserv.Utils.isString(json.data) && Xserv.Utils.isObject(json.data)) {
				setUserData.bind(this)(json.data);
				
				if (this.connection_open) {
				    this.connection_open();
				}
			    } else {
				this.callbacks = {};
				if (this.connection_error) {
				    this.connection_error(json);
				}
			    }
			} else {
			    this.callbacks = {};
			    if (this.connection_error) {
				this.connection_error(json);
			    }
			}
		    } else {
			// classic operations
			
			if (json.op == Xserv.OP_SUBSCRIBE && Xserv.isPrivateTopic(json.topic) && json.rc == Xserv.RC_OK) {
			    if (!Xserv.Utils.isString(json.data) && Xserv.Utils.isObject(json.data)) {
				setUserData.bind(this)(json.data);
			    }
			}
			
			if (this.callbacks[json.uuid]) {
			    this.callbacks[json.uuid](json);
			    delete this.callbacks[json.uuid];
			} else {
			    if (this.receive_ops_response) {
				this.receive_ops_response(json);
			    }
			}
		    }
		}
	    }
	};
	
	var setUserData = function(json) {
	    this.user_data = json;
	};
	
	var stringifyOp = function(code) {
	    if (code == Xserv.OP_SUBSCRIBE) {
		return 'subscribe';
	    } else if (code == Xserv.OP_UNSUBSCRIBE) {
		return 'unsubscribe';
	    } else if (code == Xserv.OP_HISTORY) {
		return 'history';
	    } else if (code == Xserv.OP_USERS) {
		return 'users';
	    } else if (code == Xserv.OP_JOIN) {
		return 'join';
	    } else if (code == Xserv.OP_LEAVE) {
		return 'leave';
	    } else if (code == Xserv.OP_PUBLISH) {
		return 'publish';
	    } else if (code == Xserv.OP_HANDSHAKE) {
		return 'handshake';
	    } else if (code == Xserv.OP_TOPICS) {
		return 'topics';
	    } else if (code == Xserv.OP_UPDATE) {
		return 'update';
	    } else if (code == Xserv.OP_UPDATE_ALL) {
		return 'update_all';
	    } else if (code == Xserv.OP_DELETE) {
		return 'delete';
	    } else if (code == Xserv.OP_DELETE_ALL) {
		return 'delete_all';
	    }
	    return '';
	};
	
	// public static
	
	Xserv.isPrivateTopic = function(topic) {
	    return topic.charAt(0) == '@';
	};
	
	// public
	
	prototype.createExtra = function(type, topic, div) {
	    if (type == 'webrtc') {
		var canvas = $('#' + div);
		if (canvas) {
		    canvas.html('<iframe scrolling="no" src="https://' + Xserv.HOST + ':8000/?app_id=' + this.app_id + 
				'&room=' + topic.replace("@", "priv_") + '"></iframe>');
		}
	    }
	};
	
	prototype.disableTLS = function() {
	    this.secure = false;
	};
	
	prototype.isConnected = function() {
	    return this.conn && this.conn.readyState == WebSocket.OPEN;
	};
	
	prototype.connect = function(no_ar) {
	    if (!no_ar) {
		this.is_auto_reconnect = true;
	    }
	    
	    if (!this.isConnected()) {
		if (window.MozWebSocket) {
		    window.WebSocket = window.MozWebSocket;
		}
		
		// free
		if (this.conn) {
		    delete this.conn;
		}
		this.callbacks = {};
		
		// non esiste un reopen quindi va reinizializzato tutto
		this.conn = new WebSocket(Xserv.Utils.format(Xserv.WS_URL, {'$1': this.secure ? 's' : '', 
									    '$2': Xserv.HOST, 
									    '$3': this.secure ? Xserv.TLS_PORT : Xserv.PORT, 
									    '$4': this.app_id, 
									    '$5': Xserv.VERSION}));
		
		// su connect
		this.conn.onopen = function(event) {
		    handshake.bind(this)();
		}.bind(this);
		
		this.conn.onclose = function(event) {
		    this.callbacks = {};
		    if (this.connection_close) {
			this.connection_close(event);
		    }
		    
		    // viene chiamata sempre prima della chiusura della socket
		    reConnect.bind(this)();
		}.bind(this);
		
		this.conn.onerror = function(event) {
		    this.callbacks = {};
		    if (this.connection_error) {
			this.connection_error(event);
		    }
		}.bind(this);
		
		this.conn.onmessage = function(event) {
		    manageMessage.bind(this)(event);
		}.bind(this);
	    }
	};
	
	prototype.disconnect = function() {
	    this.is_auto_reconnect = false;
	    
	    if (this.isConnected()) {
		this.conn.close();
	    }
	};
	
	prototype.addEventListener = function(name, callback) {
	    if (name == 'connection_open') {
		this.connection_open = callback;
	    } else if (name == 'connection_close') {
		this.connection_close = callback;
	    } else if (name == 'connection_error') {
		this.connection_error = callback;
	    } else if (name == 'operations') {
		this.receive_ops_response = callback;
	    } else if (name == 'messages') {
		this.receive_messages = callback;
	    }
	};
	
	prototype.setReconnectInterval = function(milliseconds) {
	    this.reconnect_interval = milliseconds;
	};
	
	prototype.getReconnectInterval = function() {
	    return this.reconnect_interval;
	};
	
	prototype.getUserData = function() {
	    return this.user_data;
	};
	
	prototype.getSocketId = function() {
	    return this.user_data.socket_id ? this.user_data.socket_id : '';
	};
	
	prototype.publish = function(topic, data, callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    send.bind(this)({uuid: uuid, 
			     op: Xserv.OP_PUBLISH, 
			     topic: topic, 
			     arg1: data});
	    return uuid;
	};
	
	prototype.update = function(topic, object_id, data, callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    send.bind(this)({uuid: uuid, 
			     op: Xserv.OP_UPDATE, 
			     topic: topic, 
			     arg1: data,
			     arg2: object_id});
	    return uuid;
	};
	
	prototype.delete = function(topic, object_id, callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    send.bind(this)({uuid: uuid, 
			     op: Xserv.OP_DELETE, 
			     topic: topic,
			     arg2: object_id});
	    return uuid;
	};
	
	prototype.subscribe = function(topic, auth, callback) {
	    if (!this.isConnected()) return;
	    
	    // fix
	    if (auth && Xserv.Utils.isFunction(auth)) {
		callback = auth;
		auth = null;
	    }
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    var tmp = {uuid: uuid,
		       op: Xserv.OP_SUBSCRIBE, 
		       topic: topic};
	    if (auth && Xserv.Utils.isObject(auth)) {
		tmp.auth = auth;
	    }
	    send.bind(this)(tmp);
	    return uuid;
	};
	
	prototype.unsubscribe = function(topic, callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_UNSUBSCRIBE, 
			     topic: topic});
	    return uuid;
	};
	
	prototype.history = function(topic, params, callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_HISTORY, 
			     topic: topic, 
			     arg1: String(params.offset ? params.offset : 0), 
			     arg2: String(params.limit ? params.limit : 0),
			     arg3: params.query ? params.query : ""});
	    return uuid;
	};
	
	prototype.users = function(topic, callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_USERS, 
			     topic: topic});
	    return uuid;
	};
	
	prototype.topics = function(callback) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (callback) {
		this.callbacks[uuid] = callback;
	    }
	    var tmp = {uuid: uuid,
		       op: Xserv.OP_TOPICS};
	    send.bind(this)(tmp);
	    return uuid;
	};
	
	this.Xserv = Xserv;
	
    }).call(this);
    
    (function () {
	
	Xserv.Utils = {
	    
	    format: function(str, args) {
		var strX = str;
		for (var i in args) {
		    strX = strX.replace(new RegExp('\\' + i, 'g'), args[i]);
		}
		return strX;
	    },
	    
	    isFunction: function(value) {
		return $.type(value) === 'function';
	    },
	    
	    isString: function(value) {
		return $.type(value) === 'string';
	    },
	    
	    isObject: function(value) {
		return $.type(value) === 'object';
	    },
	    
	    isArray: function(value) {
		return $.type(value) === 'array';
	    },
	    
	    generateUUID: function() {
		var d = new Date().getTime();
		var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		    var r = (d + Math.random()*16)%16 | 0;
		    d = Math.floor(d/16);
		    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
		});
		return uuid;
	    },
	    
	    getTimeZoneData: function() {
		var today = new Date();
		var jan = new Date(today.getFullYear(), 0, 1);
		var jul = new Date(today.getFullYear(), 6, 1);
		var dst = today.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
		// js sono inverti e si fa * -1
		return {tz_offset: -1 * parseInt(today.getTimezoneOffset() / 60), tz_dst: +dst};
	    },
	    
	    getBrowser: function() {
		var nAgt = navigator.userAgent;
		var browserName = navigator.appName;
		var fullVersion = ''+parseFloat(navigator.appVersion); 
		var nameOffset, verOffset, ix;
		
		// In Opera, the true version is after "Opera" or after "Version"
		if ((verOffset=nAgt.indexOf('Opera'))!=-1) {
		    browserName = 'Opera';
		    fullVersion = nAgt.substring(verOffset+6);
		    if ((verOffset=nAgt.indexOf('Version'))!=-1) 
			fullVersion = nAgt.substring(verOffset+8);
		}
		// In MSIE, the true version is after "MSIE" in userAgent
		else if ((verOffset=nAgt.indexOf('MSIE'))!=-1) {
		    browserName = 'Microsoft Internet Explorer';
		    fullVersion = nAgt.substring(verOffset+5);
		}
		// In Chrome, the true version is after "Chrome" 
		else if ((verOffset=nAgt.indexOf('Chrome'))!=-1) {
		    browserName = 'Chrome';
		    fullVersion = nAgt.substring(verOffset+7);
		}
		// In Safari, the true version is after "Safari" or after "Version" 
		else if ((verOffset=nAgt.indexOf('Safari'))!=-1) {
		    browserName = 'Safari';
		    fullVersion = nAgt.substring(verOffset+7);
		    if ((verOffset=nAgt.indexOf('Version'))!=-1) 
			fullVersion = nAgt.substring(verOffset+8);
		}
		// In Firefox, the true version is after "Firefox" 
		else if ((verOffset=nAgt.indexOf('Firefox'))!=-1) {
		    browserName = 'Firefox';
		    fullVersion = nAgt.substring(verOffset+8);
		}
		// In most other browsers, "name/version" is at the end of userAgent 
		else if ((nameOffset=nAgt.lastIndexOf(' ')+1) < (verOffset=nAgt.lastIndexOf('/'))) {
		    browserName = nAgt.substring(nameOffset,verOffset);
		    fullVersion = nAgt.substring(verOffset+1);
		    if (browserName.toLowerCase()==browserName.toUpperCase()) {
			browserName = navigator.appName;
		    }
		}
		// trim the fullVersion string at semicolon/space if present
		if ((ix=fullVersion.indexOf(';'))!=-1)
		    fullVersion = fullVersion.substring(0,ix);
		if ((ix=fullVersion.indexOf(' '))!=-1)
		    fullVersion = fullVersion.substring(0,ix);
		
		var majorVersion = parseInt(''+fullVersion,10);
		if (isNaN(majorVersion)) {
		    fullVersion = ''+parseFloat(navigator.appVersion); 
		}
		
		return browserName + ' ' + fullVersion;
	    }
	    
	};
	
    }).call(this);
    
    (function () {
	
	var Base64 = {_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}};
	
	Xserv.Utils.Base64 = Base64;
	
    }).call(this);
    
    (function () {
	
	Xserv.VERSION = '1';
	
	// Xserv.HOST = '192.168.1.131';
	Xserv.HOST = 'mobile-italia.com';
	Xserv.PORT = '4332';
	Xserv.TLS_PORT = '8332';
	Xserv.WS_URL = 'ws$1://$2:$3/ws/$4?version=$5';
	Xserv.DEFAULT_AUTH_URL = 'http$1://$2:$3/1/user';
	Xserv.DEFAULT_RI = 5000;
	
	// op
	Xserv.OP_HANDSHAKE = 100;
	Xserv.OP_PUBLISH = 200;
	Xserv.OP_SUBSCRIBE = 201;
	Xserv.OP_UNSUBSCRIBE = 202;
	Xserv.OP_HISTORY = 203;
	Xserv.OP_USERS = 204;
	Xserv.OP_TOPICS = 205;
	Xserv.OP_UPDATE = 300;
	Xserv.OP_UPDATE_ALL = 301;
	Xserv.OP_DELETE = 302;
	Xserv.OP_DELETE_ALL = 303;
	Xserv.OP_JOIN = 401;
	Xserv.OP_LEAVE = 402;
	// op result_code
	Xserv.RC_OK = 1;
	Xserv.RC_GENERIC_ERROR = 0;
	Xserv.RC_ARGS_ERROR = -1;
	Xserv.RC_ALREADY_SUBSCRIBED = -2;
	Xserv.RC_UNAUTHORIZED = -3;
	Xserv.RC_NO_TOPIC = -4;
	Xserv.RC_NO_DATA = -5;
	Xserv.RC_NOT_PRIVATE = -6;
	Xserv.RC_LIMIT_MESSAGES = -7;
	Xserv.RC_DB_ERROR = -8;
	
    }).call(this);
    
    return Xserv;
}));
