'use strict';

/*
	Credit to Fobos for his original version of this script
	Find at: https://github.com/fobos/gulp-archiver

*/

let path = require('path');
let gutil = require('gulp-util');
let PluginError = gutil.PluginError;
let File = gutil.File;
let through = require('through2');
let Archiver = require('archiver');
let fs = require('fs');
let concatStream = require("concat-stream")

let archiver = function(type, opts, taskEndCb){
	opts = opts || {};

	if(!type || ["zip", "tar", "tar.gz"].indexOf(type) === -1)
		throw new PluginError('gulp-archiver', 'Unsupported archive type for gulp-archiver');

	let archive = new Archiver(type, opts);
	let firstFile;

	this.add = dest => {
		//add file to pending, then if pending is 0, call triggerAdd()
		if (!dest) dest = "";
		dest += "/";

		return through.obj(function(file, encoding, callback){
			if(file.isStream()){
				this.emit('error', new PluginError('gulp-archiver',  'Streaming not supported'));
				callback();
				return;
			}
			
			if(!firstFile) firstFile = file;

			if(file.isDirectory()){
				archive.directory(file.path, {name: dest + file.relative});
			}else
				archive.append(file.contents, {name: dest + file.relative});

			if(taskEndCb)
				callback(null); //don't return file to stream, because we are going to replace it with the zip file
			else
				callback(null, file);
		}, function(callback){
			if(taskEndCb){
				taskEndCb.call(this, callback); //pass stream
			}else
				callback();
		});
	}

	this.close = function(fileOut, stream)  {
		//if items pending,set finalize to true.
		//if no items pending, set finalize to true and call triggerAdd();
		//call callback on archive.on("close")
		if(!fileOut) fileOut = "a.zip";

		return new Promise(resolve => {

			archive.finalize().then(() => {
				if(stream){
					archive.pipe(concatStream(data => {
						this.push(new File({
							cwd: firstFile.cwd,
							base: firstFile.base,
							path: path.join(firstFile.base, fileOut),
							contents: data
						}))
						resolve();
					}));
				}else{
					archive.pipe(fs.createWriteStream(fileOut));
					resolve();
				}
				
			});
		})
	}

	return this;
}

archiver.create = function(fileOut, opts){
	//creates instance, exposes this.add, closes after task completion
	let matches, type;

	if(typeof fileOut === "string" && (matches = fileOut.match(/\.(zip|tar)$|\.(tar).gz$/)))
		type = matches[1] || matches[2];
	else
		throw new PluginError('gulp-archiver', 'Unsupported archive type for gulp-archiver');

	let archInst = new archiver(type, opts, function(done){
		
		archInst.close.call(this, fileOut, true).then(() => {
			done();
		});
	})

	return archInst.add();

}

module.exports = archiver;