var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/@immediately-run/platform-constants/dist/appRoot.js
var require_appRoot = __commonJS({
  "node_modules/@immediately-run/platform-constants/dist/appRoot.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.APP_ROOT = void 0;
    exports.underAppRoot = underAppRoot2;
    exports.stripAppRoot = stripAppRoot2;
    exports.metadataKeyFor = metadataKeyFor2;
    exports.APP_ROOT = "/app";
    function underAppRoot2(repoRelativePath) {
      const suffix = repoRelativePath.startsWith("/") ? repoRelativePath : `/${repoRelativePath}`;
      return `${exports.APP_ROOT}${suffix}`;
    }
    function stripAppRoot2(path) {
      if (path === exports.APP_ROOT)
        return "/";
      return path.startsWith(`${exports.APP_ROOT}/`) ? path.slice(exports.APP_ROOT.length) : path;
    }
    function metadataKeyFor2(repoRelativePath) {
      return underAppRoot2(repoRelativePath);
    }
  }
});

// node_modules/@immediately-run/platform-constants/dist/frontmatter.js
var require_frontmatter = __commonJS({
  "node_modules/@immediately-run/platform-constants/dist/frontmatter.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isFrontmatterEnvelope = isFrontmatterEnvelope2;
    exports.isJsonSerializable = isJsonSerializable2;
    function isFrontmatterEnvelope2(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    function isJsonSerializable2(value, seen = /* @__PURE__ */ new Set()) {
      if (value === null)
        return true;
      switch (typeof value) {
        case "string":
        case "boolean":
          return true;
        case "number":
          return Number.isFinite(value);
        case "object":
          break;
        default:
          return false;
      }
      if (seen.has(value))
        return false;
      if (!Array.isArray(value)) {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null)
          return false;
      }
      seen.add(value);
      const ok = Array.isArray(value) ? value.every((v) => isJsonSerializable2(v, seen)) : Object.values(value).every((v) => isJsonSerializable2(v, seen));
      seen.delete(value);
      return ok;
    }
  }
});

// node_modules/@immediately-run/platform-constants/dist/mdxMetadata.js
var require_mdxMetadata = __commonJS({
  "node_modules/@immediately-run/platform-constants/dist/mdxMetadata.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MDX_METADATA_SCHEMA_VERSION = exports.MDX_METADATA_SIDECAR_PATH = void 0;
    exports.validateMdxMetadataSidecar = validateMdxMetadataSidecar2;
    exports.parseMdxMetadataSidecar = parseMdxMetadataSidecar2;
    var index_1 = require_dist();
    exports.MDX_METADATA_SIDECAR_PATH = `${index_1.ARTIFACTS_DIR}/mdx-metadata.json`;
    exports.MDX_METADATA_SCHEMA_VERSION = 1;
    var isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
    function validateMdxMetadataSidecar2(raw) {
      if (!isPlainObject(raw))
        return { ok: false, reason: "not-an-object" };
      if (raw.schemaVersion !== exports.MDX_METADATA_SCHEMA_VERSION) {
        return { ok: false, reason: "schema-version" };
      }
      if (!isPlainObject(raw.files))
        return { ok: false, reason: "files-not-an-object" };
      const files = {};
      const rejected = [];
      for (const [path, value] of Object.entries(raw.files)) {
        if (!isPlainObject(value)) {
          rejected.push({ path, reason: "entry-not-an-object" });
          continue;
        }
        if (typeof value.srcSha !== "string" || value.srcSha.length === 0) {
          rejected.push({ path, reason: "entry-src-sha" });
          continue;
        }
        if (!isPlainObject(value.frontmatter)) {
          rejected.push({ path, reason: "entry-frontmatter" });
          continue;
        }
        if (Object.keys(value.frontmatter).length === 0) {
          rejected.push({ path, reason: "entry-frontmatter-empty" });
          continue;
        }
        files[path] = {
          srcSha: value.srcSha,
          frontmatter: value.frontmatter
        };
      }
      return {
        ok: true,
        sidecar: { schemaVersion: exports.MDX_METADATA_SCHEMA_VERSION, files },
        rejected
      };
    }
    function parseMdxMetadataSidecar2(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, reason: "not-an-object" };
      }
      return validateMdxMetadataSidecar2(parsed);
    }
  }
});

