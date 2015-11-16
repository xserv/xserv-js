(function() {
    // Create Base64 Object
    var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/\r\n/g,"\n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
    
    var Xserv = function(app_id) {
	var BIND = 100;
	var UNBIND = 101;
	var HISTORY = 102;
	var HISTORY_ID = 'id';
	var HISTORY_TIMESTAMP = 'timestamp';
	var OP_SEP = ':';
	
	this.app_id = app_id;
	this.url = 'ws://localhost:4321/ws';
	this.conn = null;
	this.listeners = [];
	this.ops = [];
	this.reconnectInterval = 5000;
	this.autoreconnect = false;
	
	// singleton
	if (arguments.callee._singletonInstance) {
	    return arguments.callee._singletonInstance;
	}
	arguments.callee._singletonInstance = this;
	//
	
	this.addEventListener = function(name, callback) {
	    if (name == 'message') {
		
	    } else if (name == 'events') {
		var event_callback = function(event) {
		    // intercetta solo i messaggi, eventi da http
		    if (event.data.charAt(0) != OP_SEP) {
			var ev = JSON.parse(event.data);
			callback(ev.id, ev.name, ev.topic, ev.message, ev.timestamp);
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'events:op') {
		var event_callback = function(event) {
		    // intercetta solo gli op_response, eventi su comandi
		    if (event.data.charAt(0) == OP_SEP) {
			var ev = event.data.split(OP_SEP);
			if (ev.length >= 7) {
			    var data = ev[4]; // base64
			    if (data.length > 0) {
				data = Base64.decode(data); // decode
				try {
				    data = JSON.parse(data);
				} catch(e) {
				}
			    }
			    callback(this.stringifyOpCode(ev[1]), ev[2], ev[3], data, ev[5] == 'true', ev[6]);
			}
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else {
		this.listeners.push({event: name, callback: callback});
	    }
	};
	
	this.connect = function() {
	    this.autoreconnect = true;
	    
	    if (window.MozWebSocket) {
		window.WebSocket = window.MozWebSocket;
	    }
	    
	    if (!this.conn || this.conn.readyState != WebSocket.OPEN) {
		this.conn = new WebSocket(this.url);
		
		for (var i in this.listeners) {
		    // console.log(JSON.stringify(this.listeners[i]));
		    this.conn.addEventListener(this.listeners[i].event, this.listeners[i].callback);
		}
		
		// su connect
		this.conn.onopen = function(event) {
		    for (var j in this.ops) {
			send.bind(this)(JSON.stringify(this.ops[j]));
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
	    if (this.conn && this.conn.readyState <= WebSocket.OPEN) {
		this.autoreconnect = false;
		this.conn.close();
		this.listeners = [];
		this.ops = [];
	    }
	};
	
	// privato
	var send =  function(message) {
	    if (this.conn && this.conn.readyState == WebSocket.OPEN) {
		this.conn.send(message);
	    }
	};
	
	this.stringifyOpCode = function(code) {
	    if (code == BIND) {
		return 'bind';
	    } else if (code == UNBIND) {
		return 'unbind';
	    } else if (code == HISTORY) {
		return 'history';
	    }
	};
	
	this.setReconnectInterval = function(value) {
	    this.reconnectInterval = value;
	};
	
	this.bind = function(topic, event) {
	    this.ops.push({app_id: this.app_id, 
			   op: BIND, 
			   topic: topic, 
			   event: event});
	};
	
	this.unbind = function(topic, event) {
	    event = event || '';
	    
	    this.ops.push({app_id: this.app_id, 
			op: UNBIND, 
			topic: topic, 
			event: event});
	};
	
	this.historyById = function(topic, event, value) {
	    this.ops.push({app_id: this.app_id, 
			   op: HISTORY, 
			   topic: topic, 
			   event: event,
			   arg1: HISTORY_ID,
			   arg2: String(value)});
	};
	
	this.historyByTimestamp = function(topic, event, value) {
	    this.ops.push({app_id: this.app_id, 
			   op: HISTORY, 
			   topic: topic, 
			   event: event,
			   arg1: HISTORY_TIMESTAMP,
			   arg2: String(value)});
	};
    };
    
    this.Xserv = Xserv;
}).call(this);
