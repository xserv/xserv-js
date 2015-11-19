(function() {    
    var Xserv = function(app_id) {
	var URL = 'ws://localhost:4321/ws';
	var DEFAULT_RI = 5000;
	var OP_SEP = ':';
	
	this.app_id = app_id;
	this.conn = null;
	this.listeners = [];
	this.ops = [];
	this.reconnectInterval = DEFAULT_RI;
	this.autoreconnect = false;
	
	this.user_data = {};
	
	// singleton start
	if (arguments.callee._singletonInstance) {
	    return arguments.callee._singletonInstance;
	}
	arguments.callee._singletonInstance = this;
	// end
	
	this.addEventListener = function(name, callback) {
	    if (name == 'message') {
		
	    } else if (name == 'events') {
		var event_callback = function(event) {
		    // intercetta solo i messaggi, eventi da http
		    if (event.data.charAt(0) != OP_SEP) {
			var ev = JSON.parse(event.data);
			callback(ev);
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'events:op') {
		var event_callback = function(event) {
		    // intercetta solo gli op_response, eventi su comandi
		    if (event.data.charAt(0) == OP_SEP) {
			var arr = event.data.split(OP_SEP);
			if (arr.length >= 7) {
			    var data = arr[5] || null; // base64
			    if (data) {
				try {
				    data = Base64.decode(data); // decode
				    data = JSON.parse(data);
				} catch(e) {}
			    }
			    var ev = {rc: parseInt(arr[1], 10),
				      op: parseInt(arr[2], 10),
				      name: stringify_op(arr[2]),
				      topic: arr[3],
				      event: arr[4],
				      data: data,
				      descr: arr[6]};
			    
			    // bind privata ok
			    if (ev.op == Xserv.BIND && Xserv.isPrivateTopic(ev.topic) && ev.rc == Xserv.RC_DONE) {
				add_user_data.bind(this)(ev.data);
			    }
			    callback(ev);
			}
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else {
		this.listeners.push({event: name, callback: callback});
	    }
	};
	
	this.isConnected = function() {
	    return this.conn && this.conn.readyState == WebSocket.OPEN;
	};
	
	this.connect = function() {
	    this.autoreconnect = true;
	    
	    if (!this.isConnected()) {
		if (window.MozWebSocket) {
		    window.WebSocket = window.MozWebSocket;
		}
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
		}.bind(this);
		
		this.conn.onclose = function(event) {
		    if (this.autoreconnect) {
			setTimeout(this.connect.bind(this), this.reconnectInterval);
		    }
		}.bind(this);
	    }
	};
	
	this.disconnect = function() {
	    this.autoreconnect = false;
	    
	    if (this.isConnected()) {
		this.conn.close();
	    }
	    
	    this.listeners = [];
	    this.ops = [];
	};
	
	this.setReconnectInterval = function(value) {
	    this.reconnectInterval = value;
	};
	
	// privato
	var add_user_data = function(data) {
	    this.user_data = data;
	};
	
	// privato
	var send = function(json) {
	    if (this.isConnected()) {
		if (json.op == Xserv.BIND && Xserv.isPrivateTopic(json.topic)) {
		    if (json.auth_endpoint) {
			var auth_url = json.auth_endpoint.endpoint;
			var auth_user = json.auth_endpoint.user;
			var auth_pass = json.auth_endpoint.pass;
			
			var params = {
			    app_id: json.app_id,
			    topic: json.topic,
			    user: auth_user,
			    pass: auth_pass
			};
			
			$.ajaxSetup({cache: false});
			$.post(auth_url, params).always(function(response) {
				// clone perche' non si tocca quello in lista op
				var new_json = $.extend({}, json);
				delete new_json.auth_endpoint;
				
				try {
				    var data_sign = JSON.parse(response);
				    if (data_sign) {
					// double quote json di user_data
					new_json.arg1 = JSON.stringify(data_sign.data);
					new_json.arg2 = data_sign.sign;
				    }
				} catch(e) {}
				
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
	
	// privato
	var add_op = function(json) {
	    if (this.isConnected()) {
		// console.log('exec diretta');
		send.bind(this)(json);
	    } else {
		// console.log('exec indiretta');
		this.ops.push(json);
	    }
	};
	
	// privato
	var stringify_op = function(code) {
	    if (code == Xserv.BIND) {
		return 'bind';
	    } else if (code == Xserv.UNBIND) {
		return 'unbind';
	    } else if (code == Xserv.HISTORY) {
		return 'history';
	    }
	};
	
	this.bind = function(topic, event, auth_endpoint) {
	    add_op.bind(this)({app_id: this.app_id, 
			       op: Xserv.BIND, 
			       topic: topic, 
			       event: event,
			       auth_endpoint: auth_endpoint});
	};
	
	this.unbind = function(topic, event) {
	    event = event || '';
	    
	    add_op.bind(this)({app_id: this.app_id, 
			op: Xserv.UNBIND, 
			topic: topic, 
			event: event});
	};
	
	this.historyById = function(topic, event, value, limit) {
	    add_op.bind(this)({app_id: this.app_id, 
			       op: Xserv.HISTORY, 
			       topic: topic, 
			       event: event,
			       arg1: Xserv.HISTORY_ID,
			       arg2: String(value),
			       arg3: String(limit)});
	};
	
	this.historyByTimestamp = function(topic, event, value, limit) {
	    add_op.bind(this)({app_id: this.app_id, 
			       op: Xserv.HISTORY, 
			       topic: topic, 
			       event: event, 
			       arg1: Xserv.HISTORY_TIMESTAMP, 
			       arg2: String(value), 
			       arg3: String(limit)});
	};
	
	this.presence = function(topic, event) {
	    event = event || '';
	    
	    add_op.bind(this)({app_id: this.app_id,
			op: Xserv.PRESENCE, 
			topic: topic, 
			event: event});
	};
    };
    
    // static
    
    Xserv.isPrivateTopic = function(topic) {
	return topic.charAt(0) == '@';
    };
    
    // events:op op
    Xserv.BIND = 100;
    Xserv.UNBIND = 101;
    Xserv.HISTORY = 102;
    Xserv.PRESENCE = 103;
    
    // in uso in history
    Xserv.HISTORY_ID = 'id';
    Xserv.HISTORY_TIMESTAMP = 'timestamp';
    
    // events:op result_code
    Xserv.RC_FAIL = 0;
    Xserv.RC_DONE = 1;
    
    this.Xserv = Xserv;
    
    // Create Base64 Object
    var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}

}).call(this);
