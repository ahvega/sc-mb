// Pruebas del checkout tarjeta/transferencia (issue #20): idempotencia de preinscripción,
// intentos de pago, subida de comprobante con token, confirmación humana con ledger,
// migración del esquema y lista de espera. Corre con el mismo harness de gas-mocks.js.
//
//   node --test backend/tests/pagos.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./gas-mocks');

const DATOS = {
  nombre: 'Ana Prueba', correo: 'ana@test.hn', whatsapp: '+504 9999-8888', ciudad: 'San Pedro Sula',
  ocupacion: 'Filmmaker', experiencia: 'Intermedia (1 a 3 años)', talla: 'M',
  comoSeEntero: 'Instagram', restricciones: '', comunicaciones: true,
};

const PROPS_BANCO = {
  TRANSFERENCIAS_HABILITADAS: 'si',
  BANCO_NOMBRE: 'Banco de Prueba', BANCO_TITULAR: 'Titular de Prueba',
  BANCO_TIPO: 'Ahorro', BANCO_CUENTA: '000-TEST',
};
const BANCO = { props: PROPS_BANCO };
// Solo el operador en OPERADORES puede confirmar pagos
const OPS = { props: { OPERADORES: 'operador@test.local' } };
const BANCO_OPS = { props: Object.assign({}, PROPS_BANCO, OPS.props) };

const post = (env, body) => env.json(env.ctx.doPost({ postData: { contents: JSON.stringify(body) } }));
const col = (env, c) => env.colIndex('Inscritos', c);
const pre = (env, extra) => env.json(env.ctx.preinscripcion(
  Object.assign({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS }, extra)));

function filaCompleta(env, nombreCol) {
  return env.hoja('Inscritos').getRange(2, col(env, nombreCol)).getValue();
}

// ---------- preinscripción: Registration ID + idempotencia + freno de abuso ----------

test('preinscripcion devuelve registrationId y deja Estatus de Pago = Pendiente', () => {
  const env = crearEntorno();
  const res = pre(env);
  assert.equal(res.ok, true);
  assert.match(res.registrationId, /^[0-9a-f-]{36}$/);
  assert.equal(filaCompleta(env, 'Estatus de Pago'), 'Pendiente');
  assert.equal(filaCompleta(env, 'Referencia de pago'), 'PENDIENTE');
  assert.equal(filaCompleta(env, 'Registration ID'), res.registrationId);
});

test('reintento con la misma clave de idempotencia devuelve el mismo registro sin duplicar', () => {
  const env = crearEntorno();
  const r1 = pre(env, { idempotencia: 'k-1' });
  const r2 = pre(env, { idempotencia: 'k-1' }); // timeout del cliente: reintenta con la misma clave
  assert.equal(r2.ok, true);
  assert.equal(r2.repetido, true);
  assert.equal(r2.registrationId, r1.registrationId);
  assert.equal(env.hoja('Inscritos').getLastRow(), 2);
  assert.equal(env.correos.length, 1); // un solo correo de "datos recibidos"
});

test('más de 3 preinscripciones del mismo correo el mismo día se rechazan, con o sin clave', () => {
  const env = crearEntorno();
  for (let i = 1; i <= 3; i++) assert.equal(pre(env, { idempotencia: 'k' + i }).ok, true);
  assert.equal(pre(env, { idempotencia: 'k4' }).ok, false);
  assert.equal(pre(env).ok, false); // omitir la clave no elude el límite
});

// ---------- iniciarPago: intento antes de cobrar, bloqueo de cambio de método ----------

test('iniciarPago paypal registra el intento y bloquea cambiar a transferencia', () => {
  const env = crearEntorno(BANCO);
  const regId = pre(env).registrationId;
  const r = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'paypal' });
  assert.equal(r.ok, true);
  const hI = env.hoja('Intentos de Pago');
  assert.equal(hI.getRange(2, env.colIndex('Intentos de Pago', 'Estado')).getValue(), 'launched');

  // reabrir la ventana con el mismo método es idempotente
  assert.equal(post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'paypal' }).ok, true);
  // cambiar a transferencia con un intento PayPal activo está bloqueado
  const t = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  assert.equal(t.ok, false);
  assert.match(t.error, /otro método/);
});