// node_modules/@immediately-run/platform-constants/dist/index.js
var require_dist = __commonJS({
  "node_modules/@immediately-run/platform-constants/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.parseMdxMetadataSidecar = exports.validateMdxMetadataSidecar = exports.MDX_METADATA_SCHEMA_VERSION = exports.MDX_METADATA_SIDECAR_PATH = exports.isJsonSerializable = exports.isFrontmatterEnvelope = exports.metadataKeyFor = exports.stripAppRoot = exports.underAppRoot = exports.APP_ROOT = exports.PACKAGES_DIR = exports.ARTIFACTS_DIR = exports.CONTRIBUTE_MANIFEST_PATH = exports.SIDECAR_PREFIX = exports.SIDECAR_DIR = void 0;
    exports.isUnderSidecar = isUnderSidecar2;
    exports.SIDECAR_DIR = ".immediately.run";
    exports.SIDECAR_PREFIX = `${exports.SIDECAR_DIR}/`;
    exports.CONTRIBUTE_MANIFEST_PATH = `${exports.SIDECAR_DIR}/contribute-manifest.json`;
    exports.ARTIFACTS_DIR = `${exports.SIDECAR_DIR}/artifacts`;
    exports.PACKAGES_DIR = `${exports.SIDECAR_DIR}/packages`;
    function isUnderSidecar2(path) {
      const rel = path.replace(/^\.?\//, "");
      return rel === exports.SIDECAR_DIR || rel.startsWith(exports.SIDECAR_PREFIX);
    }
    var appRoot_1 = require_appRoot();
    Object.defineProperty(exports, "APP_ROOT", { enumerable: true, get: function() {
      return appRoot_1.APP_ROOT;
    } });
    Object.defineProperty(exports, "underAppRoot", { enumerable: true, get: function() {
      return appRoot_1.underAppRoot;
    } });
    Object.defineProperty(exports, "stripAppRoot", { enumerable: true, get: function() {
      return appRoot_1.stripAppRoot;
    } });
    Object.defineProperty(exports, "metadataKeyFor", { enumerable: true, get: function() {
      return appRoot_1.metadataKeyFor;
    } });
    var frontmatter_1 = require_frontmatter();
    Object.defineProperty(exports, "isFrontmatterEnvelope", { enumerable: true, get: function() {
      return frontmatter_1.isFrontmatterEnvelope;
    } });
    Object.defineProperty(exports, "isJsonSerializable", { enumerable: true, get: function() {
      return frontmatter_1.isJsonSerializable;
    } });
    var mdxMetadata_1 = require_mdxMetadata();
    Object.defineProperty(exports, "MDX_METADATA_SIDECAR_PATH", { enumerable: true, get: function() {
      return mdxMetadata_1.MDX_METADATA_SIDECAR_PATH;
    } });
    Object.defineProperty(exports, "MDX_METADATA_SCHEMA_VERSION", { enumerable: true, get: function() {
      return mdxMetadata_1.MDX_METADATA_SCHEMA_VERSION;
    } });
    Object.defineProperty(exports, "validateMdxMetadataSidecar", { enumerable: true, get: function() {
      return mdxMetadata_1.validateMdxMetadataSidecar;
    } });
    Object.defineProperty(exports, "parseMdxMetadataSidecar", { enumerable: true, get: function() {
      return mdxMetadata_1.parseMdxMetadataSidecar;
    } });
  }
});

// inline-platform-constants.js
var __ns = __toESM(require_dist());
var __m = __ns.default ?? __ns;
var SIDECAR_DIR = __m["SIDECAR_DIR"];
var SIDECAR_PREFIX = __m["SIDECAR_PREFIX"];
var CONTRIBUTE_MANIFEST_PATH = __m["CONTRIBUTE_MANIFEST_PATH"];
var ARTIFACTS_DIR = __m["ARTIFACTS_DIR"];
var PACKAGES_DIR = __m["PACKAGES_DIR"];
var APP_ROOT = __m["APP_ROOT"];
var underAppRoot = __m["underAppRoot"];
var stripAppRoot = __m["stripAppRoot"];
var metadataKeyFor = __m["metadataKeyFor"];
var isFrontmatterEnvelope = __m["isFrontmatterEnvelope"];
var isJsonSerializable = __m["isJsonSerializable"];
var MDX_METADATA_SIDECAR_PATH = __m["MDX_METADATA_SIDECAR_PATH"];
var MDX_METADATA_SCHEMA_VERSION = __m["MDX_METADATA_SCHEMA_VERSION"];
var validateMdxMetadataSidecar = __m["validateMdxMetadataSidecar"];
var parseMdxMetadataSidecar = __m["parseMdxMetadataSidecar"];
var isUnderSidecar = __m["isUnderSidecar"];
export {
  APP_ROOT,
  ARTIFACTS_DIR,
  CONTRIBUTE_MANIFEST_PATH,
  MDX_METADATA_SCHEMA_VERSION,
  MDX_METADATA_SIDECAR_PATH,
  PACKAGES_DIR,
  SIDECAR_DIR,
  SIDECAR_PREFIX,
  isFrontmatterEnvelope,
  isJsonSerializable,
  isUnderSidecar,
  metadataKeyFor,
  parseMdxMetadataSidecar,
  stripAppRoot,
  underAppRoot,
  validateMdxMetadataSidecar
};
