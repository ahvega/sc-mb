/**
 * STORYCRAFTERS · Backend de inscripciones (Google Apps Script, Web App + script vinculado a la hoja)
 *
 * Flujo (issue #20): la landing guarda la preinscripción ANTES de cobrar (Estatus de Pago =
 * Pendiente, Registration ID). El participante paga con el botón guardado de PayPal o por
 * transferencia (sube foto del comprobante). TODO pago queda Pendiente hasta que una persona
 * autorizada verifique el abono real — en PayPal o en el banco — y lo confirme desde el menú
 * STORYCRAFTERS de la hoja. Solo entonces se marca Completado y sale la bienvenida por la cola
 * de notificaciones. Escribir la referencia a mano en la celda ya no aprueba nada.
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

const REMITENTE = 'STORYCRAFTERS · Media Builders';
const CORREO_EVENTO = 'storycrafters@themediabuilders.com';

// Columnas de la hoja "Inscritos" (orden fijo). Las columnas de pagos (#20) van AL FINAL:
// nunca se insertan en medio, para no mover las posiciones que las fórmulas ya usan.
const COLUMNAS = [
  'Fecha de pago', 'Nombre (diploma y gafete)', 'Correo', 'WhatsApp', 'Ciudad', 'Ocupación',
  'Experiencia', 'Talla de camiseta', '¿Cómo se enteró?', 'Restricciones alimentarias',
  'Acepta comunicaciones', 'Tarifa', 'Precio (L)', 'Monto cobrado', 'Moneda', 'Pasarela', 'Referencia de pago', 'Comprobante',
  'Correo enviado', 'Carné verificado', 'Gafete impreso', 'Camiseta pedida', 'Notas',
  // --- checkout tarjeta/transferencia (issue #20) ---
  'Registration ID', 'Clave idempotencia', 'Token comprobante (hash)', 'Estatus de Pago',
  'Estado de gestión', 'Método de pago', 'Monto esperado', 'Moneda esperada',
  'Comprobante Drive ID', 'Comprobante recibido el', 'Pago verificado el', 'Verificado por',
  'Código estudiante',
];
const COL = {}; COLUMNAS.forEach(function (c, i) { COL[c] = i + 1; });

// Estados y pestañas operativas del checkout (issue #20). La fuente de verdad del cupo es
// "Estatus de Pago" = Completado; "Pendiente" nunca reserva lugar.
const ESTATUS_PAGO = { PENDIENTE: 'Pendiente', COMPLETADO: 'Completado' };
const METODOS = { PAYPAL: 'PayPal', TRANSFERENCIA: 'Transferencia' };

const TAB_INTENTOS = 'Intentos de Pago';
const COLUMNAS_INTENTOS = ['Intento ID', 'Registration ID', 'Método', 'Estado', 'Fecha', 'Evidencia', 'Operador'];
const INTENTO_ACTIVO = ['launched', 'in_progress', 'unknown']; // bloquean cambio de método (R2)

const TAB_ACRED = 'Acreditaciones';
const COLUMNAS_ACRED = ['Settlement key', 'Registration ID', 'Método', 'Identificador', 'Monto', 'Moneda', 'Fecha', 'Evidencia', 'Actor', 'Estado'];

const TAB_NOTIF = 'Notificaciones';
const COLUMNAS_NOTIF = ['Event key', 'Registration ID', 'Canal', 'Plantilla', 'Estado', 'Intentos', 'Creado el', 'Enviado el', 'Error', 'Datos'];
const NOTIF_MAX_INTENTOS = 5;

const TAB_AUDIT = 'Auditoría';
const COLUMNAS_AUDIT = ['Fecha', 'Actor', 'Acción', 'Registration ID', 'Detalle'];

const TAB_ESPERA = 'Lista de espera';
const COLUMNAS_ESPERA = ['Fecha', 'Nombre', 'Correo', 'WhatsApp'];

const COMPROBANTE_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const COMPROBANTE_MAX_BYTES = 6 * 1024 * 1024;
const MAX_PREINSCRIPCIONES_POR_CORREO = 3; // por día: freno de abuso del endpoint público
const MAX_COMPROBANTES_POR_REGISTRO = 3;

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

  rehacerVistas(ss);

  // Pestaña de solicitudes de estudiante (se revisan a mano)
  const est = ss.getSheetByName('Estudiantes') || ss.insertSheet('Estudiantes');
  est.getRange(1, 1, 1, COLUMNAS_EST.length).setValues([COLUMNAS_EST])
    .setBackground('#0A0A0A').setFontColor('#E8B654').setFontWeight('bold');
  est.setFrozenRows(1);
  est.getRange(2, COL_EST['Estado'], 500, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).build());
  est.getRange(1, COL_EST['Estado']).setNote('Revisa la foto del carné y cambia a "Aprobado" o "Rechazado". ' +
    'El correo al estudiante se envía solo. Si rechazas, puedes escribir el motivo en "Notas" antes de cambiar el estado.');

  // Pestañas operativas del checkout (issue #20)
  pestana(TAB_INTENTOS, COLUMNAS_INTENTOS);
  pestana(TAB_ACRED, COLUMNAS_ACRED);
  pestana(TAB_NOTIF, COLUMNAS_NOTIF);
  pestana(TAB_AUDIT, COLUMNAS_AUDIT);
  pestana(TAB_ESPERA, COLUMNAS_ESPERA);

  // Carpeta privada de Drive para las fotos de carné
  if (!props.getProperty('CARPETA_CARNES_ID')) {
    props.setProperty('CARPETA_CARNES_ID', DriveApp.createFolder('Carnés STORYCRAFTERS · 12 dic 2026').getId());
  }
  // Carpeta privada para los comprobantes de transferencia
  if (!props.getProperty('CARPETA_COMPROBANTES_ID')) {
    props.setProperty('CARPETA_COMPROBANTES_ID', DriveApp.createFolder('Comprobantes STORYCRAFTERS · 12 dic 2026').getId());
  }

  // Disparador que reacciona a ediciones manuales (estado de carné; las referencias de pago
  // escritas a mano quedan marcadas, NO aprobadas — eso es solo desde el menú STORYCRAFTERS)
  const yaExiste = ScriptApp.getProjectTriggers().some(function (tr) { return tr.getHandlerFunction() === 'alEditarHoja'; });
  if (!yaExiste) ScriptApp.newTrigger('alEditarHoja').forSpreadsheet(ss).onEdit().create();

  // Reintento de correos/WhatsApp pendientes (cola "Notificaciones"), una vez por hora
  const yaNotif = ScriptApp.getProjectTriggers().some(function (tr) { return tr.getHandlerFunction() === 'procesarNotificaciones'; });
  if (!yaNotif) ScriptApp.newTrigger('procesarNotificaciones').timeBased().everyHours(1).create();

  props.setProperty('ESQUEMA_PAGOS_V2', '1');

  Logger.log('Hoja de inscritos: ' + ss.getUrl());
  Logger.log('Siguiente paso: Implementar > Nueva implementación > Aplicación web.');
}

/**
 * Garantiza que la hoja tenga las columnas y pestañas del esquema v2 (checkout #20).
 * Idempotente; corre sola la primera vez que llega una preinscripción y también desde
 * el menú STORYCRAFTERS ▸ "Migrar esquema de pagos". Después de eso la marca
 * ESQUEMA_PAGOS_V2 evita el trabajo en cada petición.
 */
function asegurarEsquema() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ESQUEMA_PAGOS_V2') === '1') return;
  const hoja = hojaInscritos();
  const enc = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), COLUMNAS.length)).getValues()[0];
  for (let i = 0; i < COLUMNAS.length; i++) {
    if (!enc[i]) hoja.getRange(1, i + 1).setValue(COLUMNAS[i]);
  }
  pestana(TAB_INTENTOS, COLUMNAS_INTENTOS);
  pestana(TAB_ACRED, COLUMNAS_ACRED);
  pestana(TAB_NOTIF, COLUMNAS_NOTIF);
  pestana(TAB_AUDIT, COLUMNAS_AUDIT);
  pestana(TAB_ESPERA, COLUMNAS_ESPERA);
  if (!props.getProperty('CARPETA_COMPROBANTES_ID')) {
    props.setProperty('CARPETA_COMPROBANTES_ID', DriveApp.createFolder('Comprobantes STORYCRAFTERS · 12 dic 2026').getId());
  }
  props.setProperty('ESQUEMA_PAGOS_V2', '1');
}

