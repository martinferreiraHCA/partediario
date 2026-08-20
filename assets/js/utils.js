/* Utilidades generales: DOM, fechas, texto, descargas. */

export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
  'agosto','septiembre','octubre','noviembre','diciembre'];

/* ---------------- DOM ---------------- */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- fechas ---------------- */

export function hoyISO() {
  const d = new Date();
  return isoDe(d);
}

export function isoDe(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Convierte una fecha ISO (yyyy-mm-dd) en Date local a mediodía (evita saltos de huso). */
export function fechaDe(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/** 1 = lunes … 7 = domingo */
export function diaSemana(iso) {
  const n = fechaDe(iso).getDay();
  return n === 0 ? 7 : n;
}

export function fmtFechaLarga(iso) {
  const d = fechaDe(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function fmtFechaCorta(iso) {
  const d = fechaDe(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtFechaHora(ts) {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (isNaN(d)) return String(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function sumarDias(iso, n) {
  const d = fechaDe(iso);
  d.setDate(d.getDate() + n);
  return isoDe(d);
}

export function anioDe(iso) { return Number(String(iso).slice(0, 4)); }

/**
 * Acepta 20/08/2026, 2026-08-20, 20-8-26 o un Date y devuelve ISO.
 * Devuelve '' si no se puede interpretar.
 */
export function normalizarFecha(valor) {
  if (!valor && valor !== 0) return '';
  if (valor instanceof Date && !isNaN(valor)) return isoDe(valor);
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d) ? '' : isoDe(d);
}

/* ---------------- texto ---------------- */

export function sinAcentos(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Clave canónica de un nombre de docente. Ignora acentos, mayúsculas, comas y
 * el orden de las palabras, de modo que "López, María" y "María López" coincidan.
 */
export function claveDocente(nombre) {
  return sinAcentos(nombre)
    .toLowerCase()
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Comparación laxa para búsquedas libres. */
export function contiene(texto, termino) {
  if (!termino) return true;
  return sinAcentos(String(texto ?? '')).toLowerCase().includes(sinAcentos(termino).toLowerCase());
}

export function normalizarGrupo(g) {
  return sinAcentos(g).toLowerCase().replace(/[º°.\s]/g, '');
}

/** "3" → "3.ª" */
export function ordinalHora(h) {
  const n = Number(h);
  return Number.isFinite(n) ? `${n}.ª` : String(h ?? '');
}

export function pluralizar(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function uid(prefijo = 'id') {
  return `${prefijo}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** Color estable (HSL) derivado de un texto: sirve para pintar materias. */
export function colorDeTexto(texto, alpha = 1) {
  let h = 0;
  const s = sinAcentos(texto).toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsla(${h}, 62%, ${matchMedia('(prefers-color-scheme: dark)').matches ? 28 : 90}%, ${alpha})`;
}

export function colorTextoDeTexto(texto) {
  let h = 0;
  const s = sinAcentos(texto).toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, ${matchMedia('(prefers-color-scheme: dark)').matches ? 82 : 28}%)`;
}

/* ---------------- varios ---------------- */

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function agrupar(lista, fn) {
  const mapa = new Map();
  for (const item of lista) {
    const k = fn(item);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(item);
  }
  return mapa;
}

export function unicos(lista) {
  return Array.from(new Set(lista.filter(v => v !== '' && v !== null && v !== undefined)));
}

/** Orden natural: 7.º2 antes que 8.º1, y "10" después de "9". */
export function compararNatural(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