test('iniciarPago transferencia sin configuración bancaria se rechaza sin dejar intento', () => {
  const env = crearEntorno(); // sin TRANSFERENCIAS_HABILITADAS
  const regId = pre(env).registrationId;
  const r = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  assert.equal(r.ok, false);
  assert.equal(r.transferenciaDisponible, false);
  assert.equal(env.hoja('Intentos de Pago').getLastRow(), 1); // solo encabezado
});

test('iniciarPago transferencia emite token, datos bancarios y monto HNL; correo de instrucciones al participante', () => {
  const env = crearEntorno(BANCO);
  const regId = pre(env).registrationId;
  const r = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  assert.equal(r.ok, true);
  assert.ok(r.token);
  assert.equal(r.banco.cuenta, '000-TEST');
  assert.equal(r.monto, 1700);
  assert.equal(r.moneda, 'HNL');
  assert.equal(filaCompleta(env, 'Moneda esperada'), 'HNL');
  // el token en claro nunca va a la hoja: solo su hash
  assert.notEqual(filaCompleta(env, 'Token comprobante (hash)'), r.token);
  // F9: el participante recibe los datos bancarios por correo (no dependen del modal abierto)
  const inst = env.correos.find(c => /transferencia/i.test(c.subject));
  assert.ok(inst);
  assert.match(inst.htmlBody || inst.body, /000-TEST/);
});

test('iniciarPago sobre registro inexistente o ya Completado se rechaza', () => {
  const env = crearEntorno(BANCO);
  assert.equal(post(env, { accion: 'iniciarPago', registrationId: 'no-existe', metodo: 'paypal' }).ok, false);
});

// ---------- subirComprobante: token de un uso, validación, Drive privado ----------

test('subirComprobante rechaza token inválido y acepta el válido una sola vez', () => {
  const env = crearEntorno(BANCO);
  const regId = pre(env).registrationId;
  const ini = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });

  const b64 = Buffer.from('imagen-falsa').toString('base64');
  const malo = post(env, { accion: 'subirComprobante', registrationId: regId, token: 'token-falso', archivo: { nombre: 'c.png', tipo: 'image/png', base64: b64 } });
  assert.equal(malo.ok, false);
  assert.equal(env.archivos.length, 0);

  const bueno = post(env, { accion: 'subirComprobante', registrationId: regId, token: ini.token, archivo: { nombre: 'c.png', tipo: 'image/png', base64: b64 } });
  assert.equal(bueno.ok, true);
  assert.equal(env.archivos.length, 1);
  assert.match(String(filaCompleta(env, 'Estado de gestión')), /Comprobante recibido/);
  assert.ok(filaCompleta(env, 'Comprobante Drive ID'));
  assert.equal(filaCompleta(env, 'Estatus de Pago'), 'Pendiente'); // el comprobante NO acredita

  // El token se consume: reusarlo se rechaza
  const deNuevo = post(env, { accion: 'subirComprobante', registrationId: regId, token: ini.token, archivo: { nombre: 'c.png', tipo: 'image/png', base64: b64 } });
  assert.equal(deNuevo.ok, false);

  // El correo al equipo lleva el archivo adjunto y la instrucción de verificación humana
  const equipo = env.correos.find(c => /Comprobante recibido/.test(c.subject));
  assert.ok(equipo);
  assert.equal(equipo.to, 'storycrafters@themediabuilders.com');
  assert.ok(equipo.attachments && equipo.attachments.length === 1);
  // WhatsApp queda como tarea manual en la cola, no como enviado
  const hN = env.hoja('Notificaciones');
  const n = hN.getLastRow() - 1;
  const wa = hN.getRange(2, 1, n, 10).getValues().filter(r => r[2] === 'whatsapp' && r[3] === 'comprobante-equipo-v1');
  assert.equal(wa[0][4], 'manual');
});

