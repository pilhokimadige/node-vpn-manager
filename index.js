/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Dongsoo Nathaniel Kim<dongsoo.kim@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var logger = require('morgan');
var split = require('split');
var net = require('net');
var vpn_client = new net.Socket();

// Management message parser
// http://csv.adaltas.com
//var parse = require(csv-parse);

// Define your VPN server
var VPN_SERVER = '10.8.0.1';
var ADMIN_PORT = '9000';

app.use(logger('dev'));

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

// VPN data
var log_data = [];
var client_list = [];
var routing_table = [];

// TODO: client list variable & routing table variable
// TODO: get routing table as array and make html table from it

// Data receiving
// - Message format
// OpenVPN CLIENT LIST
// Updated, $DATE
// Common Name, Real Address, Bytes Received, Bytes Sent, Connected Since
// $HOSTNAME, $WAN_IP, bytes, bytes, $DATE
// ROUTING TABLE
// Virtual Address,Common Name,Real Address,Last Ref
// $VPN_IP, $HOSTNAME, $WANP_IP, $DATE
// GLOBAL STATS
// Max bcast/mcast queue length,$LENGTH
// END
vpn_client.on('data', function(data) {
	var read = data.toString();
	log_data.push(read);

	if(read.match(/END/)) {
		console.log('VPN_CLIENT ON DATA END');
		vpn_client.end();
		io.emit('command', log_data);

		// data pre-processing. strip
		var log_string = log_data.toString();
		var log_split = log_string.split(/\r\n/);

		// Make copy of log_data
		// iterate line by line
		// if Common Name, push to client_list[]
		// if Virtual Address, push to routing_table[]
		// if END, terminate
		//console.log(log_data);
		console.log(log_split);
		console.log(log_split.length);

		// Empty original array
		log_data.length = 0;
	}
});

// Connection engaged
vpn_client.on('connect', function() {
	console.log('VPN_CLIENT ON CONNECT');
});

// Connection ditched
vpn_client.on('end', function() {
	console.log('VPN_CLIENT ON END');
	console.log('Disconnected');
});

io.on('connection', function(socket){
	socket.on('command', function(msg){
		// Alter null request to status command
		if(msg.length < 1)
			msg = 'status';

		vpn_client.connect(ADMIN_PORT, VPN_SERVER, function() {
			console.log('CLIENT: CONNECTED: vpn:9000');
			console.log(msg);
			vpn_client.write(msg + '\n');
		});
	});
});

http.listen(3000, function(){
	console.log('listening on *:3000');
});
