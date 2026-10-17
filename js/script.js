// STORYCRAFTERS — comportamiento de la landing. Sin dependencias.
// Fechas, precios y textos viven en index.html (atributos data-*); aquí solo se calcula.

(function () {
  'use strict';

  var pad = function (n) { return String(n).padStart(2, '0'); };

  // ---- Cuenta regresiva (.countdown[data-target]) -------------------------
  var countdown = document.querySelector('.countdown[data-target]');
  var countdownTime = countdown && countdown.querySelector('[data-countdown-time]');

  function tickCountdown() {
    if (!countdownTime) return;
    var target = new Date(countdown.dataset.target).getTime();
    var s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); s %= 60;
    countdownTime.textContent = [d, h, m, s].map(pad).join(':');
  }

  // ---- Tarifas vigentes (.tier[data-end]) ---------------------------------
  // La vigente es la primera cuya fecha data-end aún no pasó; si todas pasaron, la última.
  function updateTiers() {
    var tiers = Array.prototype.slice.call(document.querySelectorAll('.tier[data-end]'));
    if (!tiers.length) return;
    var now = Date.now();
    var cur = tiers.findIndex(function (t) { return now < new Date(t.dataset.end).getTime(); });
    if (cur < 0) cur = tiers.length - 1;

    tiers.forEach(function (t, i) {
      t.classList.toggle('is-current', i === cur);
      t.classList.toggle('is-closed', i < cur);
      t.querySelector('.tier__tag').textContent = i === cur ? '● VIGENTE' : (i < cur ? 'CERRADO' : '');
    });

    var notice = document.getElementById('next-price');
    if (!notice) return;
    var next = tiers[cur + 1];
    if (next) {
      notice.querySelector('[data-notice-text]').textContent =
        'Sube a ' + next.querySelector('.tier__price').textContent + ' el ' + next.dataset.start;
    }
    notice.hidden = !next;
  }

  // ---- Cupos (.spots) -----------------------------------------------------
  // Edita el número en index.html ([data-spots-left]); la barra se ajusta sola.
  function updateSpots() {
    var left = document.querySelector('[data-spots-left]');
    var bar = document.querySelector('[data-spots-bar]');
    if (!left || !bar) return;
    var n = Math.max(0, Math.min(40, parseInt(left.textContent, 10) || 0));
    bar.style.width = (n / 40) * 100 + '%';
  }

  // ---- Chat de WhatsApp (.chat[data-wa-number]) ---------------------------
  // Estilo WP WhatsApp Chatbox: al enviar, el mensaje se abre en
  // wa.me/<número>?text=…; se auto-muestra una vez por sesión al llegar al footer.
  var chat = document.querySelector('.chat[data-wa-number]');

  if (chat) {
    var popup = chat.querySelector('.chat__popup');
    var fab = chat.querySelector('.chat__fab');
    var closeBtn = chat.querySelector('.chat__close');
    var form = chat.querySelector('.chat__form');
    var input = chat.querySelector('.chat__input');
    var chatOpen = false;

    function setChat(open) {
      chatOpen = open;
      popup.setAttribute('aria-hidden', String(!open));
      fab.setAttribute('aria-expanded', String(open));
      // En táctiles no se enfoca el input: evitaría que el teclado tape la caja.
      if (open && window.matchMedia('(pointer: fine)').matches) {
        setTimeout(function () { input.focus(); }, 300);
      }
    }

    fab.addEventListener('click', function () { setChat(!chatOpen); });
    closeBtn.addEventListener('click', function () { setChat(false); fab.focus(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = input.value.trim();
      if (!msg) return;
      window.open('https://wa.me/' + chat.dataset.waNumber + '?text=' + encodeURIComponent(msg), '_blank');
      input.value = '';
      setChat(false);
    });

    // Enlaces rápidos: abren la pregunta en la sección de FAQ y cierran la caja.
    popup.addEventListener('click', function (e) {
      var link = e.target.closest('a[data-faq]');
      if (!link) return;
      var item = document.querySelectorAll('.faq details')[Number(link.dataset.faq)];
      if (item) item.open = true;
      setChat(false);
    });

    // Clic fuera y Escape cierran la caja.
    document.addEventListener('click', function (e) {
      if (chatOpen && !e.target.closest('.chat')) setChat(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && chatOpen) setChat(false);
    });

    // Auto-abrir una vez por sesión cuando el footer entra en pantalla.
    var footer = document.querySelector('.footer');
    var SHOWN = 'wa_chatbox_shown';
    if (footer && 'IntersectionObserver' in window) {
      try {
        if (!sessionStorage.getItem(SHOWN)) {
          var io = new IntersectionObserver(function (entries) {
            if (!entries[0].isIntersecting) return;
            sessionStorage.setItem(SHOWN, '1');
            setChat(true);
            io.disconnect();
          });
          io.observe(footer);
        }
      } catch (err) { /* sessionStorage bloqueado: no se auto-muestra */ }
    }
  }

  tickCountdown();
  updateTiers();
  updateSpots();
  setInterval(function () { tickCountdown(); updateTiers(); }, 1000);
})();
