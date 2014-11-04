var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var logger = require('morgan');

var net = require('net');
var vpn_client = new net.Socket();

app.use(logger('dev'));

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

var log_data = '';

// TODO: client list variable & routing table variable
// TODO: csv module http://csv.adaltas.com/
// TODO: get routing table as array and make html table from it

vpn_client.on('data', function(data) {
	var read = data.toString();
	log_data += read;
	console.log('VPN_CLIENT ON DATA' + read);

	if(log_data.match(/END/)) {
		console.log('VPN_CLIENT ON DATA END');
		vpn_client.end();
		io.emit('command', log_data.toString());
		log_data = '';
	}
}).on('connect', function() {
	console.log('VPN_CLIENT ON CONNECT');
}).on('end', function() {
	console.log('VPN_CLIENT ON END');
	console.log('Disconnected');
});

io.on('connection', function(socket){
	socket.on('command', function(msg){
		if(msg.length < 1)
			msg = 'status';

		vpn_client.connect('9000', '10.8.0.1', function() {
			console.log('CLIENT: CONNECTED: vpn:9000');
			console.log(msg);
			vpn_client.write(msg + '\n');
		});
	});
});

http.listen(3000, function(){
	console.log('listening on *:3000');
});
