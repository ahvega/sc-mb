// Entorno falso de Google Apps Script para probar backend-inscripciones.gs en Node, sin tocar Google.
// Emula en memoria: SpreadsheetApp (hojas como arrays 2D), MailApp (bandeja), DriveApp,
// PropertiesService, LockService, ContentService, Utilities, Session, ScriptApp y UrlFetchApp.
//
// crearEntorno() carga el .gs en un contexto vm fresco y corre instalar() — cada test parte de una
// hoja nueva con el esquema real (Inscritos, Control, Gafetes, Estudiantes).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'backend-inscripciones.gs'), 'utf8');

function crearEntorno(opciones) {
  opciones = opciones || {};
  const env = {
    correos: [],      // MailApp.sendEmail
    archivos: [],     // DriveApp.createFile
    fetches: [],      // UrlFetchApp.fetch
    hoy: opciones.hoy || '2026-10-20',
    fetchRespuesta: null, // respuesta prefabricada para UrlFetchApp (p. ej. Claude)
  };
  env.setHoy = function (d) { env.hoy = d; };

  const props = new Map(Object.entries(opciones.props || {}));
  const registry = {}; // spreadsheets por id y carpetas por id

  // ---------- Sheets falsos ----------
  class Range {
    constructor(sheet, fila, col, nfilas, ncols) {
      this.sheet = sheet; this.f = fila; this.c = col;
      this.nf = nfilas || 1; this.nc = ncols || 1;
    }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nf; i++) {
        const fila = this.sheet.filas[this.f - 1 + i] || [];
        const r = [];
        for (let j = 0; j < this.nc; j++) r.push(fila[this.c - 1 + j] === undefined ? '' : fila[this.c - 1 + j]);
        out.push(r);
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValue(v) {
      for (let i = 0; i < this.nf; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.f - 1 + i, this.c - 1 + j, v);
      return this;
    }
    setValues(m) {
      m.forEach((fila, i) => fila.forEach((v, j) => this.sheet.set(this.f - 1 + i, this.c - 1 + j, v)));
      return this;
    }
    setFormula(v) { return this.setValue(v); }
    getDisplayValue() { return String(this.getValue()); }
    setNote() { return this; } setDataValidation() { return this; }
    setBackground() { return this; } setFontColor() { return this; }
    setFontWeight() { return this; } setFontSize() { return this; }
  }

  class Sheet {
    constructor(nombre) { this.nombre = nombre; this.filas = [[]]; }
    setName(n) { this.nombre = n; return this; }
    getName() { return this.nombre; }
    getLastRow() { return this.filas.length; }
    set(f, c, v) {
      while (this.filas.length <= f) this.filas.push([]);
      while (this.filas[f].length <= c) this.filas[f].push('');
      this.filas[f][c] = v;
    }
    getRange(f, c, nf, nc) {
      if (typeof f === 'string') { // notación A1: 'A1' o 'A8:B14'
        const celda = (s) => {
          const m = /^([A-Z]+)(\d+)$/.exec(s);
          return [Number(m[2]), m[1].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)];
        };
        const partes = f.split(':').map(celda);
        f = partes[0][0]; c = partes[0][1];
        if (partes[1]) { nf = partes[1][0] - f + 1; nc = partes[1][1] - c + 1; }
      }
      return new Range(this, f, c, nf, nc);
    }
    appendRow(fila) { this.filas.push(fila.map(function (x) { return x === undefined ? '' : x; })); }
    getLastColumn() { return this.filas.reduce(function (m, f) { return Math.max(m, f.length); }, 0); }
    setFrozenRows() { return this; } setColumnWidth() { return this; }
    clear() { this.filas = [[]]; return this; }
  }

  class SS {
    constructor(nombre) { this.id = 'ss-' + nombre; this.hojas = [new Sheet('Hoja 1')]; }
    getId() { return this.id; }
    getSheets() { return this.hojas; }
    getSheetByName(n) { return this.hojas.find(function (h) { return h.nombre === n; }) || null; }
    insertSheet(n) { const h = new Sheet(n); this.hojas.push(h); return h; }
    getUrl() { return 'https://sheets.test/' + this.id; }
  }

  // ---------- APIs de Apps Script ----------
  const scriptProps = {
    getProperty: function (k) { return props.has(k) ? props.get(k) : null; },
    setProperty: function (k, v) { props.set(k, v); return this; },
    setProperties: function (o) { Object.keys(o).forEach(function (k) { props.set(k, o[k]); }); return this; },
    deleteProperty: function (k) { props.delete(k); },
  };

  const mock = {
    console: console,
    Logger: { log: function () {} },
    MailApp: {
      sendEmail: function () {
        const a = Array.prototype.slice.call(arguments);
        env.correos.push(typeof a[0] === 'object' ? a[0] : { to: a[0], subject: a[1], body: a[2] });
      },
    },
    DriveApp: {
      createFolder: function (n) {
        const f = { id: 'fld-' + n, getId: function () { return this.id; } };
        registry[f.id] = f;
        return f;
      },
      getFolderById: function () {
        return {
          createFile: function (blob) {
            const id = 'file-' + env.archivos.length;
            const entry = { id: id, nombre: blob.nombre, tipo: blob.tipo, bytes: blob.bytes };
            env.archivos.push(entry);
            return {
              getId: function () { return id; },
              getUrl: function () { return 'https://drive.test/' + id; },
              getBlob: function () { return entry; },
            };
          },
        };
      },
      getFileById: function (id) {
        const entry = env.archivos.find(function (a) { return a.id === id; });
        if (!entry) throw new Error('Archivo no encontrado: ' + id);
        return {
          getId: function () { return entry.id; },
          getUrl: function () { return 'https://drive.test/' + entry.id; },
          getBlob: function () { return entry; },
        };
      },
    },
    PropertiesService: { getScriptProperties: function () { return scriptProps; } },
    SpreadsheetApp: {
      create: function (n) { const s = new SS(n); registry[s.id] = s; return s; },
      openById: function (id) { return registry[id] || null; },
      getUi: function () {
        return {
          createMenu: function () { return { addItem: function () { return this; }, addToUi: function () {} }; },
          alert: function () {}, showModalDialog: function () {},
        };
      },
      flush: function () {},
      newDataValidation: function () {
        return {
          requireCheckbox: function () { return { build: function () { return {}; } }; },
          requireValueInList: function () { return { build: function () { return {}; } }; },
        };
      },
    },
    LockService: {
      getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: function (t) {
        return { _t: t, setMimeType: function () { return this; }, getContent: function () { return this._t; } };
      },
    },
    CacheService: {
      getScriptCache: function () {
        const cache = new Map();
        return { get: function (k) { return cache.has(k) ? cache.get(k) : null; }, put: function (k, v) { cache.set(k, v); } };
      },
    },
    Utilities: {
      // hoyHN() usa esto: la fecha "de hoy" la controla el test con env.setHoy
      formatDate: function (d, tz, fmt) {
        if (fmt === 'yyyy-MM-dd') return env.hoy;
        if (fmt === 'yyyy-MM-dd HH:mm') return env.hoy + ' 12:00';
        return env.hoy + ' 12.00';
      },
      base64Decode: function (b) { return Buffer.from(b, 'base64'); },
      base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); },
      getUuid: function () { return crypto.randomUUID(); },
      newBlob: function (bytes, tipo, nombre) { return { bytes: bytes, tipo: tipo, nombre: nombre }; },
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: function (alg, valor) { return crypto.createHash('sha256').update(String(valor), 'utf8').digest(); },
    },
    // El operador que corre el menú de la hoja lo fija el test: opciones.operador (null = sin sesión)
    Session: {
      getActiveUser: function () { return { getEmail: function () { return opciones.operador === undefined ? 'operador@test.local' : opciones.operador; } }; },
      getEffectiveUser: function () { return { getEmail: function () { return opciones.operador === undefined ? 'operador@test.local' : opciones.operador; } }; },
    },
    ScriptApp: {
      getProjectTriggers: function () { return []; },
      newTrigger: function () {
        return {
          forSpreadsheet: function () { return { onEdit: function () { return { create: function () {} }; } }; },
          timeBased: function () { return { everyHours: function () { return { create: function () {} }; } }; },
        };
      },
    },
    HtmlService: { createHtmlOutput: function (h) { return { setWidth: function () { return this; }, setHeight: function () { return this; }, _html: h }; } },
    UrlFetchApp: {
      fetch: function (url, opts) {
        env.fetches.push({ url: url, opts: opts });
        if (env.fetchRespuesta) return env.fetchRespuesta;
        return { getResponseCode: function () { return 200; }, getContentText: function () { return '{"content":[{"type":"text","text":"{}"}]}'; } };
      },
    },
  };

  const ctx = vm.createContext(mock);
  vm.runInContext(SRC, ctx);
  ctx.instalar(); // esquema real: encabezados, Control, Gafetes, Estudiantes, carpeta Drive, trigger

  env.ctx = ctx;
  env.props = props;
  env.registry = registry;
  env.hoja = function (nombre) { return registry[props.get('HOJA_ID')].getSheetByName(nombre); };
  env.colIndex = function (nombreHoja, nombreCol) {
    const h = env.hoja(nombreHoja).getRange(1, 1, 1, 60).getValues()[0];
    return h.indexOf(nombreCol) + 1;
  };
  // Evento falso para alEditarHoja: simula una edición en (fila, col) de la hoja dada
  env.edicion = function (sheet, fila, col) {
    return {
      range: {
        getSheet: function () { return sheet; },
        getRow: function () { return fila; },
        getLastRow: function () { return fila; },
        getColumn: function () { return col; },
        getLastColumn: function () { return col; },
      },
    };
  };
  env.json = function (textOutput) { return JSON.parse(textOutput.getContent()); };

  return env;
}

module.exports = { crearEntorno };
