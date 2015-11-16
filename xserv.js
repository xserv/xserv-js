(function() {
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
		    // intercetta solo i messaggi
		    if (event.data.charAt(0) != OP_SEP) {
			var ev = JSON.parse(event.data);
			callback(ev.id, ev.name, ev.topic, ev.message, ev.timestamp);
		    }
		}.bind(this);
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'events:op') {
		var event_callback = function(event) {
		    // intercetta solo gli event dei comandi
		    if (event.data.charAt(0) == OP_SEP) {
			var ev = event.data.split(OP_SEP);
			if (ev.length >= 7) {
			    var base64 = ev[4];
			    var dec = atob(base64);
			    var data2 = jQuery.parseJSON(dec);
			    var data = dec;
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
			   arg1: HISTORY_TIMESTAMP.toString(),
			   arg2: String(value)});
	};
    };
    
    this.Xserv = Xserv;
}).call(this);
