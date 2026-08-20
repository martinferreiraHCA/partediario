/*
 * Reglas de negocio: cruce de inasistencias con el horario institucional,
 * armado del parte diario y sugerencias de cobertura.
 * Todo es puro: recibe el estado y devuelve datos nuevos.
 */

import { claveDocente, diaSemana, compararNatural } from './utils.js';
import { normalizarFilaParte, parteVacio, anioParaFecha, modulosDe } from './modelo.js';

/* ---------------- horario ---------------- */

/** Clases del horario que dicta un docente un día concreto. */
export function clasesDeDocenteEnFecha(estado, docente, fechaISO, turno = '') {
  const anio = anioParaFecha(estado.config, fechaISO);
  const dia = diaSemana(fechaISO);
  const clave = claveDocente(docente);
  return estado.horarios
    .filter(c => Number(c.anio) === anio
      && Number(c.dia) === dia
      && claveDocente(c.docente) === clave
      && (!turno || !c.turno || c.turno.toLowerCase() === turno.toLowerCase()))
    .sort((a, b) => a.hora - b.hora || compararNatural(a.grupo, b.grupo));
}

/** Clases de un docente en toda la semana (para la ficha del docente). */
export function horarioSemanalDocente(estado, docente, anio) {
  const clave = claveDocente(docente);
  return estado.horarios
    .filter(c => Number(c.anio) === Number(anio) && claveDocente(c.docente) === clave)
    .sort((a, b) => a.dia - b.dia || a.hora - b.hora);
}

export function clasesDeGrupo(estado, grupo, anio, dia = 0) {
  return estado.horarios
    .filter(c => Number(c.anio) === Number(anio) && c.grupo === grupo && (!dia || Number(c.dia) === dia))
    .sort((a, b) => a.dia - b.dia || a.hora - b.hora);
}

export function listaDocentes(estado, anio) {
  const mapa = new Map();
  for (const c of estado.horarios) {
    if (anio && Number(c.anio) !== Number(anio)) continue;
    if (!c.docente) continue;
    const k = claveDocente(c.docente);
    if (!mapa.has(k)) mapa.set(k, c.docente);
  }
  return Array.from(mapa.values()).sort(compararNatural);
}

export function listaGrupos(estado, anio, turno = '') {
  const set = new Set();
  for (const c of estado.horarios) {
    if (anio && Number(c.anio) !== Number(anio)) continue;
    if (turno && c.turno && c.turno.toLowerCase() !== turno.toLowerCase()) continue;
    if (c.grupo) set.add(c.grupo);
  }
  return Array.from(set).sort(compararNatural);
}

export function listaMaterias(estado, anio) {
  const set = new Set();
  for (const c of estado.horarios) {
    if (anio && Number(c.anio) !== Number(anio)) continue;
    if (c.materia) set.add(c.materia);
  }
  return Array.from(set).sort(compararNatural);
}

/* ---------------- cruce ---------------- */

/**
 * Cruza un aviso de inasistencia con el horario institucional.
 * Devuelve las clases afectadas (todas las del día, o sólo las horas indicadas
 * cuando el aviso es de ausencia parcial).
 */
export function clasesAfectadas(estado, inasistencia) {
  if (!inasistencia || !inasistencia.fecha || !inasistencia.docente) return [];
  let clases = clasesDeDocenteEnFecha(estado, inasistencia.docente, inasistencia.fecha, inasistencia.turno);
  if (inasistencia.horas && inasistencia.horas.length) {
    const horas = new Set(inasistencia.horas.map(Number));
    clases = clases.filter(c => horas.has(Number(c.hora)));
  }
  return clases;
}

/** Resumen legible de una inasistencia: grupos, horas y cantidad de clases. */
export function resumenInasistencia(estado, inasistencia) {
  const clases = clasesAfectadas(estado, inasistencia);
  const porGrupo = new Map();
  for (const c of clases) {
    if (!porGrupo.has(c.grupo)) porGrupo.set(c.grupo, []);
    porGrupo.get(c.grupo).push(Number(c.hora));
  }
  return {
    clases,
    cantidad: clases.length,
    grupos: Array.from(porGrupo.keys()).sort(compararNatural),
    horas: Array.from(new Set(clases.map(c => Number(c.hora)))).sort((a, b) => a - b),
    porGrupo,
    sinHorario: clases.length === 0,
  };
}

