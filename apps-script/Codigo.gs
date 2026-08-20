/**
 * Gestión Educativa – Liceo
 * Backend en Google Apps Script. Toda la información vive dentro de UNA carpeta
 * de Google Drive; este script la crea, la lee y la escribe, y expone un API
 * JSON que consume la aplicación publicada en GitHub Pages.
 *
 * Estructura que se crea con configuracionInicial() / acción "instalar":
 *
 *   📁 Gestión Educativa – <Liceo>
 *      ├── 01 · Configuración      → planilla «Configuración» (General, Usuarios, Turnos, Años, Motivos)
 *      ├── 02 · Horarios           → planilla «Horarios» + subcarpeta «Originales»
 *      ├── 03 · Inasistencias      → formulario docente + planilla de respuestas
 *      ├── 04 · Partes diarios     → planilla «Partes» + un archivo por día (año/mes)
 *      └── 05 · Exportaciones      → copias y respaldos
 *
 * Implementación: Implementar → Nueva implementación → Aplicación web
 *   · Ejecutar como: Yo
 *   · Quién tiene acceso: Cualquier usuario
 * La autorización de las personas no la da Google sino la hoja «Usuarios»:
 * cada una entra con su código de acceso personal.
 */

var VERSION = 'gestion-educativa 1.0';

var CARPETAS = {
  config: '01 · Configuración',
  horarios: '02 · Horarios',
  inasistencias: '03 · Inasistencias',
  partes: '04 · Partes diarios',
  exportaciones: '05 · Exportaciones',
};

var HOJAS = {
  general: 'General',
  usuarios: 'Usuarios',
  turnos: 'Turnos',
  anios: 'Años',
  motivos: 'Motivos',
  horarios: 'Horarios',
  inasistencias: 'Inasistencias',
  partes: 'Partes',
};

var ENCABEZADOS = {
  usuarios: ['id', 'nombre', 'email', 'rol', 'codigo', 'activo', 'observaciones'],
  turnos: ['turno', 'nombre', 'modulo', 'inicio', 'fin'],
  anios: ['anio', 'estado', 'origen', 'actualizado', 'clases'],
  motivos: ['motivo'],
  general: ['clave', 'valor'],
  horarios: ['id', 'anio', 'dia', 'hora', 'turno', 'grupo', 'materia', 'docente', 'salon'],
  inasistencias: ['id', 'timestamp', 'docente', 'fecha', 'liceo', 'turno', 'motivo',
    'observaciones', 'estado', 'origen', 'horas'],
  partes: ['id', 'fecha', 'hora', 'turno', 'docente', 'grupo', 'materia', 'salon', 'motivo',
    'cobertura', 'observaciones', 'origen', 'editado', 'inasistenciaId', 'cerrado'],
};

var PERMISOS_POR_ROL = {
  admin: ['verInasistencias', 'editarInasistencias', 'verHorarios', 'editarHorarios',
    'verParte', 'editarParte', 'exportar', 'administrar'],
  direccion: ['verInasistencias', 'editarInasistencias', 'verHorarios', 'verParte',
    'editarParte', 'exportar', 'administrar'],
  adscripcion: ['verInasistencias', 'editarInasistencias', 'verHorarios', 'verParte',
    'editarParte', 'exportar'],
  administrativo: ['verInasistencias', 'verHorarios', 'verParte', 'exportar'],
  psicologia: ['verInasistencias', 'verHorarios', 'verParte'],
  docente: ['verHorarios'],
  lectura: ['verInasistencias', 'verHorarios', 'verParte'],
};

var PERMISO_POR_ACCION = {
  estado: 'verInasistencias',
  usuarios: 'administrar',
  guardarConfig: 'administrar',
  guardarUsuario: 'administrar',
  eliminarUsuario: 'administrar',
  guardarInasistencia: 'editarInasistencias',
  eliminarInasistencia: 'editarInasistencias',
  guardarParte: 'editarParte',
  exportarParteADrive: 'exportar',
  reemplazarHorario: 'editarHorarios',
  guardarClase: 'editarHorarios',
  eliminarClase: 'editarHorarios',
  eliminarAnio: 'editarHorarios',
  restaurar: 'administrar',
};

/* ============================================================
   Puntos de entrada HTTP
   ============================================================ */

function doGet(e) {
  return manejar((e && e.parameter) || {});
}

function doPost(e) {
  var cuerpo = {};
  try {
    if (e && e.postData && e.postData.contents) cuerpo = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'El cuerpo del pedido no es JSON válido.' });
  }
  var params = {};
  if (e && e.parameter) for (var k in e.parameter) params[k] = e.parameter[k];
  for (var k2 in cuerpo) params[k2] = cuerpo[k2];
  return manejar(params);
}

