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
	}
	
	var prototype = Xserv.prototype;
	
	// rpivate
	function check() {
	    
	}
	
	// statico
	Xserv.debug = function() {
	    
	};
	
	// di instanza
	prototype.test = function() {
	    
	};
	
	this.Xserv = Xserv;	
    }).call(this);
    
    (function () {
	Xserv.VERSION = '1.0.0';
    }).call(this);
    
    return Xserv;
}));
