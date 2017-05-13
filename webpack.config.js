module.exports = {
  entry: "./index.js",
  output: { 
    library: "MyLibrary",
    libraryTarget: "umd",
    filename: "bundle.js" },
  externals:[{
    xmlhttprequest: '{XMLHttpRequest:XMLHttpRequest}'
  }]
}

