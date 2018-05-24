"use strict";

let gulp = require("gulp");
let minify = require("gulp-uglify-es").default;
let cleanCSS = require("gulp-clean-css");
let pug = require("gulp-pug");
let jeditor = require("gulp-json-editor");
let del = require("del");
let gulpif = require("gulp-if");
let mergestream = require("merge-stream");
let Archiver = require("gulp-archiver2");
let build = false, chrome = new Archiver("zip"), webext = new Archiver("zip"); //gulp-if requires that these be defined somehow
let codeVersion, packageVersion;

gulp.task("clean", () => {
	return del(["dist/chrome/debug/**/*", "dist/webext/debug/**/*"]);
})
gulp.task("css", () => {
	return gulp.src("src/*css")
	.pipe(cleanCSS())
	.pipe(gulp.dest("dist/chrome/debug"))
	.pipe(gulp.dest("dist/webext/debug"))
	.pipe(gulpif(build, webext.add()))
	.pipe(gulpif(build, chrome.add()))
})

gulp.task("js", () => {
	return gulp.src("src/*.js")
	.pipe(minify())
	.pipe(gulp.dest("dist/chrome/debug"))
	.pipe(gulp.dest("dist/webext/debug"))
	.pipe(gulpif(build, webext.add()))
	.pipe(gulpif(build, chrome.add()))
})

gulp.task("lib", () => {
	return gulp.src("lib/**")
	.pipe(gulp.dest("dist/chrome/debug/lib"))
	.pipe(gulp.dest("dist/webext/debug/lib"))
	.pipe(gulpif(build, webext.add("lib")))
	.pipe(gulpif(build, chrome.add("lib")))
})

gulp.task("img", () => {
	return gulp.src("src/img/**")
	.pipe(gulp.dest("dist/chrome/debug/img"))
	.pipe(gulp.dest("dist/webext/debug/img"))
	.pipe(gulpif(build, webext.add("img")))
	.pipe(gulpif(build, chrome.add("img")))
})

gulp.task("html", () => {
	return gulp.src("src/*.pug")
	.pipe(pug())
	.pipe(gulp.dest("dist/chrome/debug"))
	.pipe(gulp.dest("dist/webext/debug"))
	.pipe(gulpif(build, webext.add()))
	.pipe(gulpif(build, chrome.add()))
})

gulp.task("manifest", () => {
	gulp.src("package.json")
	.pipe(jeditor(json => {packageVersion = json.version; return json}));

	return gulp.src("shared/manifest.json")
	.pipe(gulp.dest("dist/webext/debug"))
	.pipe(gulpif(build, webext.add()))
	.pipe(jeditor(json => {codeVersion = json.version; delete json.applications; return json}))
	.pipe(gulp.dest("dist/chrome/debug"))
	.pipe(gulpif(build, chrome.add()))
})
gulp.task("build-start", cb => {
	build = true;

	cb();
})
gulp.task("build-end", cb => {
	console.log("Manifest version: ", codeVersion, "Project version: ", packageVersion);

	if(packageVersion !== codeVersion) 
		console.log("Manifest version appears to have changed, but project version remains the same. Call `gulp build` if this is a new version.");

	if(build)
		return mergestream(chrome.close("latest.zip").pipe(gulp.dest("dist/chrome/")), webext.close("latest.zip").pipe(gulp.dest("dist/webext/")))
	else
		cb();
})
gulp.task("default", gulp.series("clean", gulp.parallel("css", "js", "lib", "html", "img"), "manifest", "build-end"))

gulp.task("build", gulp.series("build-start", "default"));
