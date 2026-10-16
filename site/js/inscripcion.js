// STORYCRAFTERS — inscripción en 3 pasos (Datos → Pago → Listo) con PayPal.
// Backend: Google Apps Script (backend/backend-inscripciones.gs). La configuración vive en
// los atributos data-* de #insc en index.html.
//
// Inscripción general: datos → botón de PayPal con la tarifa vigente → el backend cobra, guarda y envía el correo.
// Estudiante: datos + foto del carné → el backend la guarda como "Pendiente". Cuando el equipo la aprueba,
// el estudiante recibe un enlace ?estudiante=CÓDIGO que abre directo el paso de pago con la tarifa de estudiante.

(function () {
  'use strict';

  var root = document.getElementById('insc');
  if (!root) return;

  var API = root.dataset.appsScriptUrl;
  var PAYPAL_ID = root.dataset.paypalClientId;
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // Botones guardados en PayPal: { idTarifa: Id. hospedado }. Con ellos el pago se abre en una ventana.
  var BOTONES = null;
  try { BOTONES = JSON.parse(root.dataset.paypalBotones || 'null'); } catch (e) { BOTONES = null; }
  var BOTONES_CLIENT = root.dataset.paypalBotonesClient;
  var conBotones = !!(BOTONES && BOTONES_CLIENT);
  var demo = !API && local && !conBotones;

  // Sin backend (modo demo o solo con botones de PayPal) la tarifa vigente sale de estas fechas.
  // Con backend, las tarifas vienen de Apps Script. Mantener igual a los data-end de .tier en index.html.
  var TARIFAS = [
    { id: 'preventa', nombre: 'Preventa', usd: 64, hasta: '2026-11-05' },
    { id: 'regular', nombre: 'Regular', usd: 72, hasta: '2026-11-25' },
    { id: 'finales', nombre: 'Cupos finales', usd: 82, hasta: '2026-12-11' },
  ];

  var form = root.querySelector('[data-view="datos"]');
  var datos = {}, tarifa = null, codigo = null, enviando = false;

  var q = function (sel) { return root.querySelector(sel); };
  var qa = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  var dolares = function (n) { return 'US$ ' + Number(n); };
  var escapar = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };

  function ver(nombre) {
    qa('.insc__view').forEach(function (v) { v.hidden = v.dataset.view !== nombre; });
    var paso = { datos: 1, pago: 2, ok: 3 }[nombre] || 0; // sin pasos en "enviado" (aún no paga) ni en avisos
    qa('.insc__steps li').forEach(function (li) {
      var n = Number(li.dataset.step);
      li.classList.toggle('is-active', n === paso);
      li.classList.toggle('is-done', n < paso);
    });
    q('.insc__steps').hidden = !paso;
    qa('.insc__error').forEach(function (e) { e.textContent = ''; });
  }

  function aviso(html) {
    q('[data-aviso-texto]').innerHTML = html;
    ver('aviso');
  }

  function error(msg) {
    var vis = qa('.insc__view').filter(function (v) { return !v.hidden; })[0];
    if (vis) vis.querySelector('.insc__error').textContent = msg;
  }

  function api(metodo, cuerpo, params) {
    if (metodo === 'GET') {
      return fetch(API + (params ? '?' + params : '')).then(function (r) { return r.json(); });
    }
    // text/plain evita el preflight CORS que Apps Script no responde
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(cuerpo) })
      .then(function (r) { return r.json(); });
  }

  // ---------- 01 · Datos ----------
  var esEstudiante = function () { return form.elements.tipo.value === 'estudiante'; };

  function actualizarTipo() {
    var est = esEstudiante();
    qa('[data-student]').forEach(function (el) { el.hidden = !est; });
    form.elements.institucion.required = est;
    form.elements.carne.required = est;
    var btn = q('.insc__submit');
    btn.textContent = est ? btn.dataset.labelStudent : btn.dataset.labelGeneral;
    if (est && !form.elements.ocupacion.value) form.elements.ocupacion.value = 'Estudiante';
  }
  qa('input[name="tipo"]').forEach(function (r) { r.addEventListener('change', actualizarTipo); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando) return;
    var valido = true;
    qa('[data-view="datos"] .field, [data-view="datos"] .insc__check').forEach(function (c) {
      var el = c.querySelector('input,select');
      if (!el || c.hidden) return;
      var ok = el.type === 'checkbox' ? (!el.required || el.checked)
        : el.checkValidity() && (!el.required || (el.type === 'file' ? el.files.length : el.value.trim()));
      c.classList.toggle('is-invalid', !ok);
      if (!ok && valido) { el.focus(); valido = false; }
    });
    if (!valido) return error('Revisa los campos marcados en rojo.');

    datos = {};
    ['nombre', 'correo', 'whatsapp', 'ciudad', 'ocupacion', 'experiencia', 'talla', 'comoSeEntero', 'restricciones']
      .forEach(function (k) { datos[k] = form.elements[k].value.trim(); });
    datos.comunicaciones = form.elements.comunicaciones.checked;

    if (esEstudiante()) {
      if (!API && !demo) return error('La inscripción de estudiantes abre muy pronto. Escríbenos a info@themediabuilders.com.');
      return enviarCarne();
    }
    cargarTarifaVigente();
  });

  // ---------- Solicitud de estudiante (sin pago) ----------
  function enviarCarne() {
    var archivo = form.elements.carne.files[0];
    ocupado(true, 'Enviando tu carné…');
    prepararArchivo(archivo)
      .then(function (carne) {
        if (demo) {
          // En local se puede simular la decisión con ?carne=Aprobado o ?carne=Rechazado
          var simulado = new URLSearchParams(location.search).get('carne') || 'Pendiente';
          return new Promise(function (ok) {
            setTimeout(function () {
              ok({ ok: true, estado: simulado, motivo: 'Tu carné muestra vigencia hasta junio de 2026 y ya venció.' });
            }, 900);
          });
        }
        return api('POST', { accion: 'solicitudEstudiante', datos: datos, institucion: form.elements.institucion.value.trim(), carne: carne });
      })
      .then(function (res) {
        ocupado(false);
        if (!res.ok) return error(res.error);
        var estado = res.estado || 'Pendiente';
        qa('[data-view="enviado"] [data-estado]').forEach(function (el) { el.hidden = el.dataset.estado !== estado; });
        qa('[data-view="enviado"] [data-ok-nombre]').forEach(function (el) { el.textContent = datos.nombre.split(' ')[0]; });
        qa('[data-view="enviado"] [data-ok-correo]').forEach(function (el) { el.textContent = datos.correo; });
        q('[data-view="enviado"] [data-motivo]').textContent = res.motivo || 'Tu carné no está vigente.';
        ver('enviado');
        root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) {
        ocupado(false);
        error(err && err.usuario ? err.message : 'No pudimos enviar tu carné. Revisa tu conexión e intenta de nuevo.');
      });
  }

  // Reduce las fotos a 1600 px (JPG) para que suban rápido; los PDF se envían tal cual (máx. 6 MB).
  function prepararArchivo(archivo) {
    var MAX = 6 * 1024 * 1024;
    var fallo = function (msg) { var e = new Error(msg); e.usuario = true; return e; };
    var leer = function (blob) {
      return new Promise(function (ok, mal) {
        var r = new FileReader();
        r.onload = function () { ok(String(r.result).split(',')[1]); };
        r.onerror = mal;
        r.readAsDataURL(blob);
      });
    };
    var crudo = function () {
      if (archivo.size > MAX) return Promise.reject(fallo('El archivo pesa más de 6 MB. Intenta con otra foto.'));
      return leer(archivo).then(function (b64) { return { nombre: archivo.name, tipo: archivo.type, base64: b64 }; });
    };
    if (archivo.type === 'application/pdf') return crudo();
    if (!/^image\//.test(archivo.type)) return Promise.reject(fallo('Sube una foto (JPG o PNG) o un PDF de tu carné.'));

    return new Promise(function (ok) {
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          ok(leer(blob).then(function (b64) { return { nombre: archivo.name, tipo: 'image/jpeg', base64: b64 }; }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(crudo()); }; // p. ej. HEIC en Chrome
      img.src = url;
    });
  }

  // ---------- 02 · Pago ----------
  function hoyHN() {
    var f = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Tegucigalpa' }));
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
  }

  function cargarTarifaVigente() {
    if (!API) {
      var h = hoyHN();
      var t = TARIFAS.filter(function (x) { return h <= x.hasta; })[0];
      if (!t) return aviso('Las inscripciones están cerradas.');
      return mostrarPago(t);
    }
    ocupado(true, 'Cargando…');
    api('GET')
      .then(function (res) {
        ocupado(false);
        if (res.cuposDisponibles <= 0) {
          return aviso('Los cupos de STORYCRAFTERS se llenaron. Escríbenos a <a href="mailto:info@themediabuilders.com">info@themediabuilders.com</a> para la lista de espera.');
        }
        var t = res.tarifas.filter(function (x) { return x.disponible && !x.carne; })[0];
        if (!t) return aviso('Las inscripciones están cerradas.');
        mostrarPago(t);
      })
      .catch(function () { ocupado(false); error('No pudimos cargar las tarifas. Recarga la página e intenta de nuevo.'); });
  }

  function mostrarPago(t) {
    tarifa = t;
    if (conBotones) return abrirVentanaPago();
    pintarResumen(q('[data-summary]'));
    q('[data-back]').hidden = !!codigo;
    ver('pago');
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    pintarBotonPago();
  }

  function pintarResumen(resumen) {
    var t = tarifa;
    resumen.textContent = '';
    [['NOMBRE', datos.nombre], ['TARIFA', t.nombre], ['TOTAL', dolares(t.usd)]].forEach(function (fila, i) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = fila[0];
      if (i === 2) {
        var b = document.createElement('b');
        b.className = 'insc__total';
        b.textContent = fila[1];
        dd.appendChild(b);
      } else {
        dd.textContent = fila[1];
      }
      resumen.appendChild(dt);
      resumen.appendChild(dd);
    });
  }

  // ---------- 02 · Pago con botón guardado en PayPal (ventana) ----------
  // El botón cobra el precio fijo guardado en PayPal; PayPal envía el recibo al participante y a la cuenta.
  var ventana = q('[data-pp-modal]');
  var nVentana = 0;

  function abrirVentanaPago() {
    var id = BOTONES[tarifa.id];
    if (!id) return error('No encontramos el botón de pago para la tarifa ' + tarifa.nombre + '. Escríbenos a info@themediabuilders.com.');
    pintarResumen(ventana.querySelector('[data-pp-resumen]'));
    // El botón guardado no recibe los datos: que el participante nos los envíe ya escritos
    ventana.querySelector('[data-pp-wa]').href = 'https://wa.me/50492520327?text=' + encodeURIComponent([
      'Hola, ya pagué mi inscripción a STORYCRAFTERS (' + tarifa.nombre + ', ' + dolares(tarifa.usd) + '). Mis datos:',
      'Nombre: ' + datos.nombre,
      'Correo: ' + datos.correo,
      'WhatsApp: ' + datos.whatsapp,
      'Ciudad: ' + datos.ciudad,
      'Ocupación: ' + datos.ocupacion,
      'Experiencia: ' + datos.experiencia,
      'Talla de camiseta: ' + datos.talla,
      'Restricciones alimentarias: ' + (datos.restricciones || 'ninguna'),
      'Cómo se enteró: ' + (datos.comoSeEntero || '-'),
      'Acepta comunicaciones: ' + (datos.comunicaciones ? 'sí' : 'no')
    ].join('\n'));
    var cont = ventana.querySelector('[data-pp-boton]');
    var aviso = ventana.querySelector('.insc__error');
    aviso.textContent = '';
    cont.innerHTML = '';
    var esta = ++nVentana;
    cont.id = 'paypal-container-' + id + '-' + esta;
    if (ventana.showModal) ventana.showModal(); else ventana.setAttribute('open', '');
    cargarSdk('https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(BOTONES_CLIENT) +
      '&components=hosted-buttons&disable-funding=venmo&currency=USD')
      .then(function (paypal) {
        // Si la ventana se cerró y se volvió a abrir mientras cargaba PayPal, solo pinta la última
        if (esta !== nVentana) return;
        return paypal.HostedButtons({ hostedButtonId: id }).render('#' + cont.id);
      })
      .catch(function () { if (esta === nVentana) aviso.textContent = 'No pudimos cargar PayPal. Recarga la página e intenta de nuevo.'; });
  }

  function cerrarVentana() {
    if (ventana.close) ventana.close(); else ventana.removeAttribute('open');
  }
  ventana.querySelector('[data-pp-cerrar]').addEventListener('click', cerrarVentana);
  // Clic en el fondo oscuro también cierra
  // (solo fuera del recuadro: un clic en el relleno de la ventana también tiene e.target === ventana)
  ventana.addEventListener('click', function (e) {
    if (e.target !== ventana) return;
    var r = ventana.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrarVentana();
  });

  function pintarBotonPago() {
    var cont = q('[data-paypal]');
    cont.innerHTML = '';
    if (demo || !PAYPAL_ID) {
      // Sin PayPal configurado: en local se simula; en producción no se cobra.
      if (!demo) return error('El pago en línea aún no está habilitado.');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--primary insc__submit';
      b.textContent = 'Pagar ' + dolares(tarifa.usd) + ' (demo, sin cobro) →';
      b.addEventListener('click', function () { confirmar({ pasarela: 'demo', referencia: 'DEMO-' + Date.now() }); });
      return cont.appendChild(b);
    }
    cargarPayPal().then(function (paypal) {
      paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 48 },
        createOrder: function (data, actions) {
          return actions.order.create({
            intent: 'CAPTURE',
            purchase_units: [{
              description: 'STORYCRAFTERS · ' + tarifa.nombre + ' · ' + datos.nombre.slice(0, 60),
              amount: { currency_code: 'USD', value: String(tarifa.usd) },
            }],
            application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'STORYCRAFTERS' },
          });
        },
        // El backend verifica el monto, captura el cobro, guarda y envía el correo.
        onApprove: function (data) { return confirmar({ pasarela: 'paypal', referencia: data.orderID }); },
        onError: function () { error('PayPal no pudo procesar el pago. No se realizó ningún cobro; intenta de nuevo.'); },
      }).render(cont);
    }).catch(function () { error('No pudimos cargar PayPal. Recarga la página e intenta de nuevo.'); });
  }

  function cargarPayPal() {
    return cargarSdk('https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(PAYPAL_ID) +
      '&currency=USD&intent=capture&components=buttons&locale=es_XC');
  }

  var paypalCargado = null;
  function cargarSdk(src) {
    if (window.paypal) return Promise.resolve(window.paypal);
    if (paypalCargado) return paypalCargado;
    paypalCargado = new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { ok(window.paypal); };
      s.onerror = function () { paypalCargado = null; mal(); };
      document.head.appendChild(s);
    });
    return paypalCargado;
  }

  function confirmar(pago) {
    enviando = true;
    q('[data-loading]').hidden = false;
    q('[data-paypal]').classList.add('is-busy');
    var listo = demo
      ? new Promise(function (ok) { setTimeout(function () { ok({ ok: true, nombre: datos.nombre.split(' ')[0] }); }, 1200); })
      : api('POST', { pago: pago, tarifa: tarifa.id, codigo: codigo, datos: datos });
    return listo
      .then(function (res) {
        if (!res.ok) throw new Error(res.error);
        q('[data-view="ok"] [data-ok-nombre]').textContent = res.nombre || datos.nombre.split(' ')[0];
        q('[data-view="ok"] [data-ok-correo]').textContent = datos.correo;
        if (codigo) history.replaceState(null, '', location.pathname + '#inscripcion');
        ver('ok');
      })
      .catch(function (err) {
        error(err && err.message && !/fetch/i.test(err.message) ? err.message
          : 'Se perdió la conexión al confirmar. Escríbenos a info@themediabuilders.com antes de intentar de nuevo.');
      })
      .then(function () {
        enviando = false;
        q('[data-loading]').hidden = true;
        q('[data-paypal]').classList.remove('is-busy');
      });
  }

  q('[data-back]').addEventListener('click', function () { ver('datos'); });

  // Carné rechazado: seguir con la tarifa vigente sin volver a llenar los datos
  q('[data-a-general]').addEventListener('click', function () {
    form.elements.tipo.value = 'general';
    actualizarTipo();
    cargarTarifaVigente();
  });

  function ocupado(si, texto) {
    enviando = si;
    var btn = q('.insc__submit');
    btn.disabled = si;
    if (si) btn.textContent = texto;
    else actualizarTipo();
  }

  // ---------- Inicio ----------
  // Enlace de estudiante aprobado: ?estudiante=CÓDIGO
  codigo = new URLSearchParams(location.search).get('estudiante');

  if (!API && !demo && !conBotones) {
    aviso(q('[data-aviso-texto]').innerHTML);
  } else if (codigo) {
    if (demo) {
      datos = { nombre: 'Estudiante de prueba', correo: 'estudiante@ejemplo.com' };
      mostrarPago({ id: 'estudiante', nombre: 'Estudiante', usd: 64, carne: true });
    } else {
      aviso('Validando tu enlace…');
      api('GET', null, 'codigo=' + encodeURIComponent(codigo))
        .then(function (res) {
          if (!res.ok) return aviso(escapar(res.error) + ' Si crees que es un error, escríbenos a <a href="mailto:info@themediabuilders.com">info@themediabuilders.com</a>.');
          if (!res.tarifa.disponible) return aviso('La tarifa de estudiante ya no está disponible.');
          datos = res.estudiante;
          mostrarPago(res.tarifa);
        })
        .catch(function () { aviso('No pudimos validar tu enlace. Recarga la página e intenta de nuevo.'); });
    }
  } else {
    actualizarTipo();
  }
})();