function manejar(params) {
  var accion = params.action || 'ping';
  try {
    if (accion === 'ping') {
      return responder({ ok: true, version: VERSION, instalado: estaInstalado() });
    }

    var usuario = resolverUsuario(params.token);

    if (accion === 'sesion') {
      return responder({
        ok: true,
        autenticado: !!usuario,
        instalado: estaInstalado(),
        nombre: usuario ? usuario.nombre : '',
        email: usuario ? usuario.email : '',
        rol: usuario ? usuario.rol : 'lectura',
        permisos: usuario ? (PERMISOS_POR_ROL[usuario.rol] || []) : [],
        carpetaUrl: estaInstalado() ? carpetaRaiz().getUrl() : '',
      });
    }

    if (accion === 'instalar') {
      // Antes de la primera instalación cualquiera puede instalar (todavía no
      // hay usuarios); después hace falta ser administrador.
      if (estaInstalado() && !tienePermiso(usuario, 'administrar')) {
        return responder({ ok: false, error: 'Sólo un administrador puede volver a ejecutar la configuración inicial.' });
      }
      return responder(instalar(params.liceo, params.carpetaId));
    }

    if (!estaInstalado()) {
      return responder({ ok: false, error: 'El sistema todavía no fue configurado. Ejecutá la configuración inicial.' });
    }

    var permiso = PERMISO_POR_ACCION[accion];
    if (permiso && !tienePermiso(usuario, permiso)) {
      return responder({ ok: false, error: 'No tenés permisos para realizar esta acción (' + accion + ').' });
    }

    switch (accion) {
      case 'estado': return responder({ ok: true, datos: leerTodo() });
      case 'usuarios': return responder({ ok: true, usuarios: leerUsuarios() });
      case 'guardarConfig': return responder(guardarConfig(params.config));
      case 'guardarUsuario': return responder(guardarUsuario(params.usuario));
      case 'eliminarUsuario': return responder(eliminarUsuario(params.id, params.email));
      case 'guardarInasistencia': return responder(guardarInasistencia(params.item));
      case 'eliminarInasistencia': return responder(eliminarFila(hoja(HOJAS.inasistencias), 'id', params.id));
      case 'guardarParte': return responder(guardarParte(params.fecha, params.parte));
      case 'exportarParteADrive': return responder(exportarParteADrive(params.fecha, params.parte));
      case 'reemplazarHorario': return responder(reemplazarHorario(params.anio, params.clases, params.meta));
      case 'guardarClase': return responder(guardarClase(params.item));
      case 'eliminarClase': return responder(eliminarFila(hoja(HOJAS.horarios), 'id', params.id));
      case 'eliminarAnio': return responder(eliminarAnio(params.anio));
      case 'restaurar': return responder(restaurar(params.datos));
      default: return responder({ ok: false, error: 'Acción desconocida: ' + accion });
    }
  } catch (err) {
    return responder({ ok: false, error: String((err && err.message) || err) });
  }
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   Configuración inicial
   ============================================================ */

/** Se puede ejecutar a mano desde el editor de Apps Script. */
function configuracionInicial() {
  var resultado = instalar('Liceo', '');
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function props() { return PropertiesService.getScriptProperties(); }

function estaInstalado() {
  var id = props().getProperty('CARPETA_ID');
  if (!id) return false;
  try { DriveApp.getFolderById(id); return true; } catch (e) { return false; }
}

function carpetaRaiz() { return DriveApp.getFolderById(props().getProperty('CARPETA_ID')); }

function subcarpeta(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function planillaEn(carpeta, nombre) {
  var it = carpeta.getFilesByName(nombre);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  var ss = SpreadsheetApp.create(nombre);
  var archivo = DriveApp.getFileById(ss.getId());
  carpeta.addFile(archivo);
  DriveApp.getRootFolder().removeFile(archivo);
  return ss;
}

function instalar(nombreLiceo, carpetaId) {
  var liceo = (nombreLiceo || 'Liceo').trim() || 'Liceo';
  var raiz;
  if (carpetaId) {
    raiz = DriveApp.getFolderById(carpetaId.trim());
  } else if (estaInstalado()) {
    raiz = carpetaRaiz();
  } else {
    raiz = DriveApp.createFolder('Gestión Educativa – ' + liceo);
  }
  props().setProperty('CARPETA_ID', raiz.getId());

  var cConfig = subcarpeta(raiz, CARPETAS.config);
  var cHorarios = subcarpeta(raiz, CARPETAS.horarios);
  subcarpeta(cHorarios, 'Originales');
  var cInasistencias = subcarpeta(raiz, CARPETAS.inasistencias);
  var cPartes = subcarpeta(raiz, CARPETAS.partes);
  subcarpeta(raiz, CARPETAS.exportaciones);

  var ssConfig = planillaEn(cConfig, 'Configuración – ' + liceo);
  props().setProperty('CONFIG_ID', ssConfig.getId());
  prepararHoja(ssConfig, HOJAS.general, ENCABEZADOS.general);
  prepararHoja(ssConfig, HOJAS.usuarios, ENCABEZADOS.usuarios);
  prepararHoja(ssConfig, HOJAS.turnos, ENCABEZADOS.turnos);
  prepararHoja(ssConfig, HOJAS.anios, ENCABEZADOS.anios);
  prepararHoja(ssConfig, HOJAS.motivos, ENCABEZADOS.motivos);
  var hojaVacia = ssConfig.getSheetByName('Hoja 1') || ssConfig.getSheetByName('Sheet1');
  if (hojaVacia && ssConfig.getSheets().length > 1) ssConfig.deleteSheet(hojaVacia);

  var ssDatos = planillaEn(cHorarios, 'Horarios – ' + liceo);
  props().setProperty('HORARIOS_ID', ssDatos.getId());
  prepararHoja(ssDatos, HOJAS.horarios, ENCABEZADOS.horarios);
  limpiarHojaInicial(ssDatos);

  var ssInas = planillaEn(cInasistencias, 'Inasistencias – ' + liceo);
  props().setProperty('INASISTENCIAS_ID', ssInas.getId());
  prepararHoja(ssInas, HOJAS.inasistencias, ENCABEZADOS.inasistencias);
  limpiarHojaInicial(ssInas);

  var ssPartes = planillaEn(cPartes, 'Partes diarios – ' + liceo);
  props().setProperty('PARTES_ID', ssPartes.getId());
  prepararHoja(ssPartes, HOJAS.partes, ENCABEZADOS.partes);
  limpiarHojaInicial(ssPartes);

  // Valores iniciales de configuración.
  if (!leerGeneral().liceo) {
    escribirGeneral({ liceo: liceo, anioActivo: new Date().getFullYear() });
  }
  if (!leerTurnos().length) escribirTurnos(turnosPorDefecto());
  if (!leerMotivos().length) escribirMotivos(['Inasistencia', 'Licencia médica', 'Licencia por estudio',
    'Paro', 'Actividad institucional', 'Otro']);
  if (!leerAnios().length) {
    escribirAnios([{ anio: new Date().getFullYear(), estado: 'activo', origen: '', actualizado: '', clases: 0 }]);
  }

  // Formulario de aviso de inasistencia.
  var form = asegurarFormulario(cInasistencias, ssInas, liceo);

  // Primer usuario administrador.
  var codigoAdmin = '';
  var usuarios = leerUsuarios();
  if (!usuarios.length) {
    var email = '';
    try { email = Session.getEffectiveUser().getEmail(); } catch (e) { email = ''; }
    codigoAdmin = generarCodigo();
    guardarUsuario({
      id: 'usr_admin', nombre: 'Administrador', email: email, rol: 'admin',
      codigo: codigoAdmin, activo: true, observaciones: 'Creado por la configuración inicial',
    });
  }

  asegurarDisparadores();

  return {
    ok: true,
    carpetaId: raiz.getId(),
    carpetaUrl: raiz.getUrl(),
    configUrl: ssConfig.getUrl(),
    horariosUrl: ssDatos.getUrl(),
    inasistenciasUrl: ssInas.getUrl(),
    partesUrl: ssPartes.getUrl(),
    respuestasUrl: ssInas.getUrl(),
    formUrl: form ? form.getPublishedUrl() : '',
    formEdicionUrl: form ? form.getEditUrl() : '',
    codigoAdmin: codigoAdmin,
  };
}

function limpiarHojaInicial(ss) {
  var h = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (h && ss.getSheets().length > 1) ss.deleteSheet(h);
}

function prepararHoja(ss, nombre, encabezados) {
  var h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  var actual = h.getLastColumn() ? h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0] : [];
  var faltan = actual.length !== encabezados.length;
  if (!faltan) {
    for (var i = 0; i < encabezados.length; i++) {
      if (String(actual[i]).trim() !== encabezados[i]) { faltan = true; break; }
    }
  }
  if (faltan) {
    h.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
}

function asegurarFormulario(carpeta, ssRespuestas, liceo) {
  var formId = props().getProperty('FORM_ID');
  if (formId) {
    try { return FormApp.openById(formId); } catch (e) { /* se recrea */ }
  }
  var form = FormApp.create('Aviso de inasistencia docente – ' + liceo);
  form.setDescription('Completá este formulario para avisar que no vas a asistir. Adscripción recibe el aviso y el sistema cruza automáticamente tus clases de ese día.');
  form.setCollectEmail(false);

  form.addTextItem().setTitle('Nombre del docente').setRequired(true)
    .setHelpText('Escribilo como figura en el horario institucional (por ejemplo: Da Fonte, Alejandra).');
  form.addDateItem().setTitle('Fecha de la inasistencia').setRequired(true);
  form.addTextItem().setTitle('Liceo / centro educativo').setRequired(false);
  form.addListItem().setTitle('Turno').setChoiceValues(['Matutino', 'Vespertino', 'Nocturno']).setRequired(false);
  form.addListItem().setTitle('Motivo')
    .setChoiceValues(leerMotivos().length ? leerMotivos() : ['Inasistencia', 'Licencia médica', 'Otro'])
    .setRequired(false);
  form.addParagraphTextItem().setTitle('Observaciones').setRequired(false);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ssRespuestas.getId());
  var archivo = DriveApp.getFileById(form.getId());
  carpeta.addFile(archivo);
  DriveApp.getRootFolder().removeFile(archivo);
  props().setProperty('FORM_ID', form.getId());
  return form;
}

function asegurarDisparadores() {
  var existentes = ScriptApp.getProjectTriggers();
  var yaEsta = false;
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'alRecibirFormulario') yaEsta = true;
  }
  if (yaEsta) return;
  var ssId = props().getProperty('INASISTENCIAS_ID');
  if (!ssId) return;
  ScriptApp.newTrigger('alRecibirFormulario')
    .forSpreadsheet(ssId)
    .onFormSubmit()
    .create();
}

