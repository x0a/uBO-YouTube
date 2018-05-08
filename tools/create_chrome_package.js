let fs = require("fs-extra");
let path = require("path");
let exec = require('child_process').exec;
let documentRoot = path.resolve("..");

//replace JSON.parse with one that doesn't throw exception
((parse)=>{JSON.parse=(string,reviver)=>{try{return parse(string,reviver)}catch(e){return undefined}}})(JSON.parse)
fs.ensureDirSync(documentRoot + "/dist/chrome/debug");

//process.chdir(documentRoot + "/dist/chrome");
let versionChanged = false;
fs.readFile(documentRoot + "/shared/manifest.json", "utf-8", function(err, contents){
	let manifest = JSON.parse(contents);
	delete manifest["applications"];
	if(fs.existsSync(documentRoot + "/dist/chrome/debug/manifest.json")){
		let oldmanifest = JSON.parse(fs.readFileSync(documentRoot + "/dist/chrome/debug/manifest.json").toString());
		if(manifest.version !== oldmanifest.version)
			versionChanged = true;
		console.log("Current version:", manifest.version,", packaged version:", oldmanifest.version)
		fs.unlinkSync(documentRoot + "/dist/chrome/debug/manifest.json");
	}else{
		versionChanged = true;
	}
	
	fs.writeFileSync(documentRoot + "/dist/chrome/debug/manifest.json", JSON.stringify(manifest, null, 4), "utf8");
	fs.copySync(documentRoot + "/src/", documentRoot + "/dist/chrome/debug/", {overwrite: true});
	fs.copySync(documentRoot + "/lib/", documentRoot + "/dist/chrome/debug/", {overwrite: true});

	if(versionChanged) 
		console.log("Version changed, creating package");
	else return;

	var dateAndTime = new Date();
	var fileName = documentRoot + "/dist/chrome/" + manifest.version + " " + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".zip";
	if(fs.existsSync(fileName)){
		if(!fs.unlinkSync(fileName)){
			console.log("Error removing old zip");
		}
	}

	exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "/src/*\" \"" + documentRoot + "/dist/chrome/debug/manifest.json\" \"" + documentRoot + "/lib/*\"", "", function(err, stdout){
		if(err)
			console.log("Error creating zip: ", err);

	});
})

