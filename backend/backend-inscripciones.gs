/**
 * STORYCRAFTERS · Backend de inscripciones (Google Apps Script, Web App)
 *
 * Flujo: la landing envía los datos del inscrito + la referencia del pago aprobado en la pasarela.
 * Este script revisa cupo y tarifa, confirma o cobra el pago con la pasarela,
 * guarda la inscripción en Google Sheets y envía el correo de confirmación.
 * Si algo no cuadra (cupo lleno, monto distinto), NO se cobra.
 *
 * Instalación: ver LEEME.md en la misma carpeta.
 */

// ---------- Configuración ----------
const EVENTO = {
  nombre: 'STORYCRAFTERS',
  fecha: 'Sábado 12 de diciembre de 2026, 8:00 a 18:30',
  lugar: 'Estudios Alfa y Omega Visión, San Pedro Sula, Honduras',
  cupo: 40,
  cupoEstudiantes: 10,
  zona: 'America/Tegucigalpa',
};

// Los precios oficiales son en dólares (PayPal cobra en USD). hnl queda solo como referencia
// interna para la hoja (columna "Precio (L)"), con la venta BCH del 15 oct 2026 (~27.03).
const TARIFAS = {
  preventa:   { nombre: 'Preventa',      usd: 64, hnl: 1700, desde: '2026-01-01', hasta: '2026-11-05' },
  regular:    { nombre: 'Regular',       usd: 72, hnl: 1900, desde: '2026-11-06', hasta: '2026-11-25' },
  finales:    { nombre: 'Cupos finales', usd: 82, hnl: 2200, desde: '2026-11-26', hasta: '2026-12-11' },
  estudiante: { nombre: 'Estudiante',    usd: 64, hnl: 1700, desde: '2026-01-01', hasta: '2026-12-11', carne: true },
};

const WHATSAPP_EQUIPO = '+504 9252-0327';

// Modo de prueba: acepta pagos ficticios (pasarela "prueba") para probar la hoja y el correo.
// Ponlo en false antes de abrir inscripciones reales.
const MODO_PRUEBA = true;
const REMITENTE = 'STORYCRAFTERS · Media Builders';
const CORREO_EVENTO = 'storycrafters@themediabuilders.com';

// Columnas de la hoja "Inscritos" (orden fijo)
const COLUMNAS = [
  'Fecha de pago', 'Nombre (diploma y gafete)', 'Correo', 'WhatsApp', 'Ciudad', 'Ocupación',
  'Experiencia', 'Talla de camiseta', '¿Cómo se enteró?', 'Restricciones alimentarias',
  'Acepta comunicaciones', 'Tarifa', 'Precio (L)', 'Monto cobrado', 'Moneda', 'Pasarela', 'Referencia de pago', 'Comprobante',
  'Correo enviado', 'Carné verificado', 'Gafete impreso', 'Camiseta pedida', 'Notas',
];
const COL = {}; COLUMNAS.forEach(function (c, i) { COL[c] = i + 1; });

// Tarifa de estudiante: la persona sube la foto de su carné, alguien del equipo la revisa
// en la pestaña "Estudiantes" (columna Estado → Aprobado) y el script le envía un enlace
// personal, de un solo uso, para pagar la tarifa de estudiante en la landing.
const LANDING_URL = 'https://sc.themediabuilders.com/';
const ESTADOS = ['Pendiente', 'Aprobado', 'Rechazado'];
const COLUMNAS_EST = [
  'Fecha de solicitud', 'Nombre (diploma y gafete)', 'Correo', 'WhatsApp', 'Ciudad', 'Ocupación',
  'Experiencia', 'Talla de camiseta', '¿Cómo se enteró?', 'Restricciones alimentarias',
  'Acepta comunicaciones', 'Institución', 'Foto del carné', 'Estado', 'Revisión de Claude', 'Código',
  'Correo de respuesta', 'Pagado (referencia)', 'Notas',
];
const COL_EST = {}; COLUMNAS_EST.forEach(function (c, i) { COL_EST[c] = i + 1; });
const CARNE_MAX_BYTES = 6 * 1024 * 1024;

// Revisión automática del carné con Claude (API de Anthropic). La clave se guarda con guardarClaveClaude().
// Claude aprueba solo si el carné es legible, el nombre coincide y está vigente; si está vencido lo rechaza
// (la persona puede pagar la tarifa normal). En cualquier otro caso queda "Pendiente" para revisión humana.
// Ponlo en false para revisar todo a mano.
const REVISAR_CON_CLAUDE = true;
const CLAUDE_MODELO = 'claude-opus-5-5';
const CARNE_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

