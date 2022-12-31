const twofactor = require("node-2fa");
const colors = require('@colors/colors');

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

function generate() {
	data.forEach((d, index) => {
		let newToken = twofactor.generateToken(d.secret);
		console.log(`│ ${colors.green(padNum(index + 1, 2))} │ ${padding(d.issuer, issuerLength)} │ ${padding(d.name, nameLength)} │ ${colors.yellow(newToken.token)} │`)
	});
}
draw("┌", "─", "┐")
console.log(`│ ## │ ${padding("Issuer", issuerLength)} │ ${padding("Name", nameLength)} │ ${padding("Token", 6)} │`)
draw("├", "─", "┤")
generate()
draw("└", "─", "┘")

// setInterval(generate, 1000)