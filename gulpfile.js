'use strict';

const gulp = require('gulp');
const cleanCSS = require('gulp-clean-css');
const uglify = require('gulp-uglify-es').default
const jeditor = require('gulp-json-editor');
const sass = require('gulp-sass');
const del = require('del');
const gulpif = require('gulp-if');
const mergestream = require('merge-stream');
const webpack = require('webpack-stream');
const fs = require('fs');
const compiler = require('webpack');
const Archiver = require('gulp-archiver2');
const Server = require('websocket').server;

let build = false;
let production = false;
let chrome = new Archiver('zip');
let webext = new Archiver('zip')
let src = new Archiver('zip');
let codeVersion, packageVersion, ws, wsClients = new Map();

function sendToAll(message) {
    if (!ws)
        console.error('Server needed to be running at time of load.')
    for (let client of wsClients.keys()) {
        client.sendUTF(message);
    }
}
gulp.task('clean', () => {
    return del(['dist/chrome/debug/**/*', 'dist/webext/debug/**/*']);
});
gulp.task('sass', () => {
    return gulp.src('src/sass/*.scss')
        .pipe(gulpif(build, src.add('/src/sass')))
        .pipe(sass({
            includePaths: ['node_modules']
        }))
        .pipe(cleanCSS())
        .pipe(gulp.dest('dist/chrome/debug/lib'))
        .pipe(gulp.dest('dist/webext/debug/lib'))
        .pipe(gulpif(build, webext.add('lib')))
        .pipe(gulpif(build, chrome.add('lib')))
})
gulp.task('css', () => {
    return gulp.src('src/*.css')
        .pipe(gulpif(build, src.add('/src')))
        .pipe(gulpif(production, cleanCSS()))
        .pipe(gulp.dest('dist/chrome/debug'))
        .pipe(gulp.dest('dist/webext/debug'))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task('locales', () => {
    fs.readFile('src/_locales/en/messages.json', (err, data) => {
        const strings = JSON.parse(data.toString());
        const keys = Object.keys(strings);
        const keyGroups = keys.reduce((accum, cur) => ((accum[accum.length - 1] && accum[accum.length - 1].length !== 4 || accum.push([]), accum[accum.length - 1]).push(cur), accum), []);
        const complete = keyGroups.map(group => group.map(key => `"${key}"`).join(" | ")).join("\n    | ");
        const nextFile = `type locals = ${complete};\nexport default locals`
        fs.writeFile('src/_locales/types.d.ts', nextFile, () => { });
    })

    return gulp.src('src/_locales/**/*')
        .pipe(gulpif(build, src.add('/src/_locales')))
        .pipe(gulp.dest('dist/chrome/debug/_locales'))
        .pipe(gulp.dest('dist/webext/debug/_locales'))
        .pipe(gulpif(build, webext.add('_locales')))
        .pipe(gulpif(build, chrome.add('_locales')))
})

gulp.task('js', () => {
    return gulp.src('src/pages/*.js')
        .pipe(gulpif(production, uglify()))
        .pipe(gulp.dest('dist/chrome/debug'))
        .pipe(gulp.dest('dist/webext/debug'))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task('ts', () => {
    if (build) {
        gulp.src('src/*.ts')
            .pipe(src.add('src/'));
        gulp.src('src/inject/*.ts')
            .pipe(src.add('src/inject'))
        gulp.src('shared/api.ts')
            .pipe(src.add('/shared'));
        gulp.src('src/pages/*.[tj]sx')
            .pipe(src.add('src/pages'));
    }
    return gulp.src(['src/pages/app.[tj]sx'])
        .pipe(webpack({
            entry: {
                content: './src/content',
                inject: './src/inject/index.ts',
                background: './src/background',
                popup: './src/pages/app.tsx'
            },
            output: {
                filename: '[name].js'
            },
            devtool: !build && !production ? 'cheap-module-source-map' : 'none',
            externals: {
                'browser': 'browser',
                'chrome': 'chrome'
            },
            resolve: {
                extensions: ['.js', '.ts', '.tsx', '.jsx'],
                alias: {
                    './dev-client': build && production ? 'empty-module' : './dev-client'
                }
            },
            module: {
                rules: [
                    { test: /\.[tj]sx?$/, loader: 'ts-loader', options: { transpileOnly: true } }
                ]
            },
            mode: production ? 'production' : 'development',
            optimization: {
                minimize: production,
            }
        }, compiler))
        .pipe(gulp.dest('dist/chrome/debug'))
        .pipe(gulp.dest('dist/webext/debug'))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});


gulp.task('lib', () => {
    return gulp.src('lib/**')
        .pipe(gulp.dest('dist/chrome/debug/lib'))
        .pipe(gulp.dest('dist/webext/debug/lib'))
        .pipe(gulpif(build, src.add('lib')))
        .pipe(gulpif(build, webext.add('lib')))
        .pipe(gulpif(build, chrome.add('lib')))
});

gulp.task('img', () => {
    return gulp.src('src/img/**')
        .pipe(gulp.dest('dist/chrome/debug/img'))
        .pipe(gulp.dest('dist/webext/debug/img'))
        .pipe(gulpif(build, src.add('src/img')))
        .pipe(gulpif(build, webext.add('img')))
        .pipe(gulpif(build, chrome.add('img')))
});

gulp.task('html', () => {
    return gulp.src('src/pages/*.html')
        .pipe(gulpif(build, src.add('src/pages/')))
        .pipe(gulp.dest('dist/chrome/debug'))
        .pipe(gulp.dest('dist/webext/debug'))
        .pipe(gulpif(build, webext.add()))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task('fullreload', cb => {
    sendToAll('reload')
    cb();
})

gulp.task('partialreload', cb => {
    sendToAll('partialreload');
    cb();
})

gulp.task('manifest', () => {
    gulp.src('package.json')
        .pipe(jeditor(json => { packageVersion = json.version; return json }));

    return gulp.src('shared/manifest.json')
        .pipe(gulpif(build, src.add('shared/')))
        .pipe(gulpif(!build, jeditor(json => {
            json.permissions.push('http://localhost:5030/');
            json.background.persistent = true;
            return json;
        })))
        .pipe(gulp.dest('dist/webext/debug'))
        .pipe(gulpif(build, webext.add()))
        .pipe(jeditor(json => {
            codeVersion = json.version;
            delete json.applications;
            return json;
        }))
        .pipe(gulp.dest('dist/chrome/debug'))
        .pipe(gulpif(build, chrome.add()))
});

gulp.task('build-start', cb => {
    build = true;
    production = true;
    return del(['dist/chrome/dist/latest*.zip', 'dist/webext/dist/latest*.zip', 'dist/webext/dist/src.zip']);
});

gulp.task('build-end', cb => {
    console.log('Manifest version: ', codeVersion, 'Project version: ', packageVersion);

    if (packageVersion !== codeVersion)
        console.log('Manifest version appears to have changed, but project version remains the same. Call `gulp build` if this is a new version.');

    if (build) {
        return mergestream(
            chrome.close('latest-' + codeVersion + '.zip')
                .pipe(gulp.dest('dist/chrome/')),
            webext.close('latest' + codeVersion + '.zip')
                .pipe(gulp.dest('dist/webext/')),
            gulp.src(['gulpfile.js', 'package.json', 'package-lock.json', 'tsconfig.json'])
                .pipe(src.add())
                .on('end', () =>
                    src.close('src.zip')
                        .pipe(gulp.dest('dist/webext')
                        ))
        )
    } else
        cb();
});

gulp.task('done', cb => {
    console.log(String.fromCharCode(7));

    if (build)
        build = false;

    cb();
});

gulp.task('default', gulp.series('clean', gulp.parallel('css', 'sass', 'ts', 'lib', 'html', 'img', 'locales'), 'manifest', 'build-end', 'done'))

gulp.task('build', gulp.series('build-start', 'default'));

gulp.task('prod', cb => {
    production = true;
    cb();
})

gulp.task('watch', gulp.series('default', () => {
    let server = require('http').createServer(() => { })
    server.listen(3050, () => { })
    ws = new Server({ httpServer: server });
    console.log('Websockets server listening on port 3050...');

    ws.on('request', req => {
        let con = req.accept(null, req.origin);
        let ref = { agent: '', nick: '' };

        wsClients.set(con, ref);

        con.on('message', event => {
            const msg = JSON.parse(event.utf8Data);

            if (msg.userAgent) {
                console.log('Browser connected: ', msg.userAgent);
                ref.userAgent = msg.userAgent;
                ref.nick = (agent => {
                    if (agent.indexOf('Firefox') !== -1)
                        return 'Firefox'
                    else if (agent.indexOf('Chrome') !== -1)
                        return 'Chrome';
                    else
                        return 'Unknown';
                })(msg.userAgent)
            } else if (msg.log) {
                console.log('Log from', ref.nick, ':', JSON.stringify(msg.log));
            } else if (msg.error) {
                console.error('Log from', ref.nick, ':', JSON.stringify(msg.error));
            }

        })

        con.on('close', () => {
            console.log('Disconnected:', ref.userAgent);
            wsClients.delete(con)
        })
    });

    gulp.watch('src/_locales/**/*.json', gulp.series('locales', 'fullreload'))
    gulp.watch(['src/*.css', 'src/css/**/*', 'src/sass/*.scss'], gulp.series('css', 'sass', 'partialreload'));
    gulp.watch('src/pages/*.html', gulp.series('html'))
    gulp.watch('src/pages/*.[tj]sx', gulp.series('ts'));
    gulp.watch('shared/manifest.json', gulp.series('manifest', 'fullreload'));
    gulp.watch('src/background.ts', gulp.series('ts', 'fullreload')); // core js changes (background.js) require reload
    gulp.watch(['src/*.ts', 'src/inject/*.ts', '!src/background.ts'], gulp.series('ts', 'partialreload')); // content.js doesnt require full reload, only script reloading
}))
