(function() { 
    var Xserv = function(app_id) {
	var BIND = 100;
	var UNBIND = 101;
	var HISTORY = 102;
	var HISTORY_ID = 'id';
	var HISTORY_TIMESTAMP = 'timestamp';
	
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
	// end
	
	this.addEventListener = function(name, callback) {
	    if (name == 'message') {
		
	    } else if (name == 'events') {
		var event_callback = function(event) {
		    var ev = JSON.parse(event.data);
		    if (!ev.op) {
			callback(ev.id, ev.name, ev.topic, ev.message, ev.timestamp);
		    }
		};
		
		this.listeners.push({event: 'message', callback: event_callback});
	    } else if (name == 'op_succeeded') {
		var event_callback = function(event) {
		    var ev = JSON.parse(event.data);
		    if (ev.op) {
			callback(ev.op, ev.topic, ev.event);
		    }
		};
		
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
    };
    
    this.Xserv = Xserv;
}).call(this);