// ---------- Instalación (ejecutar una vez) ----------
function instalar() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  if (props.getProperty('HOJA_ID')) {
    ss = SpreadsheetApp.openById(props.getProperty('HOJA_ID'));
  } else {
    ss = SpreadsheetApp.create('Inscritos STORYCRAFTERS · 12 dic 2026');
    props.setProperty('HOJA_ID', ss.getId());
  }

  const hoja = ss.getSheets()[0].setName('Inscritos');
  hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS])
    .setBackground('#0A0A0A').setFontColor('#E8B654').setFontWeight('bold');
  hoja.setFrozenRows(1);
  ['Carné verificado', 'Gafete impreso', 'Camiseta pedida'].forEach(function (c) {
    hoja.getRange(2, COL[c], 500, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  });

  const col = function (c) { return 'Inscritos!' + letra(COL[c]) + '2:' + letra(COL[c]); };

  const control = ss.getSheetByName('Control') || ss.insertSheet('Control');
  control.clear();
  const filas = [
    ['STORYCRAFTERS · Control', ''],
    ['Cupo total', EVENTO.cupo],
    ['Inscritos pagados', '=COUNTA(' + col('Referencia de pago') + ')'],
    ['Cupos disponibles', '=B2-B3'],
    ['Ingresos (L)', '=SUM(' + col('Precio (L)') + ')'],
    ['Cobrado en USD (solo PayPal)', '=SUMIF(' + col('Moneda') + ',"USD",' + col('Monto cobrado') + ')'],
    ['', ''],
    ['Por tarifa', ''],
    ['Preventa', '=COUNTIF(' + col('Tarifa') + ',"Preventa")'],
    ['Regular', '=COUNTIF(' + col('Tarifa') + ',"Regular")'],
    ['Cupos finales', '=COUNTIF(' + col('Tarifa') + ',"Cupos finales")'],
    ['Estudiante', '=COUNTIF(' + col('Tarifa') + ',"Estudiante")'],
    ['', ''],
    ['Pedido de camisetas', 'Cantidad'],
  ];
  ['XS', 'S', 'M', 'L', 'XL', 'XXL'].forEach(function (t) {
    filas.push([t, '=COUNTIF(' + col('Talla de camiseta') + ',"' + t + '")']);
  });
  filas.push(['Total', '=SUM(B15:B20)']);
  control.getRange(1, 1, filas.length, 2).setValues(filas);
  control.getRange('A1').setFontWeight('bold').setFontSize(14);
  control.getRange('A8:B8').setFontWeight('bold');
  control.getRange('A14:B14').setFontWeight('bold');
  control.setColumnWidth(1, 220);

  // Pestaña para combinar correspondencia de gafetes (nombre, ocupación, ciudad)
  const gafetes = ss.getSheetByName('Gafetes') || ss.insertSheet('Gafetes');
  gafetes.clear();
  gafetes.getRange('A1').setFormula(
    '=QUERY(Inscritos!A:L,"select B, F, E, H, L where B is not null label B \'Nombre\', F \'Ocupación\', ' +
      'E \'Ciudad\', H \'Talla\', L \'Tarifa\'",1)'
  );

  // Pestaña de solicitudes de estudiante (se revisan a mano)
  const est = ss.getSheetByName('Estudiantes') || ss.insertSheet('Estudiantes');
  est.getRange(1, 1, 1, COLUMNAS_EST.length).setValues([COLUMNAS_EST])
    .setBackground('#0A0A0A').setFontColor('#E8B654').setFontWeight('bold');
  est.setFrozenRows(1);
  est.getRange(2, COL_EST['Estado'], 500, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build());
  est.getRange(1, COL_EST['Estado']).setNote('Revisa la foto del carné y cambia a "Aprobado" o "Rechazado". ' +
    'El correo al estudiante se envía solo. Si rechazas, puedes escribir el motivo en "Notas" antes de cambiar el estado.');

  // Carpeta privada de Drive para las fotos de carné
  if (!props.getProperty('CARPETA_CARNES_ID')) {
    props.setProperty('CARPETA_CARNES_ID', DriveApp.createFolder('Carnés STORYCRAFTERS · 12 dic 2026').getId());
  }

  // Disparador que envía el correo cuando cambias el Estado (se crea una sola vez)
  const yaExiste = ScriptApp.getProjectTriggers().some(function (tr) { return tr.getHandlerFunction() === 'alEditarHoja'; });
  if (!yaExiste) ScriptApp.newTrigger('alEditarHoja').forSpreadsheet(ss).onEdit().create();

  Logger.log('Hoja de inscritos: ' + ss.getUrl());
  Logger.log('Siguiente paso: Implementar > Nueva implementación > Aplicación web.');
}

/** Solo si usas PayPal. Guarda sus credenciales. Rellena y ejecuta una vez; luego borra los valores de aquí. */
function guardarCredencialesPayPal() {
  PropertiesService.getScriptProperties().setProperties({
    PAYPAL_CLIENT_ID: 'PEGA_AQUI_TU_CLIENT_ID',
    PAYPAL_SECRET: 'PEGA_AQUI_TU_SECRET',
    PAYPAL_ENTORNO: 'sandbox', // cambia a 'live' cuando termines de probar
  });
  Logger.log('Credenciales guardadas. Borra el Client ID y el Secret de este código.');
}

/** Solo si REVISAR_CON_CLAUDE = true. Guarda la clave de la API de Anthropic. Rellena, ejecuta una vez y bórrala de aquí. */
function guardarClaveClaude() {
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', 'PEGA_AQUI_TU_CLAVE');
  Logger.log('Clave guardada. Bórrala de este código.');
}

// ---------- API para la landing ----------

/**
 * GET: cupos disponibles y tarifas vigentes, para pintar el paso 02.
 * GET ?codigo=XXXX: valida el enlace de pago de un estudiante aprobado.
 */
function doGet(e) {
  const codigo = e && e.parameter && e.parameter.codigo;
  if (codigo) {
    const sol = buscarSolicitud(String(codigo));
    if (!sol) return json({ ok: false, error: 'Este enlace no es válido. Revisa que lo hayas copiado completo.' });
    if (sol.pagado) return json({ ok: false, error: 'Este enlace ya se usó: tu inscripción está pagada.' });
    if (sol.estado !== 'Aprobado') return json({ ok: false, error: 'Tu carné todavía no está aprobado.' });
    const t = TARIFAS.estudiante;
    return json({
      ok: true,
      estudiante: { nombre: sol.datos.nombre, correo: sol.datos.correo },
      tarifa: { id: 'estudiante', nombre: t.nombre, hnl: t.hnl, usd: t.usd, carne: true, disponible: hoyHN() <= t.hasta },
    });
  }
  const conteo = contarInscritos();
  const hoy = hoyHN();
  const tarifas = Object.keys(TARIFAS).map(function (id) {
    const t = TARIFAS[id];
    let disponible = hoy >= t.desde && hoy <= t.hasta;
    if (id === 'estudiante' && conteo.estudiantes >= EVENTO.cupoEstudiantes) disponible = false;
    return { id: id, nombre: t.nombre, hnl: t.hnl, usd: t.usd, carne: !!t.carne, disponible: disponible };
  });
  return json({ ok: true, cuposDisponibles: Math.max(0, EVENTO.cupo - conteo.total), tarifas: tarifas });
}

