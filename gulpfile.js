"use strict";

let gulp = require("gulp");
let cleanCSS = require("gulp-clean-css");
let pug = require("gulp-pug");
let jeditor = require("gulp-json-editor");
let del = require("del");
let gulpif = require("gulp-if");
let mergestream = require("merge-stream");
let webpack = require("webpack-stream");
let Archiver = require("gulp-archiver2");
let spawn = require('child_process').spawn;
let build = false, chrome = new Archiver("zip"), webext = new Archiver("zip"); //gulp-if requires that these be defined somehow
let codeVersion, packageVersion;

gulp.task("clean", () => {
	return del(["dist/chrome/debug/**/*", "dist/webext/debug/**/*"]);
});

gulp.task("css", () => {
	return gulp.src("src/*.css")
		.pipe(gulpif(build, cleanCSS()))
		.pipe(gulp.dest("dist/chrome/debug"))
		.pipe(gulp.dest("dist/webext/debug"))
		.pipe(gulpif(build, webext.add()))
		.pipe(gulpif(build, chrome.add()))
});

gulp.task("js", () => {
	let seek = ["src/*.js"];
	if (build) {
		seek.push("!src/*development*.js")
	} else {
		seek.push("src/pages/devel.js");
	}
	return gulp.src(seek)
		//.pipe(minify())
		.pipe(gulp.dest("dist/chrome/debug"))
		.pipe(gulp.dest("dist/webext/debug"))
		.pipe(gulpif(build, webext.add()))
		.pipe(gulpif(build, chrome.add()))
});


gulp.task("jsx", () => {
	return gulp.src("src/pages/Main.jsx")
		.pipe(webpack({
			module: {
				rules: [{
					loader: "babel-loader",
					options: {
						plugins: [],
						presets: ["@babel/env", "@babel/react"]
					}
					
				}]
			},
			output: {
				filename: "popup.js"
			},
			externals: {
				"react": "React",
				"react-dom": "ReactDOM"
			},
			mode: "production",
			optimization: {
				minimize: false,
				
			}
		}))
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
});

gulp.task("img", () => {
	return gulp.src("src/img/**")
		.pipe(gulp.dest("dist/chrome/debug/img"))
		.pipe(gulp.dest("dist/webext/debug/img"))
		.pipe(gulpif(build, webext.add("img")))
		.pipe(gulpif(build, chrome.add("img")))
});

gulp.task("pug", () => {
	return gulp.src("src/pages/*.pug")
		.pipe(pug({
			locals: {
				development: !build
			}
		}))
		.pipe(gulp.dest("dist/chrome/debug"))
		.pipe(gulp.dest("dist/webext/debug"))
		.pipe(gulpif(build, webext.add()))
		.pipe(gulpif(build, chrome.add()))
});

gulp.task("pages",() => {
	return gulp.watch(["src/pages/*.jsx", "src/pages/*.js", "src/pages/*.pug", "src/*.css"], gulp.parallel("js", "jsx", "pug", "css"));
});

gulp.task("manifest", () => {
	gulp.src("package.json")
		.pipe(jeditor(json => { packageVersion = json.version; return json }));

	return gulp.src("shared/manifest.json")
		.pipe(gulp.dest("dist/webext/debug"))
		.pipe(gulpif(build, webext.add()))
		.pipe(jeditor(json => { codeVersion = json.version; delete json.applications; return json }))
		.pipe(gulp.dest("dist/chrome/debug"))
		.pipe(gulpif(build, chrome.add()))
});

gulp.task("build-start", cb => {
	build = true;
	return del(["dist/chrome/dist/latest*.zip", "dist/webext/dist/latest*.zip"]);
});

gulp.task("build-end", cb => {
	console.log("Manifest version: ", codeVersion, "Project version: ", packageVersion);

	if (packageVersion !== codeVersion)
		console.log("Manifest version appears to have changed, but project version remains the same. Call `gulp build` if this is a new version.");

	if (build)
		return mergestream(chrome.close("latest-" + codeVersion + ".zip").pipe(gulp.dest("dist/chrome/")), webext.close("latest" + codeVersion + ".zip").pipe(gulp.dest("dist/webext/")))
	else
		cb();
});

gulp.task("done", cb => {
	console.log(String.fromCharCode(7)); //beep
	spawn("explorer", ["http://www.youtube.com/robots.txt"])
	setTimeout(cb, 50);
});

gulp.task("default", gulp.series("clean", gulp.parallel("css", "js", "jsx", "lib", "pug", "img"), "manifest", "build-end", "done"))

gulp.task("build", gulp.series("build-start", "default"));