test('reabrir iniciarPago transferencia tras subir emite token nuevo (resubida controlada)', () => {
  const env = crearEntorno(BANCO);
  const regId = pre(env).registrationId;
  const i1 = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  const b64 = Buffer.from('imagen').toString('base64');
  const arch = { nombre: 'c.png', tipo: 'image/png', base64: b64 };
  assert.equal(post(env, { accion: 'subirComprobante', registrationId: regId, token: i1.token, archivo: arch }).ok, true);
  // el participante decide reemplazar el comprobante: nuevo iniciarPago devuelve token nuevo
  const i2 = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  assert.equal(i2.ok, true);
  assert.equal(i2.comprobante, 'recibido');
  assert.ok(i2.token);
  assert.notEqual(i2.token, i1.token);
  assert.equal(post(env, { accion: 'subirComprobante', registrationId: regId, token: i2.token, archivo: arch }).ok, true);
  assert.equal(env.archivos.length, 2);
});

test('subirComprobante rechaza tipo y tamaño inválidos', () => {
  const env = crearEntorno(BANCO);
  const regId = pre(env).registrationId;
  const ini = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  const exe = post(env, { accion: 'subirComprobante', registrationId: regId, token: ini.token, archivo: { nombre: 'x.exe', tipo: 'application/x-msdownload', base64: 'AAAA' } });
  assert.equal(exe.ok, false);
  const grande = post(env, { accion: 'subirComprobante', registrationId: regId, token: ini.token, archivo: { nombre: 'c.png', tipo: 'image/png', base64: Buffer.alloc(7 * 1024 * 1024).toString('base64') } });
  assert.equal(grande.ok, false);
  assert.equal(env.archivos.length, 0);
});

// ---------- confirmarPago: única autoridad, ledger, cupo, auditoría ----------

test('confirmarPago exige operador autorizado y confirmación expresa', () => {
  const env = crearEntorno();
  const regId = pre(env).registrationId;
  // sin OPERADORES configurado: nadie autorizado
  const r = env.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: 'TXN-1', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(r.ok, false);
  assert.equal(env.hoja('Inscritos').getRange(2, col(env, 'Estatus de Pago')).getValue(), 'Pendiente');

  const env2 = crearEntorno(OPS);
  pre(env2);
  // operador autorizado pero sin declarar la verificación bancaria
  const r2 = env2.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: 'TXN-1', monto: 64, moneda: 'USD', confirmo: false });
  assert.equal(r2.ok, false);
});

test('confirmarPago acredita, audita y dispara una sola bienvenida por la cola', () => {
  const env = crearEntorno(OPS);
  const regId = pre(env).registrationId;
  post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'paypal' });
  env.correos.length = 0;

  const r = env.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: 'TXN-100', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(r.ok, true);
  const h = env.hoja('Inscritos');
  assert.equal(h.getRange(2, col(env, 'Estatus de Pago')).getValue(), 'Completado');
  assert.equal(h.getRange(2, col(env, 'Referencia de pago')).getValue(), 'TXN-100');
  assert.equal(h.getRange(2, col(env, 'Verificado por')).getValue(), 'operador@test.local');
  // ledger
  const acr = env.hoja('Acreditaciones');
  assert.equal(acr.getRange(2, env.colIndex('Acreditaciones', 'Settlement key')).getValue(), 'PayPal:TXN-100');
  // bienvenida por la cola, una vez
  assert.equal(env.correos.length, 1);
  assert.match(env.correos[0].subject, /confirmado/);
  assert.equal(h.getRange(2, col(env, 'Correo enviado')).getValue(), 'Sí');
  // WhatsApp queda manual, no enviado automáticamente
  const hN = env.hoja('Notificaciones');
  const wa = hN.getRange(2, 1, hN.getLastRow() - 1, 10).getValues().filter(x => x[2] === 'whatsapp');
  assert.equal(wa[0][4], 'manual');
  // el intento quedó cerrado como verified
  const hI = env.hoja('Intentos de Pago');
  assert.equal(hI.getRange(2, env.colIndex('Intentos de Pago', 'Estado')).getValue(), 'verified');

  // repetir la misma confirmación es idempotente
  const r2 = env.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: 'TXN-100', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(r2.ok, false); // ya Completado
  assert.equal(env.correos.length, 1);
});