/** POST: { pago: { pasarela, referencia }, tarifa, datos }, enviado por la landing cuando la pasarela aprueba el pago. */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'Solicitud inválida.' });
  }

  if (body.accion === 'solicitudEstudiante') return solicitudEstudiante(body);

  let datos = body.datos || {};
  const pago = body.pago || (body.orderID ? { pasarela: 'paypal', referencia: body.orderID } : {});

  // Tarifa de estudiante: solo con el código del enlace que se envía al aprobar el carné.
  // Los datos salen de la solicitud aprobada, no de lo que mande la landing.
  let solicitud = null;
  if (body.tarifa === 'estudiante') {
    solicitud = body.codigo ? buscarSolicitud(String(body.codigo)) : null;
    if (!solicitud || solicitud.estado !== 'Aprobado') {
      return json({ ok: false, error: 'La tarifa de estudiante requiere un carné aprobado. No se realizó ningún cobro.' });
    }
    if (solicitud.pagado) return json({ ok: true, nombre: String(solicitud.datos.nombre).split(' ')[0], repetido: true });
    datos = solicitud.datos;
  }
  const faltan = ['nombre', 'correo', 'whatsapp', 'ciudad', 'ocupacion', 'experiencia', 'talla'].filter(function (k) {
    return !String(datos[k] || '').trim();
  });
  if (!pago.pasarela || !pago.referencia || faltan.length) return json({ ok: false, error: 'Faltan datos de la inscripción.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let fila;
  try {
    const hoja = hojaInscritos();

    // Si ya procesamos este pedido, responder igual (por si la landing reintenta)
    const previo = buscarPedido(hoja, String(pago.referencia));
    if (previo) return json({ ok: true, nombre: previo.nombre, repetido: true });

    const t = TARIFAS[body.tarifa];
    const hoy = hoyHN();
    if (!t || hoy < t.desde || hoy > t.hasta) return json({ ok: false, error: 'Esa tarifa ya no está disponible.' });

    const conteo = contarInscritos();
    if (conteo.total >= EVENTO.cupo) return json({ ok: false, error: 'Lo sentimos, los cupos se llenaron. No se realizó ningún cobro.' });
    if (t.carne && conteo.estudiantes >= EVENTO.cupoEstudiantes) {
      return json({ ok: false, error: 'Los cupos de estudiante se llenaron. No se realizó ningún cobro.' });
    }

    // Confirmar o cobrar con la pasarela (no cobra si el monto no coincide)
    const cobrar = PASARELAS[pago.pasarela];
    if (!cobrar) return json({ ok: false, error: 'Pasarela de pago no configurada. No se realizó ningún cobro.' });
    const cobro = cobrar(String(pago.referencia), t);
    if (!cobro.ok) return json({ ok: false, error: cobro.error });

    const registro = {};
    registro['Fecha de pago'] = new Date();
    registro['Nombre (diploma y gafete)'] = limpio(datos.nombre);
    registro['Correo'] = limpio(datos.correo);
    registro['WhatsApp'] = "'" + String(datos.whatsapp || '').trim().slice(0, 30);
    registro['Ciudad'] = limpio(datos.ciudad);
    registro['Ocupación'] = limpio(datos.ocupacion);
    registro['Experiencia'] = limpio(datos.experiencia);
    registro['Talla de camiseta'] = limpio(datos.talla);
    registro['¿Cómo se enteró?'] = limpio(datos.comoSeEntero);
    registro['Restricciones alimentarias'] = limpio(datos.restricciones);
    registro['Acepta comunicaciones'] = datos.comunicaciones ? 'Sí' : 'No';
    registro['Tarifa'] = t.nombre;
    registro['Precio (L)'] = t.hnl;
    registro['Monto cobrado'] = cobro.monto;
    registro['Moneda'] = cobro.moneda;
    registro['Pasarela'] = pago.pasarela;
    registro['Referencia de pago'] = String(pago.referencia);
    registro['Comprobante'] = cobro.comprobante;
    registro['Correo enviado'] = 'Pendiente';
    hoja.appendRow(COLUMNAS.map(function (c) { return registro[c] === undefined ? '' : registro[c]; }));
    fila = hoja.getLastRow();
    if (solicitud) {
      hoja.getRange(fila, COL['Carné verificado']).setValue(true);
      hojaEstudiantes().getRange(solicitud.fila, COL_EST['Pagado (referencia)']).setValue(String(pago.referencia));
    }
    SpreadsheetApp.flush();
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'No pudimos confirmar tu pago. Si se hizo el cobro, escríbenos por WhatsApp al ' + WHATSAPP_EQUIPO + '.' });
  } finally {
    lock.releaseLock();
  }

  // Correo de confirmación (fuera del lock)
  const hoja = hojaInscritos();
  try {
    enviarConfirmacion({
      nombre: limpio(datos.nombre),
      correo: limpio(datos.correo),
      tarifa: TARIFAS[body.tarifa],
      monto: hoja.getRange(fila, COL['Monto cobrado']).getValue(),
      moneda: hoja.getRange(fila, COL['Moneda']).getValue(),
      pasarela: pago.pasarela,
      prueba: pago.pasarela === 'prueba',
      captura: hoja.getRange(fila, COL['Comprobante']).getValue(),
    });
    hoja.getRange(fila, COL['Correo enviado']).setValue('Sí');
  } catch (err) {
    console.error('Correo no enviado: ' + err);
    hoja.getRange(fila, COL['Correo enviado']).setValue('Error: ' + err);
  }

  return json({ ok: true, nombre: limpio(datos.nombre).split(' ')[0] });
}

