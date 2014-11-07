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
var MongoClient = require('mongodb').MongoClient;
var Converter = require('csvtojson').core.Converter;
var streamifier = require('streamifier');
var json2html = require('node-json2html');

var table_header = "<tr><th>Common Name</th><th>Virtual IP</th><th>Real IP</th><th>Last ref</th><th>Location</th></tr>";
var transform = [
	{'tag': 'tr', 'children': [
	{'tag': 'td', 'html':'${Common Name}'},
	{'tag': 'td', 'html':'${Virtual Address}'},
	{'tag': 'td', 'html':'${Real Address}'},
	{'tag': 'td', 'html':'${Last Ref}'},
	{'tag': 'td', 'html': ''}
	]}];

// Management message parser
// http://csv.adaltas.com
//var parse = require(csv-parse);

// Define your VPN server
var VPN_SERVER = '10.8.0.1';
var ADMIN_PORT = '9000';

app.use(logger('dev'));

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/index.html');

});


// VPN data
var log_data = [];
var client_list = [];
var routing_table = [];
client_list_string = '';
routing_table_string = '';
var query_count = '';

// TODO: get routing table as array and make html table from it

var param = {};
var csvConverter = new Converter(param);
csvConverter.on("end_parsed", function(jsonObj){
	console.log("Converting");
	console.log(jsonObj); //here is your result json object
	console.log("Converting done");
});

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
		var csv_client = new Converter({});
		csv_client.on("end_parsed", function(jsonObj){
			console.log("Client Converting");
			//console.log(jsonObj); //here is your result json object
			console.log("Client Converting done");
		});

		var csv_routing = new Converter({});
		csv_routing.on("end_parsed", function(jsonObj){
			console.log("Routing Converting");
			//console.log(jsonObj); //here is your result json object
			console.log("Routing Converting done");
			io.emit('command', table_header
				+ json2html.transform(JSON.stringify(jsonObj), transform));
			console.log(json2html.transform(JSON.stringify(jsonObj), transform));
		});

		console.log('VPN_CLIENT ON DATA END');
		vpn_client.end();
		//io.emit('command', log_data);

		// data pre-processing. strip
		// data will be like a single array ["a", "b",....]
		var log_string = log_data.toString();
		var log_split = log_string.split(/\r\n/);

		// iterate array log_split[]
		// if Common Name, push to client_list[]
		// push member until meet "ROUTING TABLE"
		for (i = 0; i < log_split.length; ++i) {
			// Abandon comlicated contents until meet client list
			member = log_split[i].toString();
			if (member.match(/Common Name*/))
				break;
		}
		for (i; i < log_split.length; ++i) {
			member = log_split[i].toString();
			if (member.match(/ROUTING TABLE/)) {
				++i;
				break;
			}
			client_list.push(log_split[i]);
			client_list_string += log_split[i] + "\n";
		}
		for (i; i < log_split.length; ++i) {
			member = log_split[i].toString();
			if (member.match(/GLOBAL STATS/))
				break;
			routing_table.push(log_split[i]);
			routing_table_string += log_split[i] + "\n";
		}


		// if Virtual Address, push to routing_table[]
		// if END, terminate
		//console.log(log_data);
		//console.log(client_list);
		streamifier.createReadStream(client_list_string).pipe(csv_client);

		//console.log(routing_table);
		streamifier.createReadStream(routing_table_string).pipe(csv_routing);

		// Empty original array
		read.length = 0;
		member.length = 0;
		log_data.length = 0;
		log_string.length = 0;
		log_split.length = 0;
		client_list.length = 0;
		client_list_string = '';
		routing_table.length = 0;
		routing_table_string = '';
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

// set query timer
setInterval(function() {
	vpn_client.connect(ADMIN_PORT, VPN_SERVER);
	console.log('CLIENT: CONNECTED: vpn:9000');
	vpn_client.write('status\n');
	console.log('vpn status queried');
}, 3000);

io.on('connection', function(socket){
	vpn_client.connect(ADMIN_PORT, VPN_SERVER, function() {
		console.log('CLIENT: CONNECTED: vpn:9000');
		vpn_client.write('status\n');
	})

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
