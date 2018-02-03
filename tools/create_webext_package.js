var fs = require("fs");
var path = require("path");
var exec = require('child_process').exec;
var documentRoot = path.resolve("..");


if(!fs.existsSync(documentRoot + "\\dist\\webext"))
  fs.mkdirSync(documentRoot + "\\dist\\webext");
process.chdir(documentRoot + "\\dist\\webext");
fs.readFile(documentRoot + "\\shared\\manifest.json", "utf-8", function(err, contents){
  var manifest = JSON.parse(contents);
  if(fs.existsSync(documentRoot + "\\dist\\webext\\manifest.json"))
    fs.unlinkSync(documentRoot + "\\dist\\webext\\manifest.json");
  fs.writeFileSync(documentRoot + "\\dist\\webext\\manifest.json", JSON.stringify(manifest));
})

var dateAndTime = new Date();
var fileName = documentRoot + "\\dist\\webext\\" + dateAndTime.toLocaleString("en-us", {month: "short"}) + " " + dateAndTime.getDate() + " - " + dateAndTime.toLocaleString('en-US', { hour: 'numeric', hour12: true }) + ".zip";
if(fs.existsSync(fileName)){
  if(!fs.unlinkSync(fileName)){
    console.log("Error removing old zip: ", err);
  }
}
exec("7z a -tzip \"" + fileName + "\" \"" + documentRoot + "\\src\\*\" \"" + documentRoot + "\\dist\\webext\\manifest.json\" \"" + documentRoot + "\\lib\\*\"", "", function(err, stdout){
  if(err)
    console.log("Error creating zip: ", err);
  fs.unlinkSync(documentRoot + "\\dist\\webext\\manifest.json");
});