// ---------- Tarifa de estudiante ----------

/**
 * POST { accion: 'solicitudEstudiante', datos, institucion, carne: { nombre, tipo, base64 } }.
 * Guarda la foto del carné en Drive y la solicitud en la pestaña "Estudiantes" como Pendiente. No cobra nada.
 */
function solicitudEstudiante(body) {
  const datos = body.datos || {};
  const carne = body.carne || {};
  const faltan = ['nombre', 'correo', 'whatsapp', 'ciudad', 'ocupacion', 'experiencia', 'talla'].filter(function (k) {
    return !String(datos[k] || '').trim();
  });
  if (faltan.length || !String(body.institucion || '').trim()) return json({ ok: false, error: 'Faltan datos de la solicitud.' });
  if (!carne.base64 || CARNE_TIPOS.indexOf(carne.tipo) < 0) {
    return json({ ok: false, error: 'Sube una foto (JPG o PNG) o un PDF de tu carné.' });
  }
  let bytes;
  try {
    bytes = Utilities.base64Decode(carne.base64);
  } catch (err) {
    return json({ ok: false, error: 'No pudimos leer el archivo del carné. Intenta con otra foto.' });
  }
  if (bytes.length > CARNE_MAX_BYTES) return json({ ok: false, error: 'El archivo del carné pesa más de 6 MB. Intenta con otra foto.' });

  const t = TARIFAS.estudiante;
  if (hoyHN() > t.hasta) return json({ ok: false, error: 'La tarifa de estudiante ya no está disponible.' });
  const conteo = contarInscritos();
  if (conteo.total >= EVENTO.cupo) return json({ ok: false, error: 'Lo sentimos, los cupos se llenaron.' });
  if (conteo.estudiantes >= EVENTO.cupoEstudiantes) return json({ ok: false, error: 'Los cupos de estudiante se llenaron.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let fila;
  try {
    const nombre = limpio(datos.nombre);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' }[carne.tipo];
    const archivo = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('CARPETA_CARNES_ID'))
      .createFile(Utilities.newBlob(bytes, carne.tipo, 'Carné · ' + nombre.replace(/[\/\\]/g, ' ') + ' · ' +
        Utilities.formatDate(new Date(), EVENTO.zona, 'yyyy-MM-dd HH.mm') + '.' + ext));

    const r = {};
    r['Fecha de solicitud'] = new Date();
    r['Nombre (diploma y gafete)'] = nombre;
    r['Correo'] = limpio(datos.correo);
    r['WhatsApp'] = "'" + String(datos.whatsapp || '').trim().slice(0, 30);
    r['Ciudad'] = limpio(datos.ciudad);
    r['Ocupación'] = limpio(datos.ocupacion);
    r['Experiencia'] = limpio(datos.experiencia);
    r['Talla de camiseta'] = limpio(datos.talla);
    r['¿Cómo se enteró?'] = limpio(datos.comoSeEntero);
    r['Restricciones alimentarias'] = limpio(datos.restricciones);
    r['Acepta comunicaciones'] = datos.comunicaciones ? 'Sí' : 'No';
    r['Institución'] = limpio(body.institucion);
    r['Foto del carné'] = archivo.getUrl();
    r['Estado'] = 'Pendiente';
    const hoja = hojaEstudiantes();
    hoja.appendRow(COLUMNAS_EST.map(function (c) { return r[c] === undefined ? '' : r[c]; }));
    fila = hoja.getLastRow();
    SpreadsheetApp.flush();
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'No pudimos recibir tu solicitud. Intenta de nuevo en unos minutos.' });
  } finally {
    lock.releaseLock();
  }

  const saludo = limpio(datos.nombre).split(' ')[0];

  // Revisión automática con Claude: aprueba o rechaza solo los casos claros; el resto queda para una persona.
  let decision = { estado: 'Pendiente' };
  if (REVISAR_CON_CLAUDE && PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY')) {
    try {
      decision = revisarCarneConClaude(bytes, carne.tipo, limpio(datos.nombre), limpio(body.institucion));
    } catch (err) {
      console.error('Revisión con Claude falló: ' + err);
      decision = { estado: 'Pendiente', nota: 'No se pudo revisar automáticamente: ' + String(err).slice(0, 200) };
    }
    const hoja = hojaEstudiantes();
    hoja.getRange(fila, COL_EST['Revisión de Claude']).setValue(decision.nota || '');
    if (decision.estado !== 'Pendiente') {
      if (decision.estado === 'Rechazado') hoja.getRange(fila, COL_EST['Notas']).setValue(decision.motivo);
      hoja.getRange(fila, COL_EST['Estado']).setValue(decision.estado);
      // Los cambios hechos por el script no disparan alEditarHoja: se envía el correo aquí.
      try { procesarEstado(hoja, fila); } catch (err) { console.error('Correo de decisión no enviado: ' + err); }
    }
  }

  if (decision.estado === 'Pendiente') {
    try {
      enviarCorreoSimple(datos.correo, 'Recibimos tu carné, ' + saludo, 'Recibimos tu <span>carné</span>',
        ['Hola, ' + saludo + '. Recibimos tu solicitud de tarifa de estudiante para STORYCRAFTERS.',
         'Vamos a revisar tu carné y te escribiremos a este correo. Si lo aprobamos, te llegará un enlace personal para pagar USD ' +
         t.usd + ' y confirmar tu lugar.',
         'Tu lugar todavía no está reservado: se confirma cuando pagas.']);
      MailApp.sendEmail(CORREO_EVENTO, 'Nueva solicitud de estudiante: ' + limpio(datos.nombre),
        'Revisa el carné y cambia el Estado en la pestaña Estudiantes.\n' +
        (decision.nota ? 'Revisión de Claude: ' + decision.nota + '\n' : '') +
        SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HOJA_ID')).getUrl());
    } catch (err) {
      console.error('Correo de solicitud no enviado: ' + err);
    }
  }
  return json({ ok: true, nombre: saludo, estado: decision.estado, motivo: decision.motivo || '' });
}

