/*
 * Importación del horario institucional desde planillas.
 *
 *  · CSV / TSV  → se interpretan con el analizador incluido (sin dependencias).
 *  · XLSX / ODS → se leen con SheetJS, que se carga bajo demanda desde el CDN.
 *  · PDF        → no se interpreta automáticamente: se pide convertir a planilla.
 *
 * Se admiten dos disposiciones:
 *  · "lista"  → una fila por clase, con columnas Día, Hora, Grupo, Materia, Docente…
 *  · "matriz" → grilla grupos × horas de un día (como las planillas de pared).
 */

import { sinAcentos, normalizarFecha, uid } from './utils.js';

const URL_SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

/* ---------------- CSV ---------------- */

export function parsearCSV(texto, separador = null) {
  const limpio = texto.replace(/^\uFEFF/, '');
  const sep = separador || detectarSeparador(limpio);
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { entreComillas = true; continue; }
    if (c === sep) { fila.push(campo); campo = ''; continue; }
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.map(f => f.map(v => v.trim()));
}

function detectarSeparador(texto) {
  const muestra = texto.split('\n').slice(0, 5).join('\n');
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ',';
  let max = -1;
  for (const c of candidatos) {
    const n = muestra.split(c).length - 1;
    if (n > max) { max = n; mejor = c; }
  }
  return mejor;
}

/* ---------------- lectura de archivos ---------------- */

export async function leerArchivo(archivo) {
  const nombre = archivo.name || 'planilla';
  const ext = nombre.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    throw new Error('Los PDF no se interpretan automáticamente. Exportá el horario a XLSX, ODS o CSV y volvé a intentarlo.');
  }
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const texto = await archivo.text();
    return { fuente: nombre, hojas: [{ nombre: 'CSV', matriz: parsearCSV(texto) }] };
  }

  let XLSX;
  try {
    XLSX = await import(/* @vite-ignore */ URL_SHEETJS);
  } catch {
    throw new Error('No se pudo cargar el lector de planillas (se necesita conexión a internet la primera vez). Alternativa: guardá el archivo como CSV.');
  }
  const buffer = await archivo.arrayBuffer();
  const libro = XLSX.read(buffer, { type: 'array', cellDates: true });
  const hojas = libro.SheetNames.map(nombreHoja => ({
    nombre: nombreHoja,
    matriz: XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { header: 1, blankrows: false, defval: '' })
      .map(fila => fila.map(v => (v instanceof Date ? normalizarFecha(v) : String(v ?? '').trim()))),
  }));
  return { fuente: nombre, hojas };
}

/* ---------------- normalizadores ---------------- */

const DIAS_CLAVE = {
  lunes: 1, lun: 1, l: 1,
  martes: 2, mar: 2, ma: 2,
  miercoles: 3, mie: 3, mi: 3, x: 3,
  jueves: 4, jue: 4, j: 4,
  viernes: 5, vie: 5, v: 5,
  sabado: 6, sab: 6, s: 6,
  domingo: 7, dom: 7, d: 7,
};

export function normalizarDia(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = Number(valor);
  if (Number.isFinite(n) && n >= 1 && n <= 7) return n;
  const clave = sinAcentos(String(valor)).toLowerCase().trim().replace(/[.\s]/g, '');
  return DIAS_CLAVE[clave] || 0;
}

