var fs = require("fs");
var path = require("path");
var exec = require('child_process').exec;
var documentRoot = path.resolve("..");

fs.ensureDirSync(documentRoot + "\\dist\\webext\\debug");

process.chdir(documentRoot + "\\dist\\webext");
fs.readFile(documentRoot + "\\shared\\manifest.json", "utf-8", function(err, contents){
	var manifest = JSON.parse(contents);
	if(fs.existsSync(documentRoot + "\\dist\\webext\\manifest.json"))
		fs.unlinkSync(documentRoot + "\\dist\\webext\\manifest.json");
	fs.writeFileSync(documentRoot + "\\dist\\webext\\manifest.json", JSON.stringify(manifest, null, 4), "utf8");

	var dateAndTime = new Date();
	var fileName = documentRoot + "\\dist\\webext\\" + manifest.version + " " + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".xpi";
	if(fs.existsSync(fileName)){
		if(!fs.unlinkSync(fileName)){
			console.log("Error removing old zip");
		}
	}

	fs.copySync(documentRoot + "\\src\\", documentRoot + "\\dist\\webext\\debug\\", {overwrite: true});
	fs.copySync(documentRoot + "\\lib\\", documentRoot + "\\dist\\webext\\debug\\", {overwrite: true});

	exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "\\src\\*\" \"" + documentRoot + "\\dist\\webext\\manifest.json\" \"" + documentRoot + "\\lib\\*\"", "", function(err, stdout){
		if(err)
			console.log("Error creating zip: ", err);
		fs.unlinkSync(documentRoot + "\\dist\\webext\\manifest.json");
	});

})