/**
 * Le pide a Claude que lea el carné. Devuelve { estado: 'Aprobado' | 'Rechazado' | 'Pendiente', nota, motivo }.
 * Solo aprueba si es un carné estudiantil legible, el nombre coincide y está vigente hoy.
 * Solo rechaza si es legible y está vencido. Todo lo demás queda Pendiente para una persona.
 */
function revisarCarneConClaude(bytes, tipo, nombre, institucion) {
  const IMAGENES = ['image/jpeg', 'image/png', 'image/webp'];
  let adjunto;
  if (IMAGENES.indexOf(tipo) >= 0) {
    adjunto = { type: 'image', source: { type: 'base64', media_type: tipo, data: Utilities.base64Encode(bytes) } };
  } else if (tipo === 'application/pdf') {
    adjunto = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Utilities.base64Encode(bytes) } };
  } else {
    return { estado: 'Pendiente', nota: 'Formato ' + tipo + ' no compatible con la revisión automática.' };
  }

  const hoy = hoyHN();
  const instrucciones =
    'Eres parte del equipo de inscripciones de STORYCRAFTERS, una masterclass en Honduras con tarifa especial para estudiantes. ' +
    'Revisa la imagen adjunta, que la persona subió como su carné estudiantil vigente.\n\n' +
    'Datos que escribió en el formulario:\n- Nombre: ' + nombre + '\n- Institución: ' + institucion + '\n' +
    '- Fecha de hoy (Honduras): ' + hoy + '\n\n' +
    'Decide:\n' +
    '1. es_carne_estudiantil: ¿es un carné o credencial de estudiante (universidad, instituto o colegio)? Una cédula, ' +
    'licencia o carné de empleado no cuenta.\n' +
    '2. legible: ¿se leen con claridad el nombre y la vigencia?\n' +
    '3. nombre_coincide: ¿el nombre del carné es la misma persona que el del formulario? Acepta diferencias de tildes, ' +
    'mayúsculas, orden o nombres y apellidos parciales; no aceptes a otra persona.\n' +
    '4. vigencia: "vigente" si el carné es válido hoy; "vencido" si su fecha de vencimiento o su periodo académico ya ' +
    'terminó antes de hoy; "no_se_puede_determinar" si no muestra fecha o periodo, o si no queda claro.\n' +
    '5. explicacion: una o dos frases en español, dirigidas al estudiante con "tú", diciendo qué viste. ' +
    'No inventes datos que no aparecen en la imagen.';

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODELO,
      max_tokens: 8000,
      fallbacks: 'default',
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              es_carne_estudiantil: { type: 'boolean' },
              legible: { type: 'boolean' },
              nombre_en_carne: { type: 'string' },
              nombre_coincide: { type: 'boolean' },
              institucion_en_carne: { type: 'string' },
              vencimiento_en_carne: { type: 'string' },
              vigencia: { type: 'string', enum: ['vigente', 'vencido', 'no_se_puede_determinar'] },
              explicacion: { type: 'string' },
            },
            required: ['es_carne_estudiantil', 'legible', 'nombre_en_carne', 'nombre_coincide',
              'institucion_en_carne', 'vencimiento_en_carne', 'vigencia', 'explicacion'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: [adjunto, { type: 'text', text: instrucciones }] }],
    }),
  });
  if (res.getResponseCode() >= 300) throw new Error('Claude ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  const msg = JSON.parse(res.getContentText());
  if (msg.stop_reason === 'refusal') return { estado: 'Pendiente', nota: 'Claude no revisó esta imagen.' };
  const texto = (msg.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  const v = JSON.parse(texto);

  const nota = 'Carné: ' + (v.es_carne_estudiantil ? 'sí' : 'no') + ' · Legible: ' + (v.legible ? 'sí' : 'no') +
    ' · Nombre: ' + v.nombre_en_carne + (v.nombre_coincide ? ' (coincide)' : ' (NO coincide)') +
    ' · Institución: ' + v.institucion_en_carne + ' · Vence: ' + (v.vencimiento_en_carne || '—') +
    ' · ' + v.vigencia + ' · ' + v.explicacion;

  if (v.es_carne_estudiantil && v.legible && v.nombre_coincide && v.vigencia === 'vigente') {
    return { estado: 'Aprobado', nota: 'Aprobado por Claude. ' + nota };
  }
  if (v.es_carne_estudiantil && v.legible && v.vigencia === 'vencido') {
    return { estado: 'Rechazado', nota: 'Rechazado por Claude (vencido). ' + nota, motivo: v.explicacion };
  }
  return { estado: 'Pendiente', nota: 'Para revisión humana. ' + nota };
}

/** Disparador instalable: al cambiar el Estado de una solicitud, envía el correo al estudiante. */
function alEditarHoja(e) {
  const hoja = e.range.getSheet();
  if (hoja.getName() !== 'Estudiantes' || e.range.getRow() < 2) return;
  if (e.range.getColumn() > COL_EST['Estado'] || e.range.getLastColumn() < COL_EST['Estado']) return;
  for (let fila = e.range.getRow(); fila <= e.range.getLastRow(); fila++) procesarEstado(hoja, fila);
}

function procesarEstado(hoja, fila) {
  const v = hoja.getRange(fila, 1, 1, COLUMNAS_EST.length).getValues()[0];
  const get = function (c) { return v[COL_EST[c] - 1]; };
  const estado = get('Estado');
  const yaRespondido = String(get('Correo de respuesta'));
  if (yaRespondido.indexOf(estado) === 0) return; // ya se envió el correo de este estado
  const correo = String(get('Correo'));
  const saludo = String(get('Nombre (diploma y gafete)')).split(' ')[0];
  const t = TARIFAS.estudiante;

  if (estado === 'Aprobado') {
    let codigo = String(get('Código'));
    if (!codigo) {
      codigo = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
      hoja.getRange(fila, COL_EST['Código']).setValue(codigo);
    }
    const enlace = LANDING_URL + '?estudiante=' + codigo + '#inscripcion';
    enviarCorreoSimple(correo, '¡Tu carné fue aprobado, ' + saludo + '! Completa tu inscripción',
      'Tu carné fue <span>aprobado</span>',
      ['¡Listo, ' + saludo + '! Revisamos tu carné y ya puedes inscribirte con la tarifa de estudiante: USD ' +
        t.usd + '.',
       'Este enlace es personal y sirve para un solo pago. Tu lugar queda confirmado en cuanto pagas.'],
      { texto: 'Pagar mi inscripción', url: enlace });
  } else if (estado === 'Rechazado') {
    const motivo = String(get('Notas')).trim();
    enviarCorreoSimple(correo, 'Sobre tu solicitud de tarifa de estudiante', 'No pudimos validar tu <span>carné</span>',
      ['Hola, ' + saludo + '. Revisamos tu solicitud y no pudimos validar tu carné.' + (motivo ? ' ' + motivo : ''),
       'Puedes enviarnos una nueva foto desde la página o inscribirte con la tarifa vigente. Si tienes dudas, responde este correo.'],
      { texto: 'Ir a la inscripción', url: LANDING_URL + '#inscripcion' });
  } else {
    return;
  }
  hoja.getRange(fila, COL_EST['Correo de respuesta']).setValue(estado + ' · ' +
    Utilities.formatDate(new Date(), EVENTO.zona, 'yyyy-MM-dd HH:mm'));
}

function hojaEstudiantes() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HOJA_ID')).getSheetByName('Estudiantes');
}