/* ============================================================
   Acceso a las hojas
   ============================================================ */

function ssConfig() { return SpreadsheetApp.openById(props().getProperty('CONFIG_ID')); }
function ssHorarios() { return SpreadsheetApp.openById(props().getProperty('HORARIOS_ID')); }
function ssInasistencias() { return SpreadsheetApp.openById(props().getProperty('INASISTENCIAS_ID')); }
function ssPartes() { return SpreadsheetApp.openById(props().getProperty('PARTES_ID')); }

function hoja(nombre) {
  if (nombre === HOJAS.horarios) return prepararHoja(ssHorarios(), nombre, ENCABEZADOS.horarios);
  if (nombre === HOJAS.inasistencias) return prepararHoja(ssInasistencias(), nombre, ENCABEZADOS.inasistencias);
  if (nombre === HOJAS.partes) return prepararHoja(ssPartes(), nombre, ENCABEZADOS.partes);
  return prepararHoja(ssConfig(), nombre, ENCABEZADOS[claveDeHoja(nombre)]);
}

function claveDeHoja(nombre) {
  for (var k in HOJAS) if (HOJAS[k] === nombre) return k;
  return nombre;
}

function leerTabla(h) {
  var valores = h.getDataRange().getValues();
  if (valores.length < 2) return [];
  var encabezados = valores[0];
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var fila = valores[i];
    var vacia = true;
    var obj = {};
    for (var c = 0; c < encabezados.length; c++) {
      var clave = String(encabezados[c]).trim();
      if (!clave) continue;
      var v = fila[c];
      if (v !== '' && v !== null && v !== undefined) vacia = false;
      obj[clave] = v;
    }
    if (!vacia) { obj.__fila = i + 1; filas.push(obj); }
  }
  return filas;
}

