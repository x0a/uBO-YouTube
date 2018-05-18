"use strict";

let gulp = require("gulp");
let minify = require("gulp-uglify-es").default;
let cleanCSS = require("gulp-clean-css");
let pug = require("gulp-pug");
let jeditor = require("gulp-json-editor");
let del = require("del");
let gulpif = require("gulp-if");
let archive = require("./archive.js");
let build = false, chrome = "empty", webext = "empty";

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
	return gulp.src("shared/manifest.json")
	.pipe(gulp.dest("dist/webext/debug"))
	.pipe(gulpif(build, webext.add()))
	.pipe(jeditor(json => {delete json.applications; return json}))
	.pipe(gulp.dest("dist/chrome/debug"))
	.pipe(gulpif(build, chrome.add()))
})
gulp.task("build-start", cb => {
	build = true;
	chrome = new archive("zip");
	webext = new archive("zip");

	cb();
})
gulp.task("build-end", cb => {
	Promise.all([chrome.close("dist/chrome/latest.zip"), webext.close("dist/webext/latest.zip")]).then(() => cb());
})
gulp.task("default", gulp.series("clean", gulp.parallel("css", "js", "lib", "html", "img"), "manifest"))

gulp.task("build", gulp.series("build-start", "default", "build-end"));
