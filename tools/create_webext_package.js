var fs = require("fs-extra");
var path = require("path");
var exec = require('child_process').exec;
var documentRoot = path.resolve("..");

fs.ensureDirSync(documentRoot + "\\dist\\webext\\debug");

process.chdir(documentRoot + "\\dist\\webext");
let versionChanged = false;
fs.readFile(documentRoot + "\\shared\\manifest.json", "utf-8", function(err, contents){
	var manifest = JSON.parse(contents);
	if(fs.existsSync(documentRoot + "\\dist\\webext\\debug\\manifest.json")){
		let oldmanifest = JSON.parse(fs.readFileSync(documentRoot + "\\dist\\webext\\debug\\manifest.json").toString());
		if(manifest.version !== oldmanifest.version)
			versionChanged = true;
		console.log("Current version:", manifest.version,", packaged version:", oldmanifest.version)
		fs.unlinkSync(documentRoot + "\\dist\\webext\\debug\\manifest.json");
	}else{
		versionChanged = true;
	}
		
	fs.writeFileSync(documentRoot + "\\dist\\webext\\debug\\manifest.json", JSON.stringify(manifest, null, 4), "utf8");
	fs.copySync(documentRoot + "\\src\\", documentRoot + "\\dist\\webext\\debug\\", {overwrite: true});
	fs.copySync(documentRoot + "\\lib\\", documentRoot + "\\dist\\webext\\debug\\", {overwrite: true});

	if(versionChanged) 
		console.log("Version changed, creating package");
	else return;

	var dateAndTime = new Date();
	var fileName = documentRoot + "\\dist\\webext\\" + manifest.version + " " + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".xpi";
	if(fs.existsSync(fileName)){
		if(!fs.unlinkSync(fileName)){
			console.log("Error removing old zip");
		}
	}

	exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "\\src\\*\" \"" + documentRoot + "\\dist\\webext\\debug\\manifest.json\" \"" + documentRoot + "\\lib\\*\"", "", function(err, stdout){
		if(err)
			console.log("Error creating zip: ", err);
	});

})

