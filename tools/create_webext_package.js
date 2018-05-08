let fs = require("fs-extra");
let path = require("path");
let exec = require('child_process').exec;
let documentRoot = path.resolve("..");

//replace JSON.parse with one that doesn't throw exception
((parse)=>{JSON.parse=(string,reviver)=>{try{return parse(string,reviver)}catch(e){return undefined}}})(JSON.parse)
fs.ensureDirSync(documentRoot + "/dist/webext/debug");

let versionChanged = false;
fs.readFile(documentRoot + "/shared/manifest.json", "utf-8", function(err, contents){
	let manifest = JSON.parse(contents);
	if(fs.existsSync(documentRoot + "/dist/webext/debug/manifest.json")){
		let oldmanifest = JSON.parse(fs.readFileSync(documentRoot + "/dist/webext/debug/manifest.json").toString());
		if(manifest.version !== oldmanifest.version)
			versionChanged = true;
		console.log("Current version:", manifest.version,", packaged version:", oldmanifest.version)
		fs.unlinkSync(documentRoot + "/dist/webext/debug/manifest.json");
	}else{
		versionChanged = true;
	}
		
	fs.writeFileSync(documentRoot + "/dist/webext/debug/manifest.json", JSON.stringify(manifest, null, 4), "utf8");
	fs.copySync(documentRoot + "/src/", documentRoot + "/dist/webext/debug/", {overwrite: true});
	fs.copySync(documentRoot + "/lib/", documentRoot + "/dist/webext/debug/", {overwrite: true});

	if(versionChanged) 
		console.log("Version changed, creating package");
	else return;

	let dateAndTime = new Date();
	let fileName = documentRoot + "/dist/webext/" + manifest.version + " " + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".xpi";
	if(fs.existsSync(fileName)){
		if(!fs.unlinkSync(fileName)){
			console.log("Error removing old zip");
		}
	}

	exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "/src/*\" \"" + documentRoot + "/dist/webext/debug/manifest.json\" \"" + documentRoot + "/lib/*\"", "", function(err, stdout){
		if(err)
			console.log("Error creating zip: ", err);
	});

})