/** Busca una solicitud por código. Devuelve { fila, estado, pagado, datos } o null. */
function buscarSolicitud(codigo) {
  if (!/^[0-9a-f]{16}$/.test(codigo)) return null;
  const hoja = hojaEstudiantes();
  const n = hoja.getLastRow() - 1;
  if (n < 1) return null;
  const filas = hoja.getRange(2, 1, n, COLUMNAS_EST.length).getValues();
  for (let i = 0; i < filas.length; i++) {
    const v = filas[i];
    const get = function (c) { return v[COL_EST[c] - 1]; };
    if (String(get('Código')) !== codigo) continue;
    return {
      fila: i + 2,
      estado: get('Estado'),
      pagado: !!String(get('Pagado (referencia)')),
      datos: {
        nombre: String(get('Nombre (diploma y gafete)')), correo: String(get('Correo')), whatsapp: String(get('WhatsApp')),
        ciudad: String(get('Ciudad')), ocupacion: String(get('Ocupación')), experiencia: String(get('Experiencia')),
        talla: String(get('Talla de camiseta')), comoSeEntero: String(get('¿Cómo se enteró?')),
        restricciones: String(get('Restricciones alimentarias')), comunicaciones: get('Acepta comunicaciones') === 'Sí',
      },
    };
  }
  return null;
}

/** Correo corto con el estilo de la landing. En el título, <span> marca la palabra en ámbar. */
function enviarCorreoSimple(para, asunto, titulo, parrafos, boton) {
  const C = { negro: '#0A0A0A', linea: '#2A2A2A', hueso: '#EDE8DF', gris: '#9A968F', ambar: '#E8B654' };
  const display = "'Barlow Condensed','Oswald','Arial Narrow',Arial,sans-serif";
  const mono = "'IBM Plex Mono','Courier New',Courier,monospace";
  const esc = function (s) { return String(s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); };
  const html =
    '<div style="margin:0;padding:0;background:' + C.negro + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.negro + '">' +
    '<tr><td align="center" style="padding:32px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">' +
    '<tr><td style="padding:0 0 24px;font-family:' + mono + ';font-size:11px;letter-spacing:2px;color:' + C.gris + ';">' +
    '<span style="color:#E5484D;">●</span> REC &nbsp;·&nbsp; STORYCRAFTERS &nbsp;·&nbsp; 12.12.2026</td></tr>' +
    '<tr><td style="padding:0 0 24px;"><h1 style="margin:0;font-family:' + display + ';font-size:42px;line-height:1.02;' +
    'font-weight:500;letter-spacing:1px;text-transform:uppercase;color:' + C.hueso + ';">' +
    titulo.replace(/<span>/g, '<span style="color:' + C.ambar + ';">') + '</h1></td></tr>' +
    '<tr><td>' + parrafos.map(function (p) {
      return '<p style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:' + C.hueso + ';">' +
        esc(p) + '</p>';
    }).join('') + '</td></tr>' +
    (boton ? '<tr><td style="padding:12px 0 32px;"><a href="' + esc(boton.url) + '" style="display:inline-block;background:' + C.ambar +
      ';color:' + C.negro + ';font-family:Helvetica,Arial,sans-serif;font-weight:700;font-size:17px;padding:16px 28px;' +
      'border-radius:2px;text-decoration:none;">' + esc(boton.texto) + ' →</a></td></tr>' : '') +
    '<tr><td><div style="height:1px;background:' + C.linea + ';font-size:0;line-height:0;">&nbsp;</div>' +
    '<p style="margin:16px 0 0;font-family:' + mono + ';font-size:11px;letter-spacing:2px;color:' + C.gris + ';">' +
    'INVESTIGA · ESTRUCTURA · GRABA<br>STORYCRAFTERS · MEDIA BUILDERS · SC.THEMEDIABUILDERS.COM</p></td></tr>' +
    '</table></td></tr></table></div>';
  MailApp.sendEmail({ to: para, subject: asunto, htmlBody: html, name: REMITENTE, replyTo: CORREO_EVENTO });
}

