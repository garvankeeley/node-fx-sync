// Details: https://github.com/jrburke/almond#exporting-a-public-api
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        //Allow using this built library as an AMD module
        //in another project. That other project will only
        //see this AMD call, not the internal modules in
        //the closure below.
        define([], factory);
    } else {
        //Browser globals case. Just assign the
        //result to a property on the global.
        root.FxAccountClient = factory();
    }
}(this, function () {/**
 * almond 0.2.5 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    if (depName === 'sjcl') {
                      console.log('here');
                      args[i] = window.sjcl;
                  } else {
                    args[i] = callDep(depName);
                    }
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        if (config.deps) {
            req(config.deps, config.callback);
        }
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("components/almond/almond", function(){});

function q(a){throw a;}var t=void 0,u=!1;var sjcl={cipher:{},hash:{},keyexchange:{},mode:{},misc:{},codec:{},exception:{corrupt:function(a){this.toString=function(){return"CORRUPT: "+this.message};this.message=a},invalid:function(a){this.toString=function(){return"INVALID: "+this.message};this.message=a},bug:function(a){this.toString=function(){return"BUG: "+this.message};this.message=a},notReady:function(a){this.toString=function(){return"NOT READY: "+this.message};this.message=a}}};
"undefined"!==typeof module&&module.exports&&(module.exports=sjcl);
sjcl.cipher.aes=function(a){this.k[0][0][0]||this.D();var b,c,d,e,f=this.k[0][4],g=this.k[1];b=a.length;var h=1;4!==b&&(6!==b&&8!==b)&&q(new sjcl.exception.invalid("invalid aes key size"));this.b=[d=a.slice(0),e=[]];for(a=b;a<4*b+28;a++){c=d[a-1];if(0===a%b||8===b&&4===a%b)c=f[c>>>24]<<24^f[c>>16&255]<<16^f[c>>8&255]<<8^f[c&255],0===a%b&&(c=c<<8^c>>>24^h<<24,h=h<<1^283*(h>>7));d[a]=d[a-b]^c}for(b=0;a;b++,a--)c=d[b&3?a:a-4],e[b]=4>=a||4>b?c:g[0][f[c>>>24]]^g[1][f[c>>16&255]]^g[2][f[c>>8&255]]^g[3][f[c&
255]]};
sjcl.cipher.aes.prototype={encrypt:function(a){return y(this,a,0)},decrypt:function(a){return y(this,a,1)},k:[[[],[],[],[],[]],[[],[],[],[],[]]],D:function(){var a=this.k[0],b=this.k[1],c=a[4],d=b[4],e,f,g,h=[],l=[],k,n,m,p;for(e=0;0x100>e;e++)l[(h[e]=e<<1^283*(e>>7))^e]=e;for(f=g=0;!c[f];f^=k||1,g=l[g]||1){m=g^g<<1^g<<2^g<<3^g<<4;m=m>>8^m&255^99;c[f]=m;d[m]=f;n=h[e=h[k=h[f]]];p=0x1010101*n^0x10001*e^0x101*k^0x1010100*f;n=0x101*h[m]^0x1010100*m;for(e=0;4>e;e++)a[e][f]=n=n<<24^n>>>8,b[e][m]=p=p<<24^p>>>8}for(e=
0;5>e;e++)a[e]=a[e].slice(0),b[e]=b[e].slice(0)}};
function y(a,b,c){4!==b.length&&q(new sjcl.exception.invalid("invalid aes block size"));var d=a.b[c],e=b[0]^d[0],f=b[c?3:1]^d[1],g=b[2]^d[2];b=b[c?1:3]^d[3];var h,l,k,n=d.length/4-2,m,p=4,s=[0,0,0,0];h=a.k[c];a=h[0];var r=h[1],v=h[2],w=h[3],x=h[4];for(m=0;m<n;m++)h=a[e>>>24]^r[f>>16&255]^v[g>>8&255]^w[b&255]^d[p],l=a[f>>>24]^r[g>>16&255]^v[b>>8&255]^w[e&255]^d[p+1],k=a[g>>>24]^r[b>>16&255]^v[e>>8&255]^w[f&255]^d[p+2],b=a[b>>>24]^r[e>>16&255]^v[f>>8&255]^w[g&255]^d[p+3],p+=4,e=h,f=l,g=k;for(m=0;4>
m;m++)s[c?3&-m:m]=x[e>>>24]<<24^x[f>>16&255]<<16^x[g>>8&255]<<8^x[b&255]^d[p++],h=e,e=f,f=g,g=b,b=h;return s}
sjcl.bitArray={bitSlice:function(a,b,c){a=sjcl.bitArray.P(a.slice(b/32),32-(b&31)).slice(1);return c===t?a:sjcl.bitArray.clamp(a,c-b)},extract:function(a,b,c){var d=Math.floor(-b-c&31);return((b+c-1^b)&-32?a[b/32|0]<<32-d^a[b/32+1|0]>>>d:a[b/32|0]>>>d)&(1<<c)-1},concat:function(a,b){if(0===a.length||0===b.length)return a.concat(b);var c=a[a.length-1],d=sjcl.bitArray.getPartial(c);return 32===d?a.concat(b):sjcl.bitArray.P(b,d,c|0,a.slice(0,a.length-1))},bitLength:function(a){var b=a.length;return 0===
b?0:32*(b-1)+sjcl.bitArray.getPartial(a[b-1])},clamp:function(a,b){if(32*a.length<b)return a;a=a.slice(0,Math.ceil(b/32));var c=a.length;b&=31;0<c&&b&&(a[c-1]=sjcl.bitArray.partial(b,a[c-1]&2147483648>>b-1,1));return a},partial:function(a,b,c){return 32===a?b:(c?b|0:b<<32-a)+0x10000000000*a},getPartial:function(a){return Math.round(a/0x10000000000)||32},equal:function(a,b){if(sjcl.bitArray.bitLength(a)!==sjcl.bitArray.bitLength(b))return u;var c=0,d;for(d=0;d<a.length;d++)c|=a[d]^b[d];return 0===
c},P:function(a,b,c,d){var e;e=0;for(d===t&&(d=[]);32<=b;b-=32)d.push(c),c=0;if(0===b)return d.concat(a);for(e=0;e<a.length;e++)d.push(c|a[e]>>>b),c=a[e]<<32-b;e=a.length?a[a.length-1]:0;a=sjcl.bitArray.getPartial(e);d.push(sjcl.bitArray.partial(b+a&31,32<b+a?c:d.pop(),1));return d},l:function(a,b){return[a[0]^b[0],a[1]^b[1],a[2]^b[2],a[3]^b[3]]}};
sjcl.codec.utf8String={fromBits:function(a){var b="",c=sjcl.bitArray.bitLength(a),d,e;for(d=0;d<c/8;d++)0===(d&3)&&(e=a[d/4]),b+=String.fromCharCode(e>>>24),e<<=8;return decodeURIComponent(escape(b))},toBits:function(a){a=unescape(encodeURIComponent(a));var b=[],c,d=0;for(c=0;c<a.length;c++)d=d<<8|a.charCodeAt(c),3===(c&3)&&(b.push(d),d=0);c&3&&b.push(sjcl.bitArray.partial(8*(c&3),d));return b}};
sjcl.codec.hex={fromBits:function(a){var b="",c;for(c=0;c<a.length;c++)b+=((a[c]|0)+0xf00000000000).toString(16).substr(4);return b.substr(0,sjcl.bitArray.bitLength(a)/4)},toBits:function(a){var b,c=[],d;a=a.replace(/\s|0x/g,"");d=a.length;a+="00000000";for(b=0;b<a.length;b+=8)c.push(parseInt(a.substr(b,8),16)^0);return sjcl.bitArray.clamp(c,4*d)}};
sjcl.codec.base64={J:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",fromBits:function(a,b,c){var d="",e=0,f=sjcl.codec.base64.J,g=0,h=sjcl.bitArray.bitLength(a);c&&(f=f.substr(0,62)+"-_");for(c=0;6*d.length<h;)d+=f.charAt((g^a[c]>>>e)>>>26),6>e?(g=a[c]<<6-e,e+=26,c++):(g<<=6,e-=6);for(;d.length&3&&!b;)d+="=";return d},toBits:function(a,b){a=a.replace(/\s|=/g,"");var c=[],d,e=0,f=sjcl.codec.base64.J,g=0,h;b&&(f=f.substr(0,62)+"-_");for(d=0;d<a.length;d++)h=f.indexOf(a.charAt(d)),
0>h&&q(new sjcl.exception.invalid("this isn't base64!")),26<e?(e-=26,c.push(g^h>>>e),g=h<<32-e):(e+=6,g^=h<<32-e);e&56&&c.push(sjcl.bitArray.partial(e&56,g,1));return c}};sjcl.codec.base64url={fromBits:function(a){return sjcl.codec.base64.fromBits(a,1,1)},toBits:function(a){return sjcl.codec.base64.toBits(a,1)}};sjcl.hash.sha256=function(a){this.b[0]||this.D();a?(this.r=a.r.slice(0),this.o=a.o.slice(0),this.h=a.h):this.reset()};sjcl.hash.sha256.hash=function(a){return(new sjcl.hash.sha256).update(a).finalize()};
sjcl.hash.sha256.prototype={blockSize:512,reset:function(){this.r=this.N.slice(0);this.o=[];this.h=0;return this},update:function(a){"string"===typeof a&&(a=sjcl.codec.utf8String.toBits(a));var b,c=this.o=sjcl.bitArray.concat(this.o,a);b=this.h;a=this.h=b+sjcl.bitArray.bitLength(a);for(b=512+b&-512;b<=a;b+=512)z(this,c.splice(0,16));return this},finalize:function(){var a,b=this.o,c=this.r,b=sjcl.bitArray.concat(b,[sjcl.bitArray.partial(1,1)]);for(a=b.length+2;a&15;a++)b.push(0);b.push(Math.floor(this.h/
4294967296));for(b.push(this.h|0);b.length;)z(this,b.splice(0,16));this.reset();return c},N:[],b:[],D:function(){function a(a){return 0x100000000*(a-Math.floor(a))|0}var b=0,c=2,d;a:for(;64>b;c++){for(d=2;d*d<=c;d++)if(0===c%d)continue a;8>b&&(this.N[b]=a(Math.pow(c,0.5)));this.b[b]=a(Math.pow(c,1/3));b++}}};
function z(a,b){var c,d,e,f=b.slice(0),g=a.r,h=a.b,l=g[0],k=g[1],n=g[2],m=g[3],p=g[4],s=g[5],r=g[6],v=g[7];for(c=0;64>c;c++)16>c?d=f[c]:(d=f[c+1&15],e=f[c+14&15],d=f[c&15]=(d>>>7^d>>>18^d>>>3^d<<25^d<<14)+(e>>>17^e>>>19^e>>>10^e<<15^e<<13)+f[c&15]+f[c+9&15]|0),d=d+v+(p>>>6^p>>>11^p>>>25^p<<26^p<<21^p<<7)+(r^p&(s^r))+h[c],v=r,r=s,s=p,p=m+d|0,m=n,n=k,k=l,l=d+(k&n^m&(k^n))+(k>>>2^k>>>13^k>>>22^k<<30^k<<19^k<<10)|0;g[0]=g[0]+l|0;g[1]=g[1]+k|0;g[2]=g[2]+n|0;g[3]=g[3]+m|0;g[4]=g[4]+p|0;g[5]=g[5]+s|0;g[6]=
g[6]+r|0;g[7]=g[7]+v|0}
sjcl.mode.ccm={name:"ccm",encrypt:function(a,b,c,d,e){var f,g=b.slice(0),h=sjcl.bitArray,l=h.bitLength(c)/8,k=h.bitLength(g)/8;e=e||64;d=d||[];7>l&&q(new sjcl.exception.invalid("ccm: iv must be at least 7 bytes"));for(f=2;4>f&&k>>>8*f;f++);f<15-l&&(f=15-l);c=h.clamp(c,8*(15-f));b=sjcl.mode.ccm.L(a,b,c,d,e,f);g=sjcl.mode.ccm.p(a,g,c,b,e,f);return h.concat(g.data,g.tag)},decrypt:function(a,b,c,d,e){e=e||64;d=d||[];var f=sjcl.bitArray,g=f.bitLength(c)/8,h=f.bitLength(b),l=f.clamp(b,h-e),k=f.bitSlice(b,
h-e),h=(h-e)/8;7>g&&q(new sjcl.exception.invalid("ccm: iv must be at least 7 bytes"));for(b=2;4>b&&h>>>8*b;b++);b<15-g&&(b=15-g);c=f.clamp(c,8*(15-b));l=sjcl.mode.ccm.p(a,l,c,k,e,b);a=sjcl.mode.ccm.L(a,l.data,c,d,e,b);f.equal(l.tag,a)||q(new sjcl.exception.corrupt("ccm: tag doesn't match"));return l.data},L:function(a,b,c,d,e,f){var g=[],h=sjcl.bitArray,l=h.l;e/=8;(e%2||4>e||16<e)&&q(new sjcl.exception.invalid("ccm: invalid tag length"));(0xffffffff<d.length||0xffffffff<b.length)&&q(new sjcl.exception.bug("ccm: can't deal with 4GiB or more data"));
f=[h.partial(8,(d.length?64:0)|e-2<<2|f-1)];f=h.concat(f,c);f[3]|=h.bitLength(b)/8;f=a.encrypt(f);if(d.length){c=h.bitLength(d)/8;65279>=c?g=[h.partial(16,c)]:0xffffffff>=c&&(g=h.concat([h.partial(16,65534)],[c]));g=h.concat(g,d);for(d=0;d<g.length;d+=4)f=a.encrypt(l(f,g.slice(d,d+4).concat([0,0,0])))}for(d=0;d<b.length;d+=4)f=a.encrypt(l(f,b.slice(d,d+4).concat([0,0,0])));return h.clamp(f,8*e)},p:function(a,b,c,d,e,f){var g,h=sjcl.bitArray;g=h.l;var l=b.length,k=h.bitLength(b);c=h.concat([h.partial(8,
f-1)],c).concat([0,0,0]).slice(0,4);d=h.bitSlice(g(d,a.encrypt(c)),0,e);if(!l)return{tag:d,data:[]};for(g=0;g<l;g+=4)c[3]++,e=a.encrypt(c),b[g]^=e[0],b[g+1]^=e[1],b[g+2]^=e[2],b[g+3]^=e[3];return{tag:d,data:h.clamp(b,k)}}};
sjcl.mode.ocb2={name:"ocb2",encrypt:function(a,b,c,d,e,f){128!==sjcl.bitArray.bitLength(c)&&q(new sjcl.exception.invalid("ocb iv must be 128 bits"));var g,h=sjcl.mode.ocb2.H,l=sjcl.bitArray,k=l.l,n=[0,0,0,0];c=h(a.encrypt(c));var m,p=[];d=d||[];e=e||64;for(g=0;g+4<b.length;g+=4)m=b.slice(g,g+4),n=k(n,m),p=p.concat(k(c,a.encrypt(k(c,m)))),c=h(c);m=b.slice(g);b=l.bitLength(m);g=a.encrypt(k(c,[0,0,0,b]));m=l.clamp(k(m.concat([0,0,0]),g),b);n=k(n,k(m.concat([0,0,0]),g));n=a.encrypt(k(n,k(c,h(c))));d.length&&
(n=k(n,f?d:sjcl.mode.ocb2.pmac(a,d)));return p.concat(l.concat(m,l.clamp(n,e)))},decrypt:function(a,b,c,d,e,f){128!==sjcl.bitArray.bitLength(c)&&q(new sjcl.exception.invalid("ocb iv must be 128 bits"));e=e||64;var g=sjcl.mode.ocb2.H,h=sjcl.bitArray,l=h.l,k=[0,0,0,0],n=g(a.encrypt(c)),m,p,s=sjcl.bitArray.bitLength(b)-e,r=[];d=d||[];for(c=0;c+4<s/32;c+=4)m=l(n,a.decrypt(l(n,b.slice(c,c+4)))),k=l(k,m),r=r.concat(m),n=g(n);p=s-32*c;m=a.encrypt(l(n,[0,0,0,p]));m=l(m,h.clamp(b.slice(c),p).concat([0,0,0]));
k=l(k,m);k=a.encrypt(l(k,l(n,g(n))));d.length&&(k=l(k,f?d:sjcl.mode.ocb2.pmac(a,d)));h.equal(h.clamp(k,e),h.bitSlice(b,s))||q(new sjcl.exception.corrupt("ocb: tag doesn't match"));return r.concat(h.clamp(m,p))},pmac:function(a,b){var c,d=sjcl.mode.ocb2.H,e=sjcl.bitArray,f=e.l,g=[0,0,0,0],h=a.encrypt([0,0,0,0]),h=f(h,d(d(h)));for(c=0;c+4<b.length;c+=4)h=d(h),g=f(g,a.encrypt(f(h,b.slice(c,c+4))));c=b.slice(c);128>e.bitLength(c)&&(h=f(h,d(h)),c=e.concat(c,[-2147483648,0,0,0]));g=f(g,c);return a.encrypt(f(d(f(h,
d(h))),g))},H:function(a){return[a[0]<<1^a[1]>>>31,a[1]<<1^a[2]>>>31,a[2]<<1^a[3]>>>31,a[3]<<1^135*(a[0]>>>31)]}};
sjcl.mode.gcm={name:"gcm",encrypt:function(a,b,c,d,e){var f=b.slice(0);b=sjcl.bitArray;d=d||[];a=sjcl.mode.gcm.p(!0,a,f,d,c,e||128);return b.concat(a.data,a.tag)},decrypt:function(a,b,c,d,e){var f=b.slice(0),g=sjcl.bitArray,h=g.bitLength(f);e=e||128;d=d||[];e<=h?(b=g.bitSlice(f,h-e),f=g.bitSlice(f,0,h-e)):(b=f,f=[]);a=sjcl.mode.gcm.p(u,a,f,d,c,e);g.equal(a.tag,b)||q(new sjcl.exception.corrupt("gcm: tag doesn't match"));return a.data},Z:function(a,b){var c,d,e,f,g,h=sjcl.bitArray.l;e=[0,0,0,0];f=b.slice(0);
for(c=0;128>c;c++){(d=0!==(a[Math.floor(c/32)]&1<<31-c%32))&&(e=h(e,f));g=0!==(f[3]&1);for(d=3;0<d;d--)f[d]=f[d]>>>1|(f[d-1]&1)<<31;f[0]>>>=1;g&&(f[0]^=-0x1f000000)}return e},g:function(a,b,c){var d,e=c.length;b=b.slice(0);for(d=0;d<e;d+=4)b[0]^=0xffffffff&c[d],b[1]^=0xffffffff&c[d+1],b[2]^=0xffffffff&c[d+2],b[3]^=0xffffffff&c[d+3],b=sjcl.mode.gcm.Z(b,a);return b},p:function(a,b,c,d,e,f){var g,h,l,k,n,m,p,s,r=sjcl.bitArray;m=c.length;p=r.bitLength(c);s=r.bitLength(d);h=r.bitLength(e);g=b.encrypt([0,
0,0,0]);96===h?(e=e.slice(0),e=r.concat(e,[1])):(e=sjcl.mode.gcm.g(g,[0,0,0,0],e),e=sjcl.mode.gcm.g(g,e,[0,0,Math.floor(h/0x100000000),h&0xffffffff]));h=sjcl.mode.gcm.g(g,[0,0,0,0],d);n=e.slice(0);d=h.slice(0);a||(d=sjcl.mode.gcm.g(g,h,c));for(k=0;k<m;k+=4)n[3]++,l=b.encrypt(n),c[k]^=l[0],c[k+1]^=l[1],c[k+2]^=l[2],c[k+3]^=l[3];c=r.clamp(c,p);a&&(d=sjcl.mode.gcm.g(g,h,c));a=[Math.floor(s/0x100000000),s&0xffffffff,Math.floor(p/0x100000000),p&0xffffffff];d=sjcl.mode.gcm.g(g,d,a);l=b.encrypt(e);d[0]^=l[0];
d[1]^=l[1];d[2]^=l[2];d[3]^=l[3];return{tag:r.bitSlice(d,0,f),data:c}}};sjcl.misc.hmac=function(a,b){this.M=b=b||sjcl.hash.sha256;var c=[[],[]],d,e=b.prototype.blockSize/32;this.n=[new b,new b];a.length>e&&(a=b.hash(a));for(d=0;d<e;d++)c[0][d]=a[d]^909522486,c[1][d]=a[d]^1549556828;this.n[0].update(c[0]);this.n[1].update(c[1]);this.G=new b(this.n[0])};
sjcl.misc.hmac.prototype.encrypt=sjcl.misc.hmac.prototype.mac=function(a){this.Q&&q(new sjcl.exception.invalid("encrypt on already updated hmac called!"));this.update(a);return this.digest(a)};sjcl.misc.hmac.prototype.reset=function(){this.G=new this.M(this.n[0]);this.Q=u};sjcl.misc.hmac.prototype.update=function(a){this.Q=!0;this.G.update(a)};sjcl.misc.hmac.prototype.digest=function(){var a=this.G.finalize(),a=(new this.M(this.n[1])).update(a).finalize();this.reset();return a};
sjcl.misc.pbkdf2=function(a,b,c,d,e){c=c||1E3;(0>d||0>c)&&q(sjcl.exception.invalid("invalid params to pbkdf2"));"string"===typeof a&&(a=sjcl.codec.utf8String.toBits(a));"string"===typeof b&&(b=sjcl.codec.utf8String.toBits(b));e=e||sjcl.misc.hmac;a=new e(a);var f,g,h,l,k=[],n=sjcl.bitArray;for(l=1;32*k.length<(d||1);l++){e=f=a.encrypt(n.concat(b,[l]));for(g=1;g<c;g++){f=a.encrypt(f);for(h=0;h<f.length;h++)e[h]^=f[h]}k=k.concat(e)}d&&(k=n.clamp(k,d));return k};
sjcl.prng=function(a){this.c=[new sjcl.hash.sha256];this.i=[0];this.F=0;this.s={};this.C=0;this.K={};this.O=this.d=this.j=this.W=0;this.b=[0,0,0,0,0,0,0,0];this.f=[0,0,0,0];this.A=t;this.B=a;this.q=u;this.w={progress:{},seeded:{}};this.m=this.V=0;this.t=1;this.u=2;this.S=0x10000;this.I=[0,48,64,96,128,192,0x100,384,512,768,1024];this.T=3E4;this.R=80};
sjcl.prng.prototype={randomWords:function(a,b){var c=[],d;d=this.isReady(b);var e;d===this.m&&q(new sjcl.exception.notReady("generator isn't seeded"));if(d&this.u){d=!(d&this.t);e=[];var f=0,g;this.O=e[0]=(new Date).valueOf()+this.T;for(g=0;16>g;g++)e.push(0x100000000*Math.random()|0);for(g=0;g<this.c.length&&!(e=e.concat(this.c[g].finalize()),f+=this.i[g],this.i[g]=0,!d&&this.F&1<<g);g++);this.F>=1<<this.c.length&&(this.c.push(new sjcl.hash.sha256),this.i.push(0));this.d-=f;f>this.j&&(this.j=f);this.F++;
this.b=sjcl.hash.sha256.hash(this.b.concat(e));this.A=new sjcl.cipher.aes(this.b);for(d=0;4>d&&!(this.f[d]=this.f[d]+1|0,this.f[d]);d++);}for(d=0;d<a;d+=4)0===(d+1)%this.S&&A(this),e=B(this),c.push(e[0],e[1],e[2],e[3]);A(this);return c.slice(0,a)},setDefaultParanoia:function(a,b){0===a&&"Setting paranoia=0 will ruin your security; use it only for testing"!==b&&q("Setting paranoia=0 will ruin your security; use it only for testing");this.B=a},addEntropy:function(a,b,c){c=c||"user";var d,e,f=(new Date).valueOf(),
g=this.s[c],h=this.isReady(),l=0;d=this.K[c];d===t&&(d=this.K[c]=this.W++);g===t&&(g=this.s[c]=0);this.s[c]=(this.s[c]+1)%this.c.length;switch(typeof a){case "number":b===t&&(b=1);this.c[g].update([d,this.C++,1,b,f,1,a|0]);break;case "object":c=Object.prototype.toString.call(a);if("[object Uint32Array]"===c){e=[];for(c=0;c<a.length;c++)e.push(a[c]);a=e}else{"[object Array]"!==c&&(l=1);for(c=0;c<a.length&&!l;c++)"number"!==typeof a[c]&&(l=1)}if(!l){if(b===t)for(c=b=0;c<a.length;c++)for(e=a[c];0<e;)b++,
e>>>=1;this.c[g].update([d,this.C++,2,b,f,a.length].concat(a))}break;case "string":b===t&&(b=a.length);this.c[g].update([d,this.C++,3,b,f,a.length]);this.c[g].update(a);break;default:l=1}l&&q(new sjcl.exception.bug("random: addEntropy only supports number, array of numbers or string"));this.i[g]+=b;this.d+=b;h===this.m&&(this.isReady()!==this.m&&C("seeded",Math.max(this.j,this.d)),C("progress",this.getProgress()))},isReady:function(a){a=this.I[a!==t?a:this.B];return this.j&&this.j>=a?this.i[0]>this.R&&
(new Date).valueOf()>this.O?this.u|this.t:this.t:this.d>=a?this.u|this.m:this.m},getProgress:function(a){a=this.I[a?a:this.B];return this.j>=a?1:this.d>a?1:this.d/a},startCollectors:function(){this.q||(this.a={loadTimeCollector:D(this,this.aa),mouseCollector:D(this,this.ba),keyboardCollector:D(this,this.$),accelerometerCollector:D(this,this.U)},window.addEventListener?(window.addEventListener("load",this.a.loadTimeCollector,u),window.addEventListener("mousemove",this.a.mouseCollector,u),window.addEventListener("keypress",
this.a.keyboardCollector,u),window.addEventListener("devicemotion",this.a.accelerometerCollector,u)):document.attachEvent?(document.attachEvent("onload",this.a.loadTimeCollector),document.attachEvent("onmousemove",this.a.mouseCollector),document.attachEvent("keypress",this.a.keyboardCollector)):q(new sjcl.exception.bug("can't attach event")),this.q=!0)},stopCollectors:function(){this.q&&(window.removeEventListener?(window.removeEventListener("load",this.a.loadTimeCollector,u),window.removeEventListener("mousemove",
this.a.mouseCollector,u),window.removeEventListener("keypress",this.a.keyboardCollector,u),window.removeEventListener("devicemotion",this.a.accelerometerCollector,u)):document.detachEvent&&(document.detachEvent("onload",this.a.loadTimeCollector),document.detachEvent("onmousemove",this.a.mouseCollector),document.detachEvent("keypress",this.a.keyboardCollector)),this.q=u)},addEventListener:function(a,b){this.w[a][this.V++]=b},removeEventListener:function(a,b){var c,d,e=this.w[a],f=[];for(d in e)e.hasOwnProperty(d)&&
e[d]===b&&f.push(d);for(c=0;c<f.length;c++)d=f[c],delete e[d]},$:function(){E(1)},ba:function(a){sjcl.random.addEntropy([a.x||a.clientX||a.offsetX||0,a.y||a.clientY||a.offsetY||0],2,"mouse");E(0)},aa:function(){E(2)},U:function(a){a=a.accelerationIncludingGravity.x||a.accelerationIncludingGravity.y||a.accelerationIncludingGravity.z;var b="";window.orientation&&(b=window.orientation);sjcl.random.addEntropy([a,b],3,"accelerometer");E(0)}};
function C(a,b){var c,d=sjcl.random.w[a],e=[];for(c in d)d.hasOwnProperty(c)&&e.push(d[c]);for(c=0;c<e.length;c++)e[c](b)}function E(a){window&&window.performance&&"function"===typeof window.performance.now?sjcl.random.addEntropy(window.performance.now(),a,"loadtime"):sjcl.random.addEntropy((new Date).valueOf(),a,"loadtime")}function A(a){a.b=B(a).concat(B(a));a.A=new sjcl.cipher.aes(a.b)}function B(a){for(var b=0;4>b&&!(a.f[b]=a.f[b]+1|0,a.f[b]);b++);return a.A.encrypt(a.f)}
function D(a,b){return function(){b.apply(a,arguments)}}sjcl.random=new sjcl.prng(6);
a:try{var F,G,H;if("undefined"!==typeof module&&module.exports)G=require("crypto"),F=G.randomBytes(128),sjcl.random.addEntropy(F,1024,"crypto['randomBytes']");else if(window&&Uint32Array){H=new Uint32Array(32);if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(H);else if(window.msCrypto&&window.msCrypto.getRandomValues)window.msCrypto.getRandomValues(H);else break a;sjcl.random.addEntropy(H,1024,"crypto['getRandomValues']")}}catch(I){console.log("There was an error collecting entropy from the browser:"),
console.log(I)}
sjcl.json={defaults:{v:1,iter:1E3,ks:128,ts:64,mode:"ccm",adata:"",cipher:"aes"},Y:function(a,b,c,d){c=c||{};d=d||{};var e=sjcl.json,f=e.e({iv:sjcl.random.randomWords(4,0)},e.defaults),g;e.e(f,c);c=f.adata;"string"===typeof f.salt&&(f.salt=sjcl.codec.base64.toBits(f.salt));"string"===typeof f.iv&&(f.iv=sjcl.codec.base64.toBits(f.iv));(!sjcl.mode[f.mode]||!sjcl.cipher[f.cipher]||"string"===typeof a&&100>=f.iter||64!==f.ts&&96!==f.ts&&128!==f.ts||128!==f.ks&&192!==f.ks&&0x100!==f.ks||2>f.iv.length||4<
f.iv.length)&&q(new sjcl.exception.invalid("json encrypt: invalid parameters"));"string"===typeof a?(g=sjcl.misc.cachedPbkdf2(a,f),a=g.key.slice(0,f.ks/32),f.salt=g.salt):sjcl.ecc&&a instanceof sjcl.ecc.elGamal.publicKey&&(g=a.kem(),f.kemtag=g.tag,a=g.key.slice(0,f.ks/32));"string"===typeof b&&(b=sjcl.codec.utf8String.toBits(b));"string"===typeof c&&(c=sjcl.codec.utf8String.toBits(c));g=new sjcl.cipher[f.cipher](a);e.e(d,f);d.key=a;f.ct=sjcl.mode[f.mode].encrypt(g,b,f.iv,c,f.ts);return f},encrypt:function(a,
b,c,d){var e=sjcl.json,f=e.Y.apply(e,arguments);return e.encode(f)},X:function(a,b,c,d){c=c||{};d=d||{};var e=sjcl.json;b=e.e(e.e(e.e({},e.defaults),b),c,!0);var f;c=b.adata;"string"===typeof b.salt&&(b.salt=sjcl.codec.base64.toBits(b.salt));"string"===typeof b.iv&&(b.iv=sjcl.codec.base64.toBits(b.iv));(!sjcl.mode[b.mode]||!sjcl.cipher[b.cipher]||"string"===typeof a&&100>=b.iter||64!==b.ts&&96!==b.ts&&128!==b.ts||128!==b.ks&&192!==b.ks&&0x100!==b.ks||!b.iv||2>b.iv.length||4<b.iv.length)&&q(new sjcl.exception.invalid("json decrypt: invalid parameters"));
"string"===typeof a?(f=sjcl.misc.cachedPbkdf2(a,b),a=f.key.slice(0,b.ks/32),b.salt=f.salt):sjcl.ecc&&a instanceof sjcl.ecc.elGamal.secretKey&&(a=a.unkem(sjcl.codec.base64.toBits(b.kemtag)).slice(0,b.ks/32));"string"===typeof c&&(c=sjcl.codec.utf8String.toBits(c));f=new sjcl.cipher[b.cipher](a);c=sjcl.mode[b.mode].decrypt(f,b.ct,b.iv,c,b.ts);e.e(d,b);d.key=a;return sjcl.codec.utf8String.fromBits(c)},decrypt:function(a,b,c,d){var e=sjcl.json;return e.X(a,e.decode(b),c,d)},encode:function(a){var b,c=
"{",d="";for(b in a)if(a.hasOwnProperty(b))switch(b.match(/^[a-z0-9]+$/i)||q(new sjcl.exception.invalid("json encode: invalid property name")),c+=d+'"'+b+'":',d=",",typeof a[b]){case "number":case "boolean":c+=a[b];break;case "string":c+='"'+escape(a[b])+'"';break;case "object":c+='"'+sjcl.codec.base64.fromBits(a[b],0)+'"';break;default:q(new sjcl.exception.bug("json encode: unsupported type"))}return c+"}"},decode:function(a){a=a.replace(/\s/g,"");a.match(/^\{.*\}$/)||q(new sjcl.exception.invalid("json decode: this isn't json!"));
a=a.replace(/^\{|\}$/g,"").split(/,/);var b={},c,d;for(c=0;c<a.length;c++)(d=a[c].match(/^(?:(["']?)([a-z][a-z0-9]*)\1):(?:(\d+)|"([a-z0-9+\/%*_.@=\-]*)")$/i))||q(new sjcl.exception.invalid("json decode: this isn't json!")),b[d[2]]=d[3]?parseInt(d[3],10):d[2].match(/^(ct|salt|iv)$/)?sjcl.codec.base64.toBits(d[4]):unescape(d[4]);return b},e:function(a,b,c){a===t&&(a={});if(b===t)return a;for(var d in b)b.hasOwnProperty(d)&&(c&&(a[d]!==t&&a[d]!==b[d])&&q(new sjcl.exception.invalid("required parameter overridden")),
a[d]=b[d]);return a},ea:function(a,b){var c={},d;for(d in a)a.hasOwnProperty(d)&&a[d]!==b[d]&&(c[d]=a[d]);return c},da:function(a,b){var c={},d;for(d=0;d<b.length;d++)a[b[d]]!==t&&(c[b[d]]=a[b[d]]);return c}};sjcl.encrypt=sjcl.json.encrypt;sjcl.decrypt=sjcl.json.decrypt;sjcl.misc.ca={};
sjcl.misc.cachedPbkdf2=function(a,b){var c=sjcl.misc.ca,d;b=b||{};d=b.iter||1E3;c=c[a]=c[a]||{};d=c[d]=c[d]||{firstSalt:b.salt&&b.salt.length?b.salt.slice(0):sjcl.random.randomWords(2,0)};c=b.salt===t?d.firstSalt:b.salt;d[c]=d[c]||sjcl.misc.pbkdf2(a,c,b.iter);return{key:d[c].slice(0),salt:c.slice(0)}};

define("sjcl", function(){});

/*!
 * Copyright 2013 Robert Katić
 * Released under the MIT license
 * https://github.com/rkatic/p/blob/master/LICENSE
 *
 * High-priority-tasks code-portion based on https://github.com/kriskowal/asap
 * Long-Stack-Support code-portion based on https://github.com/kriskowal/q
 */
;(function( factory ){
	// CommonJS
	if ( typeof module !== "undefined" && module && module.exports ) {
		module.exports = factory();

	// RequireJS
	} else if ( typeof define === "function" && define.amd ) {
		define( 'p',factory );

	// global
	} else {
		P = factory();
	}
})(function() {
	"use strict";

	var withStack = withStackThrowing,
		pStartingLine = captureLine(),
		pFileName,
		currentTrace = null;

	function withStackThrowing( error ) {
		if ( !error.stack ) {
			try {
				throw error;
			} catch ( e ) {}
		}
		return error;
	}

	if ( new Error().stack ) {
		withStack = function( error ) {
			return error;
		};
	}

	function getTrace() {
		var stack = withStack( new Error() ).stack;
		if ( !stack ) {
			return null;
		}

		var stacks = [ filterStackString( stack, 1 ) ];

		if ( currentTrace ) {
			stacks = stacks.concat( currentTrace );

			if ( stacks.length === 128 ) {
				stacks.pop();
			}
		}

		return stacks;
	}

	function getFileNameAndLineNumber( stackLine ) {
		var m =
			/at .+ \((.+):(\d+):(?:\d+)\)$/.exec( stackLine ) ||
			/at ([^ ]+):(\d+):(?:\d+)$/.exec( stackLine ) ||
			/@(.+):(\d+):(?:\d+)$/.exec( stackLine );

		return m ? { fileName: m[1], lineNumber: Number(m[2]) } : null;
	}

	function captureLine() {
		var stack = withStack( new Error() ).stack;
		if ( !stack ) {
			return 0;
		}

		var lines = stack.split("\n");
		var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
		var pos = getFileNameAndLineNumber( firstLine );
		if ( !pos ) {
			return 0;
		}

		pFileName = pos.fileName;
		return pos.lineNumber;
	}

	function filterStackString( stack, ignoreFirstLines ) {
		var lines = stack.split("\n");
		var goodLines = [];

		for ( var i = ignoreFirstLines|0, l = lines.length; i < l; ++i ) {
			var line = lines[i];

			if ( line && !isNodeFrame(line) && !isInternalFrame(line) ) {
				goodLines.push( line );
			}
		}

		return goodLines.join("\n");
	}

	function isNodeFrame( stackLine ) {
		return stackLine.indexOf("(module.js:") !== -1 ||
			   stackLine.indexOf("(node.js:") !== -1;
	}

	function isInternalFrame( stackLine ) {
		var pos = getFileNameAndLineNumber( stackLine );
		return !!pos &&
			pos.fileName === pFileName &&
			pos.lineNumber >= pStartingLine &&
			pos.lineNumber <= pEndingLine;
	}

	var STACK_JUMP_SEPARATOR = "\nFrom previous event:\n";

	function makeStackTraceLong( error ) {
		if ( error instanceof Error ) {
			var stack = error.stack;

			if ( !stack ) {
				stack = withStack( error ).stack;

			} else if ( ~stack.indexOf(STACK_JUMP_SEPARATOR) ) {
				return;
			}

			if ( stack ) {
				error.stack = [ filterStackString( stack, 0 ) ]
					.concat( currentTrace || [] )
					.join(STACK_JUMP_SEPARATOR);
			}
		}
	}

	//__________________________________________________________________________

	var
		isNodeJS = ot(typeof process) && process != null &&
			({}).toString.call(process) === "[object process]",

		hasSetImmediate = typeof setImmediate === "function",

		gMutationObserver =
			ot(typeof MutationObserver) && MutationObserver ||
			ot(typeof WebKitMutationObserver) && WebKitMutationObserver,

		head = new TaskNode(),
		tail = head,
		flushing = false,
		nFreeTaskNodes = 0,

		requestFlush =
			isNodeJS ? requestFlushForNodeJS :
			gMutationObserver ? makeRequestCallFromMutationObserver( flush ) :
			makeRequestCallFromTimer( flush ),

		pendingErrors = [],
		requestErrorThrow = makeRequestCallFromTimer( throwFirstError ),

		handleError,

		domain,

		call = ot.call,
		apply = ot.apply;

	tail.next = head;

	function TaskNode() {
		this.f = null;
		this.a = null;
		this.b = null;
		this.next = null;
	}

	function ot( type ) {
		return type === "object" || type === "function";
	}

	function throwFirstError() {
		if ( pendingErrors.length ) {
			throw pendingErrors.shift();
		}
	}

	function flush() {
		while ( head !== tail ) {
			var h = head = head.next;

			if ( nFreeTaskNodes >= 1024 ) {
				tail.next = tail.next.next;
			} else {
				++nFreeTaskNodes;
			}

			var f = h.f;
			var a = h.a;
			var b = h.b;
			h.f = null;
			h.a = null;
			h.b = null;

			f( a, b );
		}

		flushing = false;
		currentTrace = null;
	}

	function schedule( f, a, b ) {
		var node = tail.next;

		if ( node === head ) {
			tail.next = node = new TaskNode();
			node.next = head;
		} else {
			--nFreeTaskNodes;
		}

		tail = node;

		node.f = f;
		node.a = a;
		node.b = b;

		if ( !flushing ) {
			flushing = true;
			requestFlush();
		}
	}

	function requestFlushForNodeJS() {
		var currentDomain = process.domain;

		if ( currentDomain ) {
			if ( !domain ) domain = (1,require)("domain");
			domain.active = process.domain = null;
		}

		if ( flushing && hasSetImmediate ) {
			setImmediate( flush );

		} else {
			process.nextTick( flush );
		}

		if ( currentDomain ) {
			domain.active = process.domain = currentDomain;
		}
	}

	function makeRequestCallFromMutationObserver( callback ) {
		var toggle = 1;
		var node = document.createTextNode("");
		var observer = new gMutationObserver( callback );
		observer.observe( node, {characterData: true} );

		return function() {
			toggle = -toggle;
			node.data = toggle;
		};
	}

	function makeRequestCallFromTimer( callback ) {
		return function() {
			var timeoutHandle = setTimeout( handleTimer, 0 );
			var intervalHandle = setInterval( handleTimer, 50 );

			function handleTimer() {
				clearTimeout( timeoutHandle );
				clearInterval( intervalHandle );
				callback();
			}
		};
	}

	if ( isNodeJS ) {
		handleError = function( e ) {
			currentTrace = null;
			requestFlush();
			throw e;
		};

	} else {
		handleError = function( e ) {
			pendingErrors.push( e );
			requestErrorThrow();
		}
	}

	//__________________________________________________________________________

	var FULFILLED = 1;
	var REJECTED = 2;

	var OP_CALL = -1;
	var OP_THEN = -2;
	var OP_MULTIPLE = -3;
	var OP_END = -4;

	var VOID = P(void 0);

	function DoneEb( e ) {
		if ( P.onerror ) {
			(1,P.onerror)( e );

		} else {
			throw e;
		}
	}

	function P( x ) {
		return x instanceof Promise ?
			x :
			Resolve( new Promise(), x );
	}

	P.longStackSupport = false;

	function Fulfill( p, value ) {
		if ( p._state > 0 ) {
			return;
		}

		p._state = FULFILLED;
		p._value = value;
		p._domain = null;

		HandleSettled( p );
	}

	function Reject( p, reason ) {
		if ( p._state > 0 ) {
			return;
		}

		if ( currentTrace ) {
			makeStackTraceLong( reason );
		}

		p._state = REJECTED;
		p._value = reason;

		if ( isNodeJS ) {
			p._domain = process.domain;
		}

		if ( p._op === OP_END ) {
			handleError( reason );

		} else {
			HandleSettled( p );
		}
	}

	function Propagate( parent, p ) {
		if ( p._state > 0 ) {
			return;
		}

		p._state = parent._state;
		p._value = parent._value;
		p._domain = parent._domain;

		HandleSettled( p );
	}

	function Resolve( p, x ) {
		if ( p._state > 0 ) {
			return p;
		}

		if ( x instanceof Promise ) {
			ResolveWithPromise( p, x );

		} else {
			var type = typeof x;

			if ( type === "object" && x !== null || type === "function" ) {
				ResolveWithObject( p, x )

			} else {
				Fulfill( p, x );
			}
		}

		return p;
	}

	function ResolveWithPromise( p, x ) {
		if ( x === p ) {
			Reject( p, new TypeError("You can't resolve a promise with itself") );

		} else if ( x._state > 0 ) {
			Propagate( x, p );

		} else {
			OnSettled( x, OP_THEN, p );
		}
	}

	function ResolveWithObject( p, x ) {
		var then = GetThen( p, x );

		if ( typeof then === "function" ) {
			TryResolver( resolverFor(p, false), then, x );

		} else {
			Fulfill( p, x );
		}
	}

	function GetThen( p, x ) {
		try {
			return x.then;

		} catch ( e ) {
			Reject( p, e );
			return null;
		}
	}

	function TryResolver( d, resolver, x ) {
		try {
			call.call( resolver, x, d.resolve, d.reject );

		} catch ( e ) {
			d.reject( e );
		}
	}

	function HandleSettled( p ) {
		if ( p._pending !== null ) {
			HandlePending( p, p._op, p._pending );
			p._pending = null;
		}
	}

	function HandlePending( p, op, pending ) {
		if ( op >= 0 ) {
			pending._cb( p, op );

		} else if ( op === OP_CALL ) {
			pending( p );

		} else if ( op === OP_THEN ) {
			schedule( Then, p, pending );

		} else {
			for ( var i = 0, l = pending.length; i < l; i += 2 ) {
				HandlePending( p, pending[i], pending[i + 1] );
			}
		}
	}

	function OnSettled( p, op, pending ) {
		if ( p._state > 0 ) {
			HandlePending( p, op, pending );

		} else if ( p._pending === null ) {
			p._pending = pending;
			p._op = op;

		} else if ( p._op === OP_MULTIPLE ) {
			p._pending.push( op, pending );

		} else {
			p._pending = [ p._op, p._pending, op, pending ];
			p._op = OP_MULTIPLE;
		}
	}

	function Then( parent, p ) {
		var cb = parent._state === FULFILLED ? p._cb : p._eb;
		p._cb = null;
		p._eb = null;

		if ( p._trace ) {
			currentTrace = p._trace;
			p._trace = null;
		}

		if ( cb === null ) {
			Propagate( parent, p );

		} else {
			HandleCallback( p, cb, parent._value, parent._domain || p._domain );
		}
	}

	function HandleCallback( p, cb, value, domain ) {
		if ( domain ) {
			if ( domain._disposed ) return;
			domain.enter();
		}

		try {
			value = cb( value );

		} catch ( e ) {
			Reject( p, e );
			p = null;
		}

		if ( p ) Resolve( p, value );
		if ( domain ) domain.exit();
	}

	function resolverFor( promise, nodelike ) {
		var trace = P.longStackSupport ? getTrace() : null;

		function resolve( error, y ) {
			if ( promise ) {
				var p = promise;
				promise = null;

				if ( trace ) {
					if ( currentTrace ) {
						trace = null;

					} else {
						currentTrace = trace;
					}
				}

				if ( error ) {
					Reject( p, nodelike ? error : y );

				} else {
					Resolve( p, y );
				}

				if ( trace ) {
					currentTrace = trace = null;
				}
			}
		}

		return nodelike ? resolve : {
			promise: promise,

			resolve: function( y ) {
				resolve( false, y );
			},

			reject: function( reason ) {
				resolve( true, reason );
			}
		};
	}

	P.defer = defer;
	function defer() {
		return resolverFor( new Promise(), false );
	}

	P.reject = reject;
	function reject( reason ) {
		var promise = new Promise();
		Reject( promise, reason );
		return promise;
	}

	function Promise() {
		this._state = 0;
		this._value = void 0;
		this._domain = null;
		this._cb = null;
		this._eb = null;
		this._op = 0;
		this._pending = null;
		this._trace = null;
	}

	Promise.prototype.then = function( onFulfilled, onRejected ) {
		var promise = new Promise();

		promise._cb = typeof onFulfilled === "function" ? onFulfilled : null;
		promise._eb = typeof onRejected === "function" ? onRejected : null;

		if ( P.longStackSupport ) {
			promise._trace = getTrace();
		}

		if ( isNodeJS ) {
			promise._domain = process.domain;
		}

		if ( this._state > 0 ) {
			schedule( Then, this, promise );

		} else {
			OnSettled( this, OP_THEN, promise );
		}

		return promise;
	};

	Promise.prototype.done = function( cb, eb ) {
		var p = this;

		if ( cb || eb ) {
			p = p.then( cb, eb );
		}

		p.then( null, DoneEb )._op = OP_END;
	};

	Promise.prototype.fail = function( eb ) {
		return this.then( null, eb );
	};

	Promise.prototype.fin = function( finback ) {
		var self = this;

		function fb() {
			return finback();
		}

		return self.then( fb, fb ).then(function() {
			return self;
		});
	};

	Promise.prototype.spread = function( cb, eb ) {
		return this.then( all ).then(function( args ) {
			return apply.call( cb, void 0, args );
		}, eb);
	};

	Promise.prototype.timeout = function( ms, msg ) {
		var promise = new Promise();

		if ( this._state > 0 ) {
			Propagate( this, promise );

		} else {
			var timedout = false;
			var trace = P.longStackSupport ? getTrace() : null;

			var timeoutId = setTimeout(function() {
				timedout = true;
				currentTrace = trace;
				Reject( promise, new Error(msg || "Timed out after " + ms + " ms") );
				currentTrace = null;
			}, ms);

			OnSettled(this, OP_CALL, function( p ) {
				if ( !timedout ) {
					schedule( Propagate, p, promise );
					clearTimeout( timeoutId );
				}
			});
		}

		return promise;
	};

	Promise.prototype.delay = function( ms ) {
		var promise = new Promise();

		OnSettled(this, OP_CALL, function( p ) {
			if ( p._state === FULFILLED ) {
				setTimeout(function() {
					Propagate( p, promise );
				}, ms);

			} else {
				schedule( Propagate, p, promise );
			}
		});

		return promise;
	};

	Promise.prototype.all = function() {
		return this.then( all );
	};

	Promise.prototype.allSettled = function() {
		return this.then( allSettled );
	};

	Promise.prototype.inspect = function() {
		switch ( this._state ) {
			case FULFILLED: return { state: "fulfilled", value: this._value };
			case REJECTED:  return { state: "rejected", reason: this._value };
			default:		return { state: "pending" };
		}
	};

	Promise.prototype.nodeify = function( nodeback ) {
		if ( nodeback ) {
			this.done(function( value ) {
				nodeback( null, value );
			}, nodeback);
			return void 0;

		} else {
			return this;
		}
	};

	function _allSettled_cb( p, i ) {
		this._value[ i ] = p.inspect();
		if ( ++this._state === 0 ) {
			if ( this._pending === null ) {
				this._state = FULFILLED;
			} else {
				schedule( Fulfill, this, this._value );
			}
		}
	}

	function _all_cb( p, i ) {
		if ( this._state < 0 ) {
			if ( p._state === REJECTED ) {
				this._state = 0;
				if ( this._pending === null ) {
					Propagate( p, this );
				} else {
					schedule( Propagate, p, this );
				}

			} else {
				this._value[ i ] = p._value;
				if ( ++this._state === 0 ) {
					if ( this._pending === null ) {
						this._state = FULFILLED;
					} else {
						schedule( Fulfill, this, this._value );
					}
				}
			}
		}
	}

	var nextIsAllSettled = false;

	P.all = all;
	function all( input ) {
		var promise = new Promise();
		promise._cb = nextIsAllSettled ? _allSettled_cb : _all_cb;
		nextIsAllSettled = false;

		var len = input.length|0;

		promise._state = len ? -len : FULFILLED;
		promise._value = new Array( len );

		for ( var i = 0; i < len && promise._state < 0; ++i ) {
			OnSettled( P(input[i]), i, promise );
		}

		return promise;
	}

	P.allSettled = allSettled;
	function allSettled( input ) {
		nextIsAllSettled = true;
		return all( input );
	}

	P.spread = spread;
	function spread( values, cb, eb ) {
		return all( values ).then(function( args ) {
			return apply.call( cb, void 0, args );
		}, eb);
	}

	P.promised = promised;
	function promised( f ) {
		function onFulfilled( thisAndArgs ) {
			return call.apply( f, thisAndArgs );
		}

		return function() {
			var len = arguments.length;
			var thisAndArgs = new Array( len + 1 );
			thisAndArgs[0] = this;
			for ( var i = 0; i < len; ++i ) {
				thisAndArgs[ i + 1 ] = arguments[ i ];
			}
			return all( thisAndArgs ).then( onFulfilled );
		};
	}

	P.denodeify = denodeify;
	function denodeify( f ) {
		return function() {
			var promise = new Promise();

			var i = arguments.length;
			var args = new Array( i + 1 );
			args[i] = resolverFor( promise, true );
			while ( i-- ) {
				args[i] = arguments[i];
			}

			TryApply( promise, f, this, args );

			return promise;
		};
	}

	function TryApply( p, f, that, args ) {
		try {
			apply.call( f, that, args );

		} catch ( e ) {
			Reject( p, e );
		}
	}

	P.onerror = null;

	P.nextTick = function nextTick( task ) {
		// We don't use .done to avoid P.onerror.
		VOID.then(function() {
			task.call();
		})._op = OP_END;
	};

	var pEndingLine = captureLine();

	return P;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/hawk',['sjcl'], function (sjcl) {
  'use strict';

  /*
   HTTP Hawk Authentication Scheme
   Copyright (c) 2012-2013, Eran Hammer <eran@hueniverse.com>
   MIT Licensed
   */


  // Declare namespace

  var hawk = {};

  hawk.client = {

    // Generate an Authorization header for a given request

    /*
     uri: 'http://example.com/resource?a=b'
     method: HTTP verb (e.g. 'GET', 'POST')
     options: {

     // Required

     credentials: {
     id: 'dh37fgj492je',
     key: 'aoijedoaijsdlaksjdl',
     algorithm: 'sha256'                                 // 'sha1', 'sha256'
     },

     // Optional

     ext: 'application-specific',                        // Application specific data sent via the ext attribute
     timestamp: Date.now() / 1000,                       // A pre-calculated timestamp in seconds
     nonce: '2334f34f',                                  // A pre-generated nonce
     localtimeOffsetMsec: 400,                           // Time offset to sync with server time (ignored if timestamp provided)
     payload: '{"some":"payload"}',                      // UTF-8 encoded string for body hash generation (ignored if hash provided)
     contentType: 'application/json',                    // Payload content-type (ignored if hash provided)
     hash: 'U4MKKSmiVxk37JCCrAVIjV=',                    // Pre-calculated payload hash
     app: '24s23423f34dx',                               // Oz application id
     dlg: '234sz34tww3sd'                                // Oz delegated-by application id
     }
     */

    header: function (uri, method, options) {
      /*eslint complexity: [2, 21] */
      var result = {
        field: '',
        artifacts: {}
      };

      // Validate inputs

      if (!uri || (typeof uri !== 'string' && typeof uri !== 'object') ||
        !method || typeof method !== 'string' ||
        !options || typeof options !== 'object') {

        result.err = 'Invalid argument type';
        return result;
      }

      // Application time

      var timestamp = options.timestamp || Math.floor((hawk.utils.now() + (options.localtimeOffsetMsec || 0)) / 1000);

      // Validate credentials

      var credentials = options.credentials;
      if (!credentials ||
        !credentials.id ||
        !credentials.key ||
        !credentials.algorithm) {

        result.err = 'Invalid credential object';
        return result;
      }

      if (hawk.utils.baseIndexOf(hawk.crypto.algorithms, credentials.algorithm) === -1) {
        result.err = 'Unknown algorithm';
        return result;
      }

      // Parse URI

      if (typeof uri === 'string') {
        uri = hawk.utils.parseUri(uri);
      }

      // Calculate signature

      var artifacts = {
        ts: timestamp,
        nonce: options.nonce || hawk.utils.randomString(6),
        method: method,
        resource: uri.relative,
        host: uri.hostname,
        port: uri.port,
        hash: options.hash,
        ext: options.ext,
        app: options.app,
        dlg: options.dlg
      };

      result.artifacts = artifacts;

      // Calculate payload hash

      if (!artifacts.hash &&
        options.hasOwnProperty('payload')) {

        artifacts.hash = hawk.crypto.calculatePayloadHash(options.payload, credentials.algorithm, options.contentType);
      }

      var mac = hawk.crypto.calculateMac('header', credentials, artifacts);

      // Construct header

      var hasExt = artifacts.ext !== null && artifacts.ext !== undefined && artifacts.ext !== '';       // Other falsey values allowed
      var header = 'Hawk id="' + credentials.id +
        '", ts="' + artifacts.ts +
        '", nonce="' + artifacts.nonce +
        (artifacts.hash ? '", hash="' + artifacts.hash : '') +
        (hasExt ? '", ext="' + hawk.utils.escapeHeaderAttribute(artifacts.ext) : '') +
        '", mac="' + mac + '"';

      if (artifacts.app) {
        header += ', app="' + artifacts.app +
          (artifacts.dlg ? '", dlg="' + artifacts.dlg : '') + '"';
      }

      result.field = header;

      return result;
    },


    // Validate server response

    /*
     request:    object created via 'new XMLHttpRequest()' after response received
     artifacts:  object recieved from header().artifacts
     options: {
     payload:    optional payload received
     required:   specifies if a Server-Authorization header is required. Defaults to 'false'
     }
     */

    authenticate: function (request, credentials, artifacts, options) {

      options = options || {};

      if (request.getResponseHeader('www-authenticate')) {

        // Parse HTTP WWW-Authenticate header

        var attrsAuth = hawk.utils.parseAuthorizationHeader(request.getResponseHeader('www-authenticate'), ['ts', 'tsm', 'error']);
        if (!attrsAuth) {
          return false;
        }

        if (attrsAuth.ts) {
          var tsm = hawk.crypto.calculateTsMac(attrsAuth.ts, credentials);
          if (tsm !== attrsAuth.tsm) {
            return false;
          }

          hawk.utils.setNtpOffset(attrsAuth.ts - Math.floor((new Date()).getTime() / 1000));     // Keep offset at 1 second precision
        }
      }

      // Parse HTTP Server-Authorization header

      if (!request.getResponseHeader('server-authorization') &&
        !options.required) {

        return true;
      }

      var attributes = hawk.utils.parseAuthorizationHeader(request.getResponseHeader('server-authorization'), ['mac', 'ext', 'hash']);
      if (!attributes) {
        return false;
      }

      var modArtifacts = {
        ts: artifacts.ts,
        nonce: artifacts.nonce,
        method: artifacts.method,
        resource: artifacts.resource,
        host: artifacts.host,
        port: artifacts.port,
        hash: attributes.hash,
        ext: attributes.ext,
        app: artifacts.app,
        dlg: artifacts.dlg
      };

      var mac = hawk.crypto.calculateMac('response', credentials, modArtifacts);
      if (mac !== attributes.mac) {
        return false;
      }

      if (!options.hasOwnProperty('payload')) {
        return true;
      }

      if (!attributes.hash) {
        return false;
      }

      var calculatedHash = hawk.crypto.calculatePayloadHash(options.payload, credentials.algorithm, request.getResponseHeader('content-type'));
      return (calculatedHash === attributes.hash);
    },

    message: function (host, port, message, options) {

      // Validate inputs

      if (!host || typeof host !== 'string' ||
        !port || typeof port !== 'number' ||
        message === null || message === undefined || typeof message !== 'string' ||
        !options || typeof options !== 'object') {

        return null;
      }

      // Application time

      var timestamp = options.timestamp || Math.floor((hawk.utils.now() + (options.localtimeOffsetMsec || 0)) / 1000);

      // Validate credentials

      var credentials = options.credentials;
      if (!credentials ||
        !credentials.id ||
        !credentials.key ||
        !credentials.algorithm) {

        // Invalid credential object
        return null;
      }

      if (hawk.crypto.algorithms.indexOf(credentials.algorithm) === -1) {
        return null;
      }

      // Calculate signature

      var artifacts = {
        ts: timestamp,
        nonce: options.nonce || hawk.utils.randomString(6),
        host: host,
        port: port,
        hash: hawk.crypto.calculatePayloadHash(message, credentials.algorithm)
      };

      // Construct authorization

      var result = {
        id: credentials.id,
        ts: artifacts.ts,
        nonce: artifacts.nonce,
        hash: artifacts.hash,
        mac: hawk.crypto.calculateMac('message', credentials, artifacts)
      };

      return result;
    },

    authenticateTimestamp: function (message, credentials, updateClock) {           // updateClock defaults to true

      var tsm = hawk.crypto.calculateTsMac(message.ts, credentials);
      if (tsm !== message.tsm) {
        return false;
      }

      if (updateClock !== false) {
        hawk.utils.setNtpOffset(message.ts - Math.floor((new Date()).getTime() / 1000));    // Keep offset at 1 second precision
      }

      return true;
    }
  };


  hawk.crypto = {

    headerVersion: '1',

    algorithms: ['sha1', 'sha256'],

    calculateMac: function (type, credentials, options) {
      var normalized = hawk.crypto.generateNormalizedString(type, options);
      var hmac = new sjcl.misc.hmac(credentials.key, sjcl.hash.sha256);
      hmac.update(normalized);

      return sjcl.codec.base64.fromBits(hmac.digest());
    },

    generateNormalizedString: function (type, options) {

      var normalized = 'hawk.' + hawk.crypto.headerVersion + '.' + type + '\n' +
        options.ts + '\n' +
        options.nonce + '\n' +
        (options.method || '').toUpperCase() + '\n' +
        (options.resource || '') + '\n' +
        options.host.toLowerCase() + '\n' +
        options.port + '\n' +
        (options.hash || '') + '\n';

      if (options.ext) {
        normalized += options.ext.replace('\\', '\\\\').replace('\n', '\\n');
      }

      normalized += '\n';

      if (options.app) {
        normalized += options.app + '\n' +
          (options.dlg || '') + '\n';
      }

      return normalized;
    },

    calculatePayloadHash: function (payload, algorithm, contentType) {
      var hash = new sjcl.hash.sha256();
      hash.update('hawk.' + hawk.crypto.headerVersion + '.payload\n')
        .update(hawk.utils.parseContentType(contentType) + '\n')
        .update(payload || '')
        .update('\n');

      return sjcl.codec.base64.fromBits(hash.finalize());
    },

    calculateTsMac: function (ts, credentials) {
      var hmac = new sjcl.misc.hmac(credentials.key, sjcl.hash.sha256);
      hmac.update('hawk.' + hawk.crypto.headerVersion + '.ts\n' + ts + '\n');

      return sjcl.codec.base64.fromBits(hmac.digest());
    }
  };


  hawk.utils = {

    storage: {                                      // localStorage compatible interface
      _cache: {},
      setItem: function (key, value) {

        hawk.utils.storage._cache[key] = value;
      },
      getItem: function (key) {

        return hawk.utils.storage._cache[key];
      }
    },

    setStorage: function (storage) {

      var ntpOffset = hawk.utils.getNtpOffset() || 0;
      hawk.utils.storage = storage;
      hawk.utils.setNtpOffset(ntpOffset);
    },

    setNtpOffset: function (offset) {

      try {
        hawk.utils.storage.setItem('hawk_ntp_offset', offset);
      }
      catch (err) {
        console.error('[hawk] could not write to storage.');
        console.error(err);
      }
    },

    getNtpOffset: function () {

      return parseInt(hawk.utils.storage.getItem('hawk_ntp_offset') || '0', 10);
    },

    now: function () {

      return (new Date()).getTime() + hawk.utils.getNtpOffset();
    },

    escapeHeaderAttribute: function (attribute) {

      return attribute.replace(/\\/g, '\\\\').replace(/\"/g, '\\"');
    },

    parseContentType: function (header) {

      if (!header) {
        return '';
      }

      return header.split(';')[0].replace(/^\s+|\s+$/g, '').toLowerCase();
    },

    parseAuthorizationHeader: function (header, keys) {

      if (!header) {
        return null;
      }

      var headerParts = header.match(/^(\w+)(?:\s+(.*))?$/);       // Header: scheme[ something]
      if (!headerParts) {
        return null;
      }

      var scheme = headerParts[1];
      if (scheme.toLowerCase() !== 'hawk') {
        return null;
      }

      var attributesString = headerParts[2];
      if (!attributesString) {
        return null;
      }

      var attributes = {};
      var verify = attributesString.replace(/(\w+)="([^"\\]*)"\s*(?:,\s*|$)/g, function ($0, $1, $2) {

        // Check valid attribute names

        if (keys.indexOf($1) === -1) {
          return;
        }

        // Allowed attribute value characters: !#$%&'()*+,-./:;<=>?@[]^_`{|}~ and space, a-z, A-Z, 0-9

        if ($2.match(/^[ \w\!#\$%&'\(\)\*\+,\-\.\/\:;<\=>\?@\[\]\^`\{\|\}~]+$/) === null) {
          return;
        }

        // Check for duplicates

        if (attributes.hasOwnProperty($1)) {
          return;
        }

        attributes[$1] = $2;
        return '';
      });

      if (verify !== '') {
        return null;
      }

      return attributes;
    },

    randomString: function (size) {

      var randomSource = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      var len = randomSource.length;

      var result = [];
      for (var i = 0; i < size; ++i) {
        result[i] = randomSource[Math.floor(Math.random() * len)];
      }

      return result.join('');
    },

    baseIndexOf: function(array, value, fromIndex) {
      var index = (fromIndex || 0) - 1,
        length = array ? array.length : 0;

      while (++index < length) {
        if (array[index] === value) {
          return index;
        }
      }
      return -1;
    },

    parseUri: function (input) {

      // Based on: parseURI 1.2.2
      // http://blog.stevenlevithan.com/archives/parseuri
      // (c) Steven Levithan <stevenlevithan.com>
      // MIT License

      var keys = ['source', 'protocol', 'authority', 'userInfo', 'user', 'password', 'hostname', 'port', 'resource', 'relative', 'pathname', 'directory', 'file', 'query', 'fragment'];

      var uriRegex = /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?(((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?)(?:#(.*))?)/;
      var uriByNumber = uriRegex.exec(input);
      var uri = {};

      var i = 15;
      while (i--) {
        uri[keys[i]] = uriByNumber[i] || '';
      }

      if (uri.port === null ||
        uri.port === '') {

        uri.port = (uri.protocol.toLowerCase() === 'http' ? '80' : (uri.protocol.toLowerCase() === 'https' ? '443' : ''));
      }

      return uri;
    }
  };


  return hawk;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/errors',[], function () {
  return {
    INVALID_TIMESTAMP: 111,
    INCORRECT_EMAIL_CASE: 120
  };
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/request',['./hawk', 'p', './errors'], function (hawk, P, ERRORS) {
  'use strict';
  /* global XMLHttpRequest */

  /**
   * @class Request
   * @constructor
   * @param {String} baseUri Base URI
   * @param {Object} xhr XMLHttpRequest constructor
   * @param {Object} [options={}] Options
   *   @param {Number} [options.localtimeOffsetMsec]
   *   Local time offset with the remote auth server's clock
   */
  function Request (baseUri, xhr, options) {
    if (!options) {
      options = {};
    }
    this.baseUri = baseUri;
    this._localtimeOffsetMsec = options.localtimeOffsetMsec;
    this.xhr = xhr || XMLHttpRequest;
    this.timeout = options.timeout || 30 * 1000;
  }

  /**
   * @method send
   * @param {String} path Request path
   * @param {String} method HTTP Method
   * @param {Object} credentials HAWK Headers
   * @param {Object} jsonPayload JSON Payload
   * @param {Object} [options={}] Options
   *   @param {String} [options.retrying]
   *   Flag indicating if the request is a retry
   *   @param {Array} [options.headers]
   *   A set of extra headers to add to the request
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  Request.prototype.send = function request(path, method, credentials, jsonPayload, options) {
    /*eslint complexity: [2, 8] */
    var deferred = P.defer();
    var xhr = new this.xhr();
    var uri = this.baseUri + path;
    var payload = null;
    var self = this;
    options = options || {};

    if (jsonPayload) {
      payload = JSON.stringify(jsonPayload);
    }

    try {
      xhr.open(method, uri);
    } catch (e) {
      return P.reject({ error: 'Unknown error', message: e.toString(), errno: 999 });
    }

    xhr.timeout = this.timeout;

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        var result = xhr.responseText;
        try {
          result = JSON.parse(xhr.responseText);
        } catch (e) { }

        if (result.errno) {
          // Try to recover from a timeskew error and not already tried
          if (result.errno === ERRORS.INVALID_TIMESTAMP && !options.retrying) {
            var serverTime = result.serverTime;
            self._localtimeOffsetMsec = (serverTime * 1000) - new Date().getTime();

            // add to options that the request is retrying
            options.retrying = true;

            return self.send(path, method, credentials, jsonPayload, options)
              .then(deferred.resolve, deferred.reject);

          } else {
            return deferred.reject(result);
          }
        }

        if (typeof xhr.status === 'undefined' || xhr.status !== 200) {
          if (result.length === 0) {
            return deferred.reject({ error: 'Timeout error', errno: 999 });
          } else {
            return deferred.reject({ error: 'Unknown error', message: result, errno: 999, code: xhr.status });
          }
        }

        deferred.resolve(result);
      }
    };

    // calculate Hawk header if credentials are supplied
    if (credentials) {
      var hawkHeader = hawk.client.header(uri, method, {
                          credentials: credentials,
                          payload: payload,
                          contentType: 'application/json',
                          localtimeOffsetMsec: this._localtimeOffsetMsec || 0
                        });
      xhr.setRequestHeader('authorization', hawkHeader.field);
    }

    xhr.setRequestHeader('Content-Type', 'application/json');

    if (options && options.headers) {
      // set extra headers for this request
      for (var header in options.headers) {
        xhr.setRequestHeader(header, options.headers[header]);
      }
    }

    xhr.send(payload);

    return deferred.promise;
  };

  return Request;

});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/hkdf',['sjcl', 'p'], function (sjcl, P) {
  'use strict';

  /**
   * hkdf - The HMAC-based Key Derivation Function
   * based on https://github.com/mozilla/node-hkdf
   *
   * @class hkdf
   * @param {bitArray} ikm Initial keying material
   * @param {bitArray} info Key derivation data
   * @param {bitArray} salt Salt
   * @param {integer} length Length of the derived key in bytes
   * @return promise object- It will resolve with `output` data
   */
  function hkdf(ikm, info, salt, length) {

    var mac = new sjcl.misc.hmac(salt, sjcl.hash.sha256);
    mac.update(ikm);

    // compute the PRK
    var prk = mac.digest();

    // hash length is 32 because only sjcl.hash.sha256 is used at this moment
    var hashLength = 32;
    var num_blocks = Math.ceil(length / hashLength);
    var prev = sjcl.codec.hex.toBits('');
    var output = '';

    for (var i = 0; i < num_blocks; i++) {
      var hmac = new sjcl.misc.hmac(prk, sjcl.hash.sha256);

      var input = sjcl.bitArray.concat(
        sjcl.bitArray.concat(prev, info),
        sjcl.codec.utf8String.toBits((String.fromCharCode(i + 1)))
      );

      hmac.update(input);

      prev = hmac.digest();
      output += sjcl.codec.hex.fromBits(prev);
    }

    var truncated = sjcl.bitArray.clamp(sjcl.codec.hex.toBits(output), length * 8);

    return P(truncated);
  }

  return hkdf;

});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/pbkdf2',['sjcl', 'p'], function (sjcl, P) {
  'use strict';

  /**
   * @class pbkdf2
   * @constructor
   */
  var pbkdf2 = {
    /**
     * @method derive
     * @param  {bitArray} input The password hex buffer.
     * @param  {bitArray} salt The salt string buffer.
     * @return {int} iterations the derived key bit array.
     */
    derive: function(input, salt, iterations, len) {
      var result = sjcl.misc.pbkdf2(input, salt, iterations, len, sjcl.misc.hmac);
      return P(result);
    }
  };

  return pbkdf2;

});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/credentials',['./request', 'sjcl', 'p', './hkdf', './pbkdf2'], function (Request, sjcl, P, hkdf, pbkdf2) {
  'use strict';

  // Key wrapping and stretching configuration.
  var NAMESPACE = 'identity.mozilla.com/picl/v1/';
  var PBKDF2_ROUNDS = 1000;
  var STRETCHED_PASS_LENGTH_BYTES = 32 * 8;