export function inasistenciasDeFecha(estado, fechaISO) {
  return estado.inasistencias
    .filter(i => i.fecha === fechaISO && i.estado !== 'archivada')
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

export function docentesAusentes(estado, fechaISO) {
  return new Set(inasistenciasDeFecha(estado, fechaISO).map(i => claveDocente(i.docente)));
}

/* ---------------- parte diario ---------------- */

/** Filas que el cruce automático genera para una fecha. */
export function filasAutomaticas(estado, fechaISO) {
  const filas = [];
  for (const ina of inasistenciasDeFecha(estado, fechaISO)) {
    const clases = clasesAfectadas(estado, ina);
    if (!clases.length) {
      filas.push(normalizarFilaParte({
        hora: 0,
        turno: ina.turno,
        docente: ina.docente,
        grupo: '',
        materia: '',
        motivo: ina.motivo || 'Inasistencia',
        observaciones: ina.observaciones
          ? `${ina.observaciones} · sin clases en el horario institucional`
          : 'Sin clases registradas en el horario institucional',
        origen: 'automatico',
        inasistenciaId: ina.id,
      }, fechaISO));
      continue;
    }
    for (const c of clases) {
      filas.push(normalizarFilaParte({
        hora: c.hora,
        turno: c.turno || ina.turno,
        docente: ina.docente,
        grupo: c.grupo,
        materia: c.materia,
        salon: c.salon,
        motivo: ina.motivo || 'Inasistencia',
        observaciones: ina.observaciones,
        origen: 'automatico',
        inasistenciaId: ina.id,
      }, fechaISO));
    }
  }
  return filas.sort(ordenFilas);
}

export function ordenFilas(a, b) {
  return (Number(a.hora) || 99) - (Number(b.hora) || 99)
    || compararNatural(a.grupo, b.grupo)
    || compararNatural(a.docente, b.docente);
}

function claveFila(f) {
  return [f.inasistenciaId || claveDocente(f.docente), Number(f.hora), f.grupo].join('|');
}

/**
 * Combina el parte guardado con el cruce automático:
 *  · agrega las clases nuevas que aún no figuran,
 *  · conserva las filas manuales y las que Adscripción editó,
 *  · quita las automáticas cuya inasistencia ya no existe (salvo que estén editadas).
 */
export function sincronizarParte(estado, fechaISO, parteGuardado) {
  const parte = parteGuardado ? { ...parteGuardado, filas: parteGuardado.filas.map(f => ({ ...f })) } : parteVacio(fechaISO);
  const autos = filasAutomaticas(estado, fechaISO);
  const existentes = new Map(parte.filas.map(f => [claveFila(f), f]));
  const clavesAuto = new Set(autos.map(claveFila));
  let cambios = 0;

  for (const fila of autos) {
    const k = claveFila(fila);
    const previa = existentes.get(k);
    if (!previa) {
      parte.filas.push(fila);
      existentes.set(k, fila);
      cambios++;
    } else if (!previa.editado) {
      // Refresca datos que pudieron cambiar en el horario (materia, salón, motivo).
      const antes = JSON.stringify([previa.materia, previa.salon, previa.motivo, previa.turno]);
      previa.materia = fila.materia;
      previa.salon = fila.salon;
      previa.motivo = previa.motivo || fila.motivo;
      previa.turno = fila.turno;
      if (JSON.stringify([previa.materia, previa.salon, previa.motivo, previa.turno]) !== antes) cambios++;
    }
  }

  const antesLargo = parte.filas.length;
  parte.filas = parte.filas.filter(f =>
    f.origen === 'manual' || f.editado || clavesAuto.has(claveFila(f)));
  cambios += antesLargo - parte.filas.length;

  parte.filas.sort(ordenFilas);
  parte.fecha = fechaISO;
  return { parte, cambios };
}

/* ---------------- coberturas ---------------- */

/**
 * Sugerencias de docentes que podrían cubrir una hora libre.
 * Se prioriza a quien ya está en el liceo en esa franja (clase inmediatamente
 * anterior o posterior), luego a quien tiene actividad ese día.
 */
export function sugerenciasCobertura(estado, { fecha, hora, turno = '', grupo = '', excluir = '' }) {
  const anio = anioParaFecha(estado.config, fecha);
  const dia = diaSemana(fecha);
  const ausentes = docentesAusentes(estado, fecha);
  const claveExcluida = excluir ? claveDocente(excluir) : '';
  const h = Number(hora);

  const delDia = estado.horarios.filter(c =>
    Number(c.anio) === anio && Number(c.dia) === dia &&
    (!turno || !c.turno || c.turno.toLowerCase() === turno.toLowerCase()));

  const porDocente = new Map();
  for (const c of delDia) {
    const k = claveDocente(c.docente);
    if (!k) continue;
    if (!porDocente.has(k)) porDocente.set(k, { nombre: c.docente, clases: [] });
    porDocente.get(k).clases.push(c);
  }

  const sugerencias = [];
  for (const [k, info] of porDocente) {
    if (k === claveExcluida || ausentes.has(k)) continue;
    const horas = new Set(info.clases.map(c => Number(c.hora)));
    if (horas.has(h)) continue;                     // está dando clase en esa hora

    const antes = horas.has(h - 1);
    const despues = horas.has(h + 1);
    let puntaje = 1;
    let razon = 'Tiene actividad ese día';
    if (antes && despues) { puntaje = 4; razon = 'Está en el liceo: dicta la hora anterior y la siguiente'; }
    else if (antes) { puntaje = 3; razon = 'Termina clase en la hora anterior'; }
    else if (despues) { puntaje = 3; razon = 'Comienza clase en la hora siguiente'; }

    const mismoGrupo = grupo && info.clases.some(c => c.grupo === grupo);
    if (mismoGrupo) { puntaje += 1; razon += ' · ya trabaja con el grupo'; }

    sugerencias.push({
      docente: info.nombre,
      puntaje,
      razon,
      horasEseDia: Array.from(horas).sort((a, b) => a - b),
      materias: Array.from(new Set(info.clases.map(c => c.materia))).filter(Boolean),
    });
  }

  return sugerencias.sort((a, b) => b.puntaje - a.puntaje || compararNatural(a.docente, b.docente));
}

/* ---------------- métricas ---------------- */

export function resumenDelDia(estado, fechaISO) {
  const inas = inasistenciasDeFecha(estado, fechaISO);
  const filas = filasAutomaticas(estado, fechaISO).filter(f => f.grupo);
  const parte = estado.partes[fechaISO];
  const filasParte = parte ? parte.filas : filas;
  return {
    fecha: fechaISO,
    docentes: new Set(inas.map(i => claveDocente(i.docente))).size,
    nuevas: inas.filter(i => i.estado === 'nueva').length,
    grupos: new Set(filasParte.filter(f => f.grupo).map(f => f.grupo)).size,
    horas: filasParte.filter(f => f.grupo).length,
    sinCobertura: filasParte.filter(f => f.grupo && !f.cobertura).length,
    inasistencias: inas,
  };
}

export function proximasInasistencias(estado, desdeISO) {
  return estado.inasistencias
    .filter(i => i.fecha > desdeISO && i.estado !== 'archivada')
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function historialInasistencias(estado, hastaISO) {
  return estado.inasistencias
    .filter(i => i.fecha < hastaISO)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Detecta huecos del horario: grupos con módulos sin clase (informativo). */
export function coberturaHorario(estado, anio) {
  const clases = estado.horarios.filter(c => Number(c.anio) === Number(anio));
  const turnos = new Set(clases.map(c => c.turno).filter(Boolean));
  const modulos = modulosDe(estado.config, turnos.size === 1 ? Array.from(turnos)[0] : '');
  return { clases: clases.length, modulos: modulos.length, grupos: new Set(clases.map(c => c.grupo)).size };
}
