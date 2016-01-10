(function() {
    var Xserv = function(app_id) {
	var ADDRESS = 'localhost';
	// var ADDRESS = 'mobile-italia.com';
	var PORT = '5555';
	var URL = 'ws://' + ADDRESS + ':' + PORT + '/ws/' + app_id;
	var DEFAULT_AUTH_URL = 'http://' + ADDRESS + ':' + PORT + '/app/' + app_id + '/auth_user';
	var DEFAULT_RI = 5000;
	
	this.app_id = app_id;
	this.conn = null;
	this.ops = [];
	this.listeners = [];
	this.user_data = {};
	this.reconnect_interval = DEFAULT_RI;
	
	this.is_auto_reconnect = false;
	this.is_backup_act = true;
	this.in_initialization = false;
	
	this.isConnected = function() {
	    return this.conn && this.conn.readyState == WebSocket.OPEN;
	};
	
	this.connect = function(no_ar) {
	    if (!no_ar) {
		this.is_auto_reconnect = true;
	    }
	    
	    if (!this.isConnected() && !this.in_initialization) {
		this.in_initialization = true;
		
		if (window.MozWebSocket) {
		    window.WebSocket = window.MozWebSocket;
		}
		// non esiste un reopen quindi va reinizializzato tutto e si deve gestire una
		// lista anche degli addEventListener sulla socket
		this.conn = new WebSocket(URL);
		
		for (var i in this.listeners) {
		    // console.log(JSON.stringify(this.listeners[i]));
		    this.conn.addEventListener(this.listeners[i].event, this.listeners[i].callback);
		}
		
		// su connect
		this.conn.onopen = function(event) {
		    for (var j in this.ops) {
			send.bind(this)(this.ops[j]);
		    }
		    
		    this.in_initialization = false;
		}.bind(this);
		
		this.conn.onclose = function(event) {
		    if (this.is_auto_reconnect) {
			this.setTimeout();
		    }
		    
		    this.in_initialization = false;
		}.bind(this);
	    }
	};
	
	this.setTimeout = function() {
	    setTimeout(function() {
		this.connect(true);
	    }.bind(this), this.reconnect_interval);
	};
	
	this.disconnect = function() {
	    this.is_auto_reconnect = false;
	    
	    if (this.isConnected()) {
		this.conn.close();
	    }
	};
	
	this.setReconnectInterval = function(milliseconds) {
	    this.reconnect_interval = milliseconds;
	};
	
	this.setBackupOps = function(enable) {
	    this.is_backup_act = enable;
	};
	
	// privato
	var send = function(json) {
	    if (this.isConnected()) {
		if (json.op == Xserv.BIND && Xserv.isPrivateTopic(json.topic)) {
		    if (json.auth_endpoint) {
			var auth_url = json.auth_endpoint.endpoint || DEFAULT_AUTH_URL;
			var auth_user = json.auth_endpoint.user || '';
			var auth_pass = json.auth_endpoint.pass || '';
			
			var params = {
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
		} else {
		    this.conn.send(JSON.stringify(json));
		}
	    }
	};
	
	var add_op = function(json) {
	    // salva tutte op da ripetere su riconnessione
	    if (this.is_backup_act && (json.op == Xserv.BIND || json.op == Xserv.UNBIND)) {
		this.ops.push(json);
	    }
	    
	    send.bind(this)(json);
	};
	
	var is_string = function(value) {
	    return typeof value === 'string';
	};
	
	var is_object = function(value) {
	    return typeof value === 'object';
	};
	
	var is_array = function(value) {
	    return Object.prototype.toString.call(value) === '[object Array]';
	};
	
	var set_user_data = function(json) {
	    this.user_data = json;
	};
	
	var stringify_op = function(code) {
	    if (code == Xserv.BIND) {
		return 'bind';
	    } else if (code == Xserv.UNBIND) {
		return 'unbind';
	    } else if (code == Xserv.HISTORY) {
		return 'history';
	    } else if (code == Xserv.PRESENCE) {
		return 'presence';
	    } else if (code == Xserv.PRESENCE_IN) {
		return 'presence_in';
	    } else if (code == Xserv.PRESENCE_OUT) {
		return 'presence_out';
	    } else if (code == Xserv.TRIGGER) {
		return 'trigger';
	    }
	};
	
	this.addEventListener = function(name, callback) {
	    if (name == 'message') {
		
	    } else if (name == 'events') {
		var event_callback = function(event) {
		    // intercetta solo i messaggi, eventi da http
		    var json = JSON.parse(event.data);
		    if (json.message) {
			try {
			    json.message = JSON.parse(json.message);
			} catch(e) {}
			
			callback(json);
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'ops_response') {
		var event_callback = function(event) {
		    // intercetta solo gli op_response, eventi su comandi
		    var json = JSON.parse(event.data);
		    if (json.op) {
			json.name = stringify_op(json.op); 
			try {
			    var data = Base64.decode(json.data); // decode
			    data = JSON.parse(data);
			    json.data = data;
			    
			    if (json.op == Xserv.BIND && Xserv.isPrivateTopic(json.topic) && json.rc == Xserv.RC_OK) {
				if (is_object(json.data)) {
				    set_user_data.bind(this)(json.data);
				}
			    }
			} catch(e) {}
			
			callback(json);
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else {
		this.listeners.push({event: name, callback: callback});
	    }
	};
	
	this.trigger = function(topic, event, message) {
	    var uuid = generateUUID();
	    if (!is_string(message) && is_object(message)) {
		message = JSON.stringify(message);
	    }
	    add_op.bind(this)({uuid: uuid,
			       op: Xserv.TRIGGER, 
			       topic: topic, 
			       event: event,
			       arg1: message});
	    return uuid;
	};
	
	this.bind = function(topic, event, auth_endpoint) {
	    var uuid = generateUUID();
	    var tmp = {uuid: uuid,
		       op: Xserv.BIND, 
		       topic: topic, 
		       event: event};
	    if (auth_endpoint) {
		tmp.auth_endpoint = auth_endpoint;
	    }
	    add_op.bind(this)(tmp);
	    return uuid;
	};
	
	this.unbind = function(topic, event) {
	    var uuid = generateUUID();
	    event = event || '';
	    add_op.bind(this)({uuid: uuid,
			       op: Xserv.UNBIND, 
			       topic: topic, 
			       event: event});
	    return uuid;
	};
	
	this.historyById = function(topic, event, offset, limit) {
	    var uuid = generateUUID();
	    add_op.bind(this)({uuid: uuid,
			       op: Xserv.HISTORY, 
			       topic: topic, 
			       event: event,
			       arg1: Xserv.HISTORY_ID,
			       arg2: String(offset),
			       arg3: String(limit)});
	    return uuid;
	};
	
	this.historyByTimestamp = function(topic, event, offset, limit) {
	    var uuid = generateUUID();
	    add_op.bind(this)({uuid: uuid,
			       op: Xserv.HISTORY, 
			       topic: topic, 
			       event: event, 
			       arg1: Xserv.HISTORY_TIMESTAMP, 
			       arg2: String(offset), 
			       arg3: String(limit)});
	    return uuid;
	};
	
	this.presence = function(topic, event) {
	    var uuid = generateUUID();
	    add_op.bind(this)({uuid: uuid,
			       op: Xserv.PRESENCE, 
			       topic: topic, 
			       event: event});
	    return uuid;
	};
	
    };
    
    // static
    
    Xserv.isPrivateTopic = function(topic) {
	return topic.charAt(0) == '@';
    };
    
    // events:op op
    Xserv.TRIGGER = 200;
    Xserv.BIND = 201;
    Xserv.UNBIND = 202;
    Xserv.HISTORY = 203;
    Xserv.PRESENCE = 204;
    // in uso in presence
    Xserv.PRESENCE_IN = Xserv.BIND + 200;
    Xserv.PRESENCE_OUT = Xserv.UNBIND + 200;
    // in uso in history
    Xserv.HISTORY_ID = 'id';
    Xserv.HISTORY_TIMESTAMP = 'timestamp';
    // events:op result_code
    Xserv.RC_OK = 1;
    Xserv.RC_GENERIC_ERROR = 0;
    Xserv.RC_ARGS_ERROR = -1;
    Xserv.RC_ALREADY_BINDED = -2;
    Xserv.RC_UNAUTHORIZED = -3;
    Xserv.RC_NO_EVENT = -4;
    Xserv.RC_NO_DATA = -5;
    Xserv.RC_NOT_PRIVATE = -6;
    
    this.Xserv = Xserv;
    
    var generateUUID = function() {
	var d = new Date().getTime();
	var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = (d + Math.random()*16)%16 | 0;
	    d = Math.floor(d/16);
	    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
	});
	return uuid;
    };
    
    // Create Base64 Object
    var Base64 = {_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}};

}).call(this);