function escribirTabla(h, encabezados, filas) {
  h.clear();
  h.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
  h.setFrozenRows(1);
  if (!filas.length) return;
  var matriz = filas.map(function (f) {
    return encabezados.map(function (k) {
      var v = f[k];
      if (v === undefined || v === null) return '';
      if (Object.prototype.toString.call(v) === '[object Array]') return v.join(',');
      if (typeof v === 'boolean') return v ? 'sí' : 'no';
      return v;
    });
  });
  h.getRange(2, 1, matriz.length, encabezados.length).setValues(matriz);
}

function upsertFila(h, encabezados, clave, item) {
  var filas = leerTabla(h);
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][clave]) === String(item[clave])) {
      var valores = encabezados.map(function (k) {
        var v = item[k];
        if (v === undefined || v === null) return '';
        if (Object.prototype.toString.call(v) === '[object Array]') return v.join(',');
        if (typeof v === 'boolean') return v ? 'sí' : 'no';
        return v;
      });
      h.getRange(filas[i].__fila, 1, 1, encabezados.length).setValues([valores]);
      return { ok: true, actualizado: true };
    }
  }
  var nueva = encabezados.map(function (k) {
    var v = item[k];
    if (v === undefined || v === null) return '';
    if (Object.prototype.toString.call(v) === '[object Array]') return v.join(',');
    if (typeof v === 'boolean') return v ? 'sí' : 'no';
    return v;
  });
  h.appendRow(nueva);
  return { ok: true, creado: true };
}

function eliminarFila(h, clave, valor) {
  var filas = leerTabla(h);
  for (var i = filas.length - 1; i >= 0; i--) {
    if (String(filas[i][clave]) === String(valor)) h.deleteRow(filas[i].__fila);
  }
  return { ok: true };
}

/* ============================================================
   Usuarios y permisos
   ============================================================ */

