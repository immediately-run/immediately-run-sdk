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

// node_modules/@immediately-run/sandbox-protocol/dist/sdk.js
var require_sdk = __commonJS({
  "node_modules/@immediately-run/sandbox-protocol/dist/sdk.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.REQUEST_SECRETS_METADATA = exports.REQUEST_MOUNTS = exports.REQUEST_LLM_PROVIDER = exports.REQUEST_INVITATIONS = exports.REQUEST_HOST_ATTENTION = exports.REQUEST_HANDSHAKE = exports.REQUEST_FORM_FACTOR = exports.REQUEST_EDITOR_CONTEXT = exports.REQUEST_DIAGNOSTICS = exports.REQUEST_DEBUG_ENABLED = exports.REQUEST_CHROME_STATE = exports.REQUEST_AUTH_STATE = exports.REQUEST_API_CATALOG = exports.REGION_MESSAGE = exports.PROTOCOL_VCS = exports.PROTOCOL_THEME = exports.PROTOCOL_TASK = exports.PROTOCOL_SPACES = exports.PROTOCOL_SETTINGS = exports.PROTOCOL_SECRETS = exports.PROTOCOL_LLM = exports.PROTOCOL_LAUNCH = exports.PROTOCOL_IPC = exports.PROTOCOL_FETCH = exports.PROTOCOL_EDITOR = exports.PROTOCOL_DND = exports.PROTOCOL_CONTRIBUTE = exports.PROTOCOL_ANALYTICS = exports.MOUNT_REMOVE = exports.MOUNT_ADD = exports.METADATA_UPDATE = exports.LLM_PROVIDER = exports.LAUNCH_ENDED = exports.LAUNCH_DISMISS = exports.INVITATIONS = exports.HOST_ATTENTION = exports.FS_CHANGE = exports.FORM_FACTOR = exports.EDITOR_CONTEXT = exports.DROPPED_ITEM = exports.DND_CANCEL = exports.DIAGNOSTICS = exports.DEBUG_QUERY_RESULT = exports.DEBUG_QUERY = exports.DEBUG_LOG = exports.DEBUG_ENABLED = exports.COMPILE = exports.CHROME_STATE = exports.AUTH_STATE = exports.API_CATALOG = void 0;
    exports.WIRE_NAMES = exports.VCS_STATE = exports.URLCHANGE = exports.THEME = exports.TASK_INPUT = exports.TASK_COMPLETE = exports.TASK_CANCEL = exports.SESSION_MOUNTS = exports.SECRETS_METADATA = exports.SDK_HANDSHAKE = exports.REQUEST_VCS_STATE = exports.REQUEST_THEME = exports.REQUEST_SESSION_MOUNTS = void 0;
    exports.API_CATALOG = "api-catalog";
    exports.AUTH_STATE = "auth-state";
    exports.CHROME_STATE = "chrome-state";
    exports.COMPILE = "compile";
    exports.DEBUG_ENABLED = "debug-enabled";
    exports.DEBUG_LOG = "debug-log";
    exports.DEBUG_QUERY = "debug-query";
    exports.DEBUG_QUERY_RESULT = "debug-query-result";
    exports.DIAGNOSTICS = "diagnostics";
    exports.DND_CANCEL = "dnd-cancel";
    exports.DROPPED_ITEM = "dropped-item";
    exports.EDITOR_CONTEXT = "editor-context";
    exports.FORM_FACTOR = "form-factor";
    exports.FS_CHANGE = "fs-change";
    exports.HOST_ATTENTION = "host-attention";
    exports.INVITATIONS = "invitations";
    exports.LAUNCH_DISMISS = "launch-dismiss";
    exports.LAUNCH_ENDED = "launch-ended";
    exports.LLM_PROVIDER = "llm-provider";
    exports.METADATA_UPDATE = "metadata-update";
    exports.MOUNT_ADD = "mount-add";
    exports.MOUNT_REMOVE = "mount-remove";
    exports.PROTOCOL_ANALYTICS = "protocol-analytics";
    exports.PROTOCOL_CONTRIBUTE = "protocol-contribute";
    exports.PROTOCOL_DND = "protocol-dnd";
    exports.PROTOCOL_EDITOR = "protocol-editor";
    exports.PROTOCOL_FETCH = "protocol-fetch";
    exports.PROTOCOL_IPC = "protocol-ipc";
    exports.PROTOCOL_LAUNCH = "protocol-launch";
    exports.PROTOCOL_LLM = "protocol-llm";
    exports.PROTOCOL_SECRETS = "protocol-secrets";
    exports.PROTOCOL_SETTINGS = "protocol-settings";
    exports.PROTOCOL_SPACES = "protocol-spaces";
    exports.PROTOCOL_TASK = "protocol-task";
    exports.PROTOCOL_THEME = "protocol-theme";
    exports.PROTOCOL_VCS = "protocol-vcs";
    exports.REGION_MESSAGE = "region-message";
    exports.REQUEST_API_CATALOG = "request-api-catalog";
    exports.REQUEST_AUTH_STATE = "request-auth-state";
    exports.REQUEST_CHROME_STATE = "request-chrome-state";
    exports.REQUEST_DEBUG_ENABLED = "request-debug-enabled";
    exports.REQUEST_DIAGNOSTICS = "request-diagnostics";
    exports.REQUEST_EDITOR_CONTEXT = "request-editor-context";
    exports.REQUEST_FORM_FACTOR = "request-form-factor";
    exports.REQUEST_HANDSHAKE = "request-handshake";
    exports.REQUEST_HOST_ATTENTION = "request-host-attention";
    exports.REQUEST_INVITATIONS = "request-invitations";
    exports.REQUEST_LLM_PROVIDER = "request-llm-provider";
    exports.REQUEST_MOUNTS = "request-mounts";
    exports.REQUEST_SECRETS_METADATA = "request-secrets-metadata";
    exports.REQUEST_SESSION_MOUNTS = "request-session-mounts";
    exports.REQUEST_THEME = "request-theme";
    exports.REQUEST_VCS_STATE = "request-vcs-state";
    exports.SDK_HANDSHAKE = "sdk-handshake";
    exports.SECRETS_METADATA = "secrets-metadata";
    exports.SESSION_MOUNTS = "session-mounts";
    exports.TASK_CANCEL = "task-cancel";
    exports.TASK_COMPLETE = "task-complete";
    exports.TASK_INPUT = "task-input";
    exports.THEME = "theme";
    exports.URLCHANGE = "urlchange";
    exports.VCS_STATE = "vcs-state";
    exports.WIRE_NAMES = {
      API_CATALOG: exports.API_CATALOG,
      AUTH_STATE: exports.AUTH_STATE,
      CHROME_STATE: exports.CHROME_STATE,
      COMPILE: exports.COMPILE,
      DEBUG_ENABLED: exports.DEBUG_ENABLED,
      DEBUG_LOG: exports.DEBUG_LOG,
      DEBUG_QUERY: exports.DEBUG_QUERY,
      DEBUG_QUERY_RESULT: exports.DEBUG_QUERY_RESULT,
      DIAGNOSTICS: exports.DIAGNOSTICS,
      DND_CANCEL: exports.DND_CANCEL,
      DROPPED_ITEM: exports.DROPPED_ITEM,
      EDITOR_CONTEXT: exports.EDITOR_CONTEXT,
      FORM_FACTOR: exports.FORM_FACTOR,
      FS_CHANGE: exports.FS_CHANGE,
      HOST_ATTENTION: exports.HOST_ATTENTION,
      INVITATIONS: exports.INVITATIONS,
      LAUNCH_DISMISS: exports.LAUNCH_DISMISS,
      LAUNCH_ENDED: exports.LAUNCH_ENDED,
      LLM_PROVIDER: exports.LLM_PROVIDER,
      METADATA_UPDATE: exports.METADATA_UPDATE,
      MOUNT_ADD: exports.MOUNT_ADD,
      MOUNT_REMOVE: exports.MOUNT_REMOVE,
      PROTOCOL_ANALYTICS: exports.PROTOCOL_ANALYTICS,
      PROTOCOL_CONTRIBUTE: exports.PROTOCOL_CONTRIBUTE,
      PROTOCOL_DND: exports.PROTOCOL_DND,
      PROTOCOL_EDITOR: exports.PROTOCOL_EDITOR,
      PROTOCOL_FETCH: exports.PROTOCOL_FETCH,
      PROTOCOL_IPC: exports.PROTOCOL_IPC,
      PROTOCOL_LAUNCH: exports.PROTOCOL_LAUNCH,
      PROTOCOL_LLM: exports.PROTOCOL_LLM,
      PROTOCOL_SECRETS: exports.PROTOCOL_SECRETS,
      PROTOCOL_SETTINGS: exports.PROTOCOL_SETTINGS,
      PROTOCOL_SPACES: exports.PROTOCOL_SPACES,
      PROTOCOL_TASK: exports.PROTOCOL_TASK,
      PROTOCOL_THEME: exports.PROTOCOL_THEME,
      PROTOCOL_VCS: exports.PROTOCOL_VCS,
      REGION_MESSAGE: exports.REGION_MESSAGE,
      REQUEST_API_CATALOG: exports.REQUEST_API_CATALOG,
      REQUEST_AUTH_STATE: exports.REQUEST_AUTH_STATE,
      REQUEST_CHROME_STATE: exports.REQUEST_CHROME_STATE,
      REQUEST_DEBUG_ENABLED: exports.REQUEST_DEBUG_ENABLED,
      REQUEST_DIAGNOSTICS: exports.REQUEST_DIAGNOSTICS,
      REQUEST_EDITOR_CONTEXT: exports.REQUEST_EDITOR_CONTEXT,
      REQUEST_FORM_FACTOR: exports.REQUEST_FORM_FACTOR,
      REQUEST_HANDSHAKE: exports.REQUEST_HANDSHAKE,
      REQUEST_HOST_ATTENTION: exports.REQUEST_HOST_ATTENTION,
      REQUEST_INVITATIONS: exports.REQUEST_INVITATIONS,
      REQUEST_LLM_PROVIDER: exports.REQUEST_LLM_PROVIDER,
      REQUEST_MOUNTS: exports.REQUEST_MOUNTS,
      REQUEST_SECRETS_METADATA: exports.REQUEST_SECRETS_METADATA,
      REQUEST_SESSION_MOUNTS: exports.REQUEST_SESSION_MOUNTS,
      REQUEST_THEME: exports.REQUEST_THEME,
      REQUEST_VCS_STATE: exports.REQUEST_VCS_STATE,
      SDK_HANDSHAKE: exports.SDK_HANDSHAKE,
      SECRETS_METADATA: exports.SECRETS_METADATA,
      SESSION_MOUNTS: exports.SESSION_MOUNTS,
      TASK_CANCEL: exports.TASK_CANCEL,
      TASK_COMPLETE: exports.TASK_COMPLETE,
      TASK_INPUT: exports.TASK_INPUT,
      THEME: exports.THEME,
      URLCHANGE: exports.URLCHANGE,
      VCS_STATE: exports.VCS_STATE
    };
  }
});

