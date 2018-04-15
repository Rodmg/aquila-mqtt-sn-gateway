'use strict';
var gulp = require('gulp');
var tsc  = require("gulp-typescript");
var del = require('del');
var sourcemaps = require('gulp-sourcemaps');
var path = require('path');

var tsProject = tsc.createProject("tsconfig.json");

gulp.task('clean', function(cb){
  return del('dist', cb)    
});

gulp.task('build', ['clean'], function() {
  var tsResult = gulp.src(["src/**/*.ts"])
    .pipe(sourcemaps.init())
    .pipe(tsProject());
  return tsResult.js
    .pipe(sourcemaps.write('.', {
      sourceRoot: function(file){ return file.cwd + '/src'; }
    }))
    .pipe(gulp.dest("dist"));
});

gulp.task('default', ['build']);