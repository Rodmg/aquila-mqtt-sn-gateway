"use strict";
const gulp = require("gulp");
const tsc = require("gulp-typescript");
const del = require("del");
const sourcemaps = require("gulp-sourcemaps");

const tsProject = tsc.createProject("tsconfig.json");

function clean() {
  return del(["dist"]);
}

function doBuild() {
  const tsResult = gulp
    .src(["src/**/*.ts"])
    .pipe(sourcemaps.init())
    .pipe(tsProject());
  return tsResult.js
    .pipe(
      sourcemaps.write(".", {
        sourceRoot: function(file) {
          return file.cwd + "/src";
        }
      })
    )
    .pipe(gulp.dest("dist"));
}

const build = gulp.series(clean, doBuild);

module.exports = {
  clean,
  build,
  default: build
};