/**
 * Reescribe las fórmulas de Control y Gafetes. Desde #20 la fuente de verdad es
 * "Estatus de Pago" = Completado; el segundo término de cada fórmula conserva las filas
 * legadas (Estatus vacío + referencia real ≠ PENDIENTE) para hojas aún sin migrar.
 * Una referencia escrita a mano en una fila Pendiente NUNCA entra a Control ni a Gafetes.
 */
function rehacerVistas(ss) {
  const col = function (c) { return 'Inscritos!' + letra(COL[c]) + '2:' + letra(COL[c]); };
  const cEst = col('Estatus de Pago');
  const cRef = col('Referencia de pago');
  const pagado = cEst + ',"Completado"';
  const legado = cRef + ',"<>' + PAGO_PENDIENTE + '",' + cRef + ',"<>",' + cEst + ',""';
  const ambas = function (extra) { // COUNTIFS por estatus + filas legadas
    return ') + COUNTIFS(' + legado + (extra ? ',' + extra : '');
  };

  const control = ss.getSheetByName('Control') || ss.insertSheet('Control');
  control.clear();
  const filas = [
    ['STORYCRAFTERS · Control', ''],
    ['Cupo total', EVENTO.cupo],
    ['Inscritos pagados', '=COUNTIF(' + cEst + ',"Completado"' + ambas() + ')'],
    ['Cupos disponibles', '=B2-B3'],
    ['Ingresos (L)', '=SUMIFS(' + col('Precio (L)') + ',' + pagado + ') + SUMIFS(' + col('Precio (L)') + ',' + legado + ')'],
    ['Cobrado en USD (solo PayPal)', '=SUMIFS(' + col('Monto cobrado') + ',' + col('Moneda') + ',"USD",' + pagado + ') + SUMIFS(' + col('Monto cobrado') + ',' + col('Moneda') + ',"USD",' + legado + ')'],
    // Pendiente nuevo esquema + pendiente legado (ref PENDIENTE sin estatus todavía)
    ['Pagos por verificar', '=COUNTIF(' + cEst + ',"Pendiente") + COUNTIFS(' + cRef + ',"' + PAGO_PENDIENTE + '",' + cEst + ',"")'],
    ['Por tarifa', ''],
    ['Preventa', '=COUNTIFS(' + col('Tarifa') + ',"Preventa",' + pagado + ambas(col('Tarifa') + ',"Preventa"') + ')'],
    ['Regular', '=COUNTIFS(' + col('Tarifa') + ',"Regular",' + pagado + ambas(col('Tarifa') + ',"Regular"') + ')'],
    ['Cupos finales', '=COUNTIFS(' + col('Tarifa') + ',"Cupos finales",' + pagado + ambas(col('Tarifa') + ',"Cupos finales"') + ')'],
    ['Estudiante', '=COUNTIFS(' + col('Tarifa') + ',"Estudiante",' + pagado + ambas(col('Tarifa') + ',"Estudiante"') + ')'],
    ['', ''],
    ['Pedido de camisetas', 'Cantidad'],
  ];
  ['XS', 'S', 'M', 'L', 'XL', 'XXL'].forEach(function (t) {
    filas.push([t, '=COUNTIFS(' + col('Talla de camiseta') + ',"' + t + '",' + pagado + ambas(col('Talla de camiseta') + ',"' + t + '"') + ')']);
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
    '=QUERY(Inscritos!A:' + letra(COLUMNAS.length) + ',"select B, F, E, H, L where B is not null and (' +
      letra(COL['Estatus de Pago']) + ' = \'Completado\' or (' + letra(COL['Referencia de pago']) +
      ' is not null and ' + letra(COL['Referencia de pago']) + ' <> \'' + PAGO_PENDIENTE + '\' and ' +
      letra(COL['Estatus de Pago']) + ' is null))' +
      ' label B \'Nombre\', F \'Ocupación\', E \'Ciudad\', H \'Talla\', L \'Tarifa\'",1)'
  );
}

/** Pestaña con encabezado: la crea si no existe y escribe la fila de títulos si está vacía. */
function pestana(nombre, columnas) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HOJA_ID'));
  let h = ss.getSheetByName(nombre);
  if (!h) h = ss.insertSheet(nombre);
  if (!h.getRange(1, 1).getValue()) {
    h.getRange(1, 1, 1, columnas.length).setValues([columnas])
      .setBackground('#0A0A0A').setFontColor('#E8B654').setFontWeight('bold');
    h.setFrozenRows(1);
  }
  return h;
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

/** POST: despacha por body.accion. El flujo antiguo ({pago, tarifa, datos}) se retiró (issue #20):
 * ningún cobro puede quedar sin preinscripción trazable ni saltarse la verificación humana. */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'Solicitud inválida.' });
  }

  if (body.accion === 'solicitudEstudiante') return solicitudEstudiante(body);
  if (body.accion === 'preinscripcion') return preinscripcion(body);
  if (body.accion === 'iniciarPago') return iniciarPago(body);
  if (body.accion === 'subirComprobante') return subirComprobante(body);
  if (body.accion === 'listaEspera') return listaEspera(body);

  return json({ ok: false, error: 'Acción no disponible. Recarga la página e intenta de nuevo.' });
}

// ---------- Preinscripción (pago con botón guardado de PayPal) ----------

const PAGO_PENDIENTE = 'PENDIENTE';

/**
 * POST { accion: 'preinscripcion', tarifa, datos, codigo?, idempotencia? }: la landing la envía
 * antes de mostrar opciones de pago. Guarda la fila con "Estatus de Pago" = Pendiente y devuelve
 * el Registration ID que la landing usa para iniciar el pago y subir comprobantes.
 * `idempotencia` es una clave que genera la página por envío: si la misma clave vuelve a llegar
 * (reintento tras timeout), se devuelve el registro ya creado en vez de duplicarlo.
 */
