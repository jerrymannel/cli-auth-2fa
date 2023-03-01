const twofactor = require("node-2fa");
const colors = require('@colors/colors');

let cursorPosition = 0;
let selectedToken = 0;

function stringComparison(a, b) {
	const nameA = a.issuer.toUpperCase() || "";
	const nameB = b.issuer.toUpperCase() || "";
	if (nameA < nameB) return -1;
	if (nameA > nameB) return 1;
	return 0;
}

const data = require("./db.json").map(d => {
	let link = new URL(d)
	return {
		name: decodeURIComponent(link.pathname.split("/")[1]),
		issuer: link.searchParams.get("issuer") || "---",
		secret: link.searchParams.get("secret")
	}
}).sort(stringComparison);

let issuerLength = 0
let nameLength = 0

data.forEach(d => {
	if (d.name.length > nameLength) nameLength = d.name.length
	if (d.issuer.length > issuerLength) issuerLength = d.issuer.length
})

const totalLength = issuerLength + nameLength + 6 + 2 + 11

function padding(s, max) {
	while (s.length < max) {
		s += " "
	}
	return s
}

function padNum(num, size) {
	num = num.toString();
	while (num.length < size) num = "0" + num;
	return num;
}

function draw(s, m, e) {
	let i = 0;
	let mm = "";
	while (i < totalLength) {
		mm += m;
		i++;
	}
	console.log(`${s}${mm}${e}`);
}

function goUp() {
	let i = data.length + 4;
	while (i > 0) {
		process.stdout.write('\033[1A');
		i--;
	}
}

function generate() {
	// draw("┌", "─", "┐")
	draw("─", "─", "─")
	console.log(`   ##  ${padding("Issuer", issuerLength)}  ${padding("Token", 6)}  ${padding("Name", nameLength)}`)
	// draw("├", "─", "┤")
	draw("─", "─", "─")
	data.forEach((d, index) => {
		let newToken = twofactor.generateToken(d.secret);
		let position = colors.green(padNum(index + 1, 2));
		let issuer = padding(d.issuer, issuerLength);
		let token = `  ${colors.yellow(newToken.token)}  `;
		let name = padding(d.name, nameLength);
		if (index == cursorPosition) {
			selectedToken = newToken.token;
			token = `[ ${colors.yellow(newToken.token)} ]`;
		}
		console.log(`   ${position}  ${issuer}  ${token}  ${name}   `)
	});
	// draw("└", "─", "┘")
	draw("─", "─", "─")
}

generate()

var stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('hex');
stdin.on('data', function (key) {

	if (key === '03') process.exit();

	if (key === '0d') {
		console.log(`Copied ${selectedToken} !!`);
		var proc = require('child_process').spawn('pbcopy');
		proc.stdin.write(selectedToken); proc.stdin.end();
		process.exit();
	}

	if (key == "1b5b41") {
		if (cursorPosition > 0) cursorPosition--;
		goUp();
		generate();
	}

	if (key == "1b5b42") {
		if (cursorPosition < (data.length + 3)) cursorPosition++;
		goUp();
		generate();
	}
});