//sjcl = window.sjcl;
  var HKDF_SALT = sjcl.codec.hex.toBits('00');
  var HKDF_LENGTH = 32;

  /**
   * Key Wrapping with a name
   *
   * @method kw
   * @static
   * @param {String} name The name of the salt
   * @return {bitArray} the salt combination with the namespace
   */
  function kw(name) {
    return sjcl.codec.utf8String.toBits(NAMESPACE + name);
  }

  /**
   * Key Wrapping with a name and an email
   *
   * @method kwe
   * @static
   * @param {String} name The name of the salt
   * @param {String} email The email of the user.
   * @return {bitArray} the salt combination with the namespace
   */
  function kwe(name, email) {
    return sjcl.codec.utf8String.toBits(NAMESPACE + name + ':' + email);
  }

  /**
   * @class credentials
   * @constructor
   */
  return {
    /**
     * Setup credentials
     *
     * @method setup
     * @param {String} emailInput
     * @param {String} passwordInput
     * @return {Promise} A promise that will be fulfilled with `result` of generated credentials
     */
    setup: function (emailInput, passwordInput) {
      var result = {};
      var email = kwe('quickStretch', emailInput);
      var password = sjcl.codec.utf8String.toBits(passwordInput);

      result.emailUTF8 = emailInput;
      result.passwordUTF8 = passwordInput;

      return pbkdf2.derive(password, email, PBKDF2_ROUNDS, STRETCHED_PASS_LENGTH_BYTES)
        .then(
        function (quickStretchedPW) {
          result.quickStretchedPW = quickStretchedPW;

          return hkdf(quickStretchedPW, kw('authPW'), HKDF_SALT, HKDF_LENGTH)
            .then(
            function (authPW) {
              result.authPW = authPW;

              return hkdf(quickStretchedPW, kw('unwrapBkey'), HKDF_SALT, HKDF_LENGTH);
            }
          );
        }
      )
        .then(
        function (unwrapBKey) {
          result.unwrapBKey = unwrapBKey;
          return result;
        }
      );
    },
    /**
     * Wrap
     *
     * @method wrap
     * @param {bitArray} bitArray1
     * @param {bitArray} bitArray2
     * @return {bitArray} wrap result of the two bitArrays
     */
    xor: function (bitArray1, bitArray2) {
      var result = [];

      for (var i = 0; i < bitArray1.length; i++) {
        result[i] = bitArray1[i] ^ bitArray2[i];
      }

      return result;
    },
    /**
     * Unbundle the WrapKB
     * @param {String} key Bundle Key in hex
     * @param {String} bundle Key bundle in hex
     * @returns {*}
     */
    unbundleKeyFetchResponse: function (key, bundle) {
      var self = this;
      var bitBundle = sjcl.codec.hex.toBits(bundle);

      return this.deriveBundleKeys(key, 'account/keys')
        .then(
          function (keys) {
            var ciphertext = sjcl.bitArray.bitSlice(bitBundle, 0, 8 * 64);
            var expectedHmac = sjcl.bitArray.bitSlice(bitBundle, 8 * -32);
            var hmac = new sjcl.misc.hmac(keys.hmacKey, sjcl.hash.sha256);
            hmac.update(ciphertext);

            if (!sjcl.bitArray.equal(hmac.digest(), expectedHmac)) {
              throw new Error('Bad HMac');
            }

            var keyAWrapB = self.xor(sjcl.bitArray.bitSlice(bitBundle, 0, 8 * 64), keys.xorKey);

            return {
              kA: sjcl.codec.hex.fromBits(sjcl.bitArray.bitSlice(keyAWrapB, 0, 8 * 32)),
              wrapKB: sjcl.codec.hex.fromBits(sjcl.bitArray.bitSlice(keyAWrapB, 8 * 32))
            };
          }
        );
    },
    /**
     * Derive the HMAC and XOR keys required to encrypt a given size of payload.
     * @param {String} key Hex Bundle Key
     * @param {String} keyInfo Bundle Key Info
     * @returns {Object} hmacKey, xorKey
     */
    deriveBundleKeys: function(key, keyInfo) {
      var bitKeyInfo = kw(keyInfo);
      var salt = sjcl.codec.hex.toBits('');
      key = sjcl.codec.hex.toBits(key);

      return hkdf(key, bitKeyInfo, salt, 3 * 32)
        .then(
          function (keyMaterial) {

            return {
              hmacKey: sjcl.bitArray.bitSlice(keyMaterial, 0, 8 * 32),
              xorKey: sjcl.bitArray.bitSlice(keyMaterial, 8 * 32)
            };
          }
        );
    }
  };

});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/lib/hawkCredentials',['sjcl', './hkdf'], function (sjcl, hkdf) {
  'use strict';