function preinscripcion(body) {
  let datos = body.datos || {};
  let solicitud = null;
  if (body.tarifa === 'estudiante') {
    solicitud = body.codigo ? buscarSolicitud(String(body.codigo)) : null;
    if (!solicitud || solicitud.estado !== 'Aprobado') return json({ ok: false, error: 'La tarifa de estudiante requiere un carné aprobado.' });
    // El enlace es de un solo uso: si ya hay un pago acreditado con ese código, no se reutiliza
    if (solicitud.pagado) return json({ ok: false, error: 'Este enlace de estudiante ya se usó. Si es un error, escríbenos al ' + WHATSAPP_EQUIPO + '.' });
    datos = solicitud.datos;
  }
  const faltan = ['nombre', 'correo', 'whatsapp', 'ciudad', 'ocupacion', 'experiencia', 'talla'].filter(function (k) {
    return !String(datos[k] || '').trim();
  });
  if (faltan.length) return json({ ok: false, error: 'Faltan datos de la inscripción.' });
  const t = TARIFAS[body.tarifa];
  const hoy = hoyHN();
  if (!t || hoy < t.desde || hoy > t.hasta) return json({ ok: false, error: 'Esa tarifa ya no está disponible.' });
  const idem = String(body.idempotencia || '').slice(0, 64);

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let avisar = false;
  let registrationId = null;
  try {
    asegurarEsquema();
    const hoja = hojaInscritos();

    // Reintento con la misma clave: devolver el registro ya creado, sin duplicar ni reenviar correo
    if (idem) {
      const previo = buscarPorClave(hoja, 'Clave idempotencia', idem);
      if (previo) {
        return json({ ok: true, registrationId: previo.regId, repetido: true });
      }
    }

    // Freno de abuso del endpoint público: máximo N preinscripciones por correo y día.
    // Sin condición sobre la clave: omitirla no elude el límite.
    const correo = String(datos.correo || '').trim().toLowerCase();
    if (contarHoyPorCorreo(hoja, correo) >= MAX_PREINSCRIPCIONES_POR_CORREO) {
      return json({ ok: false, error: 'Ya recibimos varias solicitudes con este correo hoy. Escríbenos al ' + WHATSAPP_EQUIPO + '.' });
    }

    // Un solo correo de "datos recibidos" por dirección mientras siga pendiente (la página es pública)
    avisar = !tienePendiente(hoja, correo);
    registrationId = Utilities.getUuid();
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
    registro['Monto cobrado'] = t.usd;
    registro['Moneda'] = 'USD';
    registro['Pasarela'] = '';
    registro['Referencia de pago'] = PAGO_PENDIENTE;
    registro['Correo enviado'] = avisar ? 'Datos recibidos' : 'No (repetido)';
    registro['Carné verificado'] = !!solicitud;
    registro['Notas'] = 'Pago pendiente de verificación. Confirmar SOLO desde el menú STORYCRAFTERS ▸ Confirmar pago verificado.';
    registro['Registration ID'] = registrationId;
    registro['Clave idempotencia'] = idem;
    registro['Estatus de Pago'] = ESTATUS_PAGO.PENDIENTE;
    registro['Monto esperado'] = t.usd;
    registro['Moneda esperada'] = 'USD';
    if (solicitud && body.codigo) registro['Código estudiante'] = String(body.codigo).slice(0, 32);

    // Siempre una fila nueva: la página es pública, así que nadie puede sobrescribir la fila de otra
    // persona con solo saber su correo. Si alguien lo intenta dos veces, el equipo borra la repetida.
    hoja.appendRow(COLUMNAS.map(function (c) { return registro[c] === undefined ? '' : registro[c]; }));
    SpreadsheetApp.flush();
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'No pudimos guardar tus datos.' });
  } finally {
    lock.releaseLock();
  }

  if (avisar) {
    try {
      const saludo = limpio(datos.nombre).split(' ')[0] || 'storycrafter';
      enviarCorreoSimple(limpio(datos.correo), '¡Hola ' + saludo + '! Recibimos tus datos para STORYCRAFTERS',
        'Recibimos tus <span>datos</span>',
        ['¡Hola, ' + saludo + '! Ya tenemos tus datos para la masterclass STORYCRAFTERS (' + EVENTO.fecha + ').',
         'Para asegurar tu lugar, completa tu pago de USD ' + t.usd + ' (tarifa ' + t.nombre + ') en la ventana de PayPal de la página.',
         'Si ya pagaste, no tienes que hacer nada más: en cuanto confirmemos tu pago te llegará el correo de bienvenida. ' +
           '¿Dudas? Responde este correo o escríbenos al ' + WHATSAPP_EQUIPO + '.'],
        { texto: 'Ir a la inscripción', url: LANDING_URL + '#inscripcion' });
    } catch (err) {
      console.error('Correo de datos recibidos no enviado: ' + err);
    }
  }
  return json({ ok: true, registrationId: registrationId });
}

/** Busca la primera fila cuya columna vale `clave`. Devuelve { fila, regId } o null. */
function buscarPorClave(hoja, columna, clave) {
  const n = hoja.getLastRow() - 1;
  if (n < 1) return null;
  const vs = hoja.getRange(2, COL[columna], n, 1).getValues();
  const cReg = COL['Registration ID'];
  for (let i = 0; i < vs.length; i++) {
    if (String(vs[i][0]) === clave) {
      return { fila: i + 2, regId: String(hoja.getRange(i + 2, cReg).getValue()) };
    }
  }
  return null;
}

/** Preinscripciones de hoy con ese correo (freno de abuso, R6). */
function contarHoyPorCorreo(hoja, correo) {
  const n = hoja.getLastRow() - 1;
  if (n < 1 || !correo) return 0;
  const hoy = hoyHN();
  return leerInscritos(hoja).filter(function (r) {
    const f = r[COL['Fecha de pago'] - 1];
    const fecha = f instanceof Date ? Utilities.formatDate(f, EVENTO.zona, 'yyyy-MM-dd') : String(f).slice(0, 10);
    return fecha === hoy && String(r[COL['Correo'] - 1]).trim().toLowerCase() === correo;
  }).length;
}

/** Filas de Inscritos con el ancho completo de COLUMNAS, aunque la hoja aún no tenga las nuevas. */
function leerInscritos(hoja) {
  const n = hoja.getLastRow() - 1;
  if (n < 1) return [];
  const ancho = Math.min(COLUMNAS.length, Math.max(hoja.getLastColumn(), 1));
  const vs = hoja.getRange(2, 1, n, ancho).getValues();
  return vs.map(function (r) { while (r.length < COLUMNAS.length) r.push(''); return r; });
}

function tienePendiente(hoja, correo) {
  const n = hoja.getLastRow() - 1;
  if (n < 1 || !correo) return false;
  return hoja.getRange(2, 1, n, COLUMNAS.length).getValues().some(function (r) {
    return String(r[COL['Correo'] - 1]).trim().toLowerCase() === correo &&
      String(r[COL['Referencia de pago'] - 1]) === PAGO_PENDIENTE;
  });
}

// ---------- Pagos: intentos, comprobantes, verificación humana (issue #20) ----------

/** Busca una fila de Inscritos por Registration ID. Devuelve { fila, get(col) } o null. */
function buscarRegistro(hoja, regId) {
  if (!regId) return null;
  const n = hoja.getLastRow() - 1;
  if (n < 1) return null;
  const ids = hoja.getRange(2, COL['Registration ID'], n, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === regId) {
      const v = hoja.getRange(i + 2, 1, 1, Math.min(COLUMNAS.length, Math.max(hoja.getLastColumn(), 1))).getValues()[0];
      while (v.length < COLUMNAS.length) v.push('');
      return { fila: i + 2, get: function (c) { return v[COL[c] - 1]; } };
    }
  }
  return null;
}

/** Intento de pago vivo del registro (bloquea cambiar de método hasta resolverlo), o null. */
function intentoActivo(regId) {
  const h = pestana(TAB_INTENTOS, COLUMNAS_INTENTOS);
  const n = h.getLastRow() - 1;
  if (n < 1) return null;
  const vs = h.getRange(2, 1, n, COLUMNAS_INTENTOS.length).getValues();
  for (let i = vs.length - 1; i >= 0; i--) {
    if (String(vs[i][1]) === regId && INTENTO_ACTIVO.indexOf(String(vs[i][3])) >= 0) {
      return { fila: i + 2, metodo: String(vs[i][2]), estado: String(vs[i][3]) };
    }
  }
  return null;
}

function cerrarIntento(regId, estado, evidencia, operador) {
  const h = pestana(TAB_INTENTOS, COLUMNAS_INTENTOS);
  const n = h.getLastRow() - 1;
  if (n < 1) return;
  const vs = h.getRange(2, 1, n, COLUMNAS_INTENTOS.length).getValues();
  for (let i = vs.length - 1; i >= 0; i--) {
    if (String(vs[i][1]) === regId && INTENTO_ACTIVO.indexOf(String(vs[i][3])) >= 0) {
      h.getRange(i + 2, 4).setValue(estado);
      h.getRange(i + 2, 6).setValue(String(evidencia || ''));
      h.getRange(i + 2, 7).setValue(String(operador || ''));
      return;
    }
  }
}

/** SHA-256 del token de subida, en base64: en la hoja nunca queda el token en claro. */
function hashToken(token) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8));
}

/** Datos bancarios autorizados (Script Properties). Solo existen si el dueño habilitó transferencias. */
function datosBancarios() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('TRANSFERENCIAS_HABILITADAS') !== 'si') return null;
  const d = {
    banco: p.getProperty('BANCO_NOMBRE'), titular: p.getProperty('BANCO_TITULAR'),
    tipo: p.getProperty('BANCO_TIPO'), cuenta: p.getProperty('BANCO_CUENTA'), moneda: 'HNL',
  };
  if (!d.banco || !d.titular || !d.tipo || !d.cuenta) return null;
  return d;
}