// inline-sandbox-protocol-sdk.js
var __ns = __toESM(require_sdk());
var __m = __ns.default ?? __ns;
var API_CATALOG = __m["API_CATALOG"];
var AUTH_STATE = __m["AUTH_STATE"];
var CHROME_STATE = __m["CHROME_STATE"];
var COMPILE = __m["COMPILE"];
var DEBUG_ENABLED = __m["DEBUG_ENABLED"];
var DEBUG_LOG = __m["DEBUG_LOG"];
var DEBUG_QUERY = __m["DEBUG_QUERY"];
var DEBUG_QUERY_RESULT = __m["DEBUG_QUERY_RESULT"];
var DIAGNOSTICS = __m["DIAGNOSTICS"];
var DND_CANCEL = __m["DND_CANCEL"];
var DROPPED_ITEM = __m["DROPPED_ITEM"];
var EDITOR_CONTEXT = __m["EDITOR_CONTEXT"];
var FORM_FACTOR = __m["FORM_FACTOR"];
var FS_CHANGE = __m["FS_CHANGE"];
var HOST_ATTENTION = __m["HOST_ATTENTION"];
var INVITATIONS = __m["INVITATIONS"];
var LAUNCH_DISMISS = __m["LAUNCH_DISMISS"];
var LAUNCH_ENDED = __m["LAUNCH_ENDED"];
var LLM_PROVIDER = __m["LLM_PROVIDER"];
var METADATA_UPDATE = __m["METADATA_UPDATE"];
var MOUNT_ADD = __m["MOUNT_ADD"];
var MOUNT_REMOVE = __m["MOUNT_REMOVE"];
var PROTOCOL_ANALYTICS = __m["PROTOCOL_ANALYTICS"];
var PROTOCOL_CONTRIBUTE = __m["PROTOCOL_CONTRIBUTE"];
var PROTOCOL_DND = __m["PROTOCOL_DND"];
var PROTOCOL_EDITOR = __m["PROTOCOL_EDITOR"];
var PROTOCOL_FETCH = __m["PROTOCOL_FETCH"];
var PROTOCOL_IPC = __m["PROTOCOL_IPC"];
var PROTOCOL_LAUNCH = __m["PROTOCOL_LAUNCH"];
var PROTOCOL_LLM = __m["PROTOCOL_LLM"];
var PROTOCOL_SECRETS = __m["PROTOCOL_SECRETS"];
var PROTOCOL_SETTINGS = __m["PROTOCOL_SETTINGS"];
var PROTOCOL_SPACES = __m["PROTOCOL_SPACES"];
var PROTOCOL_TASK = __m["PROTOCOL_TASK"];
var PROTOCOL_THEME = __m["PROTOCOL_THEME"];
var PROTOCOL_VCS = __m["PROTOCOL_VCS"];
var REGION_MESSAGE = __m["REGION_MESSAGE"];
var REQUEST_API_CATALOG = __m["REQUEST_API_CATALOG"];
var REQUEST_AUTH_STATE = __m["REQUEST_AUTH_STATE"];
var REQUEST_CHROME_STATE = __m["REQUEST_CHROME_STATE"];
var REQUEST_DEBUG_ENABLED = __m["REQUEST_DEBUG_ENABLED"];
var REQUEST_DIAGNOSTICS = __m["REQUEST_DIAGNOSTICS"];
var REQUEST_EDITOR_CONTEXT = __m["REQUEST_EDITOR_CONTEXT"];
var REQUEST_FORM_FACTOR = __m["REQUEST_FORM_FACTOR"];
var REQUEST_HANDSHAKE = __m["REQUEST_HANDSHAKE"];
var REQUEST_HOST_ATTENTION = __m["REQUEST_HOST_ATTENTION"];
var REQUEST_INVITATIONS = __m["REQUEST_INVITATIONS"];
var REQUEST_LLM_PROVIDER = __m["REQUEST_LLM_PROVIDER"];
var REQUEST_MOUNTS = __m["REQUEST_MOUNTS"];
var REQUEST_SECRETS_METADATA = __m["REQUEST_SECRETS_METADATA"];
var REQUEST_SESSION_MOUNTS = __m["REQUEST_SESSION_MOUNTS"];
var REQUEST_THEME = __m["REQUEST_THEME"];
var REQUEST_VCS_STATE = __m["REQUEST_VCS_STATE"];
var SDK_HANDSHAKE = __m["SDK_HANDSHAKE"];
var SECRETS_METADATA = __m["SECRETS_METADATA"];
var SESSION_MOUNTS = __m["SESSION_MOUNTS"];
var TASK_CANCEL = __m["TASK_CANCEL"];
var TASK_COMPLETE = __m["TASK_COMPLETE"];
var TASK_INPUT = __m["TASK_INPUT"];
var THEME = __m["THEME"];
var URLCHANGE = __m["URLCHANGE"];
var VCS_STATE = __m["VCS_STATE"];
var WIRE_NAMES = __m["WIRE_NAMES"];
export {
  API_CATALOG,
  AUTH_STATE,
  CHROME_STATE,
  COMPILE,
  DEBUG_ENABLED,
  DEBUG_LOG,
  DEBUG_QUERY,
  DEBUG_QUERY_RESULT,
  DIAGNOSTICS,
  DND_CANCEL,
  DROPPED_ITEM,
  EDITOR_CONTEXT,
  FORM_FACTOR,
  FS_CHANGE,
  HOST_ATTENTION,
  INVITATIONS,
  LAUNCH_DISMISS,
  LAUNCH_ENDED,
  LLM_PROVIDER,
  METADATA_UPDATE,
  MOUNT_ADD,
  MOUNT_REMOVE,
  PROTOCOL_ANALYTICS,
  PROTOCOL_CONTRIBUTE,
  PROTOCOL_DND,
  PROTOCOL_EDITOR,
  PROTOCOL_FETCH,
  PROTOCOL_IPC,
  PROTOCOL_LAUNCH,
  PROTOCOL_LLM,
  PROTOCOL_SECRETS,
  PROTOCOL_SETTINGS,
  PROTOCOL_SPACES,
  PROTOCOL_TASK,
  PROTOCOL_THEME,
  PROTOCOL_VCS,
  REGION_MESSAGE,
  REQUEST_API_CATALOG,
  REQUEST_AUTH_STATE,
  REQUEST_CHROME_STATE,
  REQUEST_DEBUG_ENABLED,
  REQUEST_DIAGNOSTICS,
  REQUEST_EDITOR_CONTEXT,
  REQUEST_FORM_FACTOR,
  REQUEST_HANDSHAKE,
  REQUEST_HOST_ATTENTION,
  REQUEST_INVITATIONS,
  REQUEST_LLM_PROVIDER,
  REQUEST_MOUNTS,
  REQUEST_SECRETS_METADATA,
  REQUEST_SESSION_MOUNTS,
  REQUEST_THEME,
  REQUEST_VCS_STATE,
  SDK_HANDSHAKE,
  SECRETS_METADATA,
  SESSION_MOUNTS,
  TASK_CANCEL,
  TASK_COMPLETE,
  TASK_INPUT,
  THEME,
  URLCHANGE,
  VCS_STATE,
  WIRE_NAMES
};
