/*
 * Exportación de planillas sin dependencias externas.
 *
 * Incluye un escritor ZIP mínimo (método "store", sin compresión) que alcanza
 * para generar archivos .ods y .xlsx válidos, además de CSV y de la vista de
 * impresión que el navegador convierte en PDF.
 */

import { descargar } from './utils.js';

/* ---------------- ZIP (store) ---------------- */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const codificador = new TextEncoder();
const bytes = (v) => (typeof v === 'string' ? codificador.encode(v) : v);

/** archivos: [{ nombre, datos }] — el primero se escribe primero (necesario para ODS). */
export function crearZip(archivos, mime = 'application/zip') {
  const partes = [];
  const central = [];
  let offset = 0;

  const escribir = (arr) => { partes.push(arr); offset += arr.length; };
  const u16 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
  const u32 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
  const concat = (lista) => {
    const total = lista.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const a of lista) { out.set(a, p); p += a.length; }
    return out;
  };

  // Fecha fija (1980-01-01): mantiene los archivos reproducibles.
  const hora = u16(0);
  const fecha = u16(33);

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre);
    const datos = bytes(archivo.datos);
    const crc = crc32(datos);
    const inicio = offset;

    escribir(concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), hora, fecha,
      u32(crc), u32(datos.length), u32(datos.length), u16(nombre.length), u16(0), nombre,
    ]));
    escribir(datos);

    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), hora, fecha,
      u32(crc), u32(datos.length), u32(datos.length),
      u16(nombre.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(inicio), nombre,
    ]));
  }

  const inicioCentral = offset;
  const cd = concat(central);
  escribir(cd);
  escribir(concat([
    u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length),
    u32(cd.length), u32(inicioCentral), u16(0),
  ]));

  return new Blob(partes, { type: mime });
}

/* ---------------- XML ---------------- */

function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------------- ODS ---------------- */

/** hojas: [{ nombre, filas: [[celda, …], …] }] */
export function crearODS(hojas) {
  const tablas = hojas.map(hoja => {
    const columnas = Math.max(1, ...hoja.filas.map(f => f.length));
    const filas = hoja.filas.map(fila => {
      const celdas = fila.map(celda => {
        if (esNumero(celda)) {
          return `<table:table-cell office:value-type="float" office:value="${celda}"><text:p>${escXml(celda)}</text:p></table:table-cell>`;
        }
        const texto = celda === null || celda === undefined ? '' : String(celda);
        if (!texto) return '<table:table-cell/>';
        const parrafos = texto.split('\n').map(t => `<text:p>${escXml(t)}</text:p>`).join('');
        return `<table:table-cell office:value-type="string">${parrafos}</table:table-cell>`;
      }).join('');
      return `<table:table-row>${celdas}</table:table-row>`;
    }).join('');
    return `<table:table table:name="${escXml(hoja.nombre)}">` +
      `<table:table-column table:number-columns-repeated="${columnas}"/>${filas}</table:table>`;
  }).join('');

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:version="1.2">
<office:body><office:spreadsheet>${tablas}</office:spreadsheet></office:body>
</office:document-content>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

  return crearZip([
    { nombre: 'mimetype', datos: 'application/vnd.oasis.opendocument.spreadsheet' },
    { nombre: 'META-INF/manifest.xml', datos: manifest },
    { nombre: 'content.xml', datos: content },
  ], 'application/vnd.oasis.opendocument.spreadsheet');
}

/* ---------------- XLSX ---------------- */

function columnaExcel(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function crearXLSX(hojas) {
  const archivos = [];
  const nombresHoja = hojas.map((h, i) => (h.nombre || `Hoja${i + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));

  hojas.forEach((hoja, i) => {
    const filas = hoja.filas.map((fila, r) => {
      const celdas = fila.map((celda, c) => {
        const ref = `${columnaExcel(c)}${r + 1}`;
        if (esNumero(celda)) return `<c r="${ref}"><v>${celda}</v></c>`;
        const texto = celda === null || celda === undefined ? '' : String(celda);
        if (!texto) return '';
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escXml(texto)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${celdas}</row>`;
    }).join('');
    archivos.push({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`,
    });
  });

  const overrides = hojas.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const hojasXml = nombresHoja.map((n, i) =>
    `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojasXml}</sheets></workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${nombresHoja.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
</Relationships>`;

  return crearZip([
    { nombre: '[Content_Types].xml', datos: contentTypes },
    { nombre: '_rels/.rels', datos: rels },
    { nombre: 'xl/workbook.xml', datos: workbook },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: wbRels },
    ...archivos,
  ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------------- CSV ---------------- */

export function crearCSV(filas, separador = ',') {
  const celda = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n\r]|,|;|\t/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = filas.map(f => f.map(celda).join(separador)).join('\r\n');
  return new Blob(['\uFEFF' + texto], { type: 'text/csv;charset=utf-8' });
}

/* ---------------- API de alto nivel ---------------- */

export function exportarHojas(hojas, nombreBase, formato) {
  const f = String(formato).toLowerCase();
  if (f === 'ods') return descargar(crearODS(hojas), `${nombreBase}.ods`);
  if (f === 'xlsx') return descargar(crearXLSX(hojas), `${nombreBase}.xlsx`);
  if (f === 'csv') return descargar(crearCSV(hojas[0].filas), `${nombreBase}.csv`);
  throw new Error(`Formato desconocido: ${formato}`);
}