/**
 * POST { accion: 'iniciarPago', registrationId, metodo: 'paypal'|'transferencia' }.
 * Registra el intento ANTES de exponer el botón o los datos bancarios (R2). Un intento activo
 * bloquea cambiar de método: cerrar la ventana o recargar no desbloquea — solo el operador resuelve.
 */
function iniciarPago(body) {
  const regId = String(body.registrationId || '');
  const metodo = body.metodo === 'paypal' ? METODOS.PAYPAL : body.metodo === 'transferencia' ? METODOS.TRANSFERENCIA : null;
  if (!regId || !metodo) return json({ ok: false, error: 'Solicitud inválida.' });

  const banco = metodo === METODOS.TRANSFERENCIA ? datosBancarios() : null;
  if (metodo === METODOS.TRANSFERENCIA && !banco) {
    return json({ ok: false, error: 'El pago por transferencia no está disponible por ahora. Elige tarjeta o escríbenos al ' + WHATSAPP_EQUIPO + '.', transferenciaDisponible: false });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const hoja = hojaInscritos();
    const reg = buscarRegistro(hoja, regId);
    if (!reg) return json({ ok: false, error: 'No encontramos tu registro. Vuelve a enviar el formulario.' });
    if (String(reg.get('Estatus de Pago')) === ESTATUS_PAGO.COMPLETADO) {
      return json({ ok: false, error: 'Este registro ya tiene un pago verificado. Si es un error, escríbenos al ' + WHATSAPP_EQUIPO + '.' });
    }

    const t = TARIFAS[Object.keys(TARIFAS).filter(function (k) { return TARIFAS[k].nombre === reg.get('Tarifa'); })[0]];
    const activo = intentoActivo(regId);
    if (activo && activo.metodo !== metodo) {
      return json({ ok: false, error: 'Ya iniciaste un pago con otro método. Para cambiarlo, el equipo debe revisarlo: escríbenos al ' + WHATSAPP_EQUIPO + '.' });
    }

    if (metodo === METODOS.PAYPAL) {
      if (!activo) {
        pestana(TAB_INTENTOS, COLUMNAS_INTENTOS).appendRow([Utilities.getUuid(), regId, metodo, 'launched', new Date(), 'Hosted Button', '']);
        hoja.getRange(reg.fila, COL['Método de pago']).setValue(metodo);
        hoja.getRange(reg.fila, COL['Monto esperado']).setValue(t.usd);
        hoja.getRange(reg.fila, COL['Moneda esperada']).setValue('USD');
        audit('iniciar-pago', regId, 'PayPal Hosted Button');
      }
      // Un intento PayPal lanzado queda "unknown" para conciliación: el botón no reporta resultado.
      return json({ ok: true, registrationId: regId, metodo: metodo });
    }

    // Transferencia
    const yaRecibido = !!String(reg.get('Comprobante recibido el'));
    if (!activo) {
      pestana(TAB_INTENTOS, COLUMNAS_INTENTOS).appendRow([Utilities.getUuid(), regId, metodo, 'in_progress', new Date(), '', '']);
    }
    // Token de subida nuevo en cada respuesta: sirve mientras el comprobante siga pendiente,
    // también para reemplazar un comprobante ya recibido (resubida controlada, tope por registro).
    const token = Utilities.getUuid();
    hoja.getRange(reg.fila, COL['Método de pago']).setValue(metodo);
    hoja.getRange(reg.fila, COL['Monto esperado']).setValue(t.hnl);
    hoja.getRange(reg.fila, COL['Moneda esperada']).setValue('HNL');
    hoja.getRange(reg.fila, COL['Token comprobante (hash)']).setValue(hashToken(token));
    if (!yaRecibido) hoja.getRange(reg.fila, COL['Estado de gestión']).setValue('Esperando comprobante');
    audit('iniciar-transferencia', regId, 'token emitido');
    SpreadsheetApp.flush();

    encolarNotificacion(regId, 'email', 'instrucciones-transferencia-v1', { monto: t.hnl, moneda: 'HNL' });
    procesarNotificaciones();
    return json({ ok: true, registrationId: regId, metodo: metodo, token: token, banco: banco,
      monto: t.hnl, moneda: 'HNL', referencia: regId, comprobante: yaRecibido ? 'recibido' : 'pendiente' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'No pudimos preparar el pago. Intenta de nuevo en unos minutos.' });
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST { accion: 'subirComprobante', registrationId, token, archivo: { nombre, tipo, base64 } }.
 * El token es la capacidad de subida (hash en la hoja, nunca el token en claro). Valida tipo,
 * tamaño y que el registro siga Pendiente con intento de transferencia activo.
 */
function subirComprobante(body) {
  const regId = String(body.registrationId || '');
  const token = String(body.token || '');
  const archivo = body.archivo || {};
  if (!regId || !token) return json({ ok: false, error: 'Solicitud inválida.' });
  if (!archivo.base64 || COMPROBANTE_TIPOS.indexOf(archivo.tipo) < 0) {
    return json({ ok: false, error: 'Sube una foto (JPG, PNG o WebP) o un PDF del comprobante.' });
  }
  let bytes;
  try {
    bytes = Utilities.base64Decode(archivo.base64);
  } catch (err) {
    return json({ ok: false, error: 'No pudimos leer el archivo. Intenta con otra imagen.' });
  }
  if (bytes.length > COMPROBANTE_MAX_BYTES) return json({ ok: false, error: 'El archivo pesa más de 6 MB. Intenta con otra foto.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let archivoId = '';
  try {
    const hoja = hojaInscritos();
    const reg = buscarRegistro(hoja, regId);
    if (!reg) return json({ ok: false, error: 'No encontramos tu registro.' });
    if (String(reg.get('Estatus de Pago')) === ESTATUS_PAGO.COMPLETADO) {
      return json({ ok: true, comprobante: 'recibido', mensaje: 'Tu pago ya está verificado.' });
    }
    if (String(reg.get('Token comprobante (hash)')) !== hashToken(token)) {
      audit('comprobante-token-invalido', regId, 'rechazado');
      return json({ ok: false, error: 'El enlace de subida no es válido o ya se renovó. Vuelve a elegir transferencia en la página.' });
    }
    const activo = intentoActivo(regId);
    if (!activo || activo.metodo !== METODOS.TRANSFERENCIA) {
      return json({ ok: false, error: 'Este registro no tiene una transferencia en curso.' });
    }
    const subidas = contarAuditoria(regId, 'comprobante');
    if (subidas >= MAX_COMPROBANTES_POR_REGISTRO) {
      return json({ ok: false, error: 'Ya recibimos varios comprobantes de este registro. El equipo lo revisará; si necesitas corregirlo, escríbenos al ' + WHATSAPP_EQUIPO + '.' });
    }

    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[archivo.tipo];
    const nombre = 'Comprobante · ' + regId.slice(0, 8) + ' · ' +
      Utilities.formatDate(new Date(), EVENTO.zona, 'yyyy-MM-dd HH.mm') + '.' + ext;
    const file = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('CARPETA_COMPROBANTES_ID'))
      .createFile(Utilities.newBlob(bytes, archivo.tipo, nombre));
    archivoId = file.getId();

    hoja.getRange(reg.fila, COL['Comprobante Drive ID']).setValue(archivoId);
    hoja.getRange(reg.fila, COL['Comprobante recibido el']).setValue(new Date());
    hoja.getRange(reg.fila, COL['Estado de gestión']).setValue('Comprobante recibido — pendiente de verificación humana');
    hoja.getRange(reg.fila, COL['Token comprobante (hash)']).setValue(''); // un uso; resubir pide token nuevo
    pestana(TAB_INTENTOS, COLUMNAS_INTENTOS).getRange(activo.fila, 6).setValue('comprobante:' + archivoId);
    audit('comprobante', regId, archivoId);
    SpreadsheetApp.flush();
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'No pudimos recibir tu comprobante. Intenta de nuevo en unos minutos.' });
  } finally {
    lock.releaseLock();
  }

  // Aviso al equipo con el archivo adjunto; WhatsApp queda como tarea manual (sin BSP configurado).
  encolarNotificacion(regId, 'email', 'comprobante-equipo-v1', { archivoId: archivoId }, archivoId);
  encolarNotificacion(regId, 'whatsapp', 'comprobante-equipo-v1', { archivoId: archivoId }, archivoId);
  procesarNotificaciones();
  return json({ ok: true, estado: 'Comprobante recibido. Tu pago queda pendiente hasta que el equipo verifique el abono en el banco.' });
}

/** POST { accion: 'listaEspera', nombre, correo, whatsapp }: cupo lleno → captura para el próximo evento. */
function listaEspera(body) {
  const nombre = limpio(body.nombre);
  const correo = limpio(body.correo);
  const whatsapp = String(body.whatsapp || '').trim().slice(0, 30);
  if (!nombre || !correo || !whatsapp) return json({ ok: false, error: 'Faltan datos para la lista de espera.' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    asegurarEsquema();
    const h = pestana(TAB_ESPERA, COLUMNAS_ESPERA);
    const n = h.getLastRow() - 1;
    if (n > 0) {
      const vs = h.getRange(2, 3, n, 1).getValues();
      for (let i = 0; i < vs.length; i++) {
        if (String(vs[i][0]).trim().toLowerCase() === correo.toLowerCase()) {
          return json({ ok: true, repetido: true });
        }
      }
    }
    h.appendRow([new Date(), nombre, correo, "'" + whatsapp]);
    SpreadsheetApp.flush();
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'No pudimos guardarte en la lista. Intenta de nuevo.' });
  } finally {
    lock.releaseLock();
  }
  return json({ ok: true });
}