// ---------- Pasarelas ----------
// Cada pasarela recibe la referencia del pago y la tarifa, y devuelve
// { ok: true, monto, moneda, comprobante } o { ok: false, error }.
const PASARELAS = {
  paypal: cobrarPayPal,
  pixelpay: cobrarPixelPay,
  prueba: cobrarPrueba,
};

/** Pago ficticio para pruebas. Solo funciona con MODO_PRUEBA = true. */
function cobrarPrueba(referencia, t) {
  if (!MODO_PRUEBA) return { ok: false, error: 'Pasarela de pago no configurada. No se realizó ningún cobro.' };
  return { ok: true, monto: t.usd, moneda: 'USD', comprobante: 'PRUEBA (sin cobro real)' };
}

/** PixelPay: pendiente de conectar cuando esté la cuenta y su documentación. */
function cobrarPixelPay(referencia, t) {
  // Aquí irá: consultar la transacción en PixelPay, verificar que esté aprobada
  // y que el monto sea t.hnl en HNL, y devolver su número de autorización.
  return { ok: false, error: 'El pago con tarjeta aún no está habilitado. No se realizó ningún cobro.' };
}

function cobrarPayPal(orderID, t) {
  const pedido = paypal('get', '/v2/checkout/orders/' + encodeURIComponent(orderID));
  const monto = pedido.purchase_units && pedido.purchase_units[0].amount;
  if (pedido.status !== 'APPROVED' || !monto || monto.currency_code !== 'USD' ||
      Math.abs(Number(monto.value) - t.usd) > 0.001) {
    return { ok: false, error: 'El monto del pago no coincide con la tarifa. No se realizó ningún cobro.' };
  }
  const captura = paypal('post', '/v2/checkout/orders/' + encodeURIComponent(orderID) + '/capture', {});
  const cap = captura.purchase_units[0].payments.captures[0];
  if (captura.status !== 'COMPLETED' || cap.status !== 'COMPLETED') {
    return { ok: false, error: 'PayPal no completó el cobro. Intenta de nuevo o escríbenos por WhatsApp.' };
  }
  return { ok: true, monto: Number(cap.amount.value), moneda: 'USD', comprobante: cap.id };
}

function paypal(metodo, ruta, payload) {
  const props = PropertiesService.getScriptProperties();
  const base = props.getProperty('PAYPAL_ENTORNO') === 'live'
    ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const opciones = {
    method: metodo,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + tokenPayPal(base) },
    muteHttpExceptions: true,
  };
  if (payload) opciones.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(base + ruta, opciones);
  const datos = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 300) throw new Error('PayPal ' + res.getResponseCode() + ': ' + res.getContentText());
  return datos;
}

function tokenPayPal(base) {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('PAYPAL_TOKEN');
  if (guardado) return guardado;
  const props = PropertiesService.getScriptProperties();
  const res = UrlFetchApp.fetch(base + '/v1/oauth2/token', {
    method: 'post',
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(props.getProperty('PAYPAL_CLIENT_ID') + ':' + props.getProperty('PAYPAL_SECRET')),
    },
    payload: { grant_type: 'client_credentials' },
  });
  const datos = JSON.parse(res.getContentText());
  cache.put('PAYPAL_TOKEN', datos.access_token, Math.min(21600, datos.expires_in - 300));
  return datos.access_token;
}

// ---------- Utilidades ----------
function hojaInscritos() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HOJA_ID')).getSheetByName('Inscritos');
}

function contarInscritos() {
  const hoja = hojaInscritos();
  const n = hoja.getLastRow() - 1;
  if (n < 1) return { total: 0, estudiantes: 0 };
  const tarifas = hoja.getRange(2, COL['Tarifa'], n, 1).getValues();
  return {
    total: tarifas.filter(function (r) { return r[0]; }).length,
    estudiantes: tarifas.filter(function (r) { return r[0] === 'Estudiante'; }).length,
  };
}

function buscarPedido(hoja, orderID) {
  const n = hoja.getLastRow() - 1;
  if (n < 1) return null;
  const pedidos = hoja.getRange(2, COL['Referencia de pago'], n, 1).getValues();
  for (let i = 0; i < pedidos.length; i++) {
    if (String(pedidos[i][0]) === orderID) {
      return { nombre: String(hoja.getRange(i + 2, COL['Nombre (diploma y gafete)']).getValue()).split(' ')[0] };
    }
  }
  return null;
}