export function normalizarHora(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  const m = String(valor).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** Divide el contenido de una celda "Materia / Docente" en sus dos partes. */
export function partirCelda(texto) {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return { materia: '', docente: '' };
  const partes = limpio.split(/\n|\s+[–—-]\s+|\s{2,}|\s*\/\s*/).map(p => p.trim()).filter(Boolean);
  if (partes.length === 1) return { materia: partes[0], docente: '' };
  return { materia: partes[0], docente: partes.slice(1).join(' ') };
}

/* ---------------- disposición "lista" ---------------- */

const SINONIMOS = {
  dia: ['dia', 'day', 'jornada'],
  hora: ['hora', 'modulo', 'mod', 'hour', 'periodo'],
  grupo: ['grupo', 'clase', 'curso', 'group'],
  materia: ['materia', 'asignatura', 'subject'],
  docente: ['docente', 'profesor', 'profesora', 'prof', 'teacher'],
  salon: ['salon', 'aula', 'sala', 'room'],
  turno: ['turno', 'shift'],
  anio: ['anio', 'ano', 'year'],
};

/** Adivina qué columna corresponde a cada campo a partir de los encabezados. */
export function detectarMapeo(encabezados) {
  const mapeo = {};
  const normalizados = encabezados.map(h => sinAcentos(String(h ?? '')).toLowerCase().trim());
  for (const [campo, alias] of Object.entries(SINONIMOS)) {
    const i = normalizados.findIndex(h => h && alias.some(a => h === a || h.startsWith(a)));
    if (i >= 0) mapeo[campo] = i;
  }
  return mapeo;
}

export function clasesDesdeLista(matriz, mapeo, { anio, turnoPorDefecto = '', tieneEncabezado = true }) {
  const filas = tieneEncabezado ? matriz.slice(1) : matriz;
  const clases = [];
  const problemas = [];

  filas.forEach((fila, idx) => {
    const dato = (campo) => {
      const i = mapeo[campo];
      return i === undefined || i < 0 ? '' : String(fila[i] ?? '').trim();
    };
    if (!fila.some(v => String(v ?? '').trim())) return;

    const dia = normalizarDia(dato('dia'));
    const hora = normalizarHora(dato('hora'));
    const grupo = dato('grupo');
    const materia = dato('materia');
    const docente = dato('docente');

    if (!dia || !hora || !grupo) {
      problemas.push(`Fila ${idx + (tieneEncabezado ? 2 : 1)}: falta día, hora o grupo.`);
      return;
    }
    clases.push({
      id: uid('cl'),
      anio: Number(dato('anio')) || anio,
      turno: dato('turno') || turnoPorDefecto,
      dia, hora, grupo, materia, docente,
      salon: dato('salon'),
    });
  });

  return { clases, problemas };
}

/* ---------------- disposición "matriz" ---------------- */

/**
 * Grilla con los grupos en la primera columna y las horas en la primera fila
 * (o al revés, si orientacion = 'horasEnFilas').
 */
export function clasesDesdeMatriz(matriz, { anio, dia, turno = '', orientacion = 'gruposEnFilas' }) {
  const datos = orientacion === 'horasEnFilas' ? transponer(matriz) : matriz;
  const encabezado = datos[0] || [];
  const clases = [];
  const problemas = [];

  const horas = encabezado.map((v, i) => (i === 0 ? 0 : normalizarHora(v) || i));

  datos.slice(1).forEach((fila, r) => {
    const grupo = String(fila[0] ?? '').trim();
    if (!grupo) return;
    for (let c = 1; c < fila.length; c++) {
      const contenido = String(fila[c] ?? '').trim();
      if (!contenido) continue;
      const { materia, docente } = partirCelda(contenido);
      const hora = horas[c] || c;
      if (!hora) { problemas.push(`No se pudo determinar la hora de la columna ${c + 1}.`); continue; }
      clases.push({ id: uid('cl'), anio, turno, dia, hora, grupo, materia, docente, salon: '' });
    }
  });

  return { clases, problemas };
}

function transponer(matriz) {
  const columnas = Math.max(0, ...matriz.map(f => f.length));
  const salida = [];
  for (let c = 0; c < columnas; c++) salida.push(matriz.map(f => f[c] ?? ''));
  return salida;
}

/* ---------------- validación ---------------- */

/** Busca choques de docente (misma hora, mismo día y turno, distinto grupo). */
export function detectarSuperposiciones(clases) {
  const mapa = new Map();
  const choques = [];
  for (const c of clases) {
    if (!c.docente) continue;
    const k = `${c.dia}|${c.hora}|${(c.turno || '').toLowerCase()}|${sinAcentos(c.docente).toLowerCase()}`;
    if (mapa.has(k)) {
      const previa = mapa.get(k);
      if (previa.grupo !== c.grupo) choques.push({ a: previa, b: c });
    } else mapa.set(k, c);
  }
  return choques;
}
