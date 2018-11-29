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
let ts = require("gulp-typescript");
let tsProject = ts.createProject("tsconfig.json");
let Archiver = require("gulp-archiver2");
let wsServer = require('websocket').server;
let build = false, production = false, chrome = new Archiver("zip"), webext = new Archiver("zip"); //gulp-if requires that these be defined somehow
let codeVersion, packageVersion, ws, wsClients = new Map();

function sendToAll(message) {
    if (!ws)
        console.error("Server needed to be running at time of load.")
    for (let client of wsClients.keys()) {
        client.sendUTF(message);
    }
}
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
    return gulp.src("src/pages/*.js")
        .pipe(gulpif(production, uglify()))
        .pipe(gulp.dest("dist/chrome/debug"))
        .pipe(gulp.dest("dist/webext/debug"))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task("ts", () => {
    return tsProject.src()
        .pipe(tsProject())
        //.pipe(gulpif(production, uglify()))
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
        let ref = { agent: "", nick: "" };

        wsClients.set(con, ref);

        con.on("message", event => {
            const msg = JSON.parse(event.utf8Data);

            if (msg.userAgent) {
                console.log("Browser connected: ", msg.userAgent);
                ref.userAgent = msg.userAgent;
                ref.nick = (agent => {
                    if (agent.indexOf("Firefox") !== -1)
                        return "Firefox"
                    else if (agent.indexOf("Chrome") !== -1)
                        return "Chrome";
                    else
                        return "Unknown";
                })(msg.userAgent)
            } else if (msg.log) {
                console.log("Log from", ref.nick, ":", JSON.stringify(msg.log));
            } else if (msg.error) {
                console.error("Log from", ref.nick, ":", JSON.stringify(msg.error));
            }

        })

        con.on("close", () => {
            console.log("Disconnected:", ref.userAgent);
            wsClients.delete(con)
        })
    });

    gulp.watch("src/*.css", gulp.series("css"));
    gulp.watch("src/pages/*.pug", gulp.series("pug"))
    gulp.watch("src/pages/*.jsx", gulp.series("jsx")); // this,
    if(!production){
        gulp.watch("src/pages/*.js", gulp.series("js"));   // and this both compile to popup.js
    }
    gulp.watch("shared/manifest.json", gulp.series("manifest", "fullreload"));
    gulp.watch("src/background.ts", gulp.series("ts", "fullreload")); // core js changes (background.js) require reload
    gulp.watch(["!src/background.ts", "src/*.ts"], gulp.series("ts", "partialreload")); // content.js doesnt require full reload, only script reloading
})

gulp.task("fullreload", cb => {
    sendToAll("reload")
    cb();
})

gulp.task("partialreload", cb => {
    sendToAll("partialreload");
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

gulp.task("default", gulp.series("clean", gulp.parallel("css", "ts", "jsx", "lib", "pug", "img"), "manifest", "build-end", "done"))

gulp.task("build", gulp.series("build-start", "default"));

gulp.task("prod", cb => {
    production = true;
    cb();
})