function leerUsuarios() {
  return leerTabla(hoja(HOJAS.usuarios)).map(function (u) {
    return {
      id: String(u.id || ''),
      nombre: String(u.nombre || ''),
      email: String(u.email || ''),
      rol: String(u.rol || 'lectura'),
      codigo: String(u.codigo || ''),
      activo: !(String(u.activo).toLowerCase() === 'no' || u.activo === false),
      observaciones: String(u.observaciones || ''),
    };
  });
}

function resolverUsuario(token) {
  if (!estaInstalado()) return { id: 'bootstrap', nombre: 'Instalación', email: '', rol: 'admin', activo: true };
  var usuarios = leerUsuarios();
  if (!usuarios.length) return { id: 'bootstrap', nombre: 'Instalación', email: '', rol: 'admin', activo: true };
  var codigo = String(token || '').trim();
  if (!codigo) return null;
  for (var i = 0; i < usuarios.length; i++) {
    if (usuarios[i].codigo && usuarios[i].codigo === codigo && usuarios[i].activo) return usuarios[i];
  }
  return null;
}

function tienePermiso(usuario, permiso) {
  if (!usuario) return false;
  var permisos = PERMISOS_POR_ROL[usuario.rol] || [];
  return permisos.indexOf(permiso) >= 0;
}

function guardarUsuario(usuario) {
  if (!usuario || !usuario.nombre) return { ok: false, error: 'Falta el nombre del usuario.' };
  var item = {
    id: usuario.id || 'usr_' + Utilities.getUuid().slice(0, 8),
    nombre: usuario.nombre,
    email: usuario.email || '',
    rol: usuario.rol || 'lectura',
    codigo: usuario.codigo || generarCodigo(),
    activo: usuario.activo === false ? false : true,
    observaciones: usuario.observaciones || '',
  };
  upsertFila(hoja(HOJAS.usuarios), ENCABEZADOS.usuarios, 'id', item);
  return { ok: true, usuario: item };
}

function eliminarUsuario(id, email) {
  var h = hoja(HOJAS.usuarios);
  if (id) eliminarFila(h, 'id', id);
  else if (email) eliminarFila(h, 'email', email);
  return { ok: true };
}

function generarCodigo() {
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < 10; i++) s += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  return s.slice(0, 5) + '-' + s.slice(5);
}

/* ============================================================
   Configuración (General / Turnos / Años / Motivos)
   ============================================================ */

function leerGeneral() {
  var filas = leerTabla(hoja(HOJAS.general));
  var out = {};
  for (var i = 0; i < filas.length; i++) out[String(filas[i].clave)] = filas[i].valor;
  return out;
}

function escribirGeneral(objeto) {
  var previo = leerGeneral();
  for (var k in objeto) previo[k] = objeto[k];
  var filas = [];
  for (var clave in previo) filas.push({ clave: clave, valor: previo[clave] });
  escribirTabla(hoja(HOJAS.general), ENCABEZADOS.general, filas);
}

function turnosPorDefecto() {
  return [
    { id: 'matutino', nombre: 'Matutino', modulos: [
      { n: 1, inicio: '07:30', fin: '08:15' }, { n: 2, inicio: '08:15', fin: '09:00' },
      { n: 3, inicio: '09:10', fin: '09:55' }, { n: 4, inicio: '09:55', fin: '10:40' },
      { n: 5, inicio: '10:50', fin: '11:35' }, { n: 6, inicio: '11:35', fin: '12:20' },
      { n: 7, inicio: '12:20', fin: '13:05' }] },
    { id: 'vespertino', nombre: 'Vespertino', modulos: [
      { n: 1, inicio: '12:05', fin: '12:50' }, { n: 2, inicio: '13:10', fin: '13:55' },
      { n: 3, inicio: '14:05', fin: '14:45' }, { n: 4, inicio: '14:45', fin: '15:25' },
      { n: 5, inicio: '15:30', fin: '16:15' }, { n: 6, inicio: '16:20', fin: '17:05' },
      { n: 7, inicio: '17:10', fin: '17:50' }, { n: 8, inicio: '17:50', fin: '18:30' }] },
  ];
}

function leerTurnos() {
  var filas = leerTabla(hoja(HOJAS.turnos));
  var mapa = {};
  var orden = [];
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var id = String(f.turno || '').trim();
    if (!id) continue;
    if (!mapa[id]) { mapa[id] = { id: id, nombre: String(f.nombre || id), modulos: [] }; orden.push(id); }
    if (f.modulo !== '' && f.modulo !== null && f.modulo !== undefined) {
      mapa[id].modulos.push({ n: Number(f.modulo), inicio: aHora(f.inicio), fin: aHora(f.fin) });
    }
  }
  return orden.map(function (id) {
    mapa[id].modulos.sort(function (a, b) { return a.n - b.n; });
    return mapa[id];
  });
}