//sjcl = window.sjcl;
  var PREFIX_NAME = 'identity.mozilla.com/picl/v1/';
  var bitSlice = sjcl.bitArray.bitSlice;
  var salt = sjcl.codec.hex.toBits('');

  /**
   * @class hawkCredentials
   * @method deriveHawkCredentials
   * @param {String} tokenHex
   * @param {String} context
   * @param {int} size
   * @returns {Promise}
   */
  function deriveHawkCredentials(tokenHex, context, size) {
    var token = sjcl.codec.hex.toBits(tokenHex);
    var info = sjcl.codec.utf8String.toBits(PREFIX_NAME + context);

    return hkdf(token, info, salt, size || 3 * 32)
      .then(function(out) {
        var authKey = bitSlice(out, 8 * 32, 8 * 64);
        var bundleKey = bitSlice(out, 8 * 64);

        return {
          algorithm: 'sha256',
          id: sjcl.codec.hex.fromBits(bitSlice(out, 0, 8 * 32)),
          key: authKey,
          bundleKey: bundleKey
        };
      });
  }

  return deriveHawkCredentials;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This module does the handling for the metrics context
// activity event metadata.

define('client/lib/metricsContext',[], function () {
  'use strict';

  return {
    marshall: function (data) {
      return {
        flowId: data.flowId,
        flowBeginTime: data.flowBeginTime
      };
    }
  };
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
define('client/FxAccountClient',[
  'sjcl',
  'p',
  './lib/credentials',
  './lib/errors',
  './lib/hawkCredentials',
  './lib/metricsContext',
  './lib/request',
], function (sjcl, P, credentials, ERRORS, hawkCredentials, metricsContext, Request) {
  'use strict';

  var VERSION = 'v1';
  var uriVersionRegExp = new RegExp('/' + VERSION + '$');
  var HKDF_SIZE = 2 * 32;

  function isUndefined(val) {
    return typeof val === 'undefined';
  }

  function isNull(val) {
    return val === null;
  }

  function isEmptyObject(val) {
    return Object.prototype.toString.call(val) === '[object Object]' && ! Object.keys(val).length;
  }

  function isEmptyString(val) {
    return val === '';
  }

  function required(val, name) {
    if (isUndefined(val) ||
        isNull(val) ||
        isEmptyObject(val) ||
        isEmptyString(val)) {
      throw new Error('Missing ' + name);
    }
  }

  /**
   * @class FxAccountClient
   * @constructor
   * @param {String} uri Auth Server URI
   * @param {Object} config Configuration
   */
  function FxAccountClient(uri, config) {
    if (! uri && ! config) {
      throw new Error('Firefox Accounts auth server endpoint or configuration object required.');
    }

    if (typeof uri !== 'string') {
      config = uri || {};
      uri = config.uri;
    }

    if (typeof config === 'undefined') {
      config = {};
    }

    if (! uri) {
      throw new Error('FxA auth server uri not set.');
    }

    if (!uriVersionRegExp.test(uri)) {
      uri = uri + '/' + VERSION;
    }

    this.request = new Request(uri, config.xhr, { localtimeOffsetMsec: config.localtimeOffsetMsec });
  }

  FxAccountClient.VERSION = VERSION;

  /**
   * @method signUp
   * @param {String} email Email input
   * @param {String} password Password input
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.keys]
   *   If `true`, calls the API with `?keys=true` to get the keyFetchToken
   *   @param {String} [options.service]
   *   Opaque alphanumeric token to be included in verification links
   *   @param {String} [options.redirectTo]
   *   a URL that the client should be redirected to after handling the request
   *   @param {String} [options.preVerified]
   *   set email to be verified if possible
   *   @param {String} [options.resume]
   *   Opaque url-encoded string that will be included in the verification link
   *   as a querystring parameter, useful for continuing an OAuth flow for
   *   example.
   *   @param {String} [options.lang]
   *   set the language for the 'Accept-Language' header
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.signUp = function (email, password, options) {
    var self = this;

    required(email, 'email');
    required(password, 'password');

    return credentials.setup(email, password)
      .then(
        function (result) {
          /*eslint complexity: [2, 13] */
          var endpoint = '/account/create';
          var data = {
            email: result.emailUTF8,
            authPW: sjcl.codec.hex.fromBits(result.authPW)
          };
          var requestOpts = {};

          if (options) {
            if (options.service) {
              data.service = options.service;
            }

            if (options.redirectTo) {
              data.redirectTo = options.redirectTo;
            }

            // preVerified is used for unit/functional testing
            if (options.preVerified) {
              data.preVerified = options.preVerified;
            }

            if (options.resume) {
              data.resume = options.resume;
            }

            if (options.keys) {
              endpoint += '?keys=true';
            }

            if (options.lang) {
              requestOpts.headers = {
                'Accept-Language': options.lang
              };
            }

            if (options.metricsContext) {
              data.metricsContext = metricsContext.marshall(options.metricsContext);
            }
          }

          return self.request.send(endpoint, 'POST', null, data, requestOpts)
            .then(
              function(accountData) {
                if (options && options.keys) {
                  accountData.unwrapBKey = sjcl.codec.hex.fromBits(result.unwrapBKey);
                }
                return accountData;
              }
            );
        }
      );
  };

  /**
   * @method signIn
   * @param {String} email Email input
   * @param {String} password Password input
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.keys]
   *   If `true`, calls the API with `?keys=true` to get the keyFetchToken
   *   @param {Boolean} [options.skipCaseError]
   *   If `true`, the request will skip the incorrect case error
   *   @param {String} [options.service]
   *   Service being signed into
   *   @param {String} [options.reason]
   *   Reason for sign in. Can be one of: `signin`, `password_check`,
   *   `password_change`, `password_reset`
   *   @param {String} [options.redirectTo]
   *   a URL that the client should be redirected to after handling the request
   *   @param {String} [options.resume]
   *   Opaque url-encoded string that will be included in the verification link
   *   as a querystring parameter, useful for continuing an OAuth flow for
   *   example.
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   *   @param {String} [options.unblockCode]
   *   Login unblock code.
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.signIn = function (email, password, options) {
    var self = this;
    options = options || {};

    required(email, 'email');
    required(password, 'password');

    return credentials.setup(email, password)
      .then(
        function (result) {
          var endpoint = '/account/login';

          if (options.keys) {
            endpoint += '?keys=true';
          }

          var data = {
            email: result.emailUTF8,
            authPW: sjcl.codec.hex.fromBits(result.authPW)
          };

          if (options.metricsContext) {
            data.metricsContext = metricsContext.marshall(options.metricsContext);
          }

          if (options.reason) {
            data.reason = options.reason;
          }

          if (options.redirectTo) {
            data.redirectTo = options.redirectTo;
          }

          if (options.resume) {
            data.resume = options.resume;
          }

          if (options.service) {
            data.service = options.service;
          }

          if (options.unblockCode) {
            data.unblockCode = options.unblockCode;
          }

          return self.request.send(endpoint, 'POST', null, data)
            .then(
              function(accountData) {
                if (options.keys) {
                  accountData.unwrapBKey = sjcl.codec.hex.fromBits(result.unwrapBKey);
                }
                return accountData;
              },
              function(error) {
                if (error && error.email && error.errno === ERRORS.INCORRECT_EMAIL_CASE && !options.skipCaseError) {
                  options.skipCaseError = true;

                  return self.signIn(error.email, password, options);
                } else {
                  throw error;
                }
              }
            );
        }
      );
  };

  /**
   * @method verifyCode
   * @param {String} uid Account ID
   * @param {String} code Verification code
   * @param {Object} [options={}] Options
   *   @param {String} [options.service]
   *   Service being signed into
   *   @param {String} [options.reminder]
   *   Reminder that was used to verify the account
   *   @param {String} [options.type]
   *   Type of code being verified, only supports `secondary` otherwise will verify account/sign-in
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.verifyCode = function(uid, code, options) {
    required(uid, 'uid');
    required(code, 'verify code');

    var data = {
      uid: uid,
      code: code
    };

    if (options) {
      if (options.service) {
        data.service = options.service;
      }

      if (options.reminder) {
        data.reminder = options.reminder;
      }

      if (options.type) {
        data.type = options.type;
      }
    }

    return this.request.send('/recovery_email/verify_code', 'POST', null, data);
  };

  /**
   * @method recoveryEmailStatus
   * @param {String} sessionToken sessionToken obtained from signIn
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.recoveryEmailStatus = function(sessionToken) {
    var self = this;
    required(sessionToken, 'sessionToken');

    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/recovery_email/status', 'GET', creds);
      });
  };

  /**
   * Re-sends a verification code to the account's recovery email address.
   *
   * @method recoveryEmailResendCode
   * @param {String} sessionToken sessionToken obtained from signIn
   * @param {Object} [options={}] Options
   *   @param {String} [options.email]
   *   Code will be resent to this email, only used for secondary email codes
   *   @param {String} [options.service]
   *   Opaque alphanumeric token to be included in verification links
   *   @param {String} [options.redirectTo]
   *   a URL that the client should be redirected to after handling the request
   *   @param {String} [options.resume]
   *   Opaque url-encoded string that will be included in the verification link
   *   as a querystring parameter, useful for continuing an OAuth flow for
   *   example.
   *   @param {String} [options.lang]
   *   set the language for the 'Accept-Language' header
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.recoveryEmailResendCode = function(sessionToken, options) {
    var self = this;
    var data = {};
    var requestOpts = {};

    required(sessionToken, 'sessionToken');

    if (options) {
      if (options.email) {
        data.email = options.email;
      }

      if (options.service) {
        data.service = options.service;
      }

      if (options.redirectTo) {
        data.redirectTo = options.redirectTo;
      }

      if (options.resume) {
        data.resume = options.resume;
      }

      if (options.lang) {
        requestOpts.headers = {
          'Accept-Language': options.lang
        };
      }
    }

    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/recovery_email/resend_code', 'POST', creds, data, requestOpts);
      });
  };

  /**
   * Used to ask the server to send a recovery code.
   * The API returns passwordForgotToken to the client.
   *
   * @method passwordForgotSendCode
   * @param {String} email
   * @param {Object} [options={}] Options
   *   @param {String} [options.service]
   *   Opaque alphanumeric token to be included in verification links
   *   @param {String} [options.redirectTo]
   *   a URL that the client should be redirected to after handling the request
   *   @param {String} [options.resume]
   *   Opaque url-encoded string that will be included in the verification link
   *   as a querystring parameter, useful for continuing an OAuth flow for
   *   example.
   *   @param {String} [options.lang]
   *   set the language for the 'Accept-Language' header
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.passwordForgotSendCode = function(email, options) {
    var data = {
      email: email
    };
    var requestOpts = {};

    required(email, 'email');

    if (options) {
      if (options.service) {
        data.service = options.service;
      }

      if (options.redirectTo) {
        data.redirectTo = options.redirectTo;
      }

      if (options.resume) {
        data.resume = options.resume;
      }

      if (options.lang) {
        requestOpts.headers = {
          'Accept-Language': options.lang
        };
      }

      if (options.metricsContext) {
        data.metricsContext = metricsContext.marshall(options.metricsContext);
      }
    }

    return this.request.send('/password/forgot/send_code', 'POST', null, data, requestOpts);
  };

  /**
   * Re-sends a verification code to the account's recovery email address.
   * HAWK-authenticated with the passwordForgotToken.
   *
   * @method passwordForgotResendCode
   * @param {String} email
   * @param {String} passwordForgotToken
   * @param {Object} [options={}] Options
   *   @param {String} [options.service]
   *   Opaque alphanumeric token to be included in verification links
   *   @param {String} [options.redirectTo]
   *   a URL that the client should be redirected to after handling the request
   *   @param {String} [options.resume]
   *   Opaque url-encoded string that will be included in the verification link
   *   as a querystring parameter, useful for continuing an OAuth flow for
   *   example.
   *   @param {String} [options.lang]
   *   set the language for the 'Accept-Language' header
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.passwordForgotResendCode = function(email, passwordForgotToken, options) {
    var self = this;
    var data = {
      email: email
    };
    var requestOpts = {};

    required(email, 'email');
    required(passwordForgotToken, 'passwordForgotToken');

    if (options) {
      if (options.service) {
        data.service = options.service;
      }

      if (options.redirectTo) {
        data.redirectTo = options.redirectTo;
      }

      if (options.resume) {
        data.resume = options.resume;
      }

      if (options.lang) {
        requestOpts.headers = {
          'Accept-Language': options.lang
        };
      }

      if (options.metricsContext) {
        data.metricsContext = metricsContext.marshall(options.metricsContext);
      }
    }

    return hawkCredentials(passwordForgotToken, 'passwordForgotToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/password/forgot/resend_code', 'POST', creds, data, requestOpts);
      });
  };

  /**
   * Submits the verification token to the server.
   * The API returns accountResetToken to the client.
   * HAWK-authenticated with the passwordForgotToken.
   *
   * @method passwordForgotVerifyCode
   * @param {String} code
   * @param {String} passwordForgotToken
   * @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.passwordForgotVerifyCode = function(code, passwordForgotToken, options) {
    var self = this;
    required(code, 'reset code');
    required(passwordForgotToken, 'passwordForgotToken');

    var data = {
      code: code
    };

    if (options && options.metricsContext) {
      data.metricsContext = metricsContext.marshall(options.metricsContext);
    }

    return hawkCredentials(passwordForgotToken, 'passwordForgotToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/password/forgot/verify_code', 'POST', creds, data);
      });
  };

  /**
   * Returns the status for the passwordForgotToken.
   * If the request returns a success response, the token has not yet been consumed.

   * @method passwordForgotStatus
   * @param {String} passwordForgotToken
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.passwordForgotStatus = function(passwordForgotToken) {
    var self = this;

    required(passwordForgotToken, 'passwordForgotToken');

    return hawkCredentials(passwordForgotToken, 'passwordForgotToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/password/forgot/status', 'GET', creds);
      });
  };

  /**
   * The API returns reset result to the client.
   * HAWK-authenticated with accountResetToken
   *
   * @method accountReset
   * @param {String} email
   * @param {String} newPassword
   * @param {String} accountResetToken
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.keys]
   *   If `true`, a new `keyFetchToken` is provisioned. `options.sessionToken`
   *   is required if `options.keys` is true.
   *   @param {Boolean} [options.sessionToken]
   *   If `true`, a new `sessionToken` is provisioned.
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.accountReset = function(email, newPassword, accountResetToken, options) {
    var self = this;
    var data = {};
    var unwrapBKey;

    options = options || {};

    if (options.sessionToken) {
      data.sessionToken = options.sessionToken;
    }

    if (options.metricsContext) {
      data.metricsContext = metricsContext.marshall(options.metricsContext);
    }

    required(email, 'email');
    required(newPassword, 'new password');
    required(accountResetToken, 'accountResetToken');

    if (options.keys) {
      required(options.sessionToken, 'sessionToken');
    }

    return credentials.setup(email, newPassword)
      .then(
        function (result) {
          if (options.keys) {
            unwrapBKey = sjcl.codec.hex.fromBits(result.unwrapBKey);
          }

          data.authPW = sjcl.codec.hex.fromBits(result.authPW);

          return hawkCredentials(accountResetToken, 'accountResetToken',  HKDF_SIZE);
        }
      ).then(
        function (creds) {
          var queryParams = '';
          if (options.keys) {
            queryParams = '?keys=true';
          }

          var endpoint = '/account/reset' + queryParams;
          return self.request.send(endpoint, 'POST', creds, data)
            .then(
              function(accountData) {
                if (options.keys && accountData.keyFetchToken) {
                  accountData.unwrapBKey = unwrapBKey;
                }

                return accountData;
              }
            );
        }
      );
  };

  /**
   * Get the base16 bundle of encrypted kA|wrapKb.
   *
   * @method accountKeys
   * @param {String} keyFetchToken
   * @param {String} oldUnwrapBKey
   * @return {Promise} A promise that will be fulfilled with JSON of {kA, kB}  of the key bundle
   */
  FxAccountClient.prototype.accountKeys = function(keyFetchToken, oldUnwrapBKey) {
    var self = this;

    required(keyFetchToken, 'keyFetchToken');
    required(oldUnwrapBKey, 'oldUnwrapBKey');

    return hawkCredentials(keyFetchToken, 'keyFetchToken',  3 * 32)
      .then(function(creds) {
        var bundleKey = sjcl.codec.hex.fromBits(creds.bundleKey);

        return self.request.send('/account/keys', 'GET', creds)
          .then(
            function(payload) {

              return credentials.unbundleKeyFetchResponse(bundleKey, payload.bundle);
            });
      })
      .then(function(keys) {
        return {
          kB: sjcl.codec.hex.fromBits(
            credentials.xor(
              sjcl.codec.hex.toBits(keys.wrapKB),
              sjcl.codec.hex.toBits(oldUnwrapBKey)
            )
          ),
          kA: keys.kA
        };
      });
  };

  /**
   * This deletes the account completely. All stored data is erased.
   *
   * @method accountDestroy
   * @param {String} email Email input
   * @param {String} password Password input
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.skipCaseError]
   *   If `true`, the request will skip the incorrect case error
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.accountDestroy = function(email, password, options) {
    var self = this;
    options = options || {};

    required(email, 'email');
    required(password, 'password');

    return credentials.setup(email, password)
      .then(
        function (result) {
          var data = {
            email: result.emailUTF8,
            authPW: sjcl.codec.hex.fromBits(result.authPW)
          };

          return self.request.send('/account/destroy', 'POST', null, data)
            .then(
              function(response) {
                return response;
              },
              function(error) {
                // if incorrect email case error
                if (error && error.email && error.errno === ERRORS.INCORRECT_EMAIL_CASE && !options.skipCaseError) {
                  options.skipCaseError = true;

                  return self.accountDestroy(error.email, password, options);
                } else {
                  throw error;
                }
              }
            );
        }
      );
  };

  /**
   * Gets the status of an account by uid.
   *
   * @method accountStatus
   * @param {String} uid User account id
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.accountStatus = function(uid) {
    required(uid, 'uid');

    return this.request.send('/account/status?uid=' + uid, 'GET');
  };

  /**
   * Gets the status of an account by email.
   *
   * @method accountStatusByEmail
   * @param {String} email User account email
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.accountStatusByEmail = function(email) {
    required(email, 'email');

    return this.request.send('/account/status', 'POST', null, {email: email});
  };

  /**
   * Destroys this session, by invalidating the sessionToken.
   *
   * @method sessionDestroy
   * @param {String} sessionToken User session token
   * @param {Object} [options={}] Options
   *   @param {String} [options.customSessionToken] Override which session token to destroy for this same user
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.sessionDestroy = function(sessionToken, options) {
    var self = this;
    var data = {};
    options = options || {};

    if (options.customSessionToken) {
      data.customSessionToken = options.customSessionToken;
    }

    required(sessionToken, 'sessionToken');

    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/session/destroy', 'POST', creds, data);
      });
  };

  /**
   * Responds successfully if the session status is valid, requires the sessionToken.
   *
   * @method sessionStatus
   * @param {String} sessionToken User session token
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.sessionStatus = function(sessionToken) {
    var self = this;

    required(sessionToken, 'sessionToken');

    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/session/status', 'GET', creds);
      });
  };

  /**
   * Sign a BrowserID public key
   *
   * @method certificateSign
   * @param {String} sessionToken User session token
   * @param {Object} publicKey The key to sign
   * @param {int} duration Time interval from now when the certificate will expire in milliseconds
   * @param {Object} [options={}] Options
   *   @param {String} [service=''] The requesting service, sent via the query string
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.certificateSign = function(sessionToken, publicKey, duration, options) {
    var self = this;
    var data = {
      publicKey: publicKey,
      duration: duration
    };

    required(sessionToken, 'sessionToken');
    required(publicKey, 'publicKey');
    required(duration, 'duration');

    options = options || {};

    var queryString = '';
    if (options.service) {
      queryString = '?service=' + encodeURIComponent(options.service);
    }

    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return self.request.send('/certificate/sign' + queryString, 'POST', creds, data);
      });
  };

  /**
   * Change the password from one known value to another.
   *
   * @method passwordChange
   * @param {String} email
   * @param {String} oldPassword
   * @param {String} newPassword
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.keys]
   *   If `true`, calls the API with `?keys=true` to get a new keyFetchToken
   *   @param {String} [options.sessionToken]
   *   If a `sessionToken` is passed, a new sessionToken will be returned
   *   with the same `verified` status as the existing sessionToken.
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.passwordChange = function(email, oldPassword, newPassword, options) {
    var self = this;
    options = options || {};

    required(email, 'email');
    required(oldPassword, 'old password');
    required(newPassword, 'new password');

    return self._passwordChangeStart(email, oldPassword)
      .then(function (credentials) {

        var oldCreds = credentials;

        return self._passwordChangeKeys(oldCreds)
          .then(function (keys) {

            return self._passwordChangeFinish(email, newPassword, oldCreds, keys, options);
          });
      });

  };

  /**
   * First step to change the password.
   *
   * @method passwordChangeStart
   * @private
   * @param {String} email
   * @param {String} oldPassword
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.skipCaseError]
   *   If `true`, the request will skip the incorrect case error
   * @return {Promise} A promise that will be fulfilled with JSON of `xhr.responseText` and `oldUnwrapBKey`
   */
  FxAccountClient.prototype._passwordChangeStart = function(email, oldPassword, options) {
    var self = this;
    options = options || {};

    required(email, 'email');
    required(oldPassword, 'old password');

    return credentials.setup(email, oldPassword)
      .then(function (oldCreds) {
        var data = {
          email: oldCreds.emailUTF8,
          oldAuthPW: sjcl.codec.hex.fromBits(oldCreds.authPW)
        };

        return self.request.send('/password/change/start', 'POST', null, data)
          .then(
            function(passwordData) {
              passwordData.oldUnwrapBKey = sjcl.codec.hex.fromBits(oldCreds.unwrapBKey);
              return passwordData;
            },
            function(error) {
              // if incorrect email case error
              if (error && error.email && error.errno === ERRORS.INCORRECT_EMAIL_CASE && !options.skipCaseError) {
                options.skipCaseError = true;

                return self._passwordChangeStart(error.email, oldPassword, options);
              } else {
                throw error;
              }
            }
          );
      });
  };

  function checkCreds(creds) {
    required(creds, 'credentials');
    required(creds.oldUnwrapBKey, 'credentials.oldUnwrapBKey');
    required(creds.keyFetchToken, 'credentials.keyFetchToken');
    required(creds.passwordChangeToken, 'credentials.passwordChangeToken');
  }

  /**
   * Second step to change the password.
   *
   * @method _passwordChangeKeys
   * @private
   * @param {Object} oldCreds This object should consists of `oldUnwrapBKey`, `keyFetchToken` and `passwordChangeToken`.
   * @return {Promise} A promise that will be fulfilled with JSON of `xhr.responseText`
   */
  FxAccountClient.prototype._passwordChangeKeys = function(oldCreds) {
    checkCreds(oldCreds);

    return this.accountKeys(oldCreds.keyFetchToken, oldCreds.oldUnwrapBKey);
  };

  /**
   * Third step to change the password.
   *
   * @method _passwordChangeFinish
   * @private
   * @param {String} email
   * @param {String} newPassword
   * @param {Object} oldCreds This object should consists of `oldUnwrapBKey`, `keyFetchToken` and `passwordChangeToken`.
   * @param {Object} keys This object should contain the unbundled keys
   * @param {Object} [options={}] Options
   *   @param {Boolean} [options.keys]
   *   If `true`, calls the API with `?keys=true` to get the keyFetchToken
   *   @param {String} [options.sessionToken]
   *   If a `sessionToken` is passed, a new sessionToken will be returned
   *   with the same `verified` status as the existing sessionToken.
   * @return {Promise} A promise that will be fulfilled with JSON of `xhr.responseText`
   */
  FxAccountClient.prototype._passwordChangeFinish = function(email, newPassword, oldCreds, keys, options) {
    options = options || {};
    var self = this;

    required(email, 'email');
    required(newPassword, 'new password');
    checkCreds(oldCreds);
    required(keys, 'keys');
    required(keys.kB, 'keys.kB');

    var defers = [];
    defers.push(credentials.setup(email, newPassword));
    defers.push(hawkCredentials(oldCreds.passwordChangeToken, 'passwordChangeToken',  HKDF_SIZE));

    if (options.sessionToken) {
      // Unbundle session data to get session id
      defers.push(hawkCredentials(options.sessionToken, 'sessionToken',  HKDF_SIZE));
    }

    return P.all(defers)
      .spread(function (newCreds, hawkCreds, sessionData) {
        var newWrapKb = sjcl.codec.hex.fromBits(
          credentials.xor(
            sjcl.codec.hex.toBits(keys.kB),
            newCreds.unwrapBKey
          )
        );

        var queryParams = '';
        if (options.keys) {
          queryParams = '?keys=true';
        }

        var sessionTokenId;
        if (sessionData && sessionData.id) {
          sessionTokenId = sessionData.id;
        }

        return self.request.send('/password/change/finish' + queryParams, 'POST', hawkCreds, {
          wrapKb: newWrapKb,
          authPW: sjcl.codec.hex.fromBits(newCreds.authPW),
          sessionToken: sessionTokenId
        })
        .then(function (accountData) {
          if (options.keys && accountData.keyFetchToken) {
            accountData.unwrapBKey = sjcl.codec.hex.fromBits(newCreds.unwrapBKey);
          }
          return accountData;
        });
      });
  };

  /**
   * Get 32 bytes of random data. This should be combined with locally-sourced entropy when creating salts, etc.
   *
   * @method getRandomBytes
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.getRandomBytes = function() {

    return this.request.send('/get_random_bytes', 'POST');
  };

  /**
   * Add a new device
   *
   * @method deviceRegister
   * @param {String} sessionToken User session token
   * @param {String} deviceName Name of device
   * @param {String} deviceType Type of device (mobile|desktop)
   * @param {Object} [options={}] Options
   *   @param {string} [options.deviceCallback] Device's push endpoint.
   *   @param {string} [options.devicePublicKey] Public key used to encrypt push messages.
   *   @param {string} [options.deviceAuthKey] Authentication secret used to encrypt push messages.
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.deviceRegister = function (sessionToken, deviceName, deviceType, options) {
    options = options || {};

    required(sessionToken, 'sessionToken');
    required(deviceName, 'deviceName');
    required(deviceType, 'deviceType');

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        var data = {
          name: deviceName,
          type: deviceType
        };

        if (options.deviceCallback) {
          data.pushCallback = options.deviceCallback;
        }

        if (options.devicePublicKey && options.deviceAuthKey) {
          data.pushPublicKey = options.devicePublicKey;
          data.pushAuthKey = options.deviceAuthKey;
        }

        return request.send('/account/device', 'POST', creds, data);
      });
  };

  /**
   * Update the name of an existing device
   *
   * @method deviceUpdate
   * @param {String} sessionToken User session token
   * @param {String} deviceId User-unique identifier of device
   * @param {String} deviceName Name of device
   * @param {Object} [options={}] Options
   *   @param {string} [options.deviceCallback] Device's push endpoint.
   *   @param {string} [options.devicePublicKey] Public key used to encrypt push messages.
   *   @param {string} [options.deviceAuthKey] Authentication secret used to encrypt push messages.
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.deviceUpdate = function (sessionToken, deviceId, deviceName, options) {
    options = options || {};

    required(sessionToken, 'sessionToken');
    required(deviceId, 'deviceId');
    required(deviceName, 'deviceName');

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        var data = {
          id: deviceId,
          name: deviceName
        };

        if (options.deviceCallback) {
          data.pushCallback = options.deviceCallback;
        }

        if (options.devicePublicKey && options.deviceAuthKey) {
          data.pushPublicKey = options.devicePublicKey;
          data.pushAuthKey = options.deviceAuthKey;
        }

        return request.send('/account/device', 'POST', creds, data);
      });
  };

  /**
   * Unregister an existing device
   *
   * @method deviceDestroy
   * @param {String} sessionToken Session token obtained from signIn
   * @param {String} deviceId User-unique identifier of device
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.deviceDestroy = function (sessionToken, deviceId) {
    required(sessionToken, 'sessionToken');
    required(deviceId, 'deviceId');

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        var data = {
          id: deviceId
        };

        return request.send('/account/device/destroy', 'POST', creds, data);
      });
  };

  /**
   * Get a list of all devices for a user
   *
   * @method deviceList
   * @param {String} sessionToken sessionToken obtained from signIn
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.deviceList = function (sessionToken) {
    required(sessionToken, 'sessionToken');

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return request.send('/account/devices', 'GET', creds);
      });
  };

  /**
   * Get a list of user's sessions
   *
   * @method sessions
   * @param {String} sessionToken sessionToken obtained from signIn
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.sessions = function (sessionToken) {
    required(sessionToken, 'sessionToken');

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return request.send('/account/sessions', 'GET', creds);
      });
  };

  /**
   * Send an unblock code
   *
   * @method sendUnblockCode
   * @param {String} email email where to send the login authorization code
   * @param {Object} [options={}] Options
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.sendUnblockCode = function (email, options) {
    required(email, 'email');

    var data = {
      email: email
    };

    if (options && options.metricsContext) {
      data.metricsContext = metricsContext.marshall(options.metricsContext);
    }

    return this.request.send('/account/login/send_unblock_code', 'POST', null, data);
  };

  /**
   * Reject a login unblock code. Code will be deleted from the server
   * and will not be able to be used again.
   *
   * @method rejectLoginAuthorizationCode
   * @param {String} uid Account ID
   * @param {String} unblockCode unblock code
   * @return {Promise} A promise that will be fulfilled with JSON `xhr.responseText` of the request
   */
  FxAccountClient.prototype.rejectUnblockCode = function (uid, unblockCode) {
    required(uid, 'uid');
    required(unblockCode, 'unblockCode');

    var data = {
      uid: uid,
      unblockCode: unblockCode
    };

    return this.request.send('/account/login/reject_unblock_code', 'POST', null, data);
  };

  /**
   * Send an sms.
   *
   * @method sendSms
   * @param {String} sessionToken SessionToken obtained from signIn
   * @param {String} phoneNumber Phone number sms will be sent to
   * @param {String} messageId Corresponding message id that will be sent
   * @param {Object} [options={}] Options
   *   @param {String} [options.lang] lang Language that sms will be sent in
   *   @param {Object} [options.metricsContext={}] Metrics context metadata
   *     @param {String} options.metricsContext.flowId identifier for the current event flow
   *     @param {Number} options.metricsContext.flowBeginTime flow.begin event time
   */
  FxAccountClient.prototype.sendSms = function (sessionToken, phoneNumber, messageId, options) {

    required(sessionToken, 'sessionToken');
    required(phoneNumber, 'phoneNumber');
    required(messageId, 'messageId');

    var data = {
      phoneNumber: phoneNumber,
      messageId: messageId
    };
    var requestOpts = {};

    if (options) {
      if (options.lang) {
        requestOpts.headers = {
          'Accept-Language': options.lang
        };
      }

      if (options.metricsContext) {
        data.metricsContext = metricsContext.marshall(options.metricsContext);
      }
    }

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return request.send('/sms', 'POST', creds, data, requestOpts);
      });
  };

  /**
   * Get SMS status for the current user.
   *
   * @method smsStatus
   * @param {String} sessionToken SessionToken obtained from signIn
   * @param {Object} [options={}] Options
   *   @param {String} [options.country] country Country to force for testing.
   */
  FxAccountClient.prototype.smsStatus = function (sessionToken, options) {
    required(sessionToken, 'sessionToken');

    options = options || {};

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function (creds) {
        var url = '/sms/status';
        if (options.country) {
          url += '?country=' + encodeURIComponent(options.country);
        }
        return request.send(url, 'GET', creds);
      });
  };

  /**
   * Get the recovery emails associated with the signed in account.
   *
   * @method recoveryEmails
   * @param {String} sessionToken SessionToken obtained from signIn
   */
  FxAccountClient.prototype.recoveryEmails = function (sessionToken) {
    required(sessionToken, 'sessionToken');

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return request.send('/recovery_emails', 'GET', creds);
      });
  };

  /**
   * Create a new recovery email for the signed in account.
   *
   * @method recoveryEmailCreate
   * @param {String} sessionToken SessionToken obtained from signIn
   * @param {String} email new email to be added
   */
  FxAccountClient.prototype.recoveryEmailCreate = function (sessionToken, email) {
    required(sessionToken, 'sessionToken');
    required(sessionToken, 'email');

    var data = {
      email: email
    };

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return request.send('/recovery_email', 'POST', creds, data);
      });
  };

  /**
   * Remove the recovery email for the signed in account.
   *
   * @method recoveryEmailDestroy
   * @param {String} sessionToken SessionToken obtained from signIn
   * @param {String} email email to be removed
   */
  FxAccountClient.prototype.recoveryEmailDestroy = function (sessionToken, email) {
    required(sessionToken, 'sessionToken');
    required(sessionToken, 'email');

    var data = {
      email: email
    };

    var request = this.request;
    return hawkCredentials(sessionToken, 'sessionToken',  HKDF_SIZE)
      .then(function(creds) {
        return request.send('/recovery_email/destroy', 'POST', creds, data);
      });
  };

  /**
   * Check for a required argument. Exposed for unit testing.
   *
   * @param {Value} val - value to check
   * @param {String} name - name of value
   * @throws {Error} if argument is falsey, or an empty object
   */
  FxAccountClient.prototype._required = required;

  return FxAccountClient;
});

    //The modules for your project will be inlined above
    //this snippet. Ask almond to synchronously require the
    //module value for 'main' here and return it as the
    //value to use for the public API for the built file.
    return requirejs('client/FxAccountClient');
}));
console.log('hi');