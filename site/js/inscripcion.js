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
  var regId = null, idem = null; // registro del backend y clave de idempotencia del envío actual

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

  // Ciudad: la lista de sugerencias solo muestra lo que coincide con lo escrito. Al entrar al campo
  // se vacía (la ciudad anterior queda de guía) para volver a ver todas; si no elige otra, se restaura.
  var ciudad = form.elements.ciudad;
  var guiaCiudad = ciudad.placeholder;
  ciudad.addEventListener('focus', function () {
    if (!ciudad.value) return;
    ciudad.dataset.anterior = ciudad.value;
    ciudad.placeholder = ciudad.value;
    ciudad.value = '';
  });
  ciudad.addEventListener('blur', function () {
    if (!ciudad.value.trim() && ciudad.dataset.anterior) ciudad.value = ciudad.dataset.anterior;
    delete ciudad.dataset.anterior;
    ciudad.placeholder = guiaCiudad;
  });

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
    idem = null; // envío nuevo: nueva clave de idempotencia

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
        if (res.cuposDisponibles <= 0) return ver('espera');
        var t = res.tarifas.filter(function (x) { return x.disponible && !x.carne; })[0];
        if (!t) return aviso('Las inscripciones están cerradas.');
        mostrarPago(t);
      })
      .catch(function () { ocupado(false); error('No pudimos cargar las tarifas. Recarga la página e intenta de nuevo.'); });
  }

  function mostrarPago(t) {
    tarifa = t;
    if (API || conBotones) return preinscribir();
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

  // Con backend, guarda los datos en la hoja (pago PENDIENTE) antes de abrir la ventana.
  // Si falla o no contesta, NO se abre el cobro: un pago sin registro no se puede conciliar.
  // En un timeout se reintenta UNA vez con la misma clave de idempotencia: el servidor devuelve
  // el registro ya creado en vez de duplicarlo.
  var datosGuardados = false;
  function preinscribir() {
    datosGuardados = false;
    regId = null;
    if (!API) return abrirVentanaPago();
    if (!idem) idem = (crypto.randomUUID ? crypto.randomUUID() : 'i' + Date.now() + '-' + Math.random().toString(36).slice(2));
    ocupado(true, 'Guardando tus datos…');
    var cuerpo = { accion: 'preinscripcion', tarifa: tarifa.id, datos: datos, codigo: codigo, idempotencia: idem };
    var espera = new Promise(function (ok) { setTimeout(function () { ok('timeout'); }, 20000); });
    Promise.race([api('POST', cuerpo), espera])
      .then(function (res) {
        // Reintento único con la MISMA clave, con su propio límite: no deja el botón colgado
        if (res === 'timeout') {
          var espera2 = new Promise(function (ok) { setTimeout(function () { ok(null); }, 20000); });
          return Promise.race([api('POST', cuerpo).catch(function () { return null; }), espera2]);
        }
        return res;
      })
      .then(function (res) {
        ocupado(false);
        if (res && res.ok && res.registrationId) {
          datosGuardados = true;
          regId = res.registrationId;
          return abrirVentanaPago();
        }
        error((res && res.error) || 'No pudimos guardar tus datos. No se realizó ningún cobro; intenta de nuevo en unos minutos.');
      })
      .catch(function () {
        ocupado(false);
        error('No pudimos guardar tus datos. No se realizó ningún cobro; intenta de nuevo en unos minutos.');
      });
  }

  var contBoton = ventana.querySelector('[data-pp-boton]');
  var tokenComprobante = null;

  function vistaVentana(nombre) {
    ['metodos', 'tarjeta', 'transf'].forEach(function (v) {
      ventana.querySelector('[data-pp-' + v + ']').hidden = v !== nombre;
    });
    ventana.querySelector('.insc__error').textContent = '';
  }

  function abrirVentanaPago() {
    var id = BOTONES[tarifa.id];
    if (!id) return error('No encontramos el botón de pago para la tarifa ' + tarifa.nombre + '. Escríbenos a info@themediabuilders.com.');
    pintarResumen(ventana.querySelector('[data-pp-resumen]'));
    var esta = ++nVentana;
    contBoton.innerHTML = '';
    var btnSubir = ventana.querySelector('[data-pp-subir]');
    btnSubir.hidden = false;
    btnSubir.disabled = false;
    btnSubir.textContent = 'Enviar comprobante →';
    ventana.querySelector('[data-pp-archivo]').disabled = false;
    ventana.querySelector('[data-pp-archivo]').value = '';
    ventana.querySelector('[data-pp-volver]').hidden = true;
    if (ventana.showModal) ventana.showModal(); else ventana.setAttribute('open', '');
    if (regId) {
      vistaVentana('metodos'); // con registro guardado: elegir tarjeta o transferencia
    } else {
      // Modo solo-botones (sin backend): el botón guardado no recibe los datos,
      // así que el participante los envía por WhatsApp con el texto ya escrito.
      ventana.querySelector('[data-pp-paso]').hidden = false;
      var wa = ventana.querySelector('[data-pp-wa]');
      wa.hidden = false;
      wa.href = 'https://wa.me/50492520327?text=' + encodeURIComponent([
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
      vistaVentana('tarjeta');
      montarBotonTarjeta(esta);
    }
  }

  // El intento queda registrado ANTES de exponer el botón (R2): si PayPal cobra y la página
  // no se entera, el registro queda trazable para la conciliación manual del equipo.
  function montarBotonTarjeta(esta) {
    var aviso = ventana.querySelector('.insc__error');
    var listo = regId
      ? api('POST', { accion: 'iniciarPago', registrationId: regId, metodo: 'paypal' }).catch(function () { return null; })
      : Promise.resolve({ ok: true });
    listo.then(function (res) {
      if (esta !== nVentana) return;
      if (!res || !res.ok) {
        aviso.textContent = (res && res.error) || 'No pudimos preparar el pago. Intenta de nuevo o escríbenos a info@themediabuilders.com.';
        return;
      }
      var id = BOTONES[tarifa.id];
      contBoton.id = 'paypal-container-' + id + '-' + esta;
      cargarSdk('https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(BOTONES_CLIENT) +
        '&components=hosted-buttons&disable-funding=venmo&currency=USD')
        .then(function (paypal) {
          if (esta !== nVentana) return;
          return paypal.HostedButtons({ hostedButtonId: id }).render('#' + contBoton.id);
        })
        .catch(function () { if (esta === nVentana) aviso.textContent = 'No pudimos cargar PayPal. Recarga la página e intenta de nuevo.'; });
    });
  }

  // Transferencia: el servidor entrega los datos bancarios (nunca van en el HTML) y un
  // token de un solo uso para subir el comprobante.
  function mostrarTransferencia(esta) {
    var aviso = ventana.querySelector('.insc__error');
    var v = ventana.querySelector('[data-pp-transf]');
    api('POST', { accion: 'iniciarPago', registrationId: regId, metodo: 'transferencia' })
      .then(function (res) {
        if (esta !== nVentana) return;
        if (!res || !res.ok) {
          aviso.textContent = (res && res.transferenciaDisponible === false)
            ? 'El pago por transferencia no está disponible ahora. Elige tarjeta o escríbenos al +504 9252-0327.'
            : (res && res.error) || 'No pudimos preparar la transferencia. Intenta de nuevo.';
          v.querySelector('[data-pp-volver]').hidden = false; // camino de regreso al selector
          return;
        }
        tokenComprobante = res.token;
        var banco = v.querySelector('[data-pp-banco]');
        banco.textContent = '';
        [['Banco', res.banco.banco], ['Titular', res.banco.titular], ['Tipo de cuenta', res.banco.tipo],
         ['Número de cuenta', res.banco.cuenta], ['Monto exacto', 'L ' + Number(res.monto).toLocaleString('es-HN') + ' ' + res.moneda]]
          .forEach(function (par) {
            var dt = document.createElement('dt'); dt.textContent = par[0];
            var dd = document.createElement('dd'); dd.textContent = par[1];
            banco.appendChild(dt); banco.appendChild(dd);
          });
        v.querySelector('[data-pp-monto]').textContent = 'L ' + Number(res.monto).toLocaleString('es-HN');
        v.querySelector('[data-pp-ref]').textContent = res.referencia;
        v.querySelector('[data-pp-recibido]').hidden = res.comprobante !== 'recibido';
        v.querySelector('[data-pp-volver]').hidden = false;
        vistaVentana('transf');
      })
      .catch(function () {
        if (esta !== nVentana) return;
        aviso.textContent = 'Sin conexión. Intenta de nuevo en unos minutos.';
      });
  }

  function subirComprobante(esta) {
    var aviso = ventana.querySelector('.insc__error');
    var input = ventana.querySelector('[data-pp-archivo]');
    var archivo = input.files && input.files[0];
    if (!archivo) { aviso.textContent = 'Elige la foto o PDF de tu comprobante.'; return; }
    if (archivo.size > 6 * 1024 * 1024) { aviso.textContent = 'El archivo pasa de 6 MB. Sube una foto más liviana o un PDF.'; return; }
    aviso.textContent = '';
    var btn = ventana.querySelector('[data-pp-subir]');
    btn.disabled = true;
    btn.textContent = 'Subiendo comprobante…';
    var lector = new FileReader();
    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      api('POST', {
        accion: 'subirComprobante', registrationId: regId, token: tokenComprobante,
        archivo: { nombre: archivo.name, tipo: archivo.type || 'application/octet-stream', base64: base64 },
      })
        .then(function (res) {
          if (esta !== nVentana) return;
          if (res && res.ok) {
            ventana.querySelector('[data-pp-recibido]').hidden = false;
            btn.hidden = true;
            input.disabled = true;
            return;
          }
          aviso.textContent = (res && res.error) || 'No pudimos recibir tu comprobante. Intenta de nuevo.';
        })
        .catch(function () {
          if (esta === nVentana) aviso.textContent = 'Sin conexión. El comprobante no llegó; intenta de nuevo.';
        })
        .then(function () {
          if (esta !== nVentana) return;
          btn.disabled = false;
          btn.textContent = 'Enviar comprobante →';
        });
    };
    lector.readAsDataURL(archivo);
  }

  ventana.querySelector('[data-pp-elige="tarjeta"]').addEventListener('click', function () {
    vistaVentana('tarjeta');
    montarBotonTarjeta(nVentana);
  });
  ventana.querySelector('[data-pp-elige="transferencia"]').addEventListener('click', function () {
    var dl = ventana.querySelector('[data-pp-banco]');
    dl.textContent = '';
    var dd = document.createElement('dd');
    dd.textContent = 'Cargando los datos de la cuenta…';
    dl.appendChild(dd);
    vistaVentana('transf');
    mostrarTransferencia(nVentana);
  });
  ventana.querySelector('[data-pp-subir]').addEventListener('click', function () { subirComprobante(nVentana); });
  ventana.querySelector('[data-pp-volver]').addEventListener('click', function () { vistaVentana('metodos'); });

  // Cupo lleno → lista de espera (nombre, correo, WhatsApp para el próximo evento)
  var formEspera = q('[data-view="espera"]');
  formEspera.addEventListener('submit', function (e) {
    e.preventDefault();
    if (enviando || !formEspera.reportValidity()) return;
    var btn = formEspera.querySelector('.insc__submit');
    btn.disabled = true;
    api('POST', {
      accion: 'listaEspera',
      nombre: formEspera.elements.nombre.value.trim(),
      correo: formEspera.elements.correo.value.trim(),
      whatsapp: formEspera.elements.whatsapp.value.trim(),
    })
      .then(function (res) {
        btn.disabled = false;
        if (res && res.ok) {
          formEspera.innerHTML = '<h3>Listo, <span class="hl">te avisamos</span></h3>' +
            '<p>Quedaste en la lista de espera de STORYCRAFTERS. Te escribimos al correo y WhatsApp que nos dejaste apenas abramos el próximo evento.</p>';
          return;
        }
        formEspera.querySelector('.insc__error').textContent =
          (res && res.error) || 'No pudimos guardar tus datos. Intenta de nuevo.';
      })
      .catch(function () {
        btn.disabled = false;
        formEspera.querySelector('.insc__error').textContent = 'Sin conexión. Intenta de nuevo en unos minutos.';
      });
  });

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

  // La ruta vieja de PayPal (botones JS que cobraban antes de guardar) se retiró en #20:
  // solo queda el botón de demo local. En producción sin backend no se cobra.
  function pintarBotonPago() {
    var cont = q('[data-paypal]');
    cont.innerHTML = '';
    if (!demo) return error('El pago en línea aún no está habilitado.');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--primary insc__submit';
    b.textContent = 'Pagar ' + dolares(tarifa.usd) + ' (demo, sin cobro) →';
    b.addEventListener('click', function () { confirmar({ pasarela: 'demo', referencia: 'DEMO-' + Date.now() }); });
    return cont.appendChild(b);
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
