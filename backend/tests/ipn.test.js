// Pruebas del pago automático con PayPal (IPN): el aviso verificado acredita la preinscripción
// pendiente y dispara la bienvenida sin intervención; lo que no se puede vincular queda para el equipo.
//
//   node --test backend/tests/ipn.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntorno } = require('./gas-mocks');

const DATOS = {
  nombre: 'Ana María Prueba', correo: 'ana@test.hn', whatsapp: '+504 9999-8888', ciudad: 'San Pedro Sula',
  ocupacion: 'Filmmaker', experiencia: 'Intermedia (1 a 3 años)', talla: 'M',
  comoSeEntero: 'Instagram', restricciones: '', comunicaciones: true,
};
const RECEPTOR = 'pagos@mediabuilders.test';
const PROPS = { props: { PAYPAL_RECEPTOR: RECEPTOR, OPERADORES: 'operador@test.local' } };

const verificado = (texto) => ({ getResponseCode: () => 200, getContentText: () => texto || 'VERIFIED' });
const col = (env, c) => env.colIndex('Inscritos', c);
const celda = (env, c, fila) => env.hoja('Inscritos').getRange(fila || 2, col(env, c)).getValue();
const pre = (env, datos) => env.json(env.ctx.preinscripcion({ accion: 'preinscripcion', tarifa: 'preventa', datos: datos || DATOS }));

function ipn(env, campos) {
  const p = Object.assign({
    txn_type: 'web_accept', txn_id: '9AB12345CD678901E', payment_status: 'Completed',
    mc_gross: '64.00', mc_currency: 'USD', payer_email: 'ana@test.hn',
    first_name: 'Ana', last_name: 'Prueba', receiver_email: RECEPTOR,
  }, campos);
  const raw = Object.keys(p).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
  env.fetchRespuesta = env.fetchRespuesta || verificado();
  return env.ctx.doPost({ parameter: p, postData: { contents: raw, type: 'application/x-www-form-urlencoded' } });
}

const alEquipo = (env) => env.correos.filter((c) => c.to === 'storycrafters@themediabuilders.com');

test('IPN verificado con el mismo correo acredita solo y envía la bienvenida una vez', () => {
  const env = crearEntorno(PROPS);
  pre(env);
  env.correos.length = 0;
  ipn(env);
  assert.equal(celda(env, 'Estatus de Pago'), 'Completado');
  assert.equal(celda(env, 'Referencia de pago'), '9AB12345CD678901E');
  assert.equal(celda(env, 'Verificado por'), 'PayPal (automático)');
  assert.equal(celda(env, 'Correo enviado'), 'Sí');
  assert.equal(env.correos.length, 1);
  assert.match(env.correos[0].subject, /confirmado/);
  // se validó contra PayPal con el cuerpo original
  assert.match(env.fetches[0].url, /ipnpb\.paypal\.com/);
  assert.match(env.fetches[0].opts.payload, /^cmd=_notify-validate&txn_type=web_accept/);

  // PayPal reintenta el mismo aviso: no se duplica nada
  ipn(env);
  assert.equal(env.correos.length, 1);
  assert.equal(env.hoja('Acreditaciones').getLastRow(), 2);
});

test('con otro correo en PayPal se vincula por nombre si es una sola persona', () => {
  const env = crearEntorno(PROPS);
  pre(env);
  pre(env, { ...DATOS, nombre: 'Carlos López', correo: 'carlos@test.hn' });
  env.correos.length = 0;
  ipn(env, { payer_email: 'otra.cuenta@paypal.test', first_name: 'Ana', last_name: 'Prueba' });
  assert.equal(celda(env, 'Estatus de Pago', 2), 'Completado');
  assert.equal(celda(env, 'Estatus de Pago', 3), 'Pendiente');
});

test('aviso no VERIFIED, de otra cuenta o de prueba no acredita', () => {
  const env = crearEntorno(PROPS);
  pre(env);
  env.fetchRespuesta = verificado('INVALID');
  ipn(env);
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');

  env.fetchRespuesta = verificado();
  env.correos.length = 0;
  ipn(env, { receiver_email: 'atacante@test.hn', txn_id: 'OTRA1' });
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');
  assert.equal(alEquipo(env).length, 1);

  ipn(env, { test_ipn: '1', txn_id: 'SIM1' });
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');

  ipn(env, { payment_status: 'Pending', txn_id: 'PEND1' });
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');
});

test('sin PAYPAL_RECEPTOR configurado no se acredita nada', () => {
  const env = crearEntorno({ props: { OPERADORES: 'operador@test.local' } });
  pre(env);
  ipn(env);
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');
});

test('pago sin inscripción vinculada queda para el equipo y se puede confirmar desde el menú', () => {
  const env = crearEntorno(PROPS);
  pre(env);
  env.correos.length = 0;
  ipn(env, { payer_email: 'desconocido@test.hn', first_name: 'Pedro', last_name: 'Pérez' });
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');
  assert.equal(alEquipo(env).length, 1);
  const acr = env.hoja('Acreditaciones');
  assert.equal(acr.getRange(2, env.colIndex('Acreditaciones', 'Estado')).getValue(), 'Sin inscripción — revisar');

  // el operador encuentra a la persona y confirma con la misma referencia
  const r = env.ctx.confirmarPago(2, { metodo: 'PayPal', referencia: '9AB12345CD678901E', monto: 64, moneda: 'USD', confirmo: true });
  assert.equal(r.ok, true);
  assert.equal(celda(env, 'Estatus de Pago'), 'Completado');
  assert.equal(acr.getLastRow(), 2); // reutilizó la fila del pago huérfano
  assert.equal(acr.getRange(2, env.colIndex('Acreditaciones', 'Estado')).getValue(), 'Acreditado');
  assert.equal(acr.getRange(2, env.colIndex('Acreditaciones', 'Registration ID')).getValue(), celda(env, 'Registration ID'));
});

test('monto distinto al de la inscripción no se acredita solo', () => {
  const env = crearEntorno(PROPS);
  pre(env);
  ipn(env, { mc_gross: '72.00' });
  assert.equal(celda(env, 'Estatus de Pago'), 'Pendiente');
});

test('el aviso de PayPal no interfiere con las acciones JSON de la landing', () => {
  const env = crearEntorno(PROPS);
  const r = env.json(env.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ accion: 'preinscripcion', tarifa: 'preventa', datos: DATOS }) } }));
  assert.equal(r.ok, true);
});