function escribirTurnos(turnos) {
  var filas = [];
  for (var i = 0; i < turnos.length; i++) {
    var t = turnos[i];
    for (var m = 0; m < t.modulos.length; m++) {
      filas.push({ turno: t.id, nombre: t.nombre, modulo: t.modulos[m].n,
        inicio: t.modulos[m].inicio, fin: t.modulos[m].fin });
    }
  }
  escribirTabla(hoja(HOJAS.turnos), ENCABEZADOS.turnos, filas);
}

function leerAnios() {
  return leerTabla(hoja(HOJAS.anios)).map(function (a) {
    return {
      anio: Number(a.anio), estado: String(a.estado || 'pendiente'),
      origen: String(a.origen || ''), actualizado: aTextoFecha(a.actualizado),
      clases: Number(a.clases || 0),
    };
  }).filter(function (a) { return !!a.anio; });
}

function escribirAnios(anios) {
  escribirTabla(hoja(HOJAS.anios), ENCABEZADOS.anios, anios);
}

function leerMotivos() {
  return leerTabla(hoja(HOJAS.motivos)).map(function (m) { return String(m.motivo); }).filter(String);
}

function escribirMotivos(motivos) {
  escribirTabla(hoja(HOJAS.motivos), ENCABEZADOS.motivos,
    motivos.map(function (m) { return { motivo: m }; }));
}

function leerConfig() {
  var general = leerGeneral();
  var liceos = String(general.liceos || general.liceo || '').split(',')
    .map(function (s) { return s.trim(); }).filter(String);
  return {
    liceo: String(general.liceo || 'Liceo'),
    liceos: liceos.length ? liceos : [String(general.liceo || 'Liceo')],
    anioActivo: Number(general.anioActivo) || new Date().getFullYear(),
    anios: leerAnios(),
    turnos: leerTurnos(),
    motivos: leerMotivos(),
  };
}

function guardarConfig(config) {
  if (!config) return { ok: false, error: 'Falta la configuración.' };
  escribirGeneral({
    liceo: config.liceo || '',
    liceos: (config.liceos || []).join(', '),
    anioActivo: config.anioActivo || new Date().getFullYear(),
  });
  if (config.turnos) escribirTurnos(config.turnos);
  if (config.anios) escribirAnios(config.anios);
  if (config.motivos) escribirMotivos(config.motivos);
  return { ok: true };
}

/* ============================================================
   Horarios
   ============================================================ */

function leerHorarios() {
  return leerTabla(hoja(HOJAS.horarios)).map(function (c) {
    return {
      id: String(c.id || ''), anio: Number(c.anio), dia: Number(c.dia), hora: Number(c.hora),
      turno: String(c.turno || ''), grupo: String(c.grupo || ''), materia: String(c.materia || ''),
      docente: String(c.docente || ''), salon: String(c.salon || ''),
    };
  }).filter(function (c) { return c.anio && c.dia && c.hora; });
}

function guardarClase(item) {
  if (!item) return { ok: false, error: 'Falta la clase.' };
  if (!item.id) item.id = 'cl_' + Utilities.getUuid().slice(0, 8);
  upsertFila(hoja(HOJAS.horarios), ENCABEZADOS.horarios, 'id', item);
  return { ok: true, item: item };
}

function reemplazarHorario(anio, clases, meta) {
  var h = hoja(HOJAS.horarios);
  var resto = leerHorarios().filter(function (c) { return Number(c.anio) !== Number(anio); });
  var nuevas = (clases || []).map(function (c) {
    return {
      id: c.id || 'cl_' + Utilities.getUuid().slice(0, 8),
      anio: Number(anio), dia: Number(c.dia), hora: Number(c.hora), turno: c.turno || '',
      grupo: c.grupo || '', materia: c.materia || '', docente: c.docente || '', salon: c.salon || '',
    };
  });
  escribirTabla(h, ENCABEZADOS.horarios, resto.concat(nuevas));

  var anios = leerAnios();
  var encontrado = false;
  for (var i = 0; i < anios.length; i++) {
    if (Number(anios[i].anio) === Number(anio)) {
      anios[i].origen = (meta && meta.origen) || anios[i].origen;
      anios[i].actualizado = new Date().toISOString();
      anios[i].clases = nuevas.length;
      encontrado = true;
    }
  }
  if (!encontrado) {
    anios.push({ anio: Number(anio), estado: 'pendiente', origen: (meta && meta.origen) || '',
      actualizado: new Date().toISOString(), clases: nuevas.length });
  }
  anios.sort(function (a, b) { return a.anio - b.anio; });
  escribirAnios(anios);
  return { ok: true, clases: nuevas.length };
}