// ---------- Autoridad de verificación: solo personas autorizadas, solo desde Sheets ----------

/** Correo del operador si está en la lista OPERADORES (Script Properties); null si no. */
function operadorAutorizado() {
  let email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (err) { email = ''; }
  if (!email) return null;
  const lista = String(PropertiesService.getScriptProperties().getProperty('OPERADORES') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  return lista.indexOf(email) >= 0 ? email : null;
}

function actorActual() {
  try {
    const e = Session.getActiveUser().getEmail();
    if (e) return e;
  } catch (err) { /* sin sesión */ }
  return 'script';
}

function audit(accion, regId, detalle) {
  try {
    pestana(TAB_AUDIT, COLUMNAS_AUDIT).appendRow([new Date(), actorActual(), accion, regId || '', String(detalle || '').slice(0, 500)]);
  } catch (err) {
    console.error('Auditoría no escrita: ' + err);
  }
}

function contarAuditoria(regId, accion) {
  const h = pestana(TAB_AUDIT, COLUMNAS_AUDIT);
  const n = h.getLastRow() - 1;
  if (n < 1) return 0;
  const vs = h.getRange(2, 1, n, COLUMNAS_AUDIT.length).getValues();
  return vs.filter(function (r) { return String(r[3]) === regId && String(r[2]) === accion; }).length;
}

function buscarSettlement(settlementKey) {
  const h = pestana(TAB_ACRED, COLUMNAS_ACRED);
  const n = h.getLastRow() - 1;
  if (n < 1) return null;
  const vs = h.getRange(2, 1, n, COLUMNAS_ACRED.length).getValues();
  for (let i = 0; i < vs.length; i++) {
    if (String(vs[i][0]) === settlementKey) return { fila: i + 2, regId: String(vs[i][1]), estado: String(vs[i][9]) };
  }
  return null;
}

/** Menú en la hoja de cálculo (el script va vinculado a la hoja, ver docs/adr/0001). */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('STORYCRAFTERS')
    .addItem('Confirmar pago verificado (fila seleccionada)', 'uiConfirmarPago')
    .addItem('Procesar notificaciones pendientes', 'uiProcesarNotificaciones')
    .addItem('Migrar esquema de pagos', 'uiMigrar')
    .addToUi();
}

function uiMigrar() {
  migrar();
  SpreadsheetApp.getUi().alert('Migración de esquema completada.');
}

function uiProcesarNotificaciones() {
  procesarNotificaciones();
  SpreadsheetApp.getUi().alert('Notificaciones procesadas. Revisa la pestaña "Notificaciones".');
}

/**
 * Diálogo de verificación: se abre sobre la fila seleccionada en "Inscritos". El operador debe
 * declarar que YA VERIFICÓ el abono en el banco o en PayPal — la foto del comprobante nunca prueba
 * acreditación. Sin ese check, no se confirma nada.
 */
function uiConfirmarPago() {
  const ui = SpreadsheetApp.getUi();
  const hoja = SpreadsheetApp.getActiveSheet();
  const fila = hoja.getActiveCell().getRow();
  if (hoja.getName() !== 'Inscritos' || fila < 2) {
    ui.alert('Selecciona primero la fila del participante en la pestaña "Inscritos".');
    return;
  }
  const nombre = hoja.getRange(fila, COL['Nombre (diploma y gafete)']).getValue();
  const regIdSel = hoja.getRange(fila, COL['Registration ID']).getValue();
  const estatus = hoja.getRange(fila, COL['Estatus de Pago']).getValue();
  const esperado = hoja.getRange(fila, COL['Monto esperado']).getValue() || hoja.getRange(fila, COL['Monto cobrado']).getValue();
  const moneda = hoja.getRange(fila, COL['Moneda esperada']).getValue() || 'USD';
  const html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial,sans-serif;padding:12px}label{display:block;margin:10px 0 4px;font-weight:bold}' +
    'input,select{width:100%;padding:6px;box-sizing:border-box}button{margin-top:14px;padding:10px 16px;background:#E8B654;' +
    'border:0;font-weight:bold;cursor:pointer}#res{margin-top:10px;white-space:pre-wrap}</style>' +
    '<b>' + String(nombre).replace(/[<>&]/g, '') + '</b> — esperado: ' + esperado + ' ' + moneda +
    ' · estado actual: ' + String(estatus || 'Pendiente') +
    '<form onsubmit="return false">' +
    '<label>Método</label><select id="m"><option>PayPal</option><option>Transferencia</option></select>' +
    '<label>Referencia / transacción</label><input id="r" required>' +
    '<label>Monto abonado</label><input id="mo" type="number" step="0.01" value="' + esperado + '" required>' +
    '<label>Moneda</label><select id="mo2"><option' + (moneda === 'USD' ? ' selected' : '') + '>USD</option><option' + (moneda === 'HNL' ? ' selected' : '') + '>HNL</option></select>' +
    '<label style="margin-top:12px"><input type="checkbox" id="c" style="width:auto"> Verifiqué el abono en la ' +
    'cuenta bancaria o en PayPal, con monto, moneda y referencia correctos.</label>' +
    '<button onclick="enviar()">Confirmar pago verificado</button><div id="res"></div></form>' +
    '<script>function enviar(){document.getElementById("res").textContent="Guardando…";' +
    'google.script.run.withSuccessHandler(function(r){document.getElementById("res").textContent=' +
    'r.ok?"Pago confirmado. La bienvenida queda en la cola de notificaciones.":("Error: "+r.error);' +
    'if(r.ok)setTimeout(google.script.host.close,1800);}).confirmarPago(' + fila + ',' +
    '{metodo:document.getElementById("m").value,referencia:document.getElementById("r").value,' +
    'monto:document.getElementById("mo").value,moneda:document.getElementById("mo2").value,' +
    'registrationId:"' + String(regIdSel).replace(/"/g, '') + '",' +
    'confirmo:document.getElementById("c").checked});}</script>'
  ).setWidth(420).setHeight(420);
  ui.showModalDialog(html, 'Confirmar pago verificado');
}

/**
 * ÚNICA autoridad que pasa un pago a Completado (R3/R4/F7): corre solo desde la UI de Sheets con
 * operador autenticado y en la lista OPERADORES. Ningún doPost/doGet público puede llamarla.
 * Idempotente por settlementKey (método + referencia): la misma acreditación no puede aplicarse
 * a dos inscripciones, ni dos veces a la misma.
 */
