/***
 Xserv

 Copyright (C) 2015 Giovanni Amati

 This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 You should have received a copy of the GNU General Public License along with this program. If not, see http://www.gnu.org/licenses/.
***/

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
	
	var sendStat = function() {
	    var bw = Xserv.Utils.getInfoBrowser();
	    var tz = Xserv.Utils.getTimeZoneData();
	    
	    var model = bw.browser || '';
	    var os = bw.os || '';
	    if (model.length > 45) {
		model = model.substring(0, 45);
	    }
	    if (os.length > 45) {
		os = os.substring(0, 45);
	    }
	    
	    var stat = {uuid: this.instanceUUID,
			model: model,
			os: os,
			tz_offset: tz.tz_offset,
			tz_dst: tz.tz_dst};
	    this.conn.send(JSON.stringify(stat));
	};
	
	// public static
	
	Xserv.debug = function() {
	    
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
		this.conn = new WebSocket(Xserv.Utils.format(Xserv.URL, {'$1':Xserv.ADDRESS, '$2':Xserv.PORT, '$3':this.app_id}));
		
		for (var i in this.listeners) {
		    this.conn.addEventListener(this.listeners[i].event, this.listeners[i].callback);
		}
		
		// su connect
		this.conn.onopen = function(event) {
		    // stat
		    sendStat.bind(this)();
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
	
	prototype.setReconnectInterval = function(milliseconds) {
	    this.reconnect_interval = milliseconds;
	};
	
	prototype.getReconnectInterval = function() {
	    return this.reconnect_interval;
	};
	
	prototype.getUserData = function() {
	    return this.user_data;
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
	    
	    getInfoBrowser: function() {
		var nAgt = navigator.userAgent;
		var browserName  = navigator.appName;
		var fullVersion  = ''+parseFloat(navigator.appVersion); 
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
		else if ( (nameOffset=nAgt.lastIndexOf(' ')+1) < (verOffset=nAgt.lastIndexOf('/')) ) {
		    browserName = nAgt.substring(nameOffset,verOffset);
		    fullVersion = nAgt.substring(verOffset+1);
		    if (browserName.toLowerCase()==browserName.toUpperCase()) {
			browserName = navigator.appName;
		    }
		}
		// trim the fullVersion string at semicolon/space if present
		if ((ix=fullVersion.indexOf(';'))!=-1)
		    fullVersion=fullVersion.substring(0,ix);
		if ((ix=fullVersion.indexOf(' '))!=-1)
		    fullVersion=fullVersion.substring(0,ix);
		
		var majorVersion = parseInt(''+fullVersion,10);
		if (isNaN(majorVersion)) {
		    fullVersion  = ''+parseFloat(navigator.appVersion); 
		}
		
		var os = 'Unknown';
		try {
		    os = nAgt.split('(')[1].split(')')[0];
		} catch(e) {
		}
		
		return {browser: browserName + ' ' + fullVersion, os: os};
	    }
	};
	
    }).call(this);
    
    (function () {
	
	Xserv.VERSION = '1.0.0';
	
	// Xserv.ADDRESS = '192.168.1.130';
	Xserv.ADDRESS = 'xserv.mobile-italia.com';
	Xserv.PORT = '4332';
	Xserv.URL = 'ws://$1:$2/ws/$3';
	Xserv.DEFAULT_AUTH_URL = 'http://$1:$2/app/$3/auth_user';
	Xserv.DEFAULT_RI = 5000;
	
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
	
    }).call(this);
    
    return Xserv;
}));