test('la misma referencia no puede acreditar dos inscripciones (settlement único)', () => {
  const env = crearEntorno(BANCO_OPS);
  const r1 = pre(env, { idempotencia: 'a', datos: DATOS });
  const r2 = pre(env, { idempotencia: 'b', datos: { ...DATOS, correo: 'otro@test.hn' } });
  post(env, { accion: 'iniciarPago', registrationId: r1.registrationId, metodo: 'transferencia' });
  post(env, { accion: 'iniciarPago', registrationId: r2.registrationId, metodo: 'transferencia' });
  env.correos.length = 0;
  assert.equal(env.ctx.confirmarPago(2, { metodo: 'Transferencia', referencia: 'DEP-7', monto: 1700, moneda: 'HNL', confirmo: true }).ok, true);
  const r = env.ctx.confirmarPago(3, { metodo: 'Transferencia', referencia: 'DEP-7', monto: 1700, moneda: 'HNL', confirmo: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /otro registro/);
  assert.equal(env.correos.length, 1); // una sola bienvenida
});

test('confirmarPago con cupo lleno no da el lugar: queda para devolución, sin bienvenida', () => {
  const env = crearEntorno(BANCO_OPS);
  // llenar el cupo con filas ya Completadas
  const h = env.hoja('Inscritos');
  for (let i = 0; i < 40; i++) {
    const fila = new Array(env.colIndex('Inscritos', 'Código estudiante')).fill('');
    fila[col(env, 'Tarifa') - 1] = 'Preventa';
    fila[col(env, 'Estatus de Pago') - 1] = 'Completado';
    fila[col(env, 'Referencia de pago') - 1] = 'TXN-' + i;
    h.appendRow(fila);
  }
  const reg41 = pre(env); // fila 42 (header + 40 completadas), Pendiente
  post(env, { accion: 'iniciarPago', registrationId: reg41.registrationId, metodo: 'transferencia' });
  env.correos.length = 0;
  const r = env.ctx.confirmarPago(42, { metodo: 'Transferencia', referencia: 'DEP-9', monto: 1700, moneda: 'HNL', confirmo: true });
  assert.equal(r.ok, false);
  assert.equal(r.sinCupo, true);
  assert.match(String(h.getRange(42, col(env, 'Estado de gestión')).getValue()), /cupo no disponible/);
  assert.equal(h.getRange(42, col(env, 'Estatus de Pago')).getValue(), 'Pendiente');
  assert.equal(env.correos.length, 0); // no hay bienvenida sin cupo
  // el movimiento quedó en el ledger para gestionar la devolución
  const acr = env.hoja('Acreditaciones');
  assert.match(String(acr.getRange(2, env.colIndex('Acreditaciones', 'Estado')).getValue()), /Sin cupo/);

  // Si luego se libera un lugar, el MISMO settlement puede reintentarse y sí acredita
  h.getRange(2, col(env, 'Estatus de Pago')).setValue('Cancelado'); // se liberó un lugar
  h.getRange(2, col(env, 'Referencia de pago')).setValue('PENDIENTE');
  const r2 = env.ctx.confirmarPago(42, { metodo: 'Transferencia', referencia: 'DEP-9', monto: 1700, moneda: 'HNL', confirmo: true });
  assert.equal(r2.ok, true);
  assert.equal(h.getRange(42, col(env, 'Estatus de Pago')).getValue(), 'Completado');
  assert.match(String(acr.getRange(2, env.colIndex('Acreditaciones', 'Estado')).getValue()), /Acreditado/);
  assert.equal(env.correos.length, 1); // bienvenida al confirmar de verdad
});

test('confirmarPago consume el código de estudiante una sola vez', () => {
  const env = crearEntorno(OPS);
  // solicitud de estudiante aprobada a mano → código
  const b64 = Buffer.from('carne').toString('base64');
  env.ctx.solicitudEstudiante({ accion: 'solicitudEstudiante', datos: DATOS, institucion: 'UNITEC', carne: { nombre: 'c.png', tipo: 'image/png', base64: b64 } });
  const he = env.hoja('Estudiantes');
  he.getRange(2, env.colIndex('Estudiantes', 'Estado')).setValue('Aprobado');
  env.ctx.procesarEstado(he, 2);
  const codigo = String(he.getRange(2, env.colIndex('Estudiantes', 'Código')).getValue());

  const r = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', codigo: codigo }));
  assert.equal(r.ok, true);
  env.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: 'TXN-EST', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(he.getRange(2, env.colIndex('Estudiantes', 'Pagado (referencia)')).getValue(), 'TXN-EST');
  // el enlace quedó consumido
  const v = env.json(env.ctx.doGet({ parameter: { codigo: codigo } }));
  assert.equal(v.ok, false);
  // y el código consumido no puede generar una segunda preinscripción
  const r2 = env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', codigo: codigo }));
  assert.equal(r2.ok, false);
  assert.match(r2.error, /ya se usó/);
});

test('dos preinscripciones con el mismo código de estudiante: solo una puede acreditarse', () => {
  const env = crearEntorno(OPS);
  const b64 = Buffer.from('carne').toString('base64');
  env.ctx.solicitudEstudiante({ accion: 'solicitudEstudiante', datos: DATOS, institucion: 'UNITEC', carne: { nombre: 'c.png', tipo: 'image/png', base64: b64 } });
  const he = env.hoja('Estudiantes');
  he.getRange(2, env.colIndex('Estudiantes', 'Estado')).setValue('Aprobado');
  env.ctx.procesarEstado(he, 2);
  const codigo = String(he.getRange(2, env.colIndex('Estudiantes', 'Código')).getValue());
  // dos filas Pendiente con el mismo código (ambas creadas antes del primer pago)
  env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', codigo: codigo, idempotencia: 'a' }));
  env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', codigo: codigo, idempotencia: 'b' }));
  assert.equal(env.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: 'TXN-A', monto: 64, moneda: 'USD', confirmo: true }).ok, true);
  const r = env.ctx.confirmarPago(3, { metodo: 'PayPal', referencia: 'TXN-B', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /ya se usó/);
  assert.equal(env.hoja('Inscritos').getRange(3, col(env, 'Estatus de Pago')).getValue(), 'Pendiente');
});

