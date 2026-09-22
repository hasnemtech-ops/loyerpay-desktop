// store.js — Petit magasin JSON local (config, gestionnaire_id, licence) — pas de dépendance externe
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const filePath = path.join(app.getPath('userData'), 'config.json');

function readAll() {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return {}; }
}

function get(key) {
  return readAll()[key];
}

function set(key, value) {
  const data = readAll();
  data[key] = value;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return true;
}

module.exports = { get, set };
