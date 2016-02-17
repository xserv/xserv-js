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
	    this.listeners = [];
	    this.open_connection = null;
	    this.error_connection = null;
	    this.user_data = {};
	    this.reconnect_interval = Xserv.DEFAULT_RI;
	    this.instanceUUID = Xserv.Utils.generateUUID();
	    this.is_auto_reconnect = false;
	}
	
	var prototype = Xserv.prototype;
	
	// private
	
	var reConnect = function() {
	    setTimeout(function() { 
		    this.connect(true); 
		}.bind(this), this.reconnect_interval);
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
	    
	    if (json.op == Xserv.OP_SUBSCRIBE && Xserv.isPrivateTopic(json.topic) && json.auth_endpoint) {
		var auth_url = json.auth_endpoint.endpoint || 
		    Xserv.Utils.format(Xserv.DEFAULT_AUTH_URL, {'$1':Xserv.ADDRESS, '$2':Xserv.PORT, '$3':this.app_id});
		var auth_user = json.auth_endpoint.user || '';
		var auth_pass = json.auth_endpoint.pass || '';
		
		var params = {
		    socket_id : this.getSocketId(),
		    topic: json.topic,
		    user: auth_user,
		    pass: auth_pass
		};
		
		$.ajax({cache: false, 
			crossDomain: true,
			// xhrFields: {
			//     'withCredentials': true
			// },
			type: 'post', 
			url: auth_url, 
			contentType: 'application/json; charset=UTF-8',
			data: JSON.stringify(params),
			processData: false,
			dataType: 'json'})
		    .always(function(data_sign) {
			// clone perche' non si tocca quello in lista op
			var new_json = $.extend({}, json);
			delete new_json.auth_endpoint;
			
			if (data_sign) {
			    new_json.arg1 = params.user;
			    new_json.arg2 = data_sign.data;
			    new_json.arg3 = data_sign.sign;
			}
			
			this.conn.send(JSON.stringify(new_json));
		    }.bind(this));
	    } else {
		this.conn.send(JSON.stringify(json));
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
	    } else if (code == Xserv.OP_PRESENCE) {
		return 'presence';
	    } else if (code == Xserv.OP_JOIN) {
		return 'join';
	    } else if (code == Xserv.OP_LEAVE) {
		return 'leave';
	    } else if (code == Xserv.OP_PUBLISH) {
		return 'publish';
	    } else if (code == Xserv.OP_HANDSHAKE) {
		return 'handshake';
	    }
	    return '';
	};
	
	// public static
	
	Xserv.isPrivateTopic = function(topic) {
	    return topic.charAt(0) == '@';
	};
	
	// public
	
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
		    for (var i in this.listeners) {
			this.conn.removeEventListener(this.listeners[i].event, this.listeners[i].callback);
		    }
		    delete this.conn;
		}
		
		// non esiste un reopen quindi va reinizializzato tutto e si deve gestire una
		// lista anche degli addEventListener sulla socket
		this.conn = new WebSocket(Xserv.Utils.format(Xserv.URL, {'$1':Xserv.ADDRESS, '$2':Xserv.PORT, '$3':this.app_id, '$4':Xserv.VERSION}));
		
		for (var i in this.listeners) {
		    this.conn.addEventListener(this.listeners[i].event, this.listeners[i].callback);
		}
		
		// su connect
		this.conn.onopen = function(event) {
		    handshake.bind(this)();
		}.bind(this);
		
		this.conn.onclose = function(event) {
		    if (this.is_auto_reconnect) {
			reConnect.bind(this)();
		    }
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
	    if (name == 'receive_messages') {
		var event_callback = function(event) {
		    // intercetta solo i messaggi, eventi da http
		    var json = JSON.parse(event.data);
		    if (!json.op) {
			try {
			    json.data = JSON.parse(json.data);
			} catch(e) {
			}
			
			callback(json);
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'receive_ops_response') {
		var event_callback = function(event) {
		    // intercetta solo gli op_response, eventi su comandi
		    var json = JSON.parse(event.data);
		    if (json.op) {
			json.name = stringifyOp(json.op);
			
			if (json.op == Xserv.OP_HANDSHAKE) { // vera connection
			    if (json.rc == Xserv.RC_OK) {
				try {
				    var data = Xserv.Utils.Base64.decode(json.data); // decode
				    data = JSON.parse(data);
				    
				    if (!Xserv.Utils.isString(data) && Xserv.Utils.isObject(data)) {
					setUserData.bind(this)(data);
				    }
				} catch(e) {
				}
				
				if (!$.isEmptyObject(this.user_data)) {
				    if (this.open_connection) {
					this.open_connection();
				    }
				} else {
				    if (this.error_connection) {
					this.error_connection(json);
				    }
				}
			    } else {
				if (this.error_connection) {
				    this.error_connection(json);
				}
			    }
			} else {
			    try {
				var data = Xserv.Utils.Base64.decode(json.data); // decode
				data = JSON.parse(data);
				json.data = data;
				
				if (json.op == Xserv.OP_SUBSCRIBE && Xserv.isPrivateTopic(json.topic) && json.rc == Xserv.RC_OK) {
				    if (!Xserv.Utils.isString(json.data) && Xserv.Utils.isObject(json.data)) {
					setUserData.bind(this)(json.data);
				    }
				}
			    } catch(e) {
			    }
			    
			    callback(json);
			}
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'open_connection') {
		this.open_connection = callback;
	    } else if (name == 'close_connection') {
		this.listeners.push({event: 'close', callback: callback});
	    } else if (name == 'error_connection') {
		this.error_connection = callback;
		this.listeners.push({event: 'error', callback: callback});
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
	
	prototype.publish = function(topic, data) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    if (!Xserv.Utils.isString(data) && Xserv.Utils.isObject(data)) {
		data = JSON.stringify(data);
	    }
	    send.bind(this)({uuid: uuid, 
			     op: Xserv.OP_PUBLISH, 
			     topic: topic, 
			     arg1: data});
	    return uuid;
	};
	
	prototype.subscribe = function(topic, auth_endpoint) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    var tmp = {uuid: uuid,
		       op: Xserv.OP_SUBSCRIBE, 
		       topic: topic};
	    if (auth_endpoint) {
		tmp.auth_endpoint = auth_endpoint;
	    }
	    send.bind(this)(tmp);
	    return uuid;
	};
	
	prototype.unsubscribe = function(topic) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_UNSUBSCRIBE, 
			     topic: topic});
	    return uuid;
	};
	
	prototype.historyById = function(topic, offset, limit) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_HISTORY, 
			     topic: topic, 
			     arg1: Xserv.HISTORY_ID,
			     arg2: String(offset),
			     arg3: String(limit)});
	    return uuid;
	};
	
	prototype.historyByTimestamp = function(topic, offset, limit) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_HISTORY, 
			     topic: topic, 
			     arg1: Xserv.HISTORY_TIMESTAMP, 
			     arg2: String(offset), 
			     arg3: String(limit)});
	    return uuid;
	};
	
	prototype.presence = function(topic) {
	    if (!this.isConnected()) return;
	    
	    var uuid = Xserv.Utils.generateUUID();
	    send.bind(this)({uuid: uuid,
			     op: Xserv.OP_PRESENCE, 
			     topic: topic});
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
	    
	    isString: function(value) {
		return typeof value === 'string';
	    },
	    
	    isObject: function(value) {
		return typeof value === 'object';
	    },
	    
	    isArray: function(value) {
		return Object.prototype.toString.call(value) === '[object Array]';
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
	
	Xserv.VERSION = '1.0.0';
	
	// Xserv.ADDRESS = '192.168.130.153';
	Xserv.ADDRESS = 'xserv.mobile-italia.com';
	Xserv.PORT = '4332';
	Xserv.URL = 'ws://$1:$2/ws/$3?version=$4';
	Xserv.DEFAULT_AUTH_URL = 'http://$1:$2/app/$3/auth_user';
	Xserv.DEFAULT_RI = 5000;
	
	// signal
	Xserv.OP_HANDSHAKE = 100;
	
	// op
	Xserv.OP_PUBLISH = 200;
	Xserv.OP_SUBSCRIBE = 201;
	Xserv.OP_UNSUBSCRIBE = 202;
	Xserv.OP_HISTORY = 203;
	Xserv.OP_PRESENCE = 204;
	Xserv.OP_JOIN = Xserv.OP_SUBSCRIBE + 200;
	Xserv.OP_LEAVE = Xserv.OP_UNSUBSCRIBE + 200;
	// in uso in history
	Xserv.HISTORY_ID = 'id';
	Xserv.HISTORY_TIMESTAMP = 'timestamp';
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
	
    }).call(this);
    
    return Xserv;
}));