function confirmarPago(fila, p) {
  const operador = operadorAutorizado();
  if (!operador) {
    audit('confirmar-rechazado', '', 'actor no autorizado: ' + actorActual());
    return { ok: false, error: 'No tienes permiso para confirmar pagos. Tu usuario debe estar en la lista OPERADORES.' };
  }
  if (!p || p.confirmo !== true) {
    return { ok: false, error: 'Marca la casilla solo después de verificar el abono en la cuenta.' };
  }
  const metodo = p.metodo === METODOS.TRANSFERENCIA ? METODOS.TRANSFERENCIA : p.metodo === METODOS.PAYPAL ? METODOS.PAYPAL : null;
  // Sin prefijo de fórmula: la referencia la escribe una persona en varias celdas
  const referencia = String(p.referencia || '').trim().replace(/^[=+\-@]+/, '').slice(0, 80);
  const monto = Number(p.monto);
  const moneda = String(p.moneda || '').toUpperCase();
  if (!metodo || !referencia || !(monto > 0) || ['USD', 'HNL'].indexOf(moneda) < 0) {
    return { ok: false, error: 'Datos incompletos: método, referencia, monto y moneda son obligatorios.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let regId = '';
  try {
    const hoja = hojaInscritos();
    const ancho = Math.min(COLUMNAS.length, Math.max(hoja.getLastColumn(), 1));
    let v = hoja.getRange(fila, 1, 1, ancho).getValues()[0];
    while (v.length < COLUMNAS.length) v.push('');
    let get = function (c) { return v[COL[c] - 1]; };
    regId = String(get('Registration ID'));
    // La fila pudo moverse (ordenar la hoja) mientras el diálogo estaba abierto:
    // si el regId del diálogo no coincide, se busca el registro por su ID real.
    if (p.registrationId && String(p.registrationId) !== regId) {
      const reg = buscarRegistro(hoja, String(p.registrationId));
      if (!reg) return { ok: false, error: 'La fila seleccionada ya no corresponde al registro. Cierra y vuelve a abrir el menú.' };
      fila = reg.fila;
      v = hoja.getRange(fila, 1, 1, ancho).getValues()[0];
      while (v.length < COLUMNAS.length) v.push('');
      regId = String(p.registrationId);
      get = function (c) { return v[COL[c] - 1]; };
    }
    if (!regId) return { ok: false, error: 'La fila no tiene Registration ID. Corre "Migrar esquema de pagos" primero.' };
    if (String(get('Estatus de Pago')) === ESTATUS_PAGO.COMPLETADO) {
      return { ok: false, error: 'Este registro ya está Completado.' };
    }

    // Lo esperado se deriva de la tarifa según el método declarado: un participante que eligió
    // transferencia paga en HNL (t.hnl) aunque su preinscripción mostrara USD por defecto.
    const t = TARIFAS[Object.keys(TARIFAS).filter(function (k) { return TARIFAS[k].nombre === get('Tarifa'); })[0]];
    const esperado = t ? (metodo === METODOS.TRANSFERENCIA ? t.hnl : t.usd)
      : (Number(get('Monto esperado')) || Number(get('Monto cobrado')));
    const monEsperada = metodo === METODOS.TRANSFERENCIA ? 'HNL' : 'USD';
    if (Math.abs(monto - esperado) > 0.01 || moneda !== monEsperada) {
      audit('confirmar-monto-distinto', regId, 'recibido ' + moneda + ' ' + monto + ' vs esperado ' + monEsperada + ' ' + esperado);
      return { ok: false, error: 'El monto (' + moneda + ' ' + monto + ') no coincide con el esperado para ' + metodo + ' (' + monEsperada + ' ' + esperado + '). Revisa antes de confirmar.' };
    }

    const settlementKey = metodo + ':' + referencia.toUpperCase().replace(/\s+/g, '');
    const dup = buscarSettlement(settlementKey);
    if (dup && dup.regId === regId && dup.estado === 'Acreditado') {
      // Reintento tras una escritura fallida: completa lo que falte (idempotente)
      completarAcreditacion(hoja, fila, regId, metodo, referencia, monto, moneda, settlementKey, operador);
      return { ok: true, repetido: true };
    }
    if (dup && dup.regId !== regId) {
      audit('confirmar-duplicado', regId, 'settlement ' + settlementKey + ' ya usado por ' + dup.regId);
      return { ok: false, error: 'Esta referencia ya se aplicó a otro registro. No se confirmó.' };
    }
    // dup del mismo registro pero NO acreditado (p. ej. "Sin cupo — por devolver"): se reintenta abajo

    // El cupo se verifica bajo el mismo lock en el momento de acreditar (F6):
    // Pendiente nunca reservó lugar; si ya está lleno, queda para gestión de devolución.
    const esEstudiante = String(get('Tarifa')) === 'Estudiante';
    const conteo = contarInscritos();
    if (conteo.total >= EVENTO.cupo || (esEstudiante && conteo.estudiantes >= EVENTO.cupoEstudiantes)) {
      if (!dup) {
        hoja.getRange(fila, COL['Estado de gestión']).setValue('Pago recibido — cupo no disponible; gestionar devolución o alternativa');
        pestana(TAB_ACRED, COLUMNAS_ACRED).appendRow([settlementKey, regId, metodo, referencia, monto, moneda, new Date(), '', operador, 'Sin cupo — por devolver']);
        audit('confirmar-sin-cupo', regId, settlementKey);
        SpreadsheetApp.flush();
      }
      return { ok: false, sinCupo: true, error: 'El pago llegó pero el cupo ya está lleno. Quedó registrado para gestionar la devolución.' };
    }

    // Dos filas creadas con el mismo código solo pueden acreditarse una vez: bajo el lock,
    // el código debe seguir Aprobado y sin consumir al momento de acreditar.
    const cod = String(get('Código estudiante'));
    if (cod) {
      const sol = buscarSolicitud(cod);
      if (!sol || sol.estado !== 'Aprobado' || sol.pagado) {
        audit('confirmar-codigo-usado', regId, 'código ' + cod + ' ya consumido o revocado');
        return { ok: false, error: 'El código de estudiante ya se usó en otro pago confirmado. Revisa antes de acreditar.' };
      }
    }

    const hAcred = pestana(TAB_ACRED, COLUMNAS_ACRED);
    if (dup) { // misma fila, settlement previo sin acreditar: se actualiza esa fila
      hAcred.getRange(dup.fila, 7).setValue(new Date());
      hAcred.getRange(dup.fila, 9).setValue(operador);
      hAcred.getRange(dup.fila, 10).setValue('Acreditado');
    } else {
      hAcred.appendRow([settlementKey, regId, metodo, referencia, monto, moneda, new Date(), String(p.evidencia || ''), operador, 'Acreditado']);
    }
    completarAcreditacion(hoja, fila, regId, metodo, referencia, monto, moneda, settlementKey, operador);
    return { ok: true, fila: fila, registrationId: regId };
  } catch (err) {
    console.error(err);
    return { ok: false, error: 'No se pudo confirmar: ' + String(err).slice(0, 200) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Escrituras que completan una acreditación: fila del inscrito, cierre del intento,
 * consumo del código de estudiante y encolado de la bienvenida. Idempotente — la llama
 * confirmarPago en el camino nuevo y en el reintento tras una falla parcial.
 */
function completarAcreditacion(hoja, fila, regId, metodo, referencia, monto, moneda, settlementKey, operador) {
  const ancho = Math.min(COLUMNAS.length, Math.max(hoja.getLastColumn(), 1));
  const v = hoja.getRange(fila, 1, 1, ancho).getValues()[0];
  const get = function (c) { return v[COL[c] - 1]; };
  const set = function (c, val) { hoja.getRange(fila, COL[c]).setValue(val); };
  set('Estatus de Pago', ESTATUS_PAGO.COMPLETADO);
  set('Referencia de pago', referencia);
  set('Método de pago', metodo);
  set('Monto cobrado', monto);
  set('Moneda', moneda);
  set('Pago verificado el', new Date());
  set('Verificado por', operador);
  set('Estado de gestión', 'Verificado por operador');
  cerrarIntento(regId, 'verified', referencia, operador);

  // Estudiante: consumir el código de un solo uso (F5)
  const cod = String(get('Código estudiante'));
  if (cod) consumirCodigoEstudiante(cod, referencia);
  audit('confirmar-pago', regId, settlementKey + ' · ' + moneda + ' ' + monto);
  SpreadsheetApp.flush();

  // Bienvenida por la cola única de notificaciones (F1): correo automático, WhatsApp como tarea manual.
  encolarNotificacion(regId, 'email', 'bienvenida-v1', {});
  encolarNotificacion(regId, 'whatsapp', 'bienvenida-v1', {});
  procesarNotificaciones();
}

/** Escribe "Pagado (referencia)" en la solicitud del estudiante una sola vez. */
function consumirCodigoEstudiante(codigo, referencia) {
  const sol = buscarSolicitud(codigo);
  if (!sol || sol.pagado) return;
  hojaEstudiantes().getRange(sol.fila, COL_EST['Pagado (referencia)']).setValue(String(referencia));
}

// ---------- Cola única de notificaciones (outbox) ----------

/**
 * Encola un evento único por eventKey (registrationId:plantilla:canal). Si ya existe no duplica.
 * Canal 'whatsapp' queda en estado 'manual' hasta que haya un proveedor configurado (A2).
 */
function encolarNotificacion(regId, canal, plantilla, datos, sufijo) {
  // El sufijo distingue eventos repetibles del mismo tipo (p. ej. cada comprobante subido)
  const eventKey = regId + ':' + plantilla + ':' + canal + (sufijo ? ':' + sufijo : '');
  const h = pestana(TAB_NOTIF, COLUMNAS_NOTIF);
  const n = h.getLastRow() - 1;
  if (n > 0) {
    const vs = h.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < vs.length; i++) if (String(vs[i][0]) === eventKey) return false;
  }
  h.appendRow([eventKey, regId, canal, plantilla, canal === 'whatsapp' ? 'manual' : 'queued', 0, new Date(), '', '', JSON.stringify(datos || {})]);
  return true;
}

/**
 * Worker del outbox: envía los 'queued' de email y reintenta los 'failed' (máx. 5 intentos, luego
 * 'delivery_unknown' para revisión humana). Lo llama el trigger horario, el menú y confirmarPago.
 */
// Único emisor del sistema (outbox). Bajo lock y marcando 'sending' antes del envío:
// dos ejecuciones concurrentes (cron + confirmación) no disparan la misma bienvenida dos veces.
function procesarNotificaciones() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return; // otra ejecución la está procesando
  try {
    const h = pestana(TAB_NOTIF, COLUMNAS_NOTIF);
    const n = h.getLastRow() - 1;
    if (n < 1) return;
    const vs = h.getRange(2, 1, n, COLUMNAS_NOTIF.length).getValues();
    for (let i = 0; i < vs.length; i++) {
      const estado = String(vs[i][4]);
      const intentos = Number(vs[i][5]) || 0;
      // 'sending' con reclamo de hace >10 min: la ejecución murió antes del resultado.
      // El correo pudo haber salido igual → NO se reintenta: pasa a revisión humana.
      if (estado === 'sending' && (new Date() - new Date(vs[i][7]).getTime()) > 10 * 60 * 1000) {
        h.getRange(i + 2, 5).setValue('delivery_unknown');
        h.getRange(i + 2, 9).setValue('Interrumpido durante el envío — verificar si llegó antes de reenviar');
        continue;
      }
      if ((estado !== 'queued' && estado !== 'failed') || String(vs[i][2]) !== 'email' || intentos >= NOTIF_MAX_INTENTOS) continue;
      const fila = i + 2;
      const regId = String(vs[i][1]);
      const plantilla = String(vs[i][3]);
      let datos = {};
      try { datos = JSON.parse(String(vs[i][9]) || '{}'); } catch (e) { datos = {}; }
      h.getRange(fila, 5).setValue('sending'); // reclamo antes de llamar al servicio externo
      h.getRange(fila, 8).setValue(new Date()); // marca de tiempo del reclamo (se sobrescribe al enviar)
      SpreadsheetApp.flush();
      try {
        enviarNotificacion(regId, plantilla, datos);
        h.getRange(fila, 5).setValue('sent');
        h.getRange(fila, 8).setValue(new Date());
      } catch (err) {
        console.error('Notificación ' + plantilla + ' falló: ' + err);
        h.getRange(fila, 5).setValue(intentos + 1 >= NOTIF_MAX_INTENTOS ? 'delivery_unknown' : 'failed');
        h.getRange(fila, 9).setValue(String(err).slice(0, 300));
      }
      h.getRange(fila, 6).setValue(intentos + 1);
    }
  } finally {
    lock.releaseLock();
  }
}

function enviarNotificacion(regId, plantilla, datos) {
  const hoja = hojaInscritos();
  const reg = buscarRegistro(hoja, regId);
  if (!reg) throw new Error('Registro no encontrado: ' + regId);
  const t = TARIFAS[Object.keys(TARIFAS).filter(function (k) { return TARIFAS[k].nombre === reg.get('Tarifa'); })[0]];
  const nombre = String(reg.get('Nombre (diploma y gafete)'));
  const correo = String(reg.get('Correo'));

  if (plantilla === 'bienvenida-v1') {
    enviarConfirmacion({
      nombre: nombre, correo: correo, tarifa: t,
      monto: reg.get('Monto cobrado') || (t && t.usd), moneda: String(reg.get('Moneda') || 'USD'),
      captura: String(reg.get('Referencia de pago')).replace(/[<>&"]/g, ''),
      metodo: String(reg.get('Método de pago')),
    });
    hoja.getRange(reg.fila, COL['Correo enviado']).setValue('Sí');
    return;
  }

  if (plantilla === 'comprobante-equipo-v1') {
    const blob = DriveApp.getFileById(datos.archivoId).getBlob();
    enviarCorreo({
      to: CORREO_EVENTO,
      subject: 'Comprobante recibido — verificar abono · ' + nombre,
      name: REMITENTE,
      replyTo: correo,
      attachments: [blob],
      body: 'Comprobante recibido, NO prueba acreditación. Abre el banco, verifica el abono y luego usa ' +
        'el menú STORYCRAFTERS ▸ "Confirmar pago verificado" en la fila de la hoja Inscritos.\n\n' +
        'Nombre: ' + nombre + '\nCorreo: ' + correo + '\nWhatsApp: ' + String(reg.get('WhatsApp')) +
        '\nTarifa: ' + String(reg.get('Tarifa')) + '\nMonto esperado: ' + String(reg.get('Moneda esperada') || 'HNL') + ' ' +
        String(reg.get('Monto esperado')) + '\nRegistration ID: ' + regId + '\nFila: ' + reg.fila,
    });
    return;
  }

  if (plantilla === 'instrucciones-transferencia-v1') {
    const banco = datosBancarios();
    if (!banco) throw new Error('Transferencias no configuradas');
    const saludo = nombre.split(' ')[0] || 'storycrafter';
    enviarCorreoSimple(correo, 'Datos para tu transferencia, ' + saludo,
      'Pago por <span>transferencia</span>',
      ['Hola, ' + saludo + '. Estos son los datos para tu pago de STORYCRAFTERS:',
       'Banco: ' + banco.banco + ' · Titular: ' + banco.titular + ' · ' + banco.tipo + ' · Cuenta: ' + banco.cuenta,
       'Monto exacto: L ' + datos.monto + ' (' + datos.moneda + '). Referencia de tu inscripción: ' + regId,
       'Después de transferir, sube la foto del comprobante desde la página (o envíala por WhatsApp al ' + WHATSAPP_EQUIPO + '). ' +
       'Tu lugar se confirma cuando el equipo verifique el abono en el banco.'],
      { texto: 'Ir a la inscripción', url: LANDING_URL + '#inscripcion' });
    return;
  }
  throw new Error('Plantilla desconocida: ' + plantilla);
}

/** Menú/manual: migra la hoja al esquema v2. Idempotente y conservadora (plan §5, R7).
 *  Corre bajo el lock compartido: el cron del outbox o una confirmación concurrente
 *  no pueden intercalarse entre el encolado y la marca de "ya enviado". */
function migrar() {
  asegurarEsquema();
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
  const hoja = hojaInscritos();
  const filas = leerInscritos(hoja);
  filas.forEach(function (r, i) {
    const fila = i + 2;
    const set = function (c, val) { hoja.getRange(fila, COL[c]).setValue(val); };
    let regId = String(r[COL['Registration ID'] - 1]);
    if (!regId) { regId = Utilities.getUuid(); set('Registration ID', regId); }
    const estatus = String(r[COL['Estatus de Pago'] - 1]);
    if (estatus) return;
    const ref = String(r[COL['Referencia de pago'] - 1]).trim();
    if (!ref || ref === PAGO_PENDIENTE) {
      set('Estatus de Pago', ESTATUS_PAGO.PENDIENTE);
      return;
    }
    // Referencia legada real: solo si la bienvenida YA salió se migra como Completado
    // (una referencia sin correo enviado queda Pendiente + revisión, no se presume pagada).
    if (String(r[COL['Correo enviado'] - 1]) === 'Sí') {
      set('Estatus de Pago', ESTATUS_PAGO.COMPLETADO);
      set('Estado de gestión', 'Migrado — bienvenida ya enviada');
      const metodo = r[COL['Método de pago'] - 1] || (/paypal/i.test(String(r[COL['Pasarela'] - 1])) ? METODOS.PAYPAL : '');
      if (metodo) {
        set('Método de pago', metodo);
        // Siembra el ledger para que esa referencia vieja no pueda reutilizarse en otra fila
        const key = metodo + ':' + ref.toUpperCase().replace(/\s+/g, '');
        if (!buscarSettlement(key)) {
          pestana(TAB_ACRED, COLUMNAS_ACRED).appendRow([key, regId, metodo, ref,
            r[COL['Monto cobrado'] - 1] || '', String(r[COL['Moneda'] - 1] || 'USD'),
            r[COL['Fecha de pago'] - 1] || '', 'fila legada', 'migración', 'Acreditado (legado)']);
        }
      }
      // Sembrar el historial para que la cola nunca reenvíe estas bienvenidas:
      // fila histórica insertada ya en 'sent' (no pasa por el worker).
      const hN = pestana(TAB_NOTIF, COLUMNAS_NOTIF);
      const key = regId + ':bienvenida-v1:email';
      let existe = false;
      for (let i = 2; i <= hN.getLastRow(); i++) {
        if (String(hN.getRange(i, 1).getValue()) === key) { existe = true; break; }
      }
      if (!existe) {
        hN.appendRow([key, regId, 'email', 'bienvenida-v1', 'sent', 0, new Date(), new Date(), '', '{"legado":true}']);
      }
    } else {
      set('Estatus de Pago', ESTATUS_PAGO.PENDIENTE);
      set('Estado de gestión', 'Referencia legada sin bienvenida — revisar en PayPal');
    }
  });
  rehacerVistas(SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HOJA_ID')));
  SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
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
      enviarCorreo({ to: CORREO_EVENTO, subject: 'Nueva solicitud de estudiante: ' + limpio(datos.nombre),
        body: 'Revisa el carné y cambia el Estado en la pestaña Estudiantes.\n' +
        (decision.nota ? 'Revisión de Claude: ' + decision.nota + '\n' : '') +
        SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('HOJA_ID')).getUrl() });
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

/**
 * Disparador instalable. Estudiantes: al cambiar el Estado envía el correo de decisión.
 * Inscritos: escribir la referencia a mano YA NO aprueba ni envía bienvenida (issue #20) —
 * queda marcado como edición fuera de procedimiento para que el operador use el menú
 * STORYCRAFTERS ▸ "Confirmar pago verificado", que sí deja auditoría.
 */
function alEditarHoja(e) {
  const hoja = e.range.getSheet();
  if (e.range.getRow() < 2) return;
  if (hoja.getName() === 'Inscritos') {
    const c = COL['Referencia de pago'];
    if (e.range.getColumn() > c || e.range.getLastColumn() < c) return;
    if (hoja.getLastColumn() < COL['Estatus de Pago']) return; // esquema viejo: migrar() primero
    for (let fila = e.range.getRow(); fila <= e.range.getLastRow(); fila++) {
      const ref = String(hoja.getRange(fila, c).getValue()).trim();
      if (!ref || ref === PAGO_PENDIENTE) continue;
      if (String(hoja.getRange(fila, COL['Estatus de Pago']).getValue()) === ESTATUS_PAGO.COMPLETADO) continue;
      hoja.getRange(fila, COL['Estado de gestión']).setValue(
        'Edición manual sin verificación — usa el menú STORYCRAFTERS ▸ Confirmar pago verificado');
      audit('edicion-manual', String(hoja.getRange(fila, COL['Registration ID']).getValue()),
        'referencia escrita a mano: ' + ref.slice(0, 80));
    }
    return;
  }
  if (hoja.getName() !== 'Estudiantes') return;
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

/**
 * Envía desde CORREO_EVENTO cuando la cuenta dueña del script lo tiene verificado en Gmail como
 * "Enviar correo como" (sale por el SMTP de ese buzón). Si no, usa MailApp desde la cuenta dueña.
 * Recibe el mismo objeto que MailApp.sendEmail({ to, subject, body?, htmlBody?, name?, replyTo?, attachments? }).
 */
function enviarCorreo(o) {
  let alias = false;
  try {
    alias = GmailApp.getAliases().indexOf(CORREO_EVENTO) >= 0;
  } catch (err) {
    console.error('No se pudo leer los alias de Gmail: ' + err);
  }
  if (!alias) return MailApp.sendEmail(o);
  const opciones = { from: CORREO_EVENTO };
  ['htmlBody', 'name', 'replyTo', 'attachments'].forEach(function (k) { if (o[k]) opciones[k] = o[k]; });
  GmailApp.sendEmail(o.to, o.subject, o.body || '', opciones);
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
  enviarCorreo({ to: para, subject: asunto, htmlBody: html, name: REMITENTE, replyTo: CORREO_EVENTO });
}

// ---------- PayPal API (uso administrativo: consultar una transacción desde el menú) ----------
// El backend público ya NO cobra ni confirma nada con la API: los Hosted Buttons no devuelven
// callback y la verificación de todo pago es humana (menú STORYCRAFTERS ▸ Confirmar pago).
// Se conserva el cliente mínimo para que el operador pueda contrastar una transacción.

/** Devuelve el estado de una transacción/orden de PayPal para que el operador la contraste. */
function consultarPayPal(id) {
  try {
    return paypal('get', '/v2/payments/captures/' + encodeURIComponent(id));
  } catch (e1) {
    try {
      return paypal('get', '/v2/checkout/orders/' + encodeURIComponent(id));
    } catch (e2) {
      return { error: 'PayPal no encontró esa referencia: ' + String(e2).slice(0, 200) };
    }
  }
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
  // Cuenta como inscrito solo el pago verificado: Estatus de Pago = Completado. En una hoja sin
  // migrar (sin la columna) vale el comportamiento anterior: referencia escrita ≠ PENDIENTE.
  const filas = leerInscritos(hojaInscritos()).filter(function (r) {
    if (!r[COL['Tarifa'] - 1]) return false;
    const est = String(r[COL['Estatus de Pago'] - 1]);
    if (est) return est === ESTATUS_PAGO.COMPLETADO;
    const ref = String(r[COL['Referencia de pago'] - 1]);
    return !!ref && ref !== PAGO_PENDIENTE;
  });
  return {
    total: filas.length,
    estudiantes: filas.filter(function (r) { return r[COL['Tarifa'] - 1] === 'Estudiante'; }).length,
  };
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
    dato('Pagado', String(r.moneda || 'USD') + ' ' + Number(r.monto || t.usd) +
      (r.metodo ? ' · ' + r.metodo : '')) + dato('Recibo', r.captura) +
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

  enviarCorreo({
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
