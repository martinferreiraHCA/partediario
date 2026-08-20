/*
 * Modelo de datos compartido por el frontend y por Apps Script.
 *
 * Colecciones:
 *   config          → parámetros institucionales (turnos, módulos, años, liceos)
 *   horarios[]      → una fila por clase del horario institucional
 *   inasistencias[] → un aviso de ausencia docente (viene del Google Form o se carga a mano)
 *   partes{}        → parte diario por fecha: { [fechaISO]: { fecha, filas[], cerrado } }
 */

import { uid, normalizarFecha, anioDe } from './utils.js';

export const CONFIG_POR_DEFECTO = {
  liceo: 'Liceo N.º 5',
  liceos: ['Liceo N.º 5'],
  anioActivo: new Date().getFullYear(),
  anios: [{ anio: new Date().getFullYear(), estado: 'activo', origen: '', actualizado: '' }],
  turnos: [
    {
      id: 'matutino',
      nombre: 'Matutino',
      modulos: [
        { n: 1, inicio: '07:30', fin: '08:15' },
        { n: 2, inicio: '08:15', fin: '09:00' },
        { n: 3, inicio: '09:10', fin: '09:55' },
        { n: 4, inicio: '09:55', fin: '10:40' },
        { n: 5, inicio: '10:50', fin: '11:35' },
        { n: 6, inicio: '11:35', fin: '12:20' },
        { n: 7, inicio: '12:20', fin: '13:05' },
      ],
    },
    {
      id: 'vespertino',
      nombre: 'Vespertino',
      modulos: [
        { n: 1, inicio: '12:05', fin: '12:50' },
        { n: 2, inicio: '13:10', fin: '13:55' },
        { n: 3, inicio: '14:05', fin: '14:45' },
        { n: 4, inicio: '14:45', fin: '15:25' },
        { n: 5, inicio: '15:30', fin: '16:15' },
        { n: 6, inicio: '16:20', fin: '17:05' },
        { n: 7, inicio: '17:10', fin: '17:50' },
        { n: 8, inicio: '17:50', fin: '18:30' },
      ],
    },
  ],
  motivos: ['Inasistencia', 'Licencia médica', 'Licencia por estudio', 'Paro', 'Actividad institucional', 'Otro'],
};

export const ESTADOS_INASISTENCIA = {
  nueva: { etiqueta: 'Nueva', chip: 'new' },
  revisada: { etiqueta: 'Revisada', chip: 'ok' },
  archivada: { etiqueta: 'Archivada', chip: '' },
};

/* ---------------- normalizadores ---------------- */

export function normalizarClase(fila, anioPorDefecto) {
  return {
    id: fila.id || uid('cl'),
    anio: Number(fila.anio || anioPorDefecto) || anioPorDefecto,
    turno: String(fila.turno || '').trim(),
    dia: Number(fila.dia) || 0,
    hora: Number(fila.hora) || 0,
    grupo: String(fila.grupo || '').trim(),
    materia: String(fila.materia || '').trim(),
    docente: String(fila.docente || '').trim(),
    salon: String(fila.salon || '').trim(),
  };
}

export function normalizarInasistencia(fila) {
  const fecha = normalizarFecha(fila.fecha);
  return {
    id: fila.id || uid('ina'),
    timestamp: fila.timestamp || new Date().toISOString(),
    docente: String(fila.docente || '').trim(),
    fecha,
    liceo: String(fila.liceo || '').trim(),
    turno: String(fila.turno || '').trim(),
    motivo: String(fila.motivo || '').trim(),
    observaciones: String(fila.observaciones || '').trim(),
    estado: fila.estado || 'nueva',
    origen: fila.origen || 'formulario',
    // horas: vacío = todas las clases del día; con valores = ausencia parcial
    horas: Array.isArray(fila.horas) ? fila.horas.map(Number).filter(Boolean) : [],
  };
}

export function normalizarFilaParte(fila, fecha) {
  return {
    id: fila.id || uid('pd'),
    fecha: fila.fecha || fecha,
    hora: Number(fila.hora) || 0,
    turno: String(fila.turno || '').trim(),
    docente: String(fila.docente || '').trim(),
    grupo: String(fila.grupo || '').trim(),
    materia: String(fila.materia || '').trim(),
    salon: String(fila.salon || '').trim(),
    motivo: String(fila.motivo || 'Inasistencia').trim(),
    cobertura: String(fila.cobertura || '').trim(),
    observaciones: String(fila.observaciones || '').trim(),
    origen: fila.origen || 'automatico',   // 'automatico' | 'manual'
    editado: !!fila.editado,
    inasistenciaId: fila.inasistenciaId || '',
  };
}

export function parteVacio(fecha) {
  return { fecha, filas: [], cerrado: false, actualizado: '' };
}

/* ---------------- helpers de configuración ---------------- */

export function turnoDe(config, id) {
  if (!id) return null;
  const clave = String(id).toLowerCase();
  return config.turnos.find(t => t.id.toLowerCase() === clave || t.nombre.toLowerCase() === clave) || null;
}

export function modulosDe(config, turnoId) {
  const t = turnoDe(config, turnoId);
  if (t) return t.modulos;
  // Sin turno definido: se usa la unión de módulos de todos los turnos.
  const max = Math.max(0, ...config.turnos.flatMap(t2 => t2.modulos.map(m => m.n)));
  return Array.from({ length: max }, (_, i) => ({ n: i + 1, inicio: '', fin: '' }));
}

export function horarioDeModulo(config, turnoId, n) {
  const m = modulosDe(config, turnoId).find(x => Number(x.n) === Number(n));
  return m && m.inicio ? `${m.inicio}–${m.fin}` : '';
}

export function anioActivo(config) {
  const activo = (config.anios || []).find(a => a.estado === 'activo');
  return activo ? Number(activo.anio) : Number(config.anioActivo) || new Date().getFullYear();
}

export function anioParaFecha(config, fechaISO) {
  const a = anioDe(fechaISO);
  const existe = (config.anios || []).some(x => Number(x.anio) === a);
  return existe ? a : anioActivo(config);
}