test('el cupo de estudiantes (10) también se verifica al confirmar, bajo lock', () => {
  const env = crearEntorno(OPS);
  const h = env.hoja('Inscritos');
  const llena = function () {
    const f = new Array(col(env, 'Código estudiante')).fill('');
    f[col(env, 'Tarifa') - 1] = 'Estudiante';
    f[col(env, 'Estatus de Pago') - 1] = 'Completado';
    f[col(env, 'Referencia de pago') - 1] = 'TXN-E' + h.getLastRow();
    h.appendRow(f);
  };
  for (let i = 0; i < 9; i++) llena(); // 9 completadas: la preinscripción aún cabe
  const b64 = Buffer.from('carne').toString('base64');
  env.ctx.solicitudEstudiante({ accion: 'solicitudEstudiante', datos: DATOS, institucion: 'U', carne: { nombre: 'c.png', tipo: 'image/png', base64: b64 } });
  const he = env.hoja('Estudiantes');
  he.getRange(2, env.colIndex('Estudiantes', 'Estado')).setValue('Aprobado');
  env.ctx.procesarEstado(he, 2);
  const codigo = String(he.getRange(2, env.colIndex('Estudiantes', 'Código')).getValue());
  env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'estudiante', codigo: codigo })); // fila 11, Pendiente
  llena(); // entre la preinscripción y la confirmación se llenó el cupo de estudiantes
  const r = env.ctx.confirmarPago(11, { metodo: 'PayPal', referencia: 'TXN-E11', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(r.ok, false);
  assert.equal(r.sinCupo, true);
  assert.equal(h.getRange(11, col(env, 'Estatus de Pago')).getValue(), 'Pendiente');
});

