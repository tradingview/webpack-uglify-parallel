# webpack-uglify-parallel

> This project is deprecated in favor of [official uglifyjs plugin](https://github.com/webpack-contrib/uglifyjs-webpack-plugin/), which now supports parallelization 

Identical to [standard uglify webpack plugin](https://webpack.github.io/docs/list-of-plugins.html#uglifyjsplugin), with an option to build multiple files in parallel

# Installation

```bash
npm install --save-dev webpack-uglify-parallel
```

# Usage
In webpack.config.js:
```javascript
var os = require('os');
var UglifyJsParallelPlugin = require('webpack-uglify-parallel');

module.exports = {
    /// ... rest of config
    plugins: [
        new UglifyJsParallelPlugin({
            workers: os.cpus().length, // usually having as many workers as cpu cores gives good results
            // other uglify options
        })
    ]
}

```