function hoyHN() { return Utilities.formatDate(new Date(), EVENTO.zona, 'yyyy-MM-dd'); }
function limpio(v) { return String(v || '').trim().slice(0, 300).replace(/^[=+\-@]/, "'$&"); }
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function letra(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// ---------- Correo de confirmación ----------
function enviarConfirmacion(r) {
  const saludo = (r.nombre || '').split(' ')[0] || 'storycrafter';
  const nombreHtml = saludo.replace(/[<>&"]/g, '');
  const t = r.tarifa;

  // Estilo de la landing: negro profundo, blanco hueso, ámbar como acción,
  // titulares condensados en mayúsculas y etiquetas mono espaciadas.
  const C = { negro: '#0A0A0A', panel: '#141414', linea: '#2A2A2A', hueso: '#EDE8DF', gris: '#9A968F', ambar: '#E8B654' };
  const F = {
    display: "'Barlow Condensed','Oswald','Arial Narrow',Arial,sans-serif",
    mono: "'IBM Plex Mono','Courier New',Courier,monospace",
    body: 'Helvetica,Arial,sans-serif',
  };
  const etiqueta = function (x) {
    return '<p style="margin:0 0 6px;font-family:' + F.mono + ';font-size:11px;letter-spacing:3px;' +
      'text-transform:uppercase;color:' + C.ambar + ';">' + x + '</p>';
  };
  const parrafo = function (x) {
    return '<p style="margin:0 0 16px;font-family:' + F.body + ';font-size:16px;line-height:1.6;color:' + C.hueso + ';">' + x + '</p>';
  };
  const paso = function (n, x) {
    return '<td width="33%" style="padding:0 4px;vertical-align:top;">' +
      '<div style="height:3px;background:' + C.ambar + ';font-size:0;line-height:0;">&nbsp;</div>' +
      '<p style="margin:10px 0 0;font-family:' + F.mono + ';font-size:11px;letter-spacing:2px;color:' + C.ambar + ';">' +
      n + ' ' + x + ' ✓</p></td>';
  };
  const dato = function (k, v) {
    return '<tr><td style="padding:10px 0;border-bottom:1px solid ' + C.linea + ';font-family:' + F.mono + ';font-size:11px;' +
      'letter-spacing:2px;text-transform:uppercase;color:' + C.gris + ';width:110px;vertical-align:top;">' + k + '</td>' +
      '<td style="padding:10px 0;border-bottom:1px solid ' + C.linea + ';font-family:' + F.body + ';font-size:15px;color:' + C.hueso + ';">' + v + '</td></tr>';
  };

  let extra = '';
  if (t.carne) {
    extra = '<tr><td style="padding:0 0 32px;">' + etiqueta('Un detalle más') +
      parrafo('Como te inscribiste con tarifa de estudiante, lleva tu carné vigente el día del evento.') + '</td></tr>';
  }

  const html =
    '<div style="margin:0;padding:0;background:' + C.negro + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.negro + '" style="background:' + C.negro + ';">' +
    '<tr><td align="center" style="padding:32px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">' +
    '<tr><td style="padding:0 0 28px;font-family:' + F.mono + ';font-size:11px;letter-spacing:2px;color:' + C.gris + ';">' +
    '<span style="color:#E5484D;">●</span> REC &nbsp;·&nbsp; 12.12.2026 &nbsp;·&nbsp; SAN PEDRO SULA &nbsp;·&nbsp; 08:00:00:00</td></tr>' +
    '<tr><td style="padding:0 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    paso('01', 'DATOS') + paso('02', 'PAGO') + paso('03', 'CONFIRMACIÓN') +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:0 0 24px;">' +
    '<h1 style="margin:0;font-family:' + F.display + ';font-size:44px;line-height:1.02;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:' + C.hueso + ';">' +
    '¡' + nombreHtml + ', tu lugar en <span style="color:' + C.ambar + ';">STORYCRAFTERS</span> está confirmado!</h1></td></tr>' +
    '<tr><td>' +
    parrafo('¡Qué alegría tenerte con nosotros, ' + nombreHtml + '! Recibimos tu pago y ya eres parte de la primera edición. ' +
      'Vamos a investigar, estructurar y grabar juntos, con cámara en mano y luces encendidas.') +
    '</td></tr>' +
    '<tr><td style="padding:8px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' + C.linea + ';">' +
    dato('Fecha', EVENTO.fecha) + dato('Lugar', EVENTO.lugar) + dato('Tarifa', t.nombre) +
    dato('Pagado', 'USD ' + (r.moneda === 'USD' ? Number(r.monto) : t.usd) +
      (r.moneda === 'USD' ? ' vía PayPal' : '')) + dato('Recibo', r.captura) +
    '</table></td></tr>' +
    extra +
    '<tr><td style="padding:0 0 32px;">' + etiqueta('Qué sigue') +
    parrafo('Unos días antes del evento te escribiremos con la agenda, qué llevar y cómo llegar al estudio. ' +
      'Tu camiseta y tu gafete te esperan en el registro.') +
    parrafo('¿Dudas? Responde este correo o escríbenos al ' + WHATSAPP_EQUIPO + '.') +
    '<p style="margin:28px 0 0;font-family:' + F.display + ';font-size:26px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:' + C.ambar + ';">' +
    '¡Nos vemos en el set, ' + nombreHtml + '!</p></td></tr>' +
    '<tr><td style="padding:4px 0 0;">' +
    '<div style="height:1px;background:' + C.linea + ';font-size:0;line-height:0;">&nbsp;</div>' +
    '<p style="margin:16px 0 0;font-family:' + F.mono + ';font-size:11px;letter-spacing:2px;color:' + C.gris + ';">' +
    'INVESTIGA · ESTRUCTURA · GRABA<br>STORYCRAFTERS · MEDIA BUILDERS · SC.THEMEDIABUILDERS.COM</p>' +
    '</td></tr>' +
    '</table></td></tr></table></div>';

  MailApp.sendEmail({
    to: r.correo,
    subject: (r.prueba ? '[PRUEBA] ' : '') + '¡' + saludo + ', tu lugar en STORYCRAFTERS está confirmado! 🎬',
    htmlBody: html,
    name: REMITENTE,
    replyTo: CORREO_EVENTO,
  });
}

/** Prueba: envía el correo de confirmación a tu propio correo con datos de ejemplo. */
function probarCorreo() {
  enviarConfirmacion({
    nombre: 'María López',
    correo: Session.getActiveUser().getEmail(),
    tarifa: TARIFAS.preventa,
    monto: TARIFAS.preventa.usd,
    moneda: 'USD',
    captura: 'PRUEBA-123',
  });
}