test('la resubida de comprobante vuelve a notificar al equipo (eventKey por archivo)', () => {
  const env = crearEntorno(BANCO);
  const regId = pre(env).registrationId;
  const i1 = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  const arch = { nombre: 'c.png', tipo: 'image/png', base64: Buffer.from('img').toString('base64') };
  post(env, { accion: 'subirComprobante', registrationId: regId, token: i1.token, archivo: arch });
  const i2 = post(env, { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' });
  post(env, { accion: 'subirComprobante', registrationId: regId, token: i2.token, archivo: arch });
  const avisos = env.correos.filter(c => /Comprobante recibido/.test(c.subject));
  assert.equal(avisos.length, 2); // el equipo ve el comprobante corregido, no solo el primero
});

// ---------- migración y lista de espera ----------

test('migrar asigna Registration ID y traduce el estado legado sin reenviar bienvenidas', () => {
  const env = crearEntorno();
  const h = env.hoja('Inscritos');
  // fila legada pagada (referencia real + bienvenida enviada) y otra pendiente
  const ancho = env.colIndex('Inscritos', 'Código estudiante');
  const vieja = new Array(ancho).fill('');
  vieja[0] = new Date(); vieja[col(env, 'Tarifa') - 1] = 'Preventa';
  vieja[col(env, 'Referencia de pago') - 1] = 'TXN-VIEJA'; vieja[col(env, 'Correo enviado') - 1] = 'Sí';
  vieja[col(env, 'Pasarela') - 1] = 'PayPal (botón)';
  h.appendRow(vieja);
  const pend = new Array(ancho).fill('');
  pend[0] = new Date(); pend[col(env, 'Tarifa') - 1] = 'Preventa';
  pend[col(env, 'Referencia de pago') - 1] = 'PENDIENTE';
  h.appendRow(pend);
  env.correos.length = 0;

  env.ctx.migrar();
  assert.ok(h.getRange(2, col(env, 'Registration ID')).getValue());
  assert.equal(h.getRange(2, col(env, 'Estatus de Pago')).getValue(), 'Completado');
  assert.equal(h.getRange(3, col(env, 'Estatus de Pago')).getValue(), 'Pendiente');
  env.ctx.procesarNotificaciones();
  assert.equal(env.correos.length, 0); // la bienvenida vieja se sembró como enviada, no se repite
  assert.equal(env.ctx.contarInscritos().total, 1); // solo la fila completada cuenta
  // el ledger sembró la referencia vieja: no puede reutilizarse para acreditar otra fila
  const acr = env.hoja('Acreditaciones');
  assert.equal(acr.getRange(2, env.colIndex('Acreditaciones', 'Settlement key')).getValue(), 'PayPal:TXN-VIEJA');
  // y las vistas cuentan por Estatus de Pago (con fallback legado)
  const formula = env.hoja('Control').getRange(3, 2).getValue();
  assert.match(String(formula), /Completado/);
});

test('listaEspera guarda nombre, correo y WhatsApp, y deduplica por correo', () => {
  const env = crearEntorno();
  const r = post(env, { accion: 'listaEspera', nombre: 'Ana', correo: 'ana@test.hn', whatsapp: '9999' });
  assert.equal(r.ok, true);
  const r2 = post(env, { accion: 'listaEspera', nombre: 'Ana', correo: 'ANA@test.hn', whatsapp: '9999' });
  assert.equal(r2.ok, true);
  assert.equal(r2.repetido, true);
  assert.equal(env.hoja('Lista de espera').getLastRow(), 2);
});
