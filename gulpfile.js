"use strict";

let gulp = require("gulp");
let cleanCSS = require("gulp-clean-css");
let uglify = require('gulp-uglify-es').default
let pug = require("gulp-pug");
let jeditor = require("gulp-json-editor");
let del = require("del");
let gulpif = require("gulp-if");
let mergestream = require("merge-stream");
let webpack = require("webpack-stream");
let Archiver = require("gulp-archiver2");
let wsServer = require('websocket').server;
let build = false, production = false, chrome = new Archiver("zip"), webext = new Archiver("zip"); //gulp-if requires that these be defined somehow
let codeVersion, packageVersion, ws, wsClients = [];

gulp.task("clean", () => {
    return del(["dist/chrome/debug/**/*", "dist/webext/debug/**/*"]);
});

gulp.task("css", () => {
    return gulp.src("src/*.css")
        .pipe(gulpif(production, cleanCSS()))
        .pipe(gulp.dest("dist/chrome/debug"))
        .pipe(gulp.dest("dist/webext/debug"))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task("js", () => {
    let seek = ["src/*.js"];

    if (!build) {
        seek.push("src/pages/devel.js");
    }

    return gulp.src(seek)
        .pipe(gulpif(production, uglify()))
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
            mode: production ? "production" : "development",
            optimization: {
                minimize: production,

            }
        }))
        .pipe(gulp.dest("dist/chrome/debug"))
        .pipe(gulp.dest("dist/webext/debug"))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
})

gulp.task("lib", () => {
    let seek = ["lib/**"];
    if (production) {
        seek.push("!lib/*development*.js");
    }
    return gulp.src(seek)
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
                development: !production
            }
        }))
        .pipe(gulp.dest("dist/chrome/debug"))
        .pipe(gulp.dest("dist/webext/debug"))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task("watch", () => {
    let server = require("http").createServer(() => { })
    server.listen(3050, () => { })
    ws = new wsServer({ httpServer: server });

    ws.on("request", req => {
        let con = req.accept(null, req.origin);
        let ref = { socket: con, agent: "" };
        wsClients.push(ref);

        con.on("message", event => {
            const msg = JSON.parse(event.utf8Data);

            if (msg.userAgent) {
                console.log("Browser connected: ", msg.userAgent);
                ref.userAgent = msg.userAgent;
            } else if (msg.log) {
                console.log("Log from", ref.userAgent.substring(0, 10), ":", msg.log)
            } else if (msg.error) {
                console.error("Log from", ref.userAgent.substring(0, 10), ":", msg.error)
            }

        })

        con.on("close", () => {
            const index = wsClients.findIndex(val => val === ref)
            console.log("Disconnected:", wsClients[index].userAgent);
            wsClients.splice(index, 1);
        })
    });

    gulp.watch("src/*.css", gulp.series("css"));
    gulp.watch("src/pages/*.pug", gulp.series("pug"))
    gulp.watch("src/pages/*.jsx", gulp.series("jsx")); // this,
    gulp.watch("src/pages/*.js", gulp.series("js"));   // and this both compile to popup.js
    gulp.watch("shared/manifest.json", gulp.series("manifest", "reload"));
    gulp.watch("src/*.js", gulp.series("js", "reload")); // core js changes (background.js, content.js) require reload
})

gulp.task("reload", cb => {
    if (!ws)
        console.error("Server needed to be running at time of load.")
    for (let client of wsClients) {
        client.socket.sendUTF("reload");
    }
    cb();
})

gulp.task("manifest", () => {
    gulp.src("package.json")
        .pipe(jeditor(json => { packageVersion = json.version; return json }));

    return gulp.src("shared/manifest.json")
        .pipe(gulpif(!build, jeditor(json => {
            json.permissions.push("http://localhost:5030/");
            json.background.persistent = true;
            return json;
        })))
        .pipe(gulp.dest("dist/webext/debug"))
        .pipe(gulpif(build, webext.add()))
        .pipe(jeditor(json => {
            codeVersion = json.version;
            delete json.applications;
            return json;
        }))
        .pipe(gulp.dest("dist/chrome/debug"))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task("build-start", cb => {
    build = true;
    production = true;
    return del(["dist/chrome/dist/latest*.zip", "dist/webext/dist/latest*.zip"]);
});

gulp.task("build-end", cb => {
    console.log("Manifest version: ", codeVersion, "Project version: ", packageVersion);

    if (packageVersion !== codeVersion)
        console.log("Manifest version appears to have changed, but project version remains the same. Call `gulp build` if this is a new version.");

    if (build) {
        return mergestream(chrome.close("latest-" + codeVersion + ".zip").pipe(gulp.dest("dist/chrome/")), webext.close("latest" + codeVersion + ".zip").pipe(gulp.dest("dist/webext/")))
    } else
        cb();
});

gulp.task("done", cb => {
    console.log(String.fromCharCode(7));

    if (build)
        build = false;

    cb();
});

gulp.task("default", gulp.series("clean", gulp.parallel("css", "js", "jsx", "lib", "pug", "img"), "manifest", "build-end", "done"))

gulp.task("build", gulp.series("build-start", "default"));

gulp.task("prod", cb => {
    production = true;
    cb();
})