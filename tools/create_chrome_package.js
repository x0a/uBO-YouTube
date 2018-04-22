var fs = require("fs-extra");
var path = require("path");
var exec = require('child_process').exec;
var documentRoot = path.resolve("..");

fs.ensureDirSync(documentRoot + "\\dist\\chrome\\debug");

process.chdir(documentRoot + "\\dist\\chrome");
fs.readFile(documentRoot + "\\shared\\manifest.json", "utf-8", function(err, contents){
  var manifest = JSON.parse(contents);
  delete manifest["applications"];
  if(fs.existsSync(documentRoot + "\\dist\\chrome\\debug\\manifest.json"))
    fs.unlinkSync(documentRoot + "\\dist\\chrome\\debug\\manifest.json");
  fs.writeFileSync(documentRoot + "\\dist\\chrome\\debug\\manifest.json", JSON.stringify(manifest, null, 4), "utf8");
})
var dateAndTime = new Date();
var fileName = documentRoot + "\\dist\\chrome\\" + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".zip";
if(fs.existsSync(fileName)){
  if(!fs.unlinkSync(fileName)){
    console.log("Error removing old zip");
  }
}

fs.copySync(documentRoot + "\\src\\", documentRoot + "\\dist\\chrome\\debug\\", {overwrite: true});
fs.copySync(documentRoot + "\\lib\\", documentRoot + "\\dist\\chrome\\debug\\", {overwrite: true});

exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "\\src\\*\" \"" + documentRoot + "\\dist\\chrome\\debug\\manifest.json\" \"" + documentRoot + "\\lib\\*\"", "", function(err, stdout){
  if(err)
    console.log("Error creating zip: ", err);

});
