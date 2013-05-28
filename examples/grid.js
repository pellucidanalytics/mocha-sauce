var Canvas = require('term-canvas'),
	size = process.stdout.getWindowSize(),
	Cloud = require('../index.js'),
	GridView = require('mocha-cloud-grid-view');


// configure cloud
var cloud = new Cloud({
	name: "WTF",
	username: "pbakaus",
	accessKey: "e7b171df-435b-41a4-8ab3-9abacf2f70e6",
	host: "localhost",
	port: 4445,

	// the test url
	url: "http://localhost.zynga.com/wtf/test/unit/index.php?reporter=json",

	// the current build name (optional)
	build: Date.now()
});


// setup what browsers to test with
cloud.browser({ browserName: "chrome", platform: "Windows 7" });
cloud.browser({ browserName: "firefox", platform: "Windows XP" });

// clear terminal
console.log("\033[2J\033[0f");

// setup grid and canvas
var canvas = new Canvas(size[0], size[1]);
var ctx = canvas.getContext('2d');
var grid = new GridView(cloud, ctx);
grid.size(canvas.width, canvas.height);
ctx.hideCursor();

// trap SIGINT
process.on('SIGINT', function(){
	ctx.reset();
	process.nextTick(function(){
		process.exit();
	});
});

// output failure messages
// once complete, and exit > 0
// accordingly
cloud.start(function() {
	grid.showFailures();
	setTimeout(function() {
		ctx.showCursor();
		process.exit(grid.totalFailures());
	}, 100);
});