function eliminarAnio(anio) {
  var h = hoja(HOJAS.horarios);
  var resto = leerHorarios().filter(function (c) { return Number(c.anio) !== Number(anio); });
  escribirTabla(h, ENCABEZADOS.horarios, resto);
  escribirAnios(leerAnios().filter(function (a) { return Number(a.anio) !== Number(anio); }));
  return { ok: true };
}

/* ============================================================
   Inasistencias
   ============================================================ */

function leerInasistencias() {
  return leerTabla(hoja(HOJAS.inasistencias)).map(function (i) {
    return {
      id: String(i.id || ''),
      timestamp: aTextoFecha(i.timestamp),
      docente: String(i.docente || ''),
      fecha: aFechaISO(i.fecha),
      liceo: String(i.liceo || ''),
      turno: String(i.turno || '').toLowerCase(),
      motivo: String(i.motivo || ''),
      observaciones: String(i.observaciones || ''),
      estado: String(i.estado || 'nueva'),
      origen: String(i.origen || 'formulario'),
      horas: String(i.horas || '').split(',').map(Number).filter(function (n) { return !!n; }),
    };
  }).filter(function (i) { return i.docente && i.fecha; });
}

function guardarInasistencia(item) {
  if (!item) return { ok: false, error: 'Falta el aviso.' };
  if (!item.id) item.id = 'ina_' + Utilities.getUuid().slice(0, 8);
  if (!item.timestamp) item.timestamp = new Date().toISOString();
  upsertFila(hoja(HOJAS.inasistencias), ENCABEZADOS.inasistencias, 'id', item);
  return { ok: true, item: item };
}

/** Disparador onFormSubmit: pasa la respuesta del formulario a la hoja «Inasistencias». */
function alRecibirFormulario(e) {
  try {
    var valores = {};
    if (e && e.namedValues) {
      for (var k in e.namedValues) valores[normalizarClave(k)] = String(e.namedValues[k][0] || '').trim();
    }
    var item = {
      id: 'ina_' + Utilities.getUuid().slice(0, 8),
      timestamp: new Date().toISOString(),
      docente: valores['nombre del docente'] || valores['docente'] || '',
      fecha: aFechaISO(valores['fecha de la inasistencia'] || valores['fecha'] || ''),
      liceo: valores['liceo / centro educativo'] || valores['liceo'] || leerGeneral().liceo || '',
      turno: (valores['turno'] || '').toLowerCase(),
      motivo: valores['motivo'] || 'Inasistencia',
      observaciones: valores['observaciones'] || '',
      estado: 'nueva',
      origen: 'formulario',
      horas: '',
    };
    if (!item.docente || !item.fecha) return;
    upsertFila(hoja(HOJAS.inasistencias), ENCABEZADOS.inasistencias, 'id', item);
  } catch (err) {
    console.error('alRecibirFormulario: ' + err);
  }
}

function normalizarClave(texto) {
  return String(texto).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/* ============================================================
   Partes diarios
   ============================================================ */

function leerPartes() {
  var filas = leerTabla(hoja(HOJAS.partes));
  var partes = {};
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var fecha = aFechaISO(f.fecha);
    if (!fecha) continue;
    if (!partes[fecha]) partes[fecha] = { fecha: fecha, filas: [], cerrado: false, actualizado: '' };
    if (String(f.cerrado).toLowerCase() === 'sí' || f.cerrado === true) partes[fecha].cerrado = true;
    partes[fecha].filas.push({
      id: String(f.id || ''), fecha: fecha, hora: Number(f.hora || 0), turno: String(f.turno || ''),
      docente: String(f.docente || ''), grupo: String(f.grupo || ''), materia: String(f.materia || ''),
      salon: String(f.salon || ''), motivo: String(f.motivo || ''), cobertura: String(f.cobertura || ''),
      observaciones: String(f.observaciones || ''), origen: String(f.origen || 'automatico'),
      editado: String(f.editado).toLowerCase() === 'sí' || f.editado === true,
      inasistenciaId: String(f.inasistenciaId || ''),
    });
  }
  return partes;
}

function guardarParte(fecha, parte) {
  if (!fecha || !parte) return { ok: false, error: 'Falta el parte.' };
  var h = hoja(HOJAS.partes);
  var otras = leerTabla(h).filter(function (f) { return aFechaISO(f.fecha) !== fecha; })
    .map(function (f) {
      var copia = {};
      for (var i = 0; i < ENCABEZADOS.partes.length; i++) {
        var k = ENCABEZADOS.partes[i];
        copia[k] = k === 'fecha' ? aFechaISO(f.fecha) : f[k];
      }
      return copia;
    });
  var nuevas = (parte.filas || []).map(function (f) {
    return {
      id: f.id || 'pd_' + Utilities.getUuid().slice(0, 8),
      fecha: fecha, hora: Number(f.hora || 0), turno: f.turno || '', docente: f.docente || '',
      grupo: f.grupo || '', materia: f.materia || '', salon: f.salon || '', motivo: f.motivo || '',
      cobertura: f.cobertura || '', observaciones: f.observaciones || '',
      origen: f.origen || 'automatico', editado: !!f.editado,
      inasistenciaId: f.inasistenciaId || '', cerrado: !!parte.cerrado,
    };
  });
  escribirTabla(h, ENCABEZADOS.partes, otras.concat(nuevas));
  return { ok: true, filas: nuevas.length };
}

/** Deja una copia del parte como planilla dentro de 04 · Partes diarios/AAAA/MM. */
function exportarParteADrive(fecha, parte) {
  if (!fecha) return { ok: false, error: 'Falta la fecha.' };
  var partes = subcarpeta(carpetaRaiz(), CARPETAS.partes);
  var anio = String(fecha).slice(0, 4);
  var mes = String(fecha).slice(5, 7);
  var carpetaMes = subcarpeta(subcarpeta(partes, anio), mes);
  var nombre = 'Parte diario ' + fecha;

  var it = carpetaMes.getFilesByName(nombre);
  var ss = it.hasNext() ? SpreadsheetApp.open(it.next()) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(nombre);
    var archivo = DriveApp.getFileById(ss.getId());
    carpetaMes.addFile(archivo);
    DriveApp.getRootFolder().removeFile(archivo);
  }

  var h = ss.getSheets()[0];
  h.clear();
  var config = leerConfig();
  var filas = [
    [config.liceo + ' — Parte diario'],
    [fecha],
    [],
    ['Hora', 'Turno', 'Docente', 'Grupo', 'Materia', 'Salón', 'Motivo', 'Cobertura', 'Observaciones'],
  ];
  var lista = (parte && parte.filas) || (leerPartes()[fecha] ? leerPartes()[fecha].filas : []);
  for (var i = 0; i < lista.length; i++) {
    var f = lista[i];
    filas.push([f.hora || '', f.turno || '', f.docente || '', f.grupo || '', f.materia || '',
      f.salon || '', f.motivo || '', f.cobertura || '', f.observaciones || '']);
  }
  var ancho = 9;
  for (var r = 0; r < filas.length; r++) {
    while (filas[r].length < ancho) filas[r].push('');
  }
  h.getRange(1, 1, filas.length, ancho).setValues(filas);
  h.getRange(1, 1, 1, ancho).setFontWeight('bold').setFontSize(13);
  h.getRange(4, 1, 1, ancho).setFontWeight('bold');
  h.setFrozenRows(4);
  SpreadsheetApp.flush();

  return { ok: true, url: ss.getUrl(), id: ss.getId(), registros: lista.length };
}

/* ============================================================
   Lectura completa y restauración
   ============================================================ */

function leerTodo() {
  return {
    config: leerConfig(),
    horarios: leerHorarios(),
    inasistencias: leerInasistencias(),
    partes: leerPartes(),
  };
}

function restaurar(datos) {
  if (!datos) return { ok: false, error: 'Faltan los datos del respaldo.' };
  if (datos.config) guardarConfig(datos.config);
  if (datos.horarios) {
    escribirTabla(hoja(HOJAS.horarios), ENCABEZADOS.horarios, datos.horarios);
  }
  if (datos.inasistencias) {
    escribirTabla(hoja(HOJAS.inasistencias), ENCABEZADOS.inasistencias, datos.inasistencias.map(function (i) {
      var copia = {};
      for (var k in i) copia[k] = i[k];
      copia.horas = (i.horas || []).join(',');
      return copia;
    }));
  }
  if (datos.partes) {
    var filas = [];
    for (var fecha in datos.partes) {
      var p = datos.partes[fecha];
      for (var i = 0; i < (p.filas || []).length; i++) {
        var f = p.filas[i];
        f.fecha = fecha;
        f.cerrado = !!p.cerrado;
        filas.push(f);
      }
    }
    escribirTabla(hoja(HOJAS.partes), ENCABEZADOS.partes, filas);
  }
  return { ok: true };
}

/* ============================================================
   Utilidades de formato
   ============================================================ */

function aFechaISO(valor) {
  if (!valor && valor !== 0) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, zonaHoraria(), 'yyyy-MM-dd');
  }
  var s = String(valor).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    var y = Number(m[3]);
    if (y < 100) y += 2000;
    return y + '-' + pad(m[2]) + '-' + pad(m[1]);
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, zonaHoraria(), 'yyyy-MM-dd');
  return '';
}

function aTextoFecha(valor) {
  if (!valor) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') return valor.toISOString();
  return String(valor);
}

function aHora(valor) {
  if (!valor && valor !== 0) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, zonaHoraria(), 'HH:mm');
  }
  return String(valor).trim();
}

function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }

function zonaHoraria() {
  try { return Session.getScriptTimeZone() || 'America/Montevideo'; }
  catch (e) { return 'America/Montevideo'; }
}
