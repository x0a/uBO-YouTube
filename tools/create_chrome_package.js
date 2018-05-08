let fs = require("fs-extra");
let path = require("path");
let pug = require("pug");
let exec = require('child_process').exec;
let documentRoot = path.resolve("..");

//replace JSON.parse with one that doesn't throw exception
((parse)=>{JSON.parse=(string,reviver)=>{try{return parse(string,reviver)}catch(e){return undefined}}})(JSON.parse)
fs.ensureDirSync(documentRoot + "/dist/chrome/debug");

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
	fs.copySync(documentRoot + "/src/", documentRoot + "/dist/chrome/debug/", {overwrite: true, filter: (src, dst) => {
		let isPug = src.endsWith(".pug");
		if(isPug){
			fs.outputFileSync(dst.slice(0, -3) + "html", pug.renderFile(src), {overwrite: true});
			return false;
		}else return true;
	}});
	fs.copySync(documentRoot + "/lib/", documentRoot + "/dist/chrome/debug/", {overwrite: true});

	if(versionChanged) 
		console.log("New version, creating package");
	else{
		console.log("No version change, will not create new package");
		return;
	}

	var dateAndTime = new Date();
	var fileName = documentRoot + "/dist/chrome/" + manifest.version + " " + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".zip";
	if(fs.existsSync(fileName)){
		if(!fs.unlinkSync(fileName)){
			console.log("Error removing old zip");
		}
	}

	exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "/dist/chrome/debug/*\"", "", function(err, stdout){
		if(err)
			console.log("Error creating zip: ", err);

	});
})

