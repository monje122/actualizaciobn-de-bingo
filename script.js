var supabase = window.supabase;

// ==================== SEGURIDAD: LOGS SIN DATOS SENSIBES ====================
const SEGURIDAD_DEBUG = false;

function sanitizarLogSeguro(valor) {
  const ocultarTexto = (texto) => String(texto || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo oculto]')
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '[jwt oculto]')
    .replace(/(password|contraseña|clave|access_token|refresh_token|token|secret|service_role)\s*[:=]\s*[^,\s}]+/gi, '$1=[oculto]');

  if (valor instanceof Error) {
    return {
      name: valor.name || 'Error',
      message: ocultarTexto(valor.message || ''),
      code: valor.code || undefined
    };
  }

  if (typeof valor === 'string') {
    return ocultarTexto(valor);
  }

  if (valor && typeof valor === 'object') {
    try {
      return JSON.parse(JSON.stringify(valor, (key, value) => {
        const k = String(key || '').toLowerCase();
        if (
          k.includes('email') ||
          k.includes('correo') ||
          k.includes('password') ||
          k.includes('contraseña') ||
          k.includes('clave') ||
          k.includes('token') ||
          k.includes('secret') ||
          k.includes('service_role')
        ) {
          return '[oculto]';
        }

        if (typeof value === 'string') {
          return ocultarTexto(value);
        }

        return value;
      }));
    } catch {
      return '[objeto protegido]';
    }
  }

  return valor;
}

function logSeguro(...args) {
  if (SEGURIDAD_DEBUG) {
    console.log(...args.map(sanitizarLogSeguro));
  }
}

function warnSeguro(...args) {
  if (SEGURIDAD_DEBUG) {
    console.warn(...args.map(sanitizarLogSeguro));
  }
}

function errorSeguro(...args) {
  console.error(...args.map(sanitizarLogSeguro));
}

// ==================== MULTI-SITIO ====================
let sitioActual = null;
let SITE_ID = null;
let SITE_SLUG = 'golden';

function obtenerSlugSitio() {
  const params = new URLSearchParams(window.location.search);
  const slugUrl = params.get('site');

  if (slugUrl && slugUrl.trim()) {
    return slugUrl.trim().toLowerCase();
  }

  return 'golden';
}
// Configuración del admin
let sistemaListo = false;
// Variables globales
let cartonesOcupados = [];
let precioPorCarton = 0;
let cantidadPermitida = 0;
let promocionSeleccionada = null;
let modoCartones = "libre";
let modoCartonSimple = false;
let mostrarEnVivoSitio = true;
let mostrarTopCompradoresSitio = true;
let mostrarPromocionesSitio = true;
let planTipoSitio = 'basico';
let cantidadFijaCartones = 1;
let detectorIniciado = false;

// ==================== NAVEGACIÓN INTERNA DEL NAVEGADOR ====================
// Permite que el botón ATRÁS del teléfono vuelva a la ventana anterior
// dentro del bingo, en vez de salirse de la página completa.
let historialNavegacionListo = false;
let navegandoConBotonAtras = false;
let ventanaActual = 'bienvenida';

function obtenerUrlVentana(id) {
  const url = new URL(window.location.href);
  url.hash = id || 'bienvenida';
  return `${url.pathname}${url.search}${url.hash}`;
}

function registrarHistorialVentana(id, reemplazar = false) {
  if (!id) return;

  try {
    const estado = { ventana: id };
    const url = obtenerUrlVentana(id);

    if (reemplazar) {
      history.replaceState(estado, '', url);
    } else {
      const estadoActual = history.state?.ventana;
      const hashActual = String(location.hash || '').replace('#', '');

      // Evita duplicar la misma ventana varias veces seguidas.
      if (estadoActual === id || hashActual === id) return;

      history.pushState(estado, '', url);
    }
  } catch (error) {
    warnSeguro('No se pudo registrar historial interno:', error);
  }
}

function inicializarHistorialVentanas() {
  if (historialNavegacionListo) return;

  historialNavegacionListo = true;

  const hashInicial = String(location.hash || '').replace('#', '').trim();
  const ventanaInicial = document.getElementById(hashInicial) ? hashInicial : 'bienvenida';
  ventanaActual = ventanaInicial;

  registrarHistorialVentana(ventanaInicial, true);

  window.addEventListener('popstate', async (event) => {
    const ventana = event.state?.ventana || String(location.hash || '').replace('#', '') || 'bienvenida';

    if (!document.getElementById(ventana)) return;

    navegandoConBotonAtras = true;

    try {
      await mostrarVentana(ventana, false);
    } catch (error) {
      warnSeguro('Error navegando con botón atrás:', error);
    } finally {
      navegandoConBotonAtras = false;
    }
  });
}


// Variables de sesión
let adminSession = null;
let sesionActiva = false;
let inactivityTimer = null;
const SESSION_TIMEOUT = 30 * 60 * 1000;

const ultimoEstadoProcesado = new Map();
const estadoEnProceso = new Set();

async function procesarEstadoUnaVez(id, fila, nuevoEstado, accion) {
  const claveProceso = `${id}-${nuevoEstado}`;

  const estadoActualFila = fila?.dataset?.estadoActual || '';
  const ultimoEstado = ultimoEstadoProcesado.get(id) || estadoActualFila;

  // Si ya está en ese mismo estado, no hace nada
  if (ultimoEstado === nuevoEstado) {
    logSeguro(`Inscripción ${id} ya está en estado ${nuevoEstado}. No se repite.`);
    return;
  }

  // Si ya se está procesando esa misma acción, no repite
  if (estadoEnProceso.has(claveProceso)) {
    logSeguro(`Ya se está procesando ${nuevoEstado} para inscripción ${id}`);
    return;
  }

  estadoEnProceso.add(claveProceso);

  try {
    const ok = await accion();

    if (ok !== false) {
      ultimoEstadoProcesado.set(id, nuevoEstado);

      if (fila) {
        fila.dataset.estadoActual = nuevoEstado;
      }
    }
  } catch (error) {
    errorSeguro('Error procesando estado:', error);
  } finally {
    estadoEnProceso.delete(claveProceso);
  }
}



const promociones = [
  { id: 1, activa: false, descripcion: '', cantidad: 0, precio: 0 },
  { id: 2, activa: false, descripcion: '', cantidad: 0, precio: 0 },
  { id: 3, activa: false, descripcion: '', cantidad: 0, precio: 0 },
  { id: 4, activa: false, descripcion: '', cantidad: 0, precio: 0 }
];

let usuario = {
  nombre: '',
  telefono: '',
  cedula: '',
  referido: '',
  cartones: [],
};

let totalCartones = 0;
let timerReserva = null;
// ==================== VERSIÓN MÁS SIMPLE ====================
let contador = 0;

// Registrar listener en el logo después de cargar
setTimeout(() => {
  const logo = document.querySelector('#bienvenida img, .logo, h1');

  if (logo) {
    logo.addEventListener('click', () => {
      contador++;

      // Reset del contador en 3 segundos
      setTimeout(() => { contador = 0; }, 3000);

      // Si son 7 clicks
      if (contador === 7) {
        contador = 0;

        const botonAdmin = document.getElementById('boton-admin-oculto');
        if (botonAdmin) {
          botonAdmin.style.display = 'inline-block';
          alert('🔓 Botón Admin activado');
        }
      }
    });
  }
}, 1000);

// Registrar listener del botón Admin **solo una vez**
const botonAdmin = document.getElementById('boton-admin-oculto');
if (botonAdmin) {
  botonAdmin.addEventListener('click', async () => {
    if (sesionActiva) {
      await entrarAdmin(); // Abre panel admin si ya hay sesión activa
    } else {
      mostrarVentana('admin-login'); // Solo muestra el login
    }
  });
}
function sitioEstaVencido(sitio) {
  if (!sitio) return true;

  // Si el master cambió el estado a pausado / vencido / inactivo
  if (
    sitio.estado &&
    String(sitio.estado).toLowerCase() !== 'activo'
  ) {
    return true;
  }

  // Si existe campo activo booleano
  if (sitio.activo === false) {
    return true;
  }

  // Si la RPC devuelve dias_restantes
  if (
    sitio.dias_restantes !== null &&
    sitio.dias_restantes !== undefined &&
    sitio.dias_restantes !== ''
  ) {
    return Number(sitio.dias_restantes) <= 0;
  }

  // Si existe vence_en
  if (sitio.vence_en) {
    const ahora = new Date();
    const vence = new Date(sitio.vence_en);

    if (!isNaN(vence.getTime())) {
      return vence <= ahora;
    }
  }

  // Si existe fecha_vencimiento
  if (sitio.fecha_vencimiento) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const vence = new Date(`${sitio.fecha_vencimiento}T00:00:00`);
    vence.setHours(0, 0, 0, 0);

    return vence < hoy;
  }

  return false;
}

async function iniciarSitioActual() {
  SITE_SLUG = obtenerSlugSitio();

  logSeguro('🌐 Cargando sitio:', SITE_SLUG);

  const { data, error } = await supabase.rpc('rpc_public_get_sitio', {
    _slug: SITE_SLUG
  });

  if (error) {
    errorSeguro('❌ Error cargando sitio:', error);
    mostrarSitioNoDisponible('No se pudo cargar esta página.');
    return false;
  }

  const sitio = Array.isArray(data) ? data[0] : data;

  if (!sitio) {
    mostrarSitioNoDisponible('Esta página no existe.');
    return false;
  }

  sitioActual = sitio;
  SITE_ID = sitio.id;

  logSeguro('✅ Sitio cargado:', sitioActual);

  if (sitioEstaVencido(sitioActual)) {
    mostrarSitioPausado(sitioActual);
    return false;
  }

  aplicarDatosSitio(sitioActual);
iniciarMonitorPausaSitio();
  return true;
}
let monitorPausaInterval = null;

function iniciarMonitorPausaSitio() {
  if (monitorPausaInterval) {
    clearInterval(monitorPausaInterval);
  }

  monitorPausaInterval = setInterval(async () => {
    await verificarPausaAutomaticaSitio();
  }, 30000); // revisa cada 30 segundos
}

async function verificarPausaAutomaticaSitio() {
  if (!SITE_SLUG || !SITE_ID) return;

  try {
    const { data, error } = await supabase.rpc('rpc_public_get_sitio', {
      _slug: SITE_SLUG
    });

    if (error) {
      warnSeguro('No se pudo verificar estado del sitio:', error);
      return;
    }

    const sitio = Array.isArray(data) ? data[0] : data;

    if (!sitio) {
      clearInterval(monitorPausaInterval);
      monitorPausaInterval = null;
      mostrarSitioNoDisponible('Esta página ya no está disponible.');
      return;
    }

    sitioActual = sitio;

    if (sitioEstaVencido(sitioActual)) {
      clearInterval(monitorPausaInterval);
      monitorPausaInterval = null;
      sistemaListo = false;
      mostrarSitioPausado(sitioActual);
    }

  } catch (error) {
    warnSeguro('Error verificando pausa automática:', error);
  }
}

// ==================== CACHE RÁPIDO DE COLORES ====================
function normalizarHexTema(valor, fallback = '#020A35') {
  let color = String(valor || '').trim();
  let fb = String(fallback || '#020A35').trim();

  if (!fb.startsWith('#')) fb = '#' + fb;
  if (/^#([0-9A-F]{3})$/i.test(fb)) {
    fb = '#' + fb[1] + fb[1] + fb[2] + fb[2] + fb[3] + fb[3];
  }
  if (!/^#([0-9A-F]{6})$/i.test(fb)) fb = '#020A35';

  if (!color) return fb.toUpperCase();
  if (!color.startsWith('#')) color = '#' + color;
  if (/^#([0-9A-F]{3})$/i.test(color)) {
    color = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }

  return /^#([0-9A-F]{6})$/i.test(color) ? color.toUpperCase() : fb.toUpperCase();
}

function temaTieneValor(valor) {
  return String(valor || '').trim() !== '';
}

function obtenerCacheColoresActual() {
  try {
    const slug = SITE_SLUG || obtenerSlugSitio() || 'golden';
    const key = typeof window.bingogpCacheKeyColores === 'function'
      ? window.bingogpCacheKeyColores(slug)
      : `bingogp_colores_bingo_${String(slug).trim().toLowerCase()}`;

    const keyEnvivo = typeof window.bingogpCacheKeyColoresEnvivo === 'function'
      ? window.bingogpCacheKeyColoresEnvivo(slug)
      : `bingogp_colores_envivo_${String(slug).trim().toLowerCase()}`;

    const raw = localStorage.getItem(key) || localStorage.getItem(keyEnvivo);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    warnSeguro('No se pudo leer caché de colores:', error);
    return null;
  }
}

function guardarCacheColoresActual(colores = {}) {
  try {
    const slug = SITE_SLUG || obtenerSlugSitio() || 'golden';

    if (typeof window.bingogpGuardarCacheColores === 'function') {
      window.bingogpGuardarCacheColores(slug, colores);
      return;
    }

    const datos = {
      color_fondo: colores.color_fondo || '',
      color_botones: colores.color_botones || '',
      color_texto: colores.color_texto || '',
      color_texto_botones: colores.color_texto_botones || '',
      color_principal: colores.color_principal || '',
      color_secundario: colores.color_secundario || '',
      actualizado_en: new Date().toISOString()
    };

    localStorage.setItem(`bingogp_colores_bingo_${String(slug).trim().toLowerCase()}`, JSON.stringify(datos));
    localStorage.setItem(`bingogp_colores_envivo_${String(slug).trim().toLowerCase()}`, JSON.stringify(datos));
  } catch (error) {
    warnSeguro('No se pudo guardar caché de colores:', error);
  }
}

function completarColoresTema(colores = {}) {
  const cache = obtenerCacheColoresActual() || {};
  const css = (name, fallback = '') => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const tomar = (...valores) => valores.find(temaTieneValor) || '';

  const colorFondo = normalizarHexTema(
    tomar(colores.color_fondo, cache.color_fondo, sitioActual?.color_fondo, css('--site-bg')),
    '#FFFFFF'
  );

  const colorPrincipal = normalizarHexTema(
    tomar(colores.color_principal, cache.color_principal, sitioActual?.color_principal, css('--site-primary'), css('--primary')),
    '#020A35'
  );

  const colorBotones = normalizarHexTema(
    tomar(colores.color_botones, cache.color_botones, sitioActual?.color_botones, css('--site-buttons'), colorPrincipal),
    colorPrincipal
  );

  const colorTexto = normalizarHexTema(
    tomar(colores.color_texto, cache.color_texto, sitioActual?.color_texto, css('--site-text')),
    '#000000'
  );

  const colorTextoBotones = normalizarHexTema(
    tomar(colores.color_texto_botones, cache.color_texto_botones, sitioActual?.color_texto_botones, css('--site-button-text')),
    '#FFFFFF'
  );

  const colorSecundario = normalizarHexTema(
    tomar(colores.color_secundario, cache.color_secundario, sitioActual?.color_secundario, css('--site-secondary'), css('--secondary'), colorBotones),
    colorBotones
  );

  return {
    color_fondo: colorFondo,
    color_botones: colorBotones,
    color_texto: colorTexto,
    color_texto_botones: colorTextoBotones,
    color_principal: colorPrincipal,
    color_secundario: colorSecundario
  };
}

function marcarTemaBingoListo() {
  try {
    document.documentElement.classList.add('bingogp-colores-listos');
    if (typeof window.bingogpMarcarTemaListo === 'function') {
      window.bingogpMarcarTemaListo();
    }
  } catch (error) {
    warnSeguro('No se pudo marcar tema listo:', error);
  }
}

function aplicarDatosSitio(sitio) {
  if (!sitio) return;

  // Título de la pestaña
  document.title = sitio.titulo_publico || sitio.nombre || 'Bingo';

  // Logo principal
  const logo = document.querySelector('#bienvenida .logo');
  if (logo && sitio.logo_url) {
    logo.src = sitio.logo_url;
    logo.alt = sitio.nombre || 'Logo';
  }

  // Favicon
  if (sitio.favicon_url) {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = sitio.favicon_url;
  }

  // Imagen de premio
  const imgPremio = document.getElementById('imagenPremiosInicio');
  if (imgPremio) {
    if (sitio.imagen_premio_url) {
      imgPremio.src = sitio.imagen_premio_url;
      imgPremio.classList.remove('oculto');
    } else {
      imgPremio.classList.add('oculto');
    }
  }

  // Colores CSS globales.
  // Importante: no se aplican colores por defecto aquí, porque eso pisa el localStorage
  // y produce el cambio visible de color. Se usan caché + valores reales del sitio.
  aplicarColoresPersonalizados({
    color_fondo: sitio.color_fondo || '',
    color_botones: sitio.color_botones || '',
    color_texto: sitio.color_texto || '',
    color_texto_botones: sitio.color_texto_botones || '',
    color_principal: sitio.color_principal || '',
    color_secundario: sitio.color_secundario || ''
  });

  // Total de cartones y precio desde sitios
 totalCartones = parseInt(
  sitio.cartones_visibles || sitio.total_cartones || sitio.limite_cartones || 0,
  10
) || 0;
  precioPorCarton = parseFloat(sitio.precio_carton_bs || 0) || 0;

  // Pago móvil
  aplicarDatosPagoSitio(sitio);

  // Redes sociales
  aplicarRedesSitio(sitio);
}

function aplicarDatosPagoSitio(sitio) {
  const banco = document.getElementById('adminPagoBanco');
  const telefono = document.getElementById('adminPagoTelefono');
  const cedula = document.getElementById('adminPagoCedula');

  if (banco) {
    banco.textContent = sitio.pago_banco_codigo || sitio.pago_banco || '';
  }

  if (telefono) {
    telefono.textContent = sitio.pago_telefono || '';
  }

  if (cedula) {
    cedula.textContent = sitio.pago_cedula || '';
  }
}

function aplicarRedesSitio(sitio) {
  const contenedor = document.getElementById('redes-sociales');
  if (!contenedor) return;

  const redes = [];

  if (sitio.whatsapp) {
    const numero = String(sitio.whatsapp).replace(/\D/g, '');
    redes.push(`
      <a href="https://wa.me/${numero}" target="_blank" rel="noopener noreferrer" title="WhatsApp">
        <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" width="40">
      </a>
    `);
  }

  if (sitio.youtube) {
    redes.push(`
      <a href="${sitio.youtube}" target="_blank" rel="noopener noreferrer" title="YouTube">
        <img src="https://cdn-icons-png.flaticon.com/512/1384/1384060.png" alt="YouTube" width="40">
      </a>
    `);
  }

  if (sitio.facebook) {
    redes.push(`
      <a href="${sitio.facebook}" target="_blank" rel="noopener noreferrer" title="Facebook">
        <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" width="40">
      </a>
    `);
  }

  if (sitio.instagram) {
    redes.push(`
      <a href="${sitio.instagram}" target="_blank" rel="noopener noreferrer" title="Instagram">
        <img src="https://cdn-icons-png.flaticon.com/512/1384/1384063.png" alt="Instagram" width="40">
      </a>
    `);
  }

  if (sitio.tiktok) {
    redes.push(`
      <a href="${sitio.tiktok}" target="_blank" rel="noopener noreferrer" title="TikTok">
        <img src="https://cdn-icons-png.flaticon.com/512/3046/3046121.png" alt="TikTok" width="40">
      </a>
    `);
  }

  if (sitio.whatsapp_grupo) {
    redes.push(`
      <a id="btnWhatsapp" href="${sitio.whatsapp_grupo}" target="_blank" rel="noopener noreferrer">
        Unirse al grupo de WhatsApp
      </a>
    `);
  }

  contenedor.innerHTML = redes.join('');
}

function mostrarSitioNoDisponible(mensaje) {
  const overlay = document.getElementById('overlay-carga');
  if (overlay) overlay.style.display = 'none';

  document.body.innerHTML = `
    <section style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;">
      <div style="max-width:500px;background:white;border-radius:12px;padding:30px;box-shadow:0 4px 20px rgba(0,0,0,.15);">
        <h1>⚠️ Página no disponible</h1>
        <p>${mensaje}</p>
      </div>
    </section>
  `;
}

function mostrarSitioPausado(sitio) {
  const overlay = document.getElementById('overlay-carga');
  if (overlay) overlay.style.display = 'none';

  document.body.innerHTML = `
    <section style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;background:#f8f9fa;">
      <div style="max-width:520px;background:white;border-radius:12px;padding:30px;box-shadow:0 4px 20px rgba(0,0,0,.15);">
        ${sitio.logo_url ? `<img src="${sitio.logo_url}" alt="${sitio.nombre}" style="max-width:140px;margin-bottom:15px;">` : ''}
        <h1>⏸️ Página pausada</h1>
        <p>Esta página está temporalmente pausada o vencida.</p>
        <p><strong>${sitio.nombre || ''}</strong></p>
        <small>Contacta al administrador para renovar el servicio.</small>
      </div>
    </section>
  `;
}
function calcularDiasRestantesAdmin(sitio) {
  if (!sitio) return null;

  if (
    sitio.dias_restantes !== null &&
    sitio.dias_restantes !== undefined &&
    sitio.dias_restantes !== ''
  ) {
    const dias = Number(sitio.dias_restantes);
    return Number.isFinite(dias) ? Math.max(0, dias) : null;
  }

  const fechaValor = sitio.vence_en || sitio.fecha_vencimiento;
  if (!fechaValor) return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vence = String(fechaValor).includes('T')
    ? new Date(fechaValor)
    : new Date(`${fechaValor}T00:00:00`);

  if (isNaN(vence.getTime())) return null;

  vence.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((vence - hoy) / 86400000));
}

function obtenerFechaVencimientoAdmin(sitio) {
  if (!sitio) return '';

  const fechaValor = sitio.vence_en || sitio.fecha_vencimiento || '';
  if (!fechaValor) return '';

  try {
    const fecha = String(fechaValor).includes('T')
      ? new Date(fechaValor)
      : new Date(`${fechaValor}T00:00:00`);

    if (isNaN(fecha.getTime())) return String(fechaValor).slice(0, 10);

    return fecha.toLocaleDateString('es-VE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    return String(fechaValor).slice(0, 10);
  }
}

function actualizarVencimientoPanelAdmin() {
  const panel = document.getElementById('admin-panel');
  if (!panel || !sitioActual) return;

  let box = document.getElementById('adminVencimientoSitio');

  if (!box) {
    box = document.createElement('div');
    box.id = 'adminVencimientoSitio';
    box.style.margin = '12px 0';
    box.style.padding = '12px 14px';
    box.style.borderRadius = '10px';
    box.style.background = '#fff7e6';
    box.style.border = '1px solid #ffbf69';
    box.style.color = '#111';
    box.style.fontWeight = '700';
    box.style.textAlign = 'center';
    box.style.lineHeight = '1.45';

    const logoutBtn = document.getElementById('logoutBtn');

    if (logoutBtn && logoutBtn.parentNode) {
      logoutBtn.insertAdjacentElement('afterend', box);
    } else {
      panel.insertBefore(box, panel.firstChild);
    }
  }

  const dias = calcularDiasRestantesAdmin(sitioActual);
  const fecha = obtenerFechaVencimientoAdmin(sitioActual);
  const nombreSitio = sitioActual.nombre || SITE_SLUG || 'este sitio';

  let estadoTexto = '';
  let colorFondo = '#fff7e6';
  let colorBorde = '#ffbf69';

  if (dias === null) {
    estadoTexto = 'Sin fecha de vencimiento configurada';
  } else if (dias <= 0) {
    estadoTexto = 'Servicio vencido';
    colorFondo = '#ffe5e5';
    colorBorde = '#ff6b6b';
  } else if (dias <= 3) {
    estadoTexto = `Faltan ${dias} día${dias === 1 ? '' : 's'} para vencer`;
    colorFondo = '#fff0f0';
    colorBorde = '#ff8787';
  } else {
    estadoTexto = `Faltan ${dias} día${dias === 1 ? '' : 's'} para vencer`;
  }

  box.style.background = colorFondo;
  box.style.borderColor = colorBorde;

  box.innerHTML = `
    📅 <strong>Vencimiento del sitio:</strong> ${nombreSitio}<br>
    ${estadoTexto}${fecha ? `<br><small>Fecha de vencimiento: ${fecha}</small>` : ''}
  `;
}


// ==================== POLÍTICA DE PRIVACIDAD PÚBLICA ====================
function escaparHTML(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function textoPlanoAParrafos(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return '';

  return texto
    .split(/\n{2,}/)
    .map(parrafo => `<p>${escaparHTML(parrafo).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

async function cargarPoliticaPrivacidadSitio() {
  const boton = document.getElementById('btnPoliticaPrivacidad');
  const contenido = document.getElementById('contenidoPoliticaPrivacidad');

  if (!boton || !contenido || !SITE_ID) return;

  let info = null;

  try {
    const { data, error } = await supabase.rpc('rpc_public_get_privacidad_sitio', {
      _site_id: SITE_ID
    });

    if (error) {
      warnSeguro('No se pudo cargar privacidad por RPC, usando datos básicos:', error);
    } else {
      info = Array.isArray(data) ? data[0] : data;
    }
  } catch (error) {
    warnSeguro('Error cargando política de privacidad:', error);
  }

  const nombreSitio = escaparHTML(info?.nombre || sitioActual?.nombre || SITE_SLUG || 'este bingo');
  const organizador = escaparHTML(
    info?.privacidad_organizador ||
    sitioActual?.privacidad_organizador ||
    sitioActual?.nombre ||
    'Organizador del bingo'
  );
  const contacto = escaparHTML(
    info?.privacidad_contacto ||
    sitioActual?.privacidad_contacto ||
    'Contacto no configurado'
  );
  const textoExtra = textoPlanoAParrafos(
    info?.privacidad_texto ||
    sitioActual?.privacidad_texto ||
    ''
  );

  contenido.innerHTML = `
    <p>
      Esta Política de Privacidad explica cómo <strong>${nombreSitio}</strong>
      recopila, usa y protege la información de los usuarios que participan en este bingo online.
    </p>

    <h3>1. Información que recopilamos</h3>
    <p>
      Para procesar la participación podemos solicitar nombre, teléfono, cédula,
      referido, cartones seleccionados, comprobante de pago, referencia bancaria
      y datos de pago móvil necesarios para validar la compra.
    </p>

    <h3>2. Uso de la información</h3>
    <p>
      La información se utiliza para registrar participantes, validar pagos,
      asignar cartones, verificar compras, mostrar ganadores y administrar correctamente el juego.
    </p>

    <h3>3. Publicación de información</h3>
    <p>
      Algunas secciones pueden mostrar información limitada como nombre del participante,
      cartones aprobados, lista de ganadores o resultados del juego. Los comprobantes,
      teléfonos y datos sensibles solo deben ser revisados por administradores autorizados.
    </p>

    <h3>4. Comprobantes de pago</h3>
    <p>
      Los comprobantes enviados se usan exclusivamente para validar el pago de los cartones.
      Estos comprobantes pueden contener información bancaria y deben ser tratados con confidencialidad.
    </p>

    <h3>5. Seguridad de los datos</h3>
    <p>
      El organizador toma medidas razonables para proteger la información y usarla solo
      con fines relacionados con el bingo. Ningún sistema en internet es completamente infalible.
    </p>

    <h3>6. Servicios externos</h3>
    <p>
      La página puede incluir enlaces o integraciones con YouTube, WhatsApp, redes sociales
      u otros servicios externos, los cuales pueden tener sus propias políticas de privacidad.
    </p>

    <h3>7. Derechos del usuario</h3>
    <p>
      El participante puede solicitar al organizador información sobre sus datos,
      corrección de información incorrecta o eliminación cuando sea posible.
    </p>

    <div class="politica-contacto-box">
      <p><strong>Organizador:</strong> ${organizador}</p>
      <p><strong>Contacto:</strong> ${contacto}</p>
    </div>

    ${textoExtra ? `<h3>Información adicional</h3>${textoExtra}` : ''}
  `;
}

function mostrarPoliticaPrivacidad() {
  document.getElementById('modalPoliticaPrivacidad')?.classList.remove('oculto');
}

function cerrarPoliticaPrivacidad() {
  document.getElementById('modalPoliticaPrivacidad')?.classList.add('oculto');
}

function abrirEnVivoSitio() {
  const slug = encodeURIComponent(SITE_SLUG || obtenerSlugSitio() || 'golden');
  window.open(`envivo.html?site=${slug}`, '_blank');
}

// ==================== FUNCIONES DE CONFIGURACIÓN ====================
async function getConfigValue(clave, fallback = null) {
  if (!SITE_ID) {
    warnSeguro('SITE_ID no cargado todavía para getConfigValue:', clave);
    return fallback;
  }

  const { data, error } = await supabase.rpc('rpc_get_config_sitio', {
    _site_id: SITE_ID,
    _clave: clave,
    _fallback: fallback
  });

  if (error) {
    warnSeguro('Error getConfigValue:', clave, error);
    return fallback;
  }

  return data ?? fallback;
}

async function setConfigValue(clave, value) {
  if (!SITE_ID) {
    warnSeguro('SITE_ID no cargado todavía para setConfigValue:', clave);
    return false;
  }

  const { data, error } = await supabase.rpc('rpc_set_config_sitio', {
    _site_id: SITE_ID,
    _clave: clave,
    _valor: String(value)
  });

  if (error) {
    errorSeguro('Error setConfigValue:', clave, error);
    return false;
  }

  return data === true;
}
function aplicarColoresPersonalizados(colores = {}, opciones = {}) {
  const tema = completarColoresTema(colores);
  const root = document.documentElement;

  // Variables principales que usa styles.css
  root.style.setProperty('--site-bg', tema.color_fondo);
  root.style.setProperty('--site-fondo', tema.color_fondo);
  root.style.setProperty('--color-fondo', tema.color_fondo);
  root.style.setProperty('--fondo-pagina', tema.color_fondo);

  root.style.setProperty('--site-buttons', tema.color_botones);
  root.style.setProperty('--site-color-botones', tema.color_botones);
  root.style.setProperty('--color-botones', tema.color_botones);
  root.style.setProperty('--boton-color', tema.color_botones);

  root.style.setProperty('--site-text', tema.color_texto);
  root.style.setProperty('--site-texto-general', tema.color_texto);
  root.style.setProperty('--color-texto', tema.color_texto);
  root.style.setProperty('--texto-color', tema.color_texto);

  root.style.setProperty('--site-button-text', tema.color_texto_botones);
  root.style.setProperty('--site-texto-botones', tema.color_texto_botones);
  root.style.setProperty('--color-texto-botones', tema.color_texto_botones);

  root.style.setProperty('--site-primary', tema.color_principal);
  root.style.setProperty('--site-color-principal', tema.color_principal);
  root.style.setProperty('--color-principal', tema.color_principal);
  root.style.setProperty('--primary', tema.color_principal);

  root.style.setProperty('--site-secondary', tema.color_secundario);
  root.style.setProperty('--site-color-acento', tema.color_secundario);
  root.style.setProperty('--color-secundario', tema.color_secundario);
  root.style.setProperty('--secondary', tema.color_secundario);

  if (document.body) {
    document.body.style.backgroundColor = tema.color_fondo;
    document.body.style.color = tema.color_texto;
  }

  if (opciones.guardarCache === true) {
    guardarCacheColoresActual(tema);
  }

  marcarTemaBingoListo();
  return tema;
}

async function cargarColoresSitio() {
  const fallbacks = completarColoresTema(sitioActual || {});

  const claves = [
    ['color_fondo', fallbacks.color_fondo],
    ['color_botones', fallbacks.color_botones],
    ['color_texto', fallbacks.color_texto],
    ['color_principal', fallbacks.color_principal],
    ['color_texto_botones', fallbacks.color_texto_botones],
    ['color_secundario', fallbacks.color_secundario]
  ];

  const valores = await Promise.all(
    claves.map(([clave, fallback]) => getConfigValue(clave, fallback))
  );

  const colores = Object.fromEntries(
    claves.map(([clave], index) => [clave, valores[index]])
  );

  const tema = aplicarColoresPersonalizados(colores, { guardarCache: true });

  const fondo = document.getElementById('colorFondoSitio');
  const botones = document.getElementById('colorBotonesSitio');
  const textoBotones = document.getElementById('colorTextoBotonesSitio');
  const texto = document.getElementById('colorTextoSitio');
  const principal = document.getElementById('colorPrincipalSitio');
  const secundario = document.getElementById('colorSecundarioSitio');

  if (fondo) fondo.value = tema.color_fondo;
  if (botones) botones.value = tema.color_botones;
  if (textoBotones) textoBotones.value = tema.color_texto_botones;
  if (texto) texto.value = tema.color_texto;
  if (principal) principal.value = tema.color_principal;
  if (secundario) secundario.value = tema.color_secundario;
}

async function guardarColoresSitio() {
  const estado = document.getElementById('estadoColoresSitio');

  const colores = {
   color_texto_botones: document.getElementById('colorTextoBotonesSitio')?.value || '#ffffff',
    color_fondo: document.getElementById('colorFondoSitio')?.value || '#ffffff',
    color_botones: document.getElementById('colorBotonesSitio')?.value || '#020A35',
    color_texto: document.getElementById('colorTextoSitio')?.value || '#000000',
    color_principal: document.getElementById('colorPrincipalSitio')?.value || '#020A35',
    color_secundario: document.getElementById('colorSecundarioSitio')?.value || '#FFA500'
  };

  try {
    if (estado) {
      estado.textContent = 'Guardando colores...';
      estado.style.color = 'blue';
    }

    for (const [clave, valor] of Object.entries(colores)) {
      const ok = await setConfigValue(clave, valor);

      if (!ok) {
        throw new Error(`No se pudo guardar ${clave}`);
      }
    }

    aplicarColoresPersonalizados(colores, { guardarCache: true });

    if (estado) {
      estado.textContent = '✅ Colores guardados correctamente.';
      estado.style.color = 'green';
    }

  } catch (error) {
    errorSeguro('Error guardando colores:', error);

    if (estado) {
      estado.textContent = 'Error guardando colores: ' + error.message;
      estado.style.color = 'red';
    }
  }
}

async function resetearColoresSitio() {
  const confirmar = confirm('¿Restaurar los colores por defecto?');

  if (!confirmar) return;

  const colores = {
    color_fondo: '#ffffff',
    color_botones: '#020A35',
    color_texto: '#000000',
    color_texto_botones: '#ffffff',
    color_principal: '#020A35',
    color_secundario: '#FFA500'
  };

  for (const [clave, valor] of Object.entries(colores)) {
    await setConfigValue(clave, valor);
  }

  aplicarColoresPersonalizados(colores, { guardarCache: true });
  await cargarColoresSitio();

  const estado = document.getElementById('estadoColoresSitio');
  if (estado) {
    estado.textContent = '✅ Colores restaurados.';
    estado.style.color = 'green';
  }
}

function activarVistaPreviaColores() {
  const ids = [
    'colorFondoSitio',
    'colorBotonesSitio',
    'colorTextoBotonesSitio',
    'colorTextoSitio',
    'colorPrincipalSitio',
    'colorSecundarioSitio'
  ];

  ids.forEach(id => {
    const input = document.getElementById(id);

    if (!input) return;

    input.addEventListener('input', () => {
      aplicarColoresPersonalizados({
        color_texto_botones: document.getElementById('colorTextoBotonesSitio')?.value || '#ffffff',
        color_fondo: document.getElementById('colorFondoSitio')?.value || '#ffffff',
        color_botones: document.getElementById('colorBotonesSitio')?.value || '#020A35',
        color_texto: document.getElementById('colorTextoSitio')?.value || '#000000',
        color_principal: document.getElementById('colorPrincipalSitio')?.value || '#020A35',
        color_secundario: document.getElementById('colorSecundarioSitio')?.value || '#FFA500'
      }, { guardarCache: true });
    });
  });
}
// ==================== SESIÓN ADMIN CON SUPABASE AUTH ====================
// ==================== IMÁGENES PERSONALIZADAS POR SITIO ====================

function aplicarImagenSitio(clave, url) {
  if (!url) return;

  if (clave === 'logo_url') {
    const logo = document.querySelector('#bienvenida .logo');
    if (logo) {
      logo.src = url;
      logo.alt = sitioActual?.nombre || 'Logo';
    }

    const preview = document.getElementById('previewLogoSitio');
    if (preview) {
      preview.src = url;
      preview.style.display = 'block';
    }
  }

  if (clave === 'imagen_premio_url') {
    const imgPremio = document.getElementById('imagenPremiosInicio');
    if (imgPremio) {
      imgPremio.src = url;
      imgPremio.classList.remove('oculto');
    }

    const preview = document.getElementById('previewPremioSitio');
    if (preview) {
      preview.src = url;
      preview.style.display = 'block';
    }
  }

  if (clave === 'imagen_carton_url') {
    const preview = document.getElementById('previewCartonSitio');
    if (preview) {
      preview.src = url;
      preview.style.display = 'block';
    }

    const cartonPreview = document.getElementById('imagenCartonPreview');
    if (cartonPreview) {
      cartonPreview.src = url;
    }
  }

  if (clave === 'favicon_url') {
    let favicon = document.querySelector('link[rel="icon"]');

    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }

    favicon.href = url;

    const preview = document.getElementById('previewFaviconSitio');
    if (preview) {
      preview.src = url;
      preview.style.display = 'block';
    }
  }
}

async function cargarImagenesSitio() {
  const imagenes = {
    logo_url: await getConfigValue('logo_url', sitioActual?.logo_url || ''),
    imagen_premio_url: await getConfigValue('imagen_premio_url', sitioActual?.imagen_premio_url || ''),
    
    favicon_url: await getConfigValue('favicon_url', sitioActual?.favicon_url || '')
  };

  Object.entries(imagenes).forEach(([clave, url]) => {
    if (url) aplicarImagenSitio(clave, url);
  });
}

async function subirImagenSitio(inputId, clave, nombreBase) {
  const estado = document.getElementById('estadoImagenesSitio');
  const input = document.getElementById(inputId);
  const file = input?.files?.[0];

  if (!file) {
    alert('Selecciona una imagen primero.');
    return;
  }

  let urlVieja = '';

  try {
    if (estado) {
      estado.textContent = 'Subiendo imagen...';
      estado.style.color = 'blue';
    }

    // Buscar imagen vieja antes de cambiarla
    urlVieja = await getConfigValue(clave, sitioActual?.[clave] || '');

    const imagenWebP = await convertirImagenAWebP(file, 0.85, 1600);

    const nombreLimpio = limpiarNombreArchivo(nombreBase || file.name).replace(/\.[^.]+$/, '');
    const rutaNueva = `${SITE_SLUG}/${nombreLimpio}-${Date.now()}.webp`;

    const { error: errorUpload } = await supabase.storage
      .from('imagenes')
      .upload(rutaNueva, imagenWebP, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000'
      });

    if (errorUpload) {
      throw new Error('Error subiendo imagen: ' + errorUpload.message);
    }

    const { data: publicData } = supabase.storage
      .from('imagenes')
      .getPublicUrl(rutaNueva);

    const urlNueva = publicData.publicUrl;

    const ok = await setConfigValue(clave, urlNueva);

    if (!ok) {
      // Si no se pudo guardar la URL nueva, borra la imagen recién subida
      await supabase.storage.from('imagenes').remove([rutaNueva]);
      throw new Error('La imagen subió, pero no se pudo guardar en configuración.');
    }

    if (sitioActual) {
      sitioActual[clave] = urlNueva;
    }

    aplicarImagenSitio(clave, urlNueva);

    // Borrar imagen vieja después de confirmar que la nueva quedó guardada
    const rutaVieja = obtenerRutaStorageDesdeUrl(urlVieja, 'imagenes');

    if (
      rutaVieja &&
      rutaVieja !== rutaNueva &&
      rutaVieja.startsWith(`${SITE_SLUG}/`)
    ) {
      const { error: errorDelete } = await supabase.storage
        .from('imagenes')
        .remove([rutaVieja]);

      if (errorDelete) {
        warnSeguro('La imagen nueva se guardó, pero no se pudo borrar la vieja:', errorDelete);
      } else {
        logSeguro('🗑️ Imagen vieja borrada:', rutaVieja);
      }
    }

    if (estado) {
      estado.textContent = '✅ Imagen guardada correctamente.';
      estado.style.color = 'green';
    }

    input.value = '';

  } catch (error) {
    errorSeguro('Error guardando imagen:', error);

    if (estado) {
      estado.textContent = 'Error guardando imagen: ' + error.message;
      estado.style.color = 'red';
    }
  }
}
async function guardarLogoSitio() {
  await subirImagenSitio('inputLogoSitio', 'logo_url', 'logo');
}

async function guardarPremioSitio() {
  await subirImagenSitio('inputPremioSitio', 'imagen_premio_url', 'premio');
}



async function guardarFaviconSitio() {
  await subirImagenSitio('inputFaviconSitio', 'favicon_url', 'favicon');
}
// Función para cerrar sesión

 async function cerrarSesionAdmin() {
  // Cierre “silencioso” para expiración / sesión inválida
  // No pedir confirmación, solo cerrar.
  await logoutAdminSilencioso();
}

// Igual que logoutAdmin, pero sin confirm()
async function logoutAdminSilencioso() {
  try {
    await supabase.auth.signOut();
  } catch (error) {
    warnSeguro('Logout silencioso falló:', error);
  } finally {
    clearAdminSession();
    resetToLoginState();
  }
}
// ========== FUNCIÓN LOGOUT COMPATIBLE CON TU CÓDIGO ==========
async function logoutAdmin() {
  if (!confirm('¿Estás seguro de cerrar sesión?')) return;

  try {
    await supabase.auth.signOut();
  } catch (error) {
    warnSeguro('Error cerrando sesión Auth:', error);
  }

  clearAdminSession();
  resetToLoginState();

  alert('Sesión cerrada correctamente');
}
// ========== FUNCIÓN PARA LIMPIA SESIÓN (COMPATIBLE) ==========
function clearAdminSession() {
  logSeguro('🧹 Limpiando sesión...');

  // Limpiar datos nuevos del login con Supabase Auth
  sessionStorage.removeItem('admin_email');
  sessionStorage.removeItem('admin_rol');
  sessionStorage.removeItem('admin_site_id');
  sessionStorage.removeItem('admin_is_master');

  // Limpiar datos viejos del sistema anterior
  sessionStorage.removeItem('admin_session_token');
  sessionStorage.removeItem('session_expires');
  sessionStorage.removeItem('device_id');
  sessionStorage.removeItem('pending_email');
  sessionStorage.removeItem('pending_deviceId');
  sessionStorage.removeItem('pending_password');

  // No limpiar el device_id de localStorage
  // localStorage.removeItem('admin_device_id');

  // Limpiar variables globales
  adminSession = null;
  sesionActiva = false;

  // Detener timers
  if (typeof inactivityTimer !== 'undefined' && inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  if (typeof sessionCheckInterval !== 'undefined' && sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }

  if (typeof verificacionInterval !== 'undefined' && verificacionInterval) {
    clearInterval(verificacionInterval);
    verificacionInterval = null;
  }

  if (window.otpTimerInterval) {
    clearInterval(window.otpTimerInterval);
    window.otpTimerInterval = null;
  }

  // Eliminar elementos del DOM que puedan existir
  const sessionInfo = document.getElementById('session-info');
  if (sessionInfo) sessionInfo.remove();

  logSeguro('✅ Sesión limpiada localmente');
}

// ========== FUNCIÓN PARA VOLVER A LOGIN (COMPATIBLE) ==========
function resetToLoginState() {
  logSeguro('🔄 Regresando a estado de login...');
  
  // Ocultar panel, mostrar login
  const adminPanel = document.getElementById('admin-panel');
  const adminLogin = document.getElementById('admin-login');
  
  if (adminPanel) adminPanel.classList.add('oculto');
  if (adminLogin) adminLogin.classList.remove('oculto');
  
  // Limpiar campos
  const adminPassword = document.getElementById('admin-password');
  const adminError = document.getElementById('admin-error');
  
  if (adminPassword) adminPassword.value = '';
  if (adminError) {
    adminError.textContent = '';
    adminError.className = '';
  }
}

// ========== CONFIGURAR EVENT LISTENER ==========
document.addEventListener('DOMContentLoaded', function() {
  const logoutBtn = document.getElementById('logoutBtn');
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutAdmin);
    logSeguro('✅ Botón de logout configurado');
  }
});

// ==================== RATE LIMIT LOGIN ADMIN / MASTER ====================
const LOGIN_RATE_MAX_INTENTOS = 5;
const LOGIN_RATE_VENTANA_MINUTOS = 10;
const LOGIN_RATE_BLOQUEO_MINUTOS = 15;

function normalizarRespuestaRateLogin(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function verificarRateLogin(tipo, email, siteId = null) {
  const { data, error } = await supabase.rpc('rpc_login_rate_check', {
    _tipo: tipo,
    _email: email,
    _site_id: siteId,
    _max_intentos: LOGIN_RATE_MAX_INTENTOS,
    _ventana_minutos: LOGIN_RATE_VENTANA_MINUTOS,
    _bloqueo_minutos: LOGIN_RATE_BLOQUEO_MINUTOS
  });

  if (error) {
    errorSeguro('Error verificando rate limit login:', error);
    throw new Error('Falta ejecutar el SQL de seguridad para intentos de login.');
  }

  return normalizarRespuestaRateLogin(data) || { permitido: true, mensaje: 'Permitido' };
}

async function registrarFalloRateLogin(tipo, email, siteId = null) {
  const { data, error } = await supabase.rpc('rpc_login_rate_registrar_fallo', {
    _tipo: tipo,
    _email: email,
    _site_id: siteId,
    _max_intentos: LOGIN_RATE_MAX_INTENTOS,
    _ventana_minutos: LOGIN_RATE_VENTANA_MINUTOS,
    _bloqueo_minutos: LOGIN_RATE_BLOQUEO_MINUTOS
  });

  if (error) {
    warnSeguro('No se pudo registrar fallo de login:', error);
    return null;
  }

  return normalizarRespuestaRateLogin(data);
}

async function limpiarRateLogin(tipo, email, siteId = null) {
  const { error } = await supabase.rpc('rpc_login_rate_limpiar', {
    _tipo: tipo,
    _email: email,
    _site_id: siteId
  });

  if (error) {
    warnSeguro('No se pudo limpiar rate limit de login:', error);
  }
}
// ==================== LOGIN ADMIN CON EMAIL Y CLAVE ====================
async function loginAdmin() {
  const email = document.getElementById('admin-email').value.trim().toLowerCase();
  const password = document.getElementById('admin-password').value;
  const errorDiv = document.getElementById('admin-error');

  errorDiv.textContent = '';
  errorDiv.className = '';
  errorDiv.style.whiteSpace = 'pre-line';

  if (!email || !password) {
    errorDiv.textContent = 'Por favor ingresa email y contraseña';
    errorDiv.className = 'error';
    return;
  }

  if (!SITE_ID) {
    errorDiv.textContent = 'La página todavía no terminó de cargar. Intenta de nuevo.';
    errorDiv.className = 'error';
    return;
  }

  try {
    errorDiv.textContent = '🔐 Verificando acceso...';
    errorDiv.className = 'info';

    const rate = await verificarRateLogin('admin_login', email, SITE_ID);

    if (rate && rate.permitido === false) {
      errorDiv.textContent = rate.mensaje || 'Demasiados intentos. Intenta más tarde.';
      errorDiv.className = 'error';
      document.getElementById('admin-password').value = '';
      return;
    }

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (loginError) {
      errorSeguro('Error login:', loginError);
      const fallo = await registrarFalloRateLogin('admin_login', email, SITE_ID);
      errorDiv.textContent = fallo?.mensaje || 'Usuario o clave incorrectos';
      errorDiv.className = 'error';
      document.getElementById('admin-password').value = '';
      return;
    }

    const { data: ctx, error: ctxError } = await supabase.rpc('rpc_auth_admin_context', {
      _site_id: SITE_ID
    });

    if (ctxError) {
      errorSeguro('Error verificando permisos:', ctxError);
      await supabase.auth.signOut();
      await registrarFalloRateLogin('admin_login', email, SITE_ID);
      errorDiv.textContent = 'No se pudo verificar el permiso del administrador';
      errorDiv.className = 'error';
      return;
    }

    const permiso = Array.isArray(ctx) ? ctx[0] : ctx;

    if (!permiso || (!permiso.es_master && !permiso.es_admin_sitio)) {
      await supabase.auth.signOut();
      const fallo = await registrarFalloRateLogin('admin_login', email, SITE_ID);

      errorDiv.textContent = fallo?.mensaje || 'Este usuario no tiene permiso para administrar esta página';
      errorDiv.className = 'error';
      document.getElementById('admin-password').value = '';
      return;
    }

    await limpiarRateLogin('admin_login', email, SITE_ID);

    sessionStorage.removeItem('admin_email');
    sessionStorage.setItem('admin_rol', permiso.rol || 'admin');
    sessionStorage.setItem('admin_site_id', SITE_ID);
    sessionStorage.setItem('admin_is_master', permiso.es_master ? 'true' : 'false');

    adminSession = {
      rol: permiso.rol || (permiso.es_master ? 'master' : 'admin'),
      site_id: SITE_ID,
      es_master: permiso.es_master === true
    };

    sesionActiva = true;

    document.getElementById('admin-password').value = '';

    errorDiv.innerHTML = '✅ <strong>Acceso correcto</strong><br>Entrando al panel...';
    errorDiv.className = 'success';

    setTimeout(async () => {
      document.getElementById('admin-login').classList.add('oculto');
      document.getElementById('admin-panel').classList.remove('oculto');

      const emailDisplay = document.getElementById('admin-email-display');
      if (emailDisplay) emailDisplay.textContent = permiso.es_master ? 'Master' : 'Administrador';

      actualizarVencimientoPanelAdmin();

      iniciarDetectorActividad();
      resetInactivityTimer();

      await cargarPanelAdmin();
      activarRefrescoAutomaticoAdmin();
    }, 700);

  } catch (error) {
    errorSeguro('Error en loginAdmin:', error);
    errorDiv.textContent = error.message || 'Error de conexión o configuración';
    errorDiv.className = 'error';
    document.getElementById('admin-password').value = '';
  }
}


// Función para cancelar login
function cancelarLogin() {
  const errorDiv = document.getElementById('admin-error');
  errorDiv.textContent = '';
  errorDiv.className = '';
  document.getElementById('admin-password').value = '';
}


// Función para actualizr actividad de sesión
function actualizarActividadSesion() {
  if (!sesionActiva) return;
  logSeguro('👀 Actividad detectada');
}
// Timer de inactividad
function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  if (sesionActiva) {
    logSeguro('⏰ Reiniciando timer de inactividad (30 minutos)');

    inactivityTimer = setTimeout(async () => {
      if (sesionActiva) {
        logSeguro('⏰ Sesión expirada por inactividad');
        alert('Sesión expirada por inactividad (30 minutos)');
        await cerrarSesionAdmin();
      }
    }, SESSION_TIMEOUT);
  }
}

// Eventos para detectar actividad
function iniciarDetectorActividad() {
  if (detectorIniciado) return; // ⛔ evita doble ejecución
  detectorIniciado = true;

  logSeguro('👀 Iniciando detector de actividad');

 ['click', 'keypress', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
      if (sesionActiva) {
        actualizarActividadSesion();
        resetInactivityTimer();
      }
    });
  });
}



// ==================== VERIFICACIÓN INICIAL ====================
async function verificarSesionInicial() {
  logSeguro('🔍 Verificando sesión inicial con Supabase Auth...');

  document.getElementById('admin-panel')?.classList.add('oculto');
  document.getElementById('admin-login')?.classList.add('oculto');
  document.getElementById('bienvenida')?.classList.remove('oculto');

  if (!SITE_ID) {
    warnSeguro('SITE_ID no está cargado todavía');
    return;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session?.user) {
      logSeguro('ℹ️ No hay sesión Auth activa');
      sesionActiva = false;
      adminSession = null;
      return;
    }

    const { data: ctx, error: ctxError } = await supabase.rpc('rpc_auth_admin_context', {
      _site_id: SITE_ID
    });

    if (ctxError) {
      errorSeguro('Error verificando contexto admin:', ctxError);
      await supabase.auth.signOut();
      sesionActiva = false;
      adminSession = null;
      return;
    }

    const permiso = Array.isArray(ctx) ? ctx[0] : ctx;

    if (!permiso || (!permiso.es_master && !permiso.es_admin_sitio)) {
      warnSeguro('Sesión Auth existe, pero no tiene permiso en este sitio');
      await supabase.auth.signOut();
      sesionActiva = false;
      adminSession = null;
      return;
    }

    sessionStorage.removeItem('admin_email');
    sessionStorage.setItem('admin_rol', permiso.rol || 'admin');
    sessionStorage.setItem('admin_site_id', SITE_ID);
    sessionStorage.setItem('admin_is_master', permiso.es_master ? 'true' : 'false');

    adminSession = {
      rol: permiso.rol || (permiso.es_master ? 'master' : 'admin'),
      site_id: SITE_ID,
      es_master: permiso.es_master === true
    };

    sesionActiva = true;

    const emailDisplay = document.getElementById('admin-email-display');
    if (emailDisplay) emailDisplay.textContent = permiso.es_master ? 'Master' : 'Administrador';

    iniciarDetectorActividad();
    resetInactivityTimer();

    logSeguro('✅ Sesión admin válida:', adminSession);

  } catch (error) {
    errorSeguro('❌ Error verificando sesión inicial:', error);
    await supabase.auth.signOut();
    sesionActiva = false;
    adminSession = null;
  }
}
// ==================== FUNCIONES FALTANTES QUE NECESITA EL HTML ====================

// Función para ver lista de aprobados
async function verListaAprobados() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
  .eq('site_id', SITE_ID)
    .eq('estado', 'aprobado');

  const listaDiv = document.getElementById('listaAprobados');
  if (!listaDiv) {
    errorSeguro('Elemento listaAprobados no encontrado');
    return;
  }

  listaDiv.innerHTML = '';

  if (error) {
    errorSeguro('Error al obtener aprobados:', error);
    listaDiv.innerHTML = '<p>Error al obtener la lista.</p>';
    return;
  }

  if (data.length === 0) {
    listaDiv.innerHTML = '<p>No hay personas aprobadas.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';

  tabla.innerHTML = `
    <thead>
      <tr>
        <th style="border: 1px solid #ccc; padding: 8px;">Nombre</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Cédula</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Cartones</th>
        <th style="border: 1px solid #ccc; padding: 8px;">Pago Móvil</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = tabla.querySelector('tbody');

  data.forEach(item => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td style="border: 1px solid #ccc; padding: 8px;">${item.nombre || ''}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.cedula || ''}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">
        ${Array.isArray(item.cartones) ? item.cartones.join(', ') : ''}
      </td>
      <td style="border: 1px solid #ccc; padding: 8px;">
  ${item.pago_banco || ''}<br>
  ${item.pago_telefono || ''}<br>
  ${item.pago_cedula || ''}
</td>
    `;

    tbody.appendChild(tr);
  });

  listaDiv.appendChild(tabla);
}

// Función para detectar cartones duplicados
async function detectarCartonesDuplicados() {
  const boton = document.getElementById('btnDuplicados');
  if (!boton) return;
  
  const prev = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Buscando duplicados...';

  try {
    const { data, error } = await supabase
      .from('inscripciones')
      .select('id,nombre,cedula,estado,cartones')
    .eq('site_id', SITE_ID)
      .in('estado', ['pendiente', 'aprobado']);

    if (error) throw error;

    const indice = new Map();

    (data || []).forEach(ins => {
      if (!Array.isArray(ins.cartones)) return;

      const únicos = new Set(
        ins.cartones
          .map(x => {
            if (typeof x === 'number') return x;
            if (typeof x === 'string') return parseInt(x, 10);
            try {
              const s = (x && typeof x === 'object') ? JSON.stringify(x) : String(x);
              return parseInt(s.replace(/[^0-9\-]/g,''), 10);
            } catch { return NaN; }
          })
          .filter(n => Number.isFinite(n))
      );

      únicos.forEach(n => {
        if (!indice.has(n)) indice.set(n, []);
        indice.get(n).push({ id: ins.id, nombre: ins.nombre || '', cedula: ins.cedula || '' });
      });
    });

    const duplicados = [];
    const duplicadosSet = new Set();
    
    for (const [numero, dueños] of indice.entries()) {
      if (dueños.length > 1) {
        duplicados.push({
          numero,
          personas: dueños,
          veces: dueños.length
        });
        duplicadosSet.add(numero);
      }
    }

    duplicados.sort((a, b) => (b.veces - a.veces) || (a.numero - b.numero));

    renderDuplicados(duplicados);
    resaltarCeldasDuplicadas(duplicadosSet);

  } catch (e) {
    errorSeguro(e);
    const cont = document.getElementById('duplicadosResultado');
    if (cont) {
      cont.innerHTML = '<p style="color:#f44336;">Error buscando duplicados. Revisa la consola.</p>';
    }
  } finally {
    boton.disabled = false;
    boton.textContent = prev;
  }
}

// Función auxiliar para renderizar duplicados
function renderDuplicados(lista) {
  const cont = document.getElementById('duplicadosResultado');
  if (!cont) return;
  
  cont.innerHTML = '';

  if (!lista.length) {
    cont.innerHTML = '<p style="color:#4caf50;font-weight:bold;">No se encontraron cartones duplicados en inscripciones activas.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th style="border:1px solid #ccc;padding:6px;">Cartón</th>
        <th style="border:1px solid #ccc;padding:6px;">Personas</th>
        <th style="border:1px solid #ccc;padding:6px;">Veces</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = tabla.querySelector('tbody');

  lista.forEach(row => {
    const tr = document.createElement('tr');
    
    const tdNumero = document.createElement('td');
    tdNumero.style.border = '1px solid #ccc';
    tdNumero.style.padding = '6px';
    tdNumero.textContent = String(row.numero);
    
    const tdPersonas = document.createElement('td');
    tdPersonas.style.border = '1px solid #ccc';
    tdPersonas.style.padding = '6px';
    tdPersonas.textContent = row.personas.map(p => `${p.nombre} (${p.cedula})`).join(', ');
    
    const tdVeces = document.createElement('td');
    tdVeces.style.border = '1px solid #ccc';
    tdVeces.style.padding = '6px';
    tdVeces.textContent = String(row.veces);
    
    tr.appendChild(tdNumero);
    tr.appendChild(tdPersonas);
    tr.appendChild(tdVeces);
    tbody.appendChild(tr);
  });

  cont.appendChild(tabla);
}

// Función auxiliar para resaltar celdas duplicadas
function resaltarCeldasDuplicadas(duplicadosSet) {
  const cartonesCells = document.querySelectorAll('#tabla-comprobantes tbody tr td:nth-child(5)');
  cartonesCells.forEach(td => {
    const nums = td.textContent
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n));

    const tieneDuplicado = nums.some(n => duplicadosSet.has(n));
    td.style.backgroundColor = tieneDuplicado ? 'rgba(255,0,0,0.18)' : '';
  });
}

// Función para r huérfanos
async function verHuerfanos() {
  const btn = document.getElementById('btnVerHuerfanos');
  if (!btn) return;

  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Buscando...';

  try {
    const { data, error } = await supabase.rpc('rpc_listar_cartones_huerfanos', {
      _site_id: SITE_ID,
      _min_age: '5 minutes'
    });

    if (error) throw error;

    renderTablaHuerfanos(data || []);

  } catch (e) {
    errorSeguro(e);
    const resultado = document.getElementById('huerfanosResultado');
    if (resultado) {
      resultado.innerHTML = '<p style="color:#f44336;">Error buscando huérfanos. Revisa consola.</p>';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

// Función para renderizar tabla de huérfanos
function renderTablaHuerfanos(rows) {
  const cont = document.getElementById('huerfanosResultado');
  if (!cont) return;
  
  cont.innerHTML = '';

  if (!rows || rows.length === 0) {
    cont.innerHTML = '<p style="color:#4caf50;font-weight:bold;">No hay cartones huérfanos.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th style="border:1px solid #ccc;padding:6px;">Cartón</th>
        <th style="border:1px solid #ccc;padding:6px;">Reservado desde</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = tabla.querySelector('tbody');

  rows.forEach(r => {
    const tr = document.createElement('tr');
    
    const tdNumero = document.createElement('td');
    tdNumero.style.border = '1px solid #ccc';
    tdNumero.style.padding = '6px';
    tdNumero.textContent = r.numero;
    
    const tdFecha = document.createElement('td');
    tdFecha.style.border = '1px solid #ccc';
    tdFecha.style.padding = '6px';
    tdFecha.textContent = r.created_at ? new Date(r.created_at).toLocaleString() : '';
    
    tr.appendChild(tdNumero);
    tr.appendChild(tdFecha);
    tbody.appendChild(tr);
  });

  cont.appendChild(tabla);
}

// Función para liberar huérfanos
async function liberarHuerfanos() {
  if (!confirm('¿Liberar todos los cartones huérfanos de este sitio?')) return;

  const btn = document.getElementById('btnLiberarHuerfanos');
  if (!btn) return;

  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Limpiando...';

  try {
    const { data, error } = await supabase.rpc('rpc_liberar_cartones_huerfanos', {
      _site_id: SITE_ID,
      _min_age: '5 minutes'
    });

    if (error) throw error;

    alert(`Listo. Cartones liberados: ${data ?? 0}`);

    await verHuerfanos();
    await cargarCartones();
    await contarCartonesVendidos();

  } catch (e) {
    errorSeguro(e);
    alert('Error al liberar huérfanos.');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}
// Función para guardar precio por cartón
async function guardarPrecioPorCarton() {
  const input = document.getElementById('precioCarton');
  const nuevoPrecio = parseFloat(input.value);

  if (isNaN(nuevoPrecio) || nuevoPrecio < 0) {
    alert('Ingrese un precio válido');
    return;
  }

  const ok = await setConfigValue('precio_carton', nuevoPrecio.toString());

  if (!ok) {
    alert('Error guardando el precio');
    return;
  }

  precioPorCarton = nuevoPrecio;

  if (sitioActual) {
    sitioActual.precio_carton_bs = nuevoPrecio;
  }

  alert('Precio actualizado correctamente');
  await cargarPrecioPorCarton();
}

// ==================== FUNCIONES EXISTENTES ====================

async function obtenerMontoTotalRecaudado() {
   const { data, error } = await supabase
    .from('inscripciones')
    .select('monto_bs, cartones')
   .eq('site_id', SITE_ID)
    .eq('estado', 'aprobado'); 

  if (error) {
    errorSeguro('Error al obtener inscripciones:', error.message);
    return;
  }

  let total = 0;
  
  for (const ins of (data || [])) {
    let m = Number(ins.monto_bs);
    if (!(m > 0)) {
      const unidades = Array.isArray(ins.cartones) ? ins.cartones.length : 0;
      m = unidades * (precioPorCarton || 0);
    }
    total += m;
  }

  const totalElement = document.getElementById('totalMonto');
  if (totalElement) {
    totalElement.textContent = new Intl.NumberFormat('es-VE', { 
      style: 'currency', 
      currency: 'VES' 
    }).format(total);
  }
}

async function contarCartonesVendidos() {
  await obtenerTotalCartones();

  const { data, error } = await supabase.rpc('rpc_public_contar_cartones_ocupados', {
    _site_id: SITE_ID,
    _total: totalCartones
  });

  if (error) {
    errorSeguro('Error contando cartones ocupados por RPC:', error);
    return 0;
  }

  const totalVendidos = Number(data) || 0;

  const totalVendidosElement = document.getElementById('total-vendidos');
  if (totalVendidosElement) {
    totalVendidosElement.textContent = totalVendidos;
  }

  return totalVendidos;
}


async function cargarMostrarPromocionesSitio() {
  try {
    const { data, error } = await supabase.rpc('rpc_public_mostrar_promociones', {
      _site_id: SITE_ID
    });

    if (error) {
      warnSeguro('No se pudo cargar mostrar_promociones por RPC pública:', error);
      const valorFallback = await getConfigValue('mostrar_promociones', 'true');
      mostrarPromocionesSitio = String(valorFallback).toLowerCase() !== 'false';
      aplicarEstadoPromocionesAdminPanel();
      return;
    }

    mostrarPromocionesSitio = data !== false && String(data).toLowerCase() !== 'false';
    aplicarEstadoPromocionesAdminPanel();

  } catch (error) {
    warnSeguro('Error cargando mostrar_promociones:', error);
    mostrarPromocionesSitio = true;
    aplicarEstadoPromocionesAdminPanel();
  }
}

function aplicarEstadoPromocionesAdminPanel() {
  const tabPromociones = document.getElementById('tab-promociones');
  const btnTabPromociones = Array.from(document.querySelectorAll('.tab-btn, button'))
    .find(btn => {
      const onclick = String(btn.getAttribute('onclick') || '').toLowerCase();
      const texto = String(btn.textContent || '').toLowerCase();
      return onclick.includes('tab-promociones') || texto.includes('promocion') || texto.includes('promoción');
    });

  const promoBoxPublico = document.getElementById('promoBox');

  if (!mostrarPromocionesSitio) {
    promocionSeleccionada = null;

    if (promoBoxPublico) {
      promoBoxPublico.classList.add('oculto');
    }

    if (btnTabPromociones) {
      btnTabPromociones.style.display = 'none';
      btnTabPromociones.disabled = true;
    }

    if (tabPromociones) {
      const estabaActivo = tabPromociones.classList.contains('active');
      tabPromociones.classList.remove('active');
      tabPromociones.classList.add('oculto');

      tabPromociones.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = true;
      });

      if (estabaActivo && typeof cambiarTab === 'function') {
        cambiarTab('tab-dashboard');
      }
    }

    return;
  }

  if (btnTabPromociones) {
    btnTabPromociones.style.display = '';
    btnTabPromociones.disabled = false;
  }

  if (tabPromociones) {
    tabPromociones.classList.remove('oculto');
    tabPromociones.querySelectorAll('input, select, textarea, button').forEach(el => {
      el.disabled = false;
    });
  }
}

function renderizarBotonesPromociones() {
  const promoBox = document.getElementById('promoBox');
  if (!promoBox) return;

  if (!mostrarPromocionesSitio) {
    promoBox.classList.add('oculto');
    promocionSeleccionada = null;

    document.querySelectorAll('.btn-promo').forEach(btn => {
      btn.classList.remove('seleccionado');
      btn.classList.add('desactivado');
      btn.onclick = null;
    });

    return;
  }

  let algunaActiva = false;
  
  promociones.forEach((promo, index) => {
    const boton = document.querySelector(`[data-promo="${index + 1}"]`);
    const descElement = document.getElementById(`promo-desc-${index + 1}`);
    const precioElement = document.getElementById(`promo-precio-${index + 1}`);
    
    if (boton && descElement && precioElement) {
      if (promo.activa && promo.cantidad > 0 && promo.precio > 0) {
        descElement.textContent = promo.descripcion;
        precioElement.textContent = `${promo.precio.toFixed(2)} Bs`;
        boton.classList.remove('desactivado');
        algunaActiva = true;
        boton.title = `${promo.cantidad} cartones por ${promo.precio.toFixed(2)} Bs`;
        
        boton.onclick = () => seleccionarPromocion(index + 1);
      } else {
        descElement.textContent = `Promo ${index + 1} (No disponible)`;
        precioElement.textContent = 'No disponible';
        boton.classList.add('desactivado');
        boton.onclick = null;
      }
      
      boton.classList.remove('seleccionado');
    }
  });
  
  promoBox.classList.toggle('oculto', !algunaActiva);
}

// ==================== FUNC PINCILES ====================
window.addEventListener('DOMContentLoaded', async () => {
  logSeguro('🚀 Inicializando sistema...');
    sistemaListo = false;
  const sitioOk = await iniciarSitioActual();

if (!sitioOk) {
  warnSeguro('Sitio no disponible o pausado.');
  return;
}
  // Crear ta¿'bl ses nxiste
   document.getElementById('modal-terminos').classList.remove('oculto');
   await obtenerTotalCartones();
  await cargarLinkWhatsapp();

  // Si no hay caché, espera los colores reales antes de mostrar la página.
  // Si sí hay caché, se muestra rápido y Supabase actualiza el tema en segundo plano.
  const temaYaEstabaEnCache = !!obtenerCacheColoresActual();
  if (!temaYaEstabaEnCache) {
    await cargarColoresSitio();
  }

  document.getElementById('overlay-carga').style.display = 'none';

  // Primero se carga si el master permite promociones.
  // Luego se cargan las promociones para evitar que se muestren por carrera de carga.
  await cargarMostrarPromocionesSitio();

  await Promise.all([
    cargarDatosClienteLocal(),
  activarProgresoCartonesRealtime(),
  generarCartones(),
    cargarBarraProgresoInicio(),
    cargarConfigBarraProgresoAdmin(),
    cargarPrecioPorCarton(),
    cargarConfiguracionModoCartones(),
    cargarModoCartonSimple(),
    cargarOpcionesMasterSitio(),
    cargarPromocionesConfig(),
    cargarImagenesSitio(),
    temaYaEstabaEnCache ? cargarColoresSitio() : Promise.resolve(),
    cargarPagoMovilSitio(),
    cargarRedesSitio(),
    cargarPoliticaPrivacidadSitio()
  ]);

  await verificarSesionInicial();


  
 
  // Event listes pefos
 document.getElementById('guardarPromocionesBtn')?.addEventListener('click', guardarPromociones);
  document.getElementById('btnDupNombreAprobados')?.addEventListener('click', detectarDuplicadosAprobadosPorNombre);
  document.getElementById('btnDupReferenciaAprobados')?.addEventListener('click', detectarDuplicadosAprobadosPorReferencia);
  document.getElementById('btnDuplicados')?.addEventListener('click', detectarCartonesDuplicados);
  document.getElementById('btnVerHuerfanos')?.addEventListener('click', verHuerfanos);
  document.getElementById('btnLiberarHuerfanos')?.addEventListener('click', liberarHuerfanos);
  document.getElementById('guardarPrecioBtn')?.addEventListener('click', guardarPrecioPorCarton);
  document.getElementById('cerrarVentasBtn')?.addEventListener('click', cerrarVentas);
  document.getElementById('abrirVentasBtn')?.addEventListener('click', abrirVentas);
 document.getElementById('btnGuardarPagoSitio')?.addEventListener('click', guardarPagoMovilSitio); document.getElementById('imprimirListaBtn')?.addEventListener('click', imprimirLista);
  document.getElementById('verListaBtn')?.addEventListener('click', verListaAprobados);
  document.getElementById('guardarModoCartonesBtn')?.addEventListener('click', guardarModoCartones);
  document.getElementById('modoCartonesSelect')?.addEventListener('change', cambiarModoCartones);
  document.getElementById('btnGuardarColoresSitio')?.addEventListener('click', guardarColoresSitio);
  document.getElementById('btnGuardarLogoSitio')?.addEventListener('click', guardarLogoSitio);
document.getElementById('btnGuardarPremioSitio')?.addEventListener('click', guardarPremioSitio);
document.getElementById('btnGuardarRedesSitio')?.addEventListener('click', guardarRedesSitio); 
document.getElementById('btnGuardarFaviconSitio')?.addEventListener('click', guardarFaviconSitio);
document.getElementById('btnResetColoresSitio')?.addEventListener('click', resetearColoresSitio);
  activarVistaPreviaColores();
  // Cargar likde WhatsApp
    sistemaListo = true;
  inicializarHistorialVentanas();
  // Mostrar términos

  document.getElementById('overlay-carga')?.style && (document.getElementById('overlay-carga').style.display = 'none');
  logSeguro('✅ Sistema inicializado correctamente');
});

async function obtenerTotalCartones() {
  const fallback =
    sitioActual?.cartones_visibles ||
    sitioActual?.total_cartones ||
    sitioActual?.limite_cartones ||
    '0';

  const valor = await getConfigValue('cartones_visibles', String(fallback));

  totalCartones = parseInt(valor, 10) || 0;
}

async function cargarModoCartonSimple() {
  try {
    const { data, error } = await supabase.rpc('rpc_public_modo_carton_simple', {
      _site_id: SITE_ID
    });

    if (error) {
      warnSeguro('No se pudo leer modo cartón simple por RPC pública:', error);
      const valorFallback = await getConfigValue('modo_carton_simple', 'false');
      modoCartonSimple = isTrue(valorFallback);
    } else {
      modoCartonSimple = data === true || data === 'true';
    }

    aplicarModoCartonSimpleAdmin();
  } catch (error) {
    warnSeguro('Error cargando modo cartón simple:', error);
    modoCartonSimple = false;
    aplicarModoCartonSimpleAdmin();
  }
}

function aplicarModoCartonSimpleAdmin() {
  const input = document.getElementById('cartonImageInput');
  const btnSubir = document.querySelector('button[onclick*="subirCartones"]');
  const btnBorrar = document.querySelector('button[onclick*="borrarCartones"]');
  const seccionImagenes = input?.closest('.panel-section');
  const status = document.getElementById('uploadStatus');

  if (input) input.disabled = modoCartonSimple;
  if (btnSubir) btnSubir.disabled = modoCartonSimple;
  if (btnBorrar) btnBorrar.disabled = modoCartonSimple;

  if (seccionImagenes) {
    seccionImagenes.style.display = modoCartonSimple ? 'none' : '';
  }

  if (status && modoCartonSimple) {
    status.innerHTML = '<p style="color:#666;">Modo cartón simple activo: no se usan imágenes de cartones.</p>';
  }
}


async function cargarOpcionesMasterSitio() {
  if (!SITE_ID) return;

  try {
    const { data, error } = await supabase.rpc('rpc_public_config_funciones', {
      _site_id: SITE_ID
    });

    if (error) {
      warnSeguro('No se pudieron cargar opciones master del sitio:', error);
      aplicarOpcionesMasterSitio();
      return;
    }

    const cfg = Array.isArray(data) ? data[0] : data;

    if (cfg) {
      planTipoSitio = cfg.plan_tipo || 'basico';
      mostrarEnVivoSitio = cfg.mostrar_en_vivo !== false;
      mostrarTopCompradoresSitio = cfg.mostrar_top_compradores !== false;
    }

    aplicarOpcionesMasterSitio();
  } catch (error) {
    warnSeguro('Error cargando opciones master:', error);
    aplicarOpcionesMasterSitio();
  }
}

function aplicarOpcionesMasterSitio() {
  const botones = Array.from(document.querySelectorAll('button, a'));

  botones.forEach(el => {
    const texto = String(el.textContent || '').toLowerCase();
    const onclick = String(el.getAttribute('onclick') || '').toLowerCase();
    const href = String(el.getAttribute('href') || '').toLowerCase();

    const esEnVivo =
      texto.includes('ver en vivo') ||
      texto.includes('en vivo') ||
      onclick.includes('envivo.html') ||
      href.includes('envivo.html');

    const esTop =
      texto.includes('top compradores') ||
      onclick.includes('top-compradores') ||
      href.includes('top-compradores');

    if (esEnVivo) {
      el.style.display = mostrarEnVivoSitio ? '' : 'none';
      if ('disabled' in el) el.disabled = !mostrarEnVivoSitio;
    }

    if (esTop) {
      el.style.display = mostrarTopCompradoresSitio ? '' : 'none';
      if ('disabled' in el) el.disabled = !mostrarTopCompradoresSitio;
    }
  });

  const seccionTop = document.getElementById('top-compradores');
  if (seccionTop && !mostrarTopCompradoresSitio) {
    seccionTop.classList.add('oculto');
  }
}

function asignarClickCartonLibre(carton, numero) {
  if (!carton) return;

  carton.onclick = async () => {
    if (modoCartonSimple) {
      await toggleCarton(numero, carton);
    } else {
      abrirModalCarton(numero, carton);
    }
  };
}

async function cargarPrecioPorCarton() {
  const fallback = sitioActual?.precio_carton_bs ?? '0';
  const valor = await getConfigValue('precio_carton', String(fallback));

  precioPorCarton = parseFloat(valor) || 0;
}

function generarCartones() {
  logSeguro(`Sistema de bingo inicializado con ${totalCartones} cartones disponibles`);
}

function actualizarPreseleccion() {
  const input = document.getElementById('cantidadCartones');
  const monto = document.getElementById('monto-preseleccion');

  if (!input || !monto) return;

  let cant = parseInt(input.value, 10);
  if (isNaN(cant)) cant = 1;

  // Solo contar cartones válidos dentro del rango configurado
  const ocupadosValidos = cartonesOcupados
    .map(Number)
    .filter(n => n >= 1 && n <= totalCartones).length;

  const maxDisponibles = Math.max(0, totalCartones - ocupadosValidos);

  // Si ya no quedan cartones
  if (maxDisponibles <= 0) {
    input.value = 0;
    monto.textContent = '0.00';
    return;
  }

  if (modoCartones === 'fijo') {
    cant = Math.min(cantidadFijaCartones, maxDisponibles);
  } else {
    cant = Math.max(1, Math.min(cant, maxDisponibles));
  }

  input.value = cant;
  monto.textContent = (cant * precioPorCarton).toFixed(2);
}

document.addEventListener('DOMContentLoaded', () => {

  const btnMas = document.getElementById('btnMas');
  const btnMenos = document.getElementById('btnMenos');
  const inputCantidad = document.getElementById('cantidadCartones');

  if (inputCantidad) {
    inputCantidad.min = '1';
  }

  if (btnMas && inputCantidad) {
    btnMas.onclick = () => {
      if (modoCartones === 'fijo') return;

      let actual = parseInt(inputCantidad.value, 10);
      if (isNaN(actual)) actual = 1;

      const ocupadosValidos = cartonesOcupados
        .map(Number)
        .filter(n => n >= 1 && n <= totalCartones).length;

      const maxDisponibles = Math.max(0, totalCartones - ocupadosValidos);

      inputCantidad.value = Math.min(actual + 1, maxDisponibles);
      limpiarPromoPorCambioCantidad();
    };
  }

  if (btnMenos && inputCantidad) {
    btnMenos.onclick = () => {
      if (modoCartones === 'fijo') return;

      let actual = parseInt(inputCantidad.value, 10);
      if (isNaN(actual)) actual = 1;

      inputCantidad.value = Math.max(1, actual - 1);
      limpiarPromoPorCambioCantidad();
    };
  }

  if (inputCantidad) {
    inputCantidad.addEventListener('input', function () {
      let valor = parseInt(this.value, 10);

      if (isNaN(valor)) valor = 1;

      if (modoCartones === 'fijo') {
        this.value = cantidadFijaCartones;
      } else {
        this.value = Math.max(1, valor);
      }

      limpiarPromoPorCambioCantidad();
    });
  }

  // ⏰ Hora Venezuela
  actualizarHoraVenezuela();
  setInterval(actualizarHoraVenezuela, 1000);

  // 🛡️ Detector de actividad
  iniciarDetectorActividad();

});

function limpiarPromoPorCambioCantidad() {
  if (promocionSeleccionada) {
    deseleccionarPromocion();
  }
  actualizarPreseleccion();
}

function isTrue(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

async function mostrarVentana(id, guardarHistorial = true) {
  if (!sistemaListo) return;

  if (id === 'top-compradores') {
    if (!mostrarTopCompradoresSitio) {
      alert('El Top de compradores está deshabilitado para este sitio.');
      return;
    }

    await cargarTopCompradores();
    activarTopCompradoresRealtime();
  }

  if (id === 'admin') {
    await entrarAdmin();
    return;
  }

  // 1) Si va a CARTONES, valida ventas_abierta por sitio
  if (id === 'cartones') {
    const fallbackVentas = sitioActual?.ventas_abiertas === false ? 'false' : 'true';
    const ventasAbierta = await getConfigValue('ventas_abierta', fallbackVentas);

    if (!isTrue(ventasAbierta)) {
      alert('Las ventas están cerradas');

      document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));
      document.getElementById('bienvenida')?.classList.remove('oculto');

      return;
    }
  }

  // 2) Si va a PAGO, valida cantidad exacta
  if (id === 'pago') {
    const requerido = modoCartones === 'fijo' ? cantidadFijaCartones : cantidadPermitida;

    if (usuario.cartones.length !== requerido) {
      alert(`Debes elegir exactamente ${requerido} cartones antes de continuar.`);
      return;
    }
  }

  // 3) Mostrar la ventana solicitada
  document.querySelectorAll('section').forEach(s => s.classList.add('oculto'));

  const target = document.getElementById(id);
  if (target) {
    target.classList.remove('oculto');
    ventanaActual = id;

    if (guardarHistorial && !navegandoConBotonAtras) {
      registrarHistorialVentana(id);
    }
  }

  requestAnimationFrame(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  if (id === 'cantidad') {
    promocionSeleccionada = null;
    await cargarPromocionesConfig();
    actualizarPreseleccion();
  }

  if (id === 'pago') {
    const promo = getPromocionSeleccionada();
    const monto = promo ? promo.precio : usuario.cartones.length * (precioPorCarton || 0);

    const montoPago = document.getElementById('monto-pago');
    if (montoPago) montoPago.textContent = monto.toFixed(2);

    iniciarContadorReserva(5);
  }

  if (id === 'cartones') {
    await cargarCartones();
  }

  if (id === 'lista-aprobados') {
    await cargarListaAprobadosSeccion();
  }

  if (id === 'ganadores') {
    cargarGanadores();
  }
}
// Guardar datos del formulario
function guardarDatosInscripcion() {
  usuario.nombre = document.getElementById('nombre').value;
  usuario.telefono = document.getElementById('telefono').value;
  usuario.cedula = document.getElementById('cedula').value;
  usuario.referido = document.getElementById('referido').value;
  usuario.cartones = [];
  mostrarVentana('cantidad')
  actualizarPreseleccion(); 
  guardarDatosClienteLocal();
}

function confirmarCantidad() {
  const promo = getPromocionSeleccionada();
  let cant;
  
  if (promo) {
    cant = promo.cantidad;
  } else {
    cant = parseInt(document.getElementById('cantidadCartones').value);
    const ocupadosValidos = cartonesOcupados
  .map(Number)
  .filter(n => n >= 1 && n <= totalCartones).length;

const maxDisponibles = Math.max(0, totalCartones - ocupadosValidos);

if (maxDisponibles <= 0) {
  return alert('No quedan cartones disponibles.');
}
    
    if (modoCartones === 'fijo') {
      if (cant !== cantidadFijaCartones) {
        document.getElementById('cantidadCartones').value = cantidadFijaCartones;
        cant = cantidadFijaCartones;
      }
    } else {
      if (isNaN(cant) || cant < 1) {
        return alert('Ingresa un número válido');
      }
      if (cant > maxDisponibles) {
        return alert(`Solo quedan ${maxDisponibles} cartones disponibles`);
      }
    }
  }
  
  cantidadPermitida = cant;
  usuario.cartones = [];
  mostrarVentana('cartones');
}

// ==================== FUNCIONES DE CARTONES ====================
async function cargarCartones() {
  const { error: errorHuerfanos } = await supabase.rpc('rpc_liberar_cartones_huerfanos', {
  _site_id: SITE_ID,
  _min_age: '5 minutes'
});

  if (errorHuerfanos) {
    errorSeguro('Error liberando huérfanos:', errorHuerfanos);
  }

  cartonesOcupados = await fetchTodosLosOcupados();
  const ocupadosSet = new Set(cartonesOcupados);

  const contenedor = document.getElementById('contenedor-cartones');
  contenedor.innerHTML = '';

  for (let i = 1; i <= totalCartones; i++) {
    const carton = document.createElement('div');
    carton.textContent = i;
    carton.classList.add('carton');

    if (ocupadosSet.has(i)) {
      carton.classList.add('ocupado');
    } else {
      asignarClickCartonLibre(carton, i);
    }

    contenedor.appendChild(carton);
  }

  await contarCartonesVendidos();

  actualizarContadorCartones(
    totalCartones,
    Number(document.getElementById('total-vendidos').textContent) || cartonesOcupados.length,
    usuario.cartones.length
  );

  actualizarMonto();
}

async function toggleCarton(num, elem) {
  num = Number(num);
  const cedulaLimpia = String(usuario.cedula || '').trim();

  const index = usuario.cartones.map(Number).indexOf(num);

  // Deseleccionar
  if (index >= 0) {
    usuario.cartones.splice(index, 1);
    elem.classList.remove('seleccionado');

  

const { data: liberado, error: errorLiberar } = await supabase.rpc('rpc_liberar_reserva', {
  _site_id: SITE_ID,
  _numero: num,
  _cedula: cedulaLimpia,
  _partida_id: null
});
    logSeguro('Liberar cartón:', {
      numero: num,
      cedula: cedulaLimpia,
      liberado,
      errorLiberar
    });

    if (errorLiberar) {
      errorSeguro('Error liberando reserva:', errorLiberar);
      alert('No se pudo liberar el cartón. Intenta otra vez.');
      return;
    }

    if (liberado !== true) {
      warnSeguro('El cartón no se liberó. Puede que no coincidía la cédula o ya estaba en inscripción.');
    }

    cartonesOcupados = cartonesOcupados.filter(n => Number(n) !== num);

    document.querySelectorAll('.carton.bloqueado').forEach(c => {
      const n = Number(c.textContent);
      if (!cartonesOcupados.map(Number).includes(n) && !usuario.cartones.map(Number).includes(n)) {
        c.classList.remove('bloqueado');
        asignarClickCartonLibre(c, n);
      }
    });

    actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
    actualizarMonto();
    return;
  }

  // No permitir más de la cantidad elegida
  if (usuario.cartones.length >= cantidadPermitida) return;

 const { data, error } = await supabase.rpc('rpc_reservar_carton', {
  _site_id: SITE_ID,
  _numero: num,
  _cedula: cedulaLimpia,
  _partida_id: null
});

  if (error || data !== true) {
    alert('Ese cartón ya fue tomado por otra persona. Elige otro.');
    await cargarCartones();
    return;
  }

  usuario.cartones.push(num);
  elem.classList.add('seleccionado');

  if (usuario.cartones.length === cantidadPermitida) {
    document.querySelectorAll('.carton').forEach(c => {
      const n = Number(c.textContent);
      const yaSeleccionado = usuario.cartones.map(Number).includes(n);
      const yaOcupado = cartonesOcupados.map(Number).includes(n);

      if (!yaSeleccionado && !yaOcupado) {
        c.classList.add('bloqueado');
        c.onclick = null;
      }
    });
  }

  actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
  actualizarMonto();
}
function actualizarMonto() {
  let total;
  const promo = getPromocionSeleccionada();
  
  if (promo && usuario.cartones.length === promo.cantidad) {
    total = promo.precio;
  } else {
    total = (usuario.cartones.length || 0) * (precioPorCarton || 0);
  }
  
  const nodo = document.getElementById('monto-total');
  if (nodo) nodo.textContent = total.toFixed(2);
}

// ==================== FUNCIONES DE PAGO ====================
function limpiarNombreArchivo(nombre) {
  return String(nombre || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

async function convertirImagenAWebP(file, calidad = 0.85, maxWidth = 1600) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen');
  }

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = objectUrl;
  });

  let width = img.width;
  let height = img.height;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  URL.revokeObjectURL(objectUrl);

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/webp', calidad);
  });

  if (!blob) {
    throw new Error('No se pudo convertir la imagen a WebP');
  }

  const nombreWebP = limpiarNombreArchivo(file.name).replace(/\.[^.]+$/, '') + '.webp';

  return new File([blob], nombreWebP, {
    type: 'image/webp',
    lastModified: Date.now()
  });
}

async function enviarComprobante() {
  const boton = document.getElementById('btnEnviarComprobante');
  const textoOriginal = boton ? boton.textContent : 'Enviar comprobante';

  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Cargando comprobante...';
  }

  let nombreArchivo = null;
  let cartonesEnviar = [];
  let cedulaLimpia = '';

  try {
    if (!SITE_ID) {
      throw new Error('No se pudo identificar el sitio actual.');
    }

    if (!usuario.nombre || !usuario.telefono || !usuario.cedula) {
      throw new Error('Debes completar primero los datos de inscripción');
    }

    const referencia4dig = document.getElementById('referencia4dig').value.trim();

    if (!/^\d{4}$/.test(referencia4dig)) {
      throw new Error('Debes ingresar los últimos 4 dígitos de la referencia bancaria.');
    }

    const PagoBanco = document.getElementById('pago_banco').value.trim();
    const PagoTelefono = document.getElementById('pago_telefono').value.trim();
    const PagoCedula = document.getElementById('pago_cedula').value.trim();

    if (!PagoBanco || !PagoTelefono || !PagoCedula) {
      throw new Error('Debes registrar tu Pago Móvil para el pago ganador.');
    }

    guardarDatosPagoClienteAutomatico();

    const archivoOriginal = document.getElementById('comprobante').files[0];

    if (!archivoOriginal) {
      throw new Error('Debes subir un comprobante');
    }

    const archivoWebP = await convertirImagenAWebP(archivoOriginal, 0.85, 1600);

    cedulaLimpia = String(usuario.cedula || '').trim();

    const cedulaArchivo = cedulaLimpia.replace(/\D/g, '') || 'sin-cedula';

    const idArchivo = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    nombreArchivo = `${SITE_SLUG}/${cedulaArchivo}-${Date.now()}-${idArchivo}.webp`;

    const { error: errorUpload } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, archivoWebP, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000'
      });

    if (errorUpload) {
      throw new Error('Error subiendo comprobante: ' + errorUpload.message);
    }

    const { data: publicData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(nombreArchivo);

    const urlPublica = publicData.publicUrl;

    const promo = getPromocionSeleccionada();
    const monto = promo ? promo.precio : (usuario.cartones.length * (precioPorCarton || 0));

    cartonesEnviar = (usuario.cartones || [])
      .map(n => Number(n))
      .filter(Number.isFinite);

    if (cartonesEnviar.length === 0) {
      throw new Error('Debes seleccionar al menos un cartón.');
    }

    if (cartonesEnviar.length !== cantidadPermitida) {
      throw new Error('La cantidad de cartones seleccionados no coincide con la cantidad elegida.');
    }

    // 1. Validar reserva por RPC segura.
    // No usamos SELECT directo a cartones porque esa tabla debe estar cerrada por RLS.
    const { data: reservas, error: errorReservas } = await supabase.rpc(
      'rpc_public_validar_reserva_cartones',
      {
        _site_id: SITE_ID,
        _cedula: cedulaLimpia,
        _cartones: cartonesEnviar
      }
    );

    if (errorReservas) {
      errorSeguro('Error validando reservas:', errorReservas);
      throw new Error('No se pudieron validar tus cartones.');
    }

    const reservasValidas = (reservas || [])
      .map(r => Number(r.numero))
      .filter(Number.isFinite);

    const faltantes = cartonesEnviar.filter(n => !reservasValidas.includes(Number(n)));

    if (faltantes.length > 0) {
      await liberarReservasSeleccionadas(cedulaLimpia, cartonesEnviar);

      alert(
        '⚠️ Estos cartones ya no están reservados para ti: ' +
        faltantes.join(', ') +
        '\n\nElige otros cartones.'
      );

      await cargarCartones();
      mostrarVentana('cartones');
      return;
    }

   // 2. Validar por RPC que no existan en otra inscripción pendiente/aprobada del mismo sitio
const { data: cartonesDuplicados, error: errorDuplicados } = await supabase.rpc(
  'rpc_public_validar_cartones_inscripcion',
  {
    _site_id: SITE_ID,
    _cartones: cartonesEnviar
  }
);

if (errorDuplicados) {
  errorSeguro('Error validando cartones duplicados:', errorDuplicados);
  throw new Error('No se pudieron verificar cartones duplicados.');
}

const duplicados = (cartonesDuplicados || [])
  .map(item => Number(item.carton))
  .filter(Number.isFinite);

if (duplicados.length > 0) {
  const numeros = [...new Set(duplicados)];

  await liberarReservasSeleccionadas(cedulaLimpia, cartonesEnviar);

  alert(
    '⚠️ Estos cartones ya fueron tomados: ' +
    numeros.join(', ') +
    '\n\nElige otros cartones.'
  );

  await cargarCartones();
  mostrarVentana('cartones');
  return;
}

    // 3. Guardar inscripción
    const { error: errorInsert } = await supabase
      .from('inscripciones')
      .insert([{
        site_id: SITE_ID,
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        cedula: cedulaLimpia,
        referido: usuario.referido,
        cartones: cartonesEnviar,
        referencia4dig: referencia4dig,
        comprobante: urlPublica,
        estado: 'pendiente',
        monto_bs: monto,
        pago_banco: PagoBanco,
        pago_telefono: PagoTelefono,
        pago_cedula: PagoCedula,
        usa_promo: !!promo,
        promo_desc: promo ? promo.descripcion : null,
        precio_unitario_bs: promo ? null : (precioPorCarton || 0)
      }]);

    if (errorInsert) {
      errorSeguro('Error insertando inscripción:', errorInsert);

      await liberarReservasSeleccionadas(cedulaLimpia, cartonesEnviar);

      if (nombreArchivo) {
        await supabase.storage
          .from('comprobantes')
          .remove([nombreArchivo]);
      }

      throw new Error('Error guardando la inscripción');
    }

    clearInterval(timerReserva);

    alert('Inscripción y comprobante enviados con éxito');
    location.reload();

  } catch (err) {
    errorSeguro(err);
    alert(err.message || 'Ocurrió un error inesperado');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }
}

async function liberarReservasSeleccionadas(cedulaLimpia, cartones = usuario.cartones) {
  const lista = (cartones || [])
    .map(Number)
    .filter(Number.isFinite);

  for (const numero of lista) {
    await supabase.rpc('rpc_liberar_reserva', {
      _site_id: SITE_ID,
      _numero: numero,
      _cedula: cedulaLimpia,
      _partida_id: null
    });
  }
}
// ==================== fUNCIONES DE USUARIO ====================
async function consultarCartones() {
  const cedula = document.getElementById('consulta-cedula')?.value.trim();
  const cont = document.getElementById('cartones-usuario');

  if (!cont) return;

  cont.innerHTML = '';

  if (!cedula) {
    cont.innerHTML = `
      <p style="text-align:center;color:#ff4444;">
        Ingresa tu cédula para consultar.
      </p>
    `;
    return;
  }

  const { data, error } = await supabase.rpc('rpc_public_consultar_compra', {
    _site_id: SITE_ID,
    _cedula: cedula
  });

  if (error) {
    errorSeguro('Error consultando compra:', error);
    cont.innerHTML = `
      <p style="text-align:center;color:#ff4444;">
        Error consultando la compra.
      </p>
    `;
    return;
  }

  const compras = data || [];

  if (compras.length === 0) {
    cont.innerHTML = `
      <p style="text-align:center;color:#ff4444;">
        No se encontró ninguna compra registrada con esta cédula.
      </p>
    `;
    return;
  }

  const tieneAprobada = compras.some(i => i.estado === 'aprobado');
  const tienePendiente = compras.some(i => i.estado === 'pendiente');
  const tieneRechazada = compras.some(i => i.estado === 'rechazado');

  let mensaje = '';

  if (tieneAprobada) {
    mensaje += '✅ Tu compra aprobada aparece abajo.<br>';
  }

  if (tienePendiente) {
    mensaje += '⏳ Tienes una compra pendiente de aprobación.<br>';
  }

  if (tieneRechazada) {
    mensaje += '❌ Tienes una compra rechazada. Consulta con soporte.<br>';
  }

  const aprobadas = compras.filter(i => i.estado === 'aprobado');
  const cartones = aprobadas.flatMap(i => Array.isArray(i.cartones) ? i.cartones : []);

  cont.innerHTML = `
    <div style="text-align:center;font-weight:bold;margin-bottom:15px;">
      ${mensaje}
    </div>
  `;

  if (cartones.length > 0) {
    const box = document.createElement('div');
    box.style.display = 'flex';
    box.style.flexWrap = 'wrap';
    box.style.justifyContent = 'center';
    box.style.gap = '10px';

    cartones.forEach(numero => {
  const item = document.createElement('div');
  item.className = 'carton-consulta-card';
  item.style.width = '130px';
  item.style.textAlign = 'center';
  item.style.border = '2px solid #ffa500';
  item.style.borderRadius = '12px';
  item.style.padding = '6px';
  item.style.background = '#fff';

  const img = document.createElement('img');
  img.src = urlCartonWebP(numero);
  img.loading = 'lazy';
  img.alt = `Cartón ${numero}`;
  img.style.width = '100%';
  img.style.maxWidth = '120px';
  img.style.borderRadius = '8px';
  img.style.display = 'block';
  img.style.margin = '0 auto 6px auto';

  const label = document.createElement('div');
  label.textContent = `Cartón ${numero}`;
  label.style.fontWeight = 'bold';
  label.style.color = '#020A35';

  img.onerror = () => {
    img.remove();
    item.style.width = '70px';
    item.style.height = '65px';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'center';
    item.style.fontSize = '22px';
    item.style.fontWeight = 'bold';
    label.textContent = numero;
  };

  item.appendChild(img);
  item.appendChild(label);
  box.appendChild(item);
});

    cont.appendChild(box);
  }
}

async function elegirMasCartones() {
  const cedula = document.getElementById('consulta-cedula').value.trim();

  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
    .eq('site_id', SITE_ID)
    .eq('cedula', cedula)
    .order('id', { ascending: false });

  if (error || !data || data.length === 0) {
    return alert('No se encontró ningún usuario con esa cédula');
  }

  const inscripcion = data[0];

  usuario.nombre = inscripcion.nombre;
  usuario.telefono = inscripcion.telefono;
  usuario.cedula = inscripcion.cedula;
  usuario.referido = inscripcion.referido;
  usuario.cartones = [];

  mostrarVentana('cantidad');
  actualizarPreseleccion();
}

// ==================== FUNCIOS DEL PANEL ADMIN ====================
async function cargarPanelAdmin() {
await Promise.all([
  obtenerTotalCartones(),
  obtenerMontoTotalRecaudado(),
  contarCartonesVendidos(),
  cargarModoCartonesAdmin(),
  cargarPromocionesAdmin()
]);

cartonesOcupados = await fetchTodosLosOcupados();
  
 
  const { data, error } = await supabase
    .from('inscripciones')
    .select(`
      id,
      nombre,
      telefono,
      cedula,
      referido,
      cartones,
      referencia4dig,
      comprobante,
      pago_banco,
      pago_telefono,
      pago_cedula,
      estado
    `)
  .eq('site_id', SITE_ID)
    .order('id', { ascending: false });

  if (error) {
    errorSeguro(error);
    return alert('Error cargando inscripciones');
  }

  const tbody = document.querySelector('#tabla-comprobantes tbody');
  tbody.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.dataset.estadoActual = item.estado || 'pendiente';
    tr.dataset.inscripcionId = item.id;
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td>
        <a href="${buildWhatsAppLink(item.telefono, mensajeWhatsappAdminCliente(item))}"
           target="_blank" rel="noopener">
          ${item.telefono}
        </a>
      </td>
      <td>${item.cedula}</td>
      <td>${item.referido}</td>
      <td>${Array.isArray(item.cartones) ? item.cartones.join(', ') : ''}</td>
      <td class="celda-ref" data-id="${item.id}">
        <span class="ref-text">${item.referencia4dig || ''}</span>
        <button class="btn-accion btn-edit-ref" title="Editar">&#9998;</button>
      </td>
      <td><a href="${item.comprobante}" target="_blank">
            <img src="${item.comprobante}" alt="Comp." loading="lazy">
          </a></td>
          <td class="pago-ganador-admin">
  <strong>${item.pago_banco || 'Sin banco'}</strong><br>
  📱 ${item.pago_telefono || 'Sin número'}<br>
  🪪 ${item.pago_cedula || 'Sin cédula'}
   <button
    class="btn-copiar-pago"
    onclick="copiarPagoMovil(
      '${item.pago_banco || ''}',
      '${item.pago_telefono || ''}',
      '${item.pago_cedula || ''}'
    )">
    📋 Copiar
  </button>
</td>
      <td>
        <span class="estado-circulo ${
  item.estado === 'aprobado'
    ? 'verde'
    : item.estado === 'rechazado'
      ? 'naranja'
      : 'rojo'
}"></span>
        <button class="btn-accion btn-aprobar" title="Aprobar">&#x2705;</button>
        <button class="btn-accion btn-rechazar" title="Rechazar">&#x274C;</button>
        <button class="btn-accion btn-eliminar" title="Eliminar">&#x1F5D1;</button>
      </td>
    `;

    const btnAprobar = tr.querySelector('.btn-aprobar');
    const btnRechazar = tr.querySelector('.btn-rechazar');
    const btnEliminar = tr.querySelector('.btn-eliminar');
    const btnEditRef = tr.querySelector('.btn-edit-ref');

   btnAprobar.onclick = () => procesarEstadoUnaVez(
  item.id,
  tr,
  'aprobado',
  () => aprobarInscripcion(item.id, tr)
);

btnRechazar.onclick = () => procesarEstadoUnaVez(
  item.id,
  tr,
  'rechazado',
  () => rechazarInscripcion(item, tr)
);
    btnEliminar.onclick = () => eliminarInscripcion(item, tr);
    btnEditRef.onclick = () => editarReferencia(tr.querySelector('.celda-ref'));
    
  

    tbody.appendChild(tr);
  });

  document.getElementById('contador-clientes').textContent = data.length;
  document.getElementById('contadorCartones').innerText = 
    `Cartones disponibles: ${totalCartones - cartonesOcupados.length} de ${totalCartones}`;
  const pendientes = data.filter(item => item.estado === 'pendiente').length;
document.getElementById('pendientes-count').textContent = pendientes;
}
document.getElementById('btn-recargar-panel').addEventListener('click', () => {
  cargarPanelAdmin(); 
  mostrarBotonPanelMaster();// Llama directamente a la función que refresca el contenido
});

async function aprobarInscripcion(id, fila) {
  const puedeCambiar = await confirmarCambioEstado(id, 'aprobado');
  if (!puedeCambiar) return false;

  // Buscar inscripción actual
  const { data: actual, error: errorActual } = await supabase
    .from('inscripciones')
    .select('cartones,nombre')
    .eq('id', id)
  .eq('site_id', SITE_ID)
    .single();

  if (errorActual || !actual) {
    alert('No se pudo verificar la inscripción');
    return false;
  }

  const misCartones = (actual.cartones || []).map(String);

  // Buscar aprobados
  const { data: aprobados, error: errorAprobados } = await supabase
    .from('inscripciones')
    .select('id,nombre,cartones')
    .eq('estado', 'aprobado')
  .eq('site_id', SITE_ID)
    .neq('id', id);

  if (errorAprobados) {
    alert('No se pudieron verificar duplicados');
    return false;
  }

  const duplicados = [];

  (aprobados || []).forEach(ins => {
    const otros = (ins.cartones || []).map(String);

    misCartones.forEach(c => {
      if (otros.includes(c)) {
        duplicados.push({
          carton: c,
          nombre: ins.nombre
        });
      }
    });
  });

  if (duplicados.length > 0) {
    const mensaje = duplicados
      .map(d => `Cartón ${d.carton} ya aprobado para ${d.nombre}`)
      .join('\n');

    alert(
      '⚠️ No se puede aprobar.\n\n' +
      mensaje
    );

    return false;
  }

  // Aprobar
  const { error } = await supabase
    .from('inscripciones')
    .update({ estado: 'aprobado' })
  .eq('site_id', SITE_ID)
    .eq('id', id);

  if (error) {
    errorSeguro(error);
    alert('No se pudo aprobar');
    return false;
  }

  const circulo = fila.querySelector('.estado-circulo');
  if (circulo) {
    circulo.classList.remove('rojo', 'naranja');
    circulo.classList.add('verde');
  }

  fila.dataset.estadoActual = 'aprobado';

  alert('¡Inscripción aprobada!');
  return true;
}
async function confirmarCambioEstado(id, nuevoEstado) {
  const { data } = await supabase
    .from('inscripciones')
    .select('estado')
    .eq('id', id)
  .eq('site_id', SITE_ID)
    .single();

  if (!data) return false;

  if (data.estado !== 'pendiente' && data.estado !== nuevoEstado) {
    return confirm(`Esta inscripción está ${data.estado}. ¿Seguro quieres cambiarla a ${nuevoEstado}?`);
  }

  return true;
}
async function rechazarInscripcion(item, fila) {
  const puedeCambiar = await confirmarCambioEstado(item.id, 'rechazado');
  if (!puedeCambiar) return false;

  const confirma = confirm('¿Seguro que deseas rechazar, seguirá estando ocupado hasta que lo elimines?');
  if (!confirma) return false;

  const { error: errUpd } = await supabase
    .from('inscripciones')
    .update({ estado: 'rechazado' })
  .eq('site_id', SITE_ID)
    .eq('id', item.id);

  if (errUpd) {
    errorSeguro(errUpd);
    alert('Error actualizando inscripción');
    return false;
  }

  const circulo = fila.querySelector('.estado-circulo');
  if (circulo) {
    circulo.classList.remove('rojo', 'verde');
    circulo.classList.add('naranja');
  }

  fila.dataset.estadoActual = 'rechazado';

  alert('Inscripción rechazada');
  return true;
}
function obtenerRutaComprobanteDesdeUrl(url) {
  if (!url) return null;

  try {
    const texto = String(url);

    // URL pública normal:
    // .../storage/v1/object/public/comprobantes/golden/archivo.webp
    const parte = texto.split('/storage/v1/object/public/comprobantes/')[1];

    if (parte) {
      return decodeURIComponent(parte.split('?')[0]);
    }

    // Respaldo por si solo viene el nombre del archivo
    const nombreArchivo = texto.split('/').pop()?.split('?')[0];

    if (!nombreArchivo) return null;

    // Si ya viene con carpeta, lo deja igual
    if (nombreArchivo.includes('/')) return nombreArchivo;

    // Si viene solo archivo.webp, intenta dentro del sitio actual
    return `${SITE_SLUG}/${nombreArchivo}`;

  } catch (error) {
    errorSeguro('Error obteniendo ruta del comprobante:', error);
    return null;
  }
}

async function eliminarInscripcion(item, fila) {
  if (!SITE_ID || !SITE_SLUG) {
    alert('Error: sitio no identificado.');
    return;
  }

  const confirmar = confirm('¿Eliminar esta inscripción? Se liberarán solo los cartones que nadie más tenga.');
  if (!confirmar) return;

  try {
    const { data, error } = await supabase.rpc('rpc_eliminar_inscripcion_seguro', {
      _site_id: SITE_ID,
      _id: item.id
    });

    if (error) throw error;

    if (item.comprobante) {
      const rutaComprobante = obtenerRutaComprobanteDesdeUrl(item.comprobante);

      if (rutaComprobante) {
        const rutasIntento = [...new Set([
          rutaComprobante,
          rutaComprobante.split('/').pop()
        ].filter(Boolean))];

        const { error: errorStorage } = await supabase.storage
          .from('comprobantes')
          .remove(rutasIntento);

        if (errorStorage) {
          warnSeguro('No se pudo eliminar el comprobante del storage:', errorStorage);
        }
      }
    }

    if (fila) fila.remove();

    await contarCartonesVendidos();
    await obtenerMontoTotalRecaudado();
    await cargarCartones();

    alert(`Inscripción eliminada. Cartones liberados: ${data ?? 0}`);

  } catch (e) {
    errorSeguro(e);
    alert('Error al eliminar inscripción.');
  }
}

async function cerrarVentas() {
  const confirmacion = confirm("¿Estás seguro que quieres cerrar las ventas?");
  if (!confirmacion) return;

  const ok = await setConfigValue('ventas_abierta', 'false');

  if (!ok) {
    alert("Error al cerrar las ventas");
    return;
  }

  if (sitioActual) sitioActual.ventas_abiertas = false;

  alert("Ventas cerradas correctamente");
  location.reload();
}

async function abrirVentas() {
  const confirmacion = confirm("¿Estás seguro que quieres abrir las ventas?");
  if (!confirmacion) return;

  const ok = await setConfigValue('ventas_abierta', 'true');

  if (!ok) {
    alert("Error al abrir las ventas");
    return;
  }

  if (sitioActual) sitioActual.ventas_abiertas = true;

  alert("Ventas abiertas correctamente");
  location.reload();
}

async function reiniciarTodo() {
  if (!SITE_ID || !SITE_SLUG) {
    alert('❌ No se pudo identificar el sitio actual.');
    return;
  }

  if (!confirm('⚠️ ¿Estás seguro de reiniciar este sitio?\n\nEsto borrará inscripciones, cartones y comprobantes de ESTE sitio.')) {
    return;
  }

  const claveIngresada = prompt('🔒 INGRESA LA CLAVE DE SEGURIDAD PARA CONTINUAR:');

  if (!claveIngresada) {
    alert('❌ Operación cancelada. No se ingresó clave.');
    return;
  }

  const claveCorrecta = await getConfigValue('clave_reinicio', null);

  if (!claveCorrecta) {
    alert('❌ Error del sistema. No se pudo verificar la clave de reinicio.');
    return;
  }

  if (claveIngresada.trim() !== String(claveCorrecta).trim()) {
    alert('❌ CLAVE INCORRECTA\n\nOperación cancelada por seguridad.');
    return;
  }

  if (!confirm('🔥 ÚLTIMA CONFIRMACIÓN\n\n¿Estás ABSOLUTAMENTE seguro?\n\nEsto NO se puede deshacer.')) {
    alert('✅ Operación cancelada.');
    return;
  }

  // 1) Borrar comprobantes primero, antes de borrar las inscripciones.
  // Así, si Storage falla, no se pierden las referencias en la tabla.
  let totalEliminados = 0;
  const pageSize = 1000;

  while (true) {
    const { data: files, error: listErr } = await supabase.storage
      .from('comprobantes')
      .list(SITE_SLUG, {
        limit: pageSize,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (listErr) {
      alert('❌ Error listando comprobantes. No se reinició nada: ' + listErr.message);
      return;
    }

    if (!files || files.length === 0) break;

    const names = files
      .filter(f => f && f.name)
      .map(f => `${SITE_SLUG}/${f.name}`);

    if (names.length === 0) break;

    const { error: delErr } = await supabase.storage
      .from('comprobantes')
      .remove(names);

    if (delErr) {
      alert('❌ Error eliminando comprobantes. No se reinició nada: ' + delErr.message);
      return;
    }

    totalEliminados += names.length;

    if (files.length < pageSize) break;
  }

  // 2) Borrar inscripciones solo de este sitio
  const { error: errorInscripciones } = await supabase
    .from('inscripciones')
    .delete()
    .eq('site_id', SITE_ID)
    .gte('id', 0);

  if (errorInscripciones) {
    alert('❌ Los comprobantes se borraron, pero hubo error eliminando inscripciones: ' + errorInscripciones.message);
    return;
  }

  // 3) Borrar cartones solo de este sitio
  const { error: errorCartones } = await supabase
    .from('cartones')
    .delete()
    .eq('site_id', SITE_ID)
    .gte('numero', 1);

  if (errorCartones) {
    alert('❌ Error eliminando cartones: ' + errorCartones.message);
    return;
  }

  // 4) Opcional: borrar ganadores solo de este sitio
  const { error: errorGanadores } = await supabase
    .from('ganadores')
    .delete()
    .eq('site_id', SITE_ID)
    .gte('id', 0);

  if (errorGanadores) {
    warnSeguro('No se pudieron borrar ganadores:', errorGanadores);
  }

  usuario.cartones = [];
  cartonesOcupados = [];

  alert(`✅ Sitio reiniciado correctamente.\n\nComprobantes eliminados: ${totalEliminados}`);
  location.reload();
}

// ==================== FUNCIONES DE MODAL ====================
let cartonSeleccionadoTemporal = null;
let cartonElementoTemporal = null;

function abrirModalCarton(numero, elemento) {
  if (modoCartonSimple) {
    toggleCarton(numero, elemento);
    return;
  }

  cartonSeleccionadoTemporal = numero;
  cartonElementoTemporal = elemento;
  const img = document.getElementById('imagen-carton-modal');
  img.src = urlCartonWebP(numero);
img.loading = 'lazy';
img.alt = `Cartón ${numero}`;

  document.getElementById('modal-carton').classList.remove('oculto');

  const btn = document.getElementById('btnSeleccionarCarton');
  btn.onclick = async () => {
  await toggleCarton(cartonSeleccionadoTemporal, cartonElementoTemporal);
  cerrarModalCarton();
};
}

function cerrarModalCarton() {
  document.getElementById('modal-carton').classList.add('oculto');
  cartonSeleccionadoTemporal = null;
  cartonElementoTemporal = null;
}

function actualizarContadorCartones(total, ocupados, seleccionados) {
  const disponibles = Math.max(0, total - ocupados - seleccionados);
  const contador = document.getElementById('contadorCartones');

  if (contador) {
    contador.textContent = `Cartones disponibles: ${disponibles} de ${total}`;
  }
}

// ==================== FUNCIONES AUXILIARES ====================
async function guardarNuevoTotal() {
  const input = document.getElementById("nuevoTotalCartones");
  const estado = document.getElementById("estadoTotalCartones");

  const nuevoTotal = parseInt(input?.value, 10);

  if (isNaN(nuevoTotal) || nuevoTotal < 1) {
    if (estado) estado.textContent = "Número inválido.";
    return;
  }

  if (!SITE_ID) {
    if (estado) estado.textContent = "Error: sitio no identificado.";
    return;
  }

  try {
    if (estado) estado.textContent = "Guardando cartones visibles...";

    const { data, error } = await supabase.rpc('rpc_set_cartones_visibles_sitio', {
      _site_id: SITE_ID,
      _cartones_visibles: nuevoTotal
    });

    if (error) {
      throw error;
    }

    if (data !== true) {
      throw new Error('No se pudo actualizar.');
    }

    totalCartones = nuevoTotal;

    if (sitioActual) {
      sitioActual.cartones_visibles = nuevoTotal;
    }

    if (estado) estado.textContent = "✅ Cartones visibles actualizados.";

    await cargarCartones();
    await contarCartonesVendidos();

  } catch (error) {
    errorSeguro('Error guardando cartones visibles:', error);

    if (estado) {
      estado.textContent = error.message || "Error al actualizar.";
    }
  }
}
async function cargarPromocionesConfig() {
  try {
    for (let i = 0; i < promociones.length; i++) {
      const promo = promociones[i];
      const prefix = `promo${i + 1}`;
      
      promo.activa = (await getConfigValue(`${prefix}_activa`, 'false')) === 'true';
      promo.descripcion = await getConfigValue(`${prefix}_descripcion`, `Promo ${i + 1}`);
      promo.cantidad = parseInt(await getConfigValue(`${prefix}_cantidad`, '0')) || 0;
      promo.precio = parseFloat(await getConfigValue(`${prefix}_precio`, '0')) || 0;
    }
    
    logSeguro('Promociones cargadas:', promociones);
    renderizarBotonesPromociones();
  } catch (error) {
    errorSeguro('Error cargando promociones:', error);
  }
}

async function cargarPromocionesAdmin() {
  const estado = document.getElementById('estadoPromociones');

  try {
    await cargarMostrarPromocionesSitio();
    aplicarEstadoPromocionesAdminPanel();

    if (!mostrarPromocionesSitio) {
      if (estado) {
        estado.textContent = '🚫 Promociones deshabilitadas por el master para este sitio.';
        estado.style.color = '#dc3545';
      }
      return;
    }

    if (estado) {
      estado.textContent = '';
      estado.style.color = '';
    }

    for (let i = 1; i <= 4; i++) {
      const activa = document.getElementById(`promo${i}_activa`);
      const descripcion = document.getElementById(`promo${i}_descripcion`);
      const cantidad = document.getElementById(`promo${i}_cantidad`);
      const precio = document.getElementById(`promo${i}_precio`);

      if (activa) activa.checked = (await getConfigValue(`promo${i}_activa`, 'false')) === 'true';
      if (descripcion) descripcion.value = await getConfigValue(`promo${i}_descripcion`, '');
      if (cantidad) cantidad.value = parseInt(await getConfigValue(`promo${i}_cantidad`, '0'), 10) || '';
      if (precio) precio.value = parseFloat(await getConfigValue(`promo${i}_precio`, '0')) || '';
    }
  } catch (error) {
    errorSeguro('Error cargando promociones en admin:', error);
  }
}

async function guardarPromociones() {
  const estado = document.getElementById('estadoPromociones');

  if (!SITE_ID) {
    if (estado) {
      estado.textContent = 'Error: sitio no identificado';
      estado.style.color = 'red';
    }
    return;
  }

  await cargarMostrarPromocionesSitio();
  aplicarEstadoPromocionesAdminPanel();

  if (!mostrarPromocionesSitio) {
    if (estado) {
      estado.textContent = '🚫 No se pueden guardar promociones: están deshabilitadas por el master.';
      estado.style.color = '#dc3545';
    }
    return;
  }

  try {
    for (let i = 1; i <= 4; i++) {
      const activa = document.getElementById(`promo${i}_activa`)?.checked || false;
      const desc = document.getElementById(`promo${i}_descripcion`)?.value.trim() || '';
      const cant = parseInt(document.getElementById(`promo${i}_cantidad`)?.value, 10) || 0;
      const precio = parseFloat(document.getElementById(`promo${i}_precio`)?.value) || 0;

      const resultados = await Promise.all([
        setConfigValue(`promo${i}_activa`, String(activa)),
        setConfigValue(`promo${i}_descripcion`, desc),
        setConfigValue(`promo${i}_cantidad`, String(cant)),
        setConfigValue(`promo${i}_precio`, String(precio))
      ]);

      if (resultados.some(ok => !ok)) {
        throw new Error(`No se pudo guardar la promoción ${i}`);
      }
    }

    if (estado) {
      estado.textContent = '✅ Todas las promociones guardadas correctamente';
      estado.style.color = 'green';
    }

    await cargarPromocionesConfig();

    setTimeout(() => {
      if (estado) estado.textContent = '';
    }, 3000);

  } catch (error) {
    errorSeguro('Error guardando promociones:', error);

    if (estado) {
      estado.textContent = 'Error inesperado al guardar';
      estado.style.color = 'red';
    }
  }
}

function seleccionarPromocion(numero) {
  if (!mostrarPromocionesSitio) {
    promocionSeleccionada = null;
    return;
  }

  const promo = promociones[numero - 1];
  
  if (!promo.activa || promo.cantidad <= 0 || promo.precio <= 0) {
    alert('Esta promoción no está disponible en este momento.');
    return;
  }
  
  const ocupadosValidos = cartonesOcupados
  .map(Number)
  .filter(n => n >= 1 && n <= totalCartones).length;

const maxDisponibles = Math.max(0, totalCartones - ocupadosValidos);
  if (promo.cantidad > maxDisponibles) {
    alert(`No hay suficientes cartones disponibles para esta promoción. Disponibles: ${maxDisponibles}`);
    return;
  }
  
  if (promocionSeleccionada === numero) {
    deseleccionarPromocion();
    return;
  }
  
  promocionSeleccionada = numero;
  
  document.querySelectorAll('.btn-promo').forEach(btn => {
    btn.classList.remove('seleccionado');
  });
  
  const botonSeleccionado = document.querySelector(`[data-promo="${numero}"]`);
  if (botonSeleccionado) {
    botonSeleccionado.classList.add('seleccionado');
  }
  
  document.getElementById('cantidadCartones').value = promo.cantidad;
  actualizarPreseleccion();
}

function deseleccionarPromocion() {
  promocionSeleccionada = null;
  document.querySelectorAll('.btn-promo').forEach(btn => {
    btn.classList.remove('seleccionado');
  });
  document.getElementById('cantidadCartones').value = 1;
  actualizarPreseleccion();
}

function getPromocionSeleccionada() {
  if (!mostrarPromocionesSitio) return null;
  return promocionSeleccionada ? promociones[promocionSeleccionada - 1] : null;
}

// ==================== FUNCIONES RESTANTES ====================
function mostrarSeccion(id, guardarHistorial = true) {
  const secciones = document.querySelectorAll('section');
  secciones.forEach(sec => sec.classList.add('oculto'));
  const target = document.getElementById(id);
  if (target) {
    target.classList.remove('oculto');
    ventanaActual = id;

    if (guardarHistorial && !navegandoConBotonAtras) {
      registrarHistorialVentana(id);
    }
  }
  
    if (id === 'ganadores') {
    cargarGanadores();
  }
  
  const redes = document.getElementById('redes-sociales');
  if (redes) {
    redes.style.display = id === 'inicio' ? 'flex' : 'none';
  }
}

async function cargarListaAprobadosSeccion() {
  const { data, error } = await supabase.rpc('rpc_public_lista_aprobados', {
    _site_id: SITE_ID
  });

  const contenedor =
    document.getElementById('contenedor-aprobados') ||
    document.getElementById('listaAprobados');

  if (!contenedor) return;

  contenedor.innerHTML = '';

  if (error) {
    errorSeguro('Error cargando lista pública:', error);
    contenedor.innerHTML = '<p>Error cargando lista de aprobados.</p>';
    return;
  }

  const lista = data || [];

  if (lista.length === 0) {
    contenedor.innerHTML = '<p>No hay compras aprobadas todavía.</p>';
    return;
  }

  const tabla = document.createElement('table');

  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Cartones</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = tabla.querySelector('tbody');

  lista.forEach(item => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${item.nombre || 'Sin nombre'}</td>
      <td>${Array.isArray(item.cartones) ? item.cartones.join(', ') : ''}</td>
    `;

    tbody.appendChild(tr);
  });

  contenedor.appendChild(tabla);
}

function actualizarHoraVenezuela() {
  const contenedor = document.getElementById('hora-venezuela');
  if (!contenedor) return;

  const opciones = {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  };

  const ahora = new Date();
  const formato = new Intl.DateTimeFormat('es-VE', opciones).format(ahora);
  contenedor.textContent = `📅 ${formato}`;
}

async function guardarLinkWhatsapp() {
  const link = document.getElementById('inputWhatsapp')?.value.trim();

  if (!link) {
    alert('Ingresa un enlace válido');
    return;
  }

  const ok = await setConfigValue('link_whatsapp', link);

  if (!ok) {
    alert('Error guardando el enlace');
    return;
  }

  alert('Enlace guardado');

  const btn = document.getElementById('btnWhatsapp');
  if (btn) {
    btn.href = link;
    btn.style.display = 'inline-block';
  }
}

async function cargarLinkWhatsapp() {
  const linkConfig = await getConfigValue('link_whatsapp', null);

  const btn = document.getElementById('btnWhatsapp');
  if (!btn) return;

  const linkFinal = linkConfig || sitioActual?.whatsapp_grupo || '';

  if (!linkFinal) {
    btn.style.display = 'none';
    return;
  }

  btn.href = linkFinal;
  btn.style.display = 'inline-block';
}

function cerrarTerminos() {
  document.getElementById('modal-terminos')?.classList.add('oculto');
}

async function guardarLinkYoutube() {
  const link = document.getElementById("inputYoutube")?.value.trim();

  if (!link) {
    alert("Ingresa un enlace válido de YouTube.");
    return;
  }

  const ok = await setConfigValue('youtube_live', link);

  if (!ok) {
    alert("Error al guardar el enlace de YouTube.");
    return;
  }

  alert("Enlace de YouTube guardado exitosamente.");
}

async function cargarConfiguracionModoCartones() {
  const modoGuardado = await getConfigValue('modo_cartones', sitioActual?.modo_cartones || 'libre');
  modoCartones = modoGuardado || 'libre';

  const inputCantidad = document.getElementById('cantidadCartones');
  const btnMas = document.getElementById('btnMas');
  const btnMenos = document.getElementById('btnMenos');

  if (modoCartones === "fijo") {
    const cantidadGuardada = await getConfigValue(
      'cartones_obligatorios',
      String(sitioActual?.cantidad_fija_cartones || 1)
    );

    cantidadFijaCartones = parseInt(cantidadGuardada, 10) || 1;

    if (inputCantidad) {
      inputCantidad.value = cantidadFijaCartones;
      inputCantidad.readOnly = true;
    }

    if (btnMas) btnMas.disabled = true;
    if (btnMenos) btnMenos.disabled = true;

  } else {
    if (inputCantidad) inputCantidad.readOnly = false;
    if (btnMas) btnMas.disabled = false;
    if (btnMenos) btnMenos.disabled = false;
  }
}

async function cargarModoCartonesAdmin() {
  const modoGuardado = await getConfigValue('modo_cartones', sitioActual?.modo_cartones || 'libre');

  const selectModo = document.getElementById('modoCartonesSelect');
  const contenedorFijos = document.getElementById('contenedorCartonesFijos');
  const inputFijos = document.getElementById('cantidadCartonesFijos');

  if (selectModo) {
    selectModo.value = modoGuardado || 'libre';
  }

  if (modoGuardado === 'fijo') {
    const cantidadGuardada = await getConfigValue(
      'cartones_obligatorios',
      String(sitioActual?.cantidad_fija_cartones || 1)
    );

    if (inputFijos) {
      inputFijos.value = cantidadGuardada || '1';
    }

    if (contenedorFijos) {
      contenedorFijos.style.display = 'block';
    }

  } else {
    if (contenedorFijos) {
      contenedorFijos.style.display = 'none';
    }
  }
}
function cambiarModoCartones() {
  const modo = document.getElementById('modoCartonesSelect').value;
  const contenedor = document.getElementById('contenedorCartonesFijos');
  contenedor.style.display = (modo === 'fijo') ? 'block' : 'none';
  
  if (modo === 'fijo') {
    const cantidad = document.getElementById('cantidadCartonesFijos').value || 1;
    document.getElementById('btnMas').disabled = true;
    document.getElementById('btnMenos').disabled = true;
    document.getElementById('cantidadCartones').readOnly = true;
  } else {
    document.getElementById('btnMas').disabled = false;
    document.getElementById('btnMenos').disabled = false;
    document.getElementById('cantidadCartones').readOnly = false;
  }
}

async function guardarModoCartones() {
  const modo = document.getElementById('modoCartonesSelect')?.value || 'libre';
  const cantidadInput = document.getElementById('cantidadCartonesFijos');
  const cantidad = parseInt(cantidadInput?.value, 10);

  if (!SITE_ID) {
    alert('Error: sitio no identificado.');
    return;
  }

  if (modo === 'fijo') {
    if (isNaN(cantidad) || cantidad < 1) {
      alert('Cantidad fija inválida');
      return;
    }
  }

  const okModo = await setConfigValue('modo_cartones', modo);

  if (!okModo) {
    alert('Error guardando modo de cartones');
    return;
  }

  if (modo === 'fijo') {
    const okCantidad = await setConfigValue('cartones_obligatorios', String(cantidad));

    if (!okCantidad) {
      alert('Error guardando cantidad fija');
      return;
    }

    cantidadFijaCartones = cantidad;

    if (sitioActual) {
      sitioActual.cantidad_fija_cartones = cantidad;
    }
  }

  modoCartones = modo;

  if (sitioActual) {
    sitioActual.modo_cartones = modo;
  }

  alert('Modo actualizado correctamente');

  await cargarConfiguracionModoCartones();
  await cargarModoCartonesAdmin();
}

async function guardarGanador() {
  if (!SITE_ID) {
    alert('Error: sitio no identificado.');
    return;
  }

  const nombre = document.getElementById('ganadorNombre').value.trim();
  const cedula = document.getElementById('ganadorCedula').value.trim();
  const cartones = document.getElementById('ganadorCartones').value.trim();
  const premio = document.getElementById('ganadorPremio').value.trim();
  const telefono = document.getElementById('ganadorTelefono').value.trim();
  const fecha = document.getElementById('ganadorFecha').value.trim();

  if (!nombre || !cedula || !cartones || !premio || !telefono || !fecha) {
    return alert("Completa todos los campos del ganador.");
  }

  const { error } = await supabase
    .from('ganadores')
    .insert([{
      site_id: SITE_ID,
      nombre,
      cedula,
      cartones,
      premio,
      telefono,
      fecha
    }]);

  if (error) {
    errorSeguro(error);
    alert("Error al guardar el ganador.");
    return;
  }

  alert("¡Ganador guardado correctamente!");
  document.getElementById('formularioGanador')?.reset();
  await cargarGanadores();
}

async function cargarGanadores() {
  if (!SITE_ID) return;

  const { data, error } = await supabase
    .from('ganadores')
    .select('*')
    .eq('site_id', SITE_ID)
    .order('id', { ascending: false });

  const contenedor = document.getElementById('listaGanadores');
  if (!contenedor) return;

  contenedor.innerHTML = '';

  if (error || !data || !data.length) {
    contenedor.innerHTML = '<p>No hay ganadores registrados aún.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';

  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Nombre</th>
        <th>Cédula</th>
        <th>Cartones</th>
        <th>Premio</th>
        <th>Teléfono</th>
        <th>Fecha</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(g => `
        <tr>
          <td>${g.nombre || ''}</td>
          <td>${g.cedula || ''}</td>
          <td>${g.cartones || ''}</td>
          <td>${g.premio || ''}</td>
          <td>${g.telefono || ''}</td>
          <td>${g.fecha || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  `;

  contenedor.appendChild(tabla);
}

function toggleFormularioGanador() {
  const contenedor = document.getElementById('formularioGanadorContenedor');
  contenedor.style.display = contenedor.style.display === 'none' ? 'block' : 'none';
}

async function activarCohetes() {
  if (!SITE_ID) {
    alert('Error: sitio no identificado.');
    return;
  }

  try {
    // IMPORTANTE:
    // Primero lo apagamos y luego lo encendemos con un valor único.
    // Así Realtime dispara el evento aunque ya estuviera en true.
    await setConfigValue('cohetes_activados', 'false');

    await new Promise(resolve => setTimeout(resolve, 350));

    const ok = await setConfigValue('cohetes_activados', `true:${Date.now()}`);

    if (!ok) {
      alert('Error activando cohetes');
      return;
    }

    alert('¡Cohetes activados!');
  } catch (error) {
    errorSeguro('Error activando cohetes:', error);
    alert('Error activando cohetes');
  }
}

function ordenarInscripcionesPorNombre() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const nombreA = a.cells[0].textContent.trim().toLowerCase();
    const nombreB = b.cells[0].textContent.trim().toLowerCase();
    return nombreA.localeCompare(nombreB);
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
}

let ordenCedulaAscendente = true;

function ordenarPorCedula() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const cedulaA = parseInt(a.cells[2].textContent.trim());
    const cedulaB = parseInt(b.cells[2].textContent.trim());
    return ordenCedulaAscendente ? cedulaA - cedulaB : cedulaB - cedulaA;
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
  ordenCedulaAscendente = !ordenCedulaAscendente;
}

let ordenReferenciaAscendente = false;
function ordenarPorReferencia() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const refA = a.cells[5].textContent.trim();
    const refB = b.cells[5].textContent.trim();
    const numA = parseInt(refA) || 0;
    const numB = parseInt(refB) || 0;
    return ordenReferenciaAscendente ? numA - numB : numB - numA;
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
  ordenReferenciaAscendente = !ordenReferenciaAscendente;
}

function ordenarPendientesArriba() {
  const tabla = document.querySelector('#tabla-comprobantes tbody');
  if (!tabla) return;

  const filas = Array.from(tabla.rows);

  filas.sort((a, b) => {
    const estadoA = String(a.dataset.estadoActual || '').toLowerCase();
    const estadoB = String(b.dataset.estadoActual || '').toLowerCase();

    const prioridadA = estadoA === 'pendiente' ? 0 : 1;
    const prioridadB = estadoB === 'pendiente' ? 0 : 1;

    if (prioridadA !== prioridadB) {
      return prioridadA - prioridadB;
    }

    const idA = parseInt(a.dataset.inscripcionId || '0', 10) || 0;
    const idB = parseInt(b.dataset.inscripcionId || '0', 10) || 0;

    return idB - idA;
  });

  tabla.innerHTML = '';
  filas.forEach(fila => tabla.appendChild(fila));
}


// ==================== WHATSAPP ADMIN: NOMBRE DEL BINGO DINÁMICO ====================
// Cuando el admin toca el teléfono de un cliente, el mensaje usa el nombre
// del bingo actual y no un nombre fijo para todos los sitios.
function obtenerNombreBingoMensaje() {
  const nombre =
    sitioActual?.titulo_publico ||
    sitioActual?.nombre ||
    SITE_SLUG ||
    'este bingo';

  return String(nombre).trim() || 'este bingo';
}

function mensajeWhatsappAdminCliente(item = {}) {
  const nombreCliente = String(item?.nombre || '').trim();
  const nombreBingo = obtenerNombreBingoMensaje();

  if (nombreCliente) {
    return `Hola ${nombreCliente}, te escribo de parte del equipo de ${nombreBingo}.`;
  }

  return `Hola, te escribo de parte del equipo de ${nombreBingo}.`;
}

function buildWhatsAppLink(rawPhone, presetMsg = '') {
  if (!rawPhone) return null;

  let s = String(rawPhone).trim().replace(/[\s\-\.\(\)]/g, '');

  if (s.startsWith('00')) s = '+' + s.slice(2);

  if (!s.startsWith('+')) {
    const digits = s.replace(/\D+/g, '');
    const m = /^(0?)(412|414|416|424|426)(\d{7})$/.exec(digits);
    if (m) {
      s = '+58' + m[2] + m[3];
    } else {
      s = '+' + digits;
    }
  }

  const waNumber = s.replace(/^\+/, '');
  const text = encodeURIComponent(presetMsg || `Hola, te escribo de parte del equipo de ${obtenerNombreBingoMensaje()}.`);
  return `https://wa.me/${waNumber}?text=${text}`;
}

async function fetchTodosLosOcupados() {
  if (!SITE_ID) return [];

  const { data, error } = await supabase.rpc('rpc_public_cartones_ocupados', {
    _site_id: SITE_ID,
    _total: totalCartones
  });

  if (error) {
    errorSeguro('Error cargando cartones ocupados por RPC:', error);
    return [];
  }

  return (data || [])
    .map(c => Number(c.numero))
    .filter(Number.isFinite);
}

function restringirSolo4Digitos(input) {
  input.value = input.value.replace(/\D+/g, '').slice(0, 4);
}

function editarReferencia(td) {
  const id   = td.getAttribute('data-id');
  const prev = (td.querySelector('.ref-text')?.textContent || '').trim();

  td.innerHTML = `
    <input class="ref-input" type="text" maxlength="4" value="${prev}">
    <button class="btn-mini btn-guardar">Guardar</button>
    <button class="btn-mini btn-cancelar">Cancelar</button>
  `;

  const inp     = td.querySelector('.ref-input');
  const btnOk   = td.querySelector('.btn-guardar');
  const btnCancel = td.querySelector('.btn-cancelar');

  inp.addEventListener('input', () => restringirSolo4Digitos(inp));
  inp.focus();
  inp.select();

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnOk.click();
    if (e.key === 'Escape') btnCancel.click();
  });

  btnOk.onclick = async () => {
    const val = (inp.value || '').trim();
    if (!/^\d{4}$/.test(val)) {
      alert('La referencia debe tener exactamente 4 dígitos (0000–9999).');
      inp.focus();
      return;
    }

    const { error } = await supabase
      .from('inscripciones')
      .update({ referencia4dig: val })
    .eq('site_id', SITE_ID)
      .eq('id', id);

    if (error) {
      errorSeguro(error);
      alert('No se pudo guardar la referencia.');
      return;
    }

    td.innerHTML = `
      <span class="ref-text">${val}</span>
      <button class="btn-accion btn-edit-ref" title="Editar">&#9998;</button>
    `;
    td.querySelector('.btn-edit-ref').onclick = () => editarReferencia(td);
  };

  btnCancel.onclick = () => {
    td.innerHTML = `
      <span class="ref-text">${prev}</span>
      <button class="btn-accion btn-edit-ref" title="Editar">&#9998;</button>
    `;
    td.querySelector('.btn-edit-ref').onclick = () => editarReferencia(td);
  };
}

function normalizarNombre(s='') {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function solo4Digitos(s='') {
  const t = String(s).replace(/\D+/g, '').slice(0,4);
  return /^\d{4}$/.test(t) ? t : '';
}

async function fetchAprobadosBasico() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('id,nombre,cedula,telefono,cartones,referencia4dig')
  .eq('site_id', SITE_ID)
    .eq('estado','aprobado');
  if (error) {
    errorSeguro('Error cargando aprobados:', error);
    alert('No se pudieron cargar los aprobados.');
    return [];
  }
  return data || [];
}

function renderDuplicadosAprobados(lista, tipoClave) {
  const cont = document.getElementById('duplicadosAprobadosResultado');
  if (!cont) return;

  cont.innerHTML = '';

  if (!lista.length) {
    cont.innerHTML = `<p style="color:#4caf50;font-weight:600;">
      No se encontraron duplicados por ${tipoClave} entre los aprobados.
    </p>`;
    return;
  }

  lista.forEach((g, index) => {
    const card = document.createElement('div');
    card.className = 'duplicado-card';

    const titulo = tipoClave === 'nombre'
      ? `👤 Nombre: ${g.clave}`
      : `#️⃣ Referencia: ${g.clave}`;

    const detalleId = `dup-detalle-${tipoClave}-${index}`;

    card.innerHTML = `
      <div class="duplicado-header" onclick="toggleDuplicado('${detalleId}')">
        <span>${titulo}</span>
        <span>${g.items.length} veces ▼</span>
      </div>

      <div id="${detalleId}" class="duplicado-detalle">
        ${g.items.map(x => {
          const carts = Array.isArray(x.cartones) ? x.cartones.join(', ') : '';

          return `
            <div class="persona-item">
              <strong>${x.nombre || 'Sin nombre'}</strong><br>
              CI: ${x.cedula || 'N/A'}
              ${x.telefono ? `<br>Tel: ${x.telefono}` : ''}
              ${carts ? `<br>Cartones: ${carts}` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    cont.appendChild(card);
  });
}

function toggleDuplicado(id) {
  const detalle = document.getElementById(id);
  if (!detalle) return;

  detalle.style.display =
    detalle.style.display === 'block' ? 'none' : 'block';
}
async function detectarDuplicadosAprobadosPorNombre() {
  const rows = await fetchAprobadosBasico();
  const mapa = new Map();
  rows.forEach(r => {
    const k = normalizarNombre(r.nombre);
    if (!k) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  });
  
  const duplicados = [];
  const dupSet = new Set();
  for (const [k, arr] of mapa.entries()) {
    if (arr.length > 1) {
      duplicados.push({ clave: k, items: arr });
      dupSet.add(k);
    }
  }
  
  duplicados.sort((a,b) => (b.items.length - a.items.length) || a.clave.localeCompare(b.clave));
  renderDuplicadosAprobados(duplicados, 'nombre');
}

async function detectarDuplicadosAprobadosPorReferencia() {
  const rows = await fetchAprobadosBasico();
  const mapa = new Map();
  rows.forEach(r => {
    const ref = solo4Digitos(r.referencia4dig);
    if (!ref) return;
    if (!mapa.has(ref)) mapa.set(ref, []);
    mapa.get(ref).push(r);
  });
  
  const duplicados = [];
  for (const [ref, arr] of mapa.entries()) {
    if (arr.length > 1) duplicados.push({ clave: ref, items: arr });
  }
  
  duplicados.sort((a,b) => (b.items.length - a.items.length) || (a.clave.localeCompare(b.clave)));
  renderDuplicadosAprobados(duplicados, 'referencia');
}

function imprimirLista() {
  const lista = document.getElementById('listaAprobados');

  if (!lista || !lista.innerHTML.trim()) {
    alert('Primero debes generar la lista de aprobados.');
    return;
  }

  const ventana = window.open('', '_blank');

  ventana.document.write(`
    <html>
      <head>
        <title>Lista de Aprobados</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #000;
            padding: 00px;
          }

          h1 {
            text-align: center;
            font-size: 16px;
            margin: 0 0 4px 0;
          }

          .fecha {
            text-align: center;
            font-size: 9px;
            margin-bottom: 8px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 18px;
          }

          th, td {
            border: 1px solid #999;
            padding: 2px 3px;
            text-align: center;
            vertical-align: middle;
          }

          th {
            background: #eee;
            font-weight: bold;
          }

          @page {
            size: letter portrait;
            margin: 6mm;
          }
        </style>
      </head>
      <body>
        <h1>Lista de Aprobados</h1>
        <div class="fecha">${new Date().toLocaleString()}</div>
        ${lista.innerHTML}
      </body>
    </html>
  `);

  ventana.document.close();

  ventana.onload = function () {
    ventana.focus();
    ventana.print();
  };
}


// ==================== SUBIR CARTONES A STORAGE ====================

function limpiarSlugParaArchivo(slug) {
  return String(slug || 'sitio')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function obtenerNumeroCartonDesdeNombre(nombreArchivo) {
  const nombre = String(nombreArchivo || '');

  // Busca el último grupo de números en el nombre.
  // Ejemplo: SERIAL_BINGOGANGA_CARTON_00003.jpg => 00003
  const coincidencias = nombre.match(/\d+/g);

  if (!coincidencias || coincidencias.length === 0) {
    return null;
  }

  const numero = parseInt(coincidencias[coincidencias.length - 1], 10);

  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function nombreCartonWebP(numero) {
  const slugArchivo = limpiarSlugParaArchivo(SITE_SLUG);

  return `${SITE_SLUG}/SERIAL_${slugArchivo}_CARTON_${String(numero).padStart(5, '0')}.webp`;
}

function urlCartonWebP(numero) {
  return `${supabaseUrl}/storage/v1/object/public/cartones/${nombreCartonWebP(numero)}`;
}

async function subirCartones() {
  if (modoCartonSimple) {
    alert('Este sitio está en modo cartón simple. No se usan imágenes de cartones.');
    return;
  }

  const input = document.getElementById('cartonImageInput');
  const files = Array.from(input?.files || []);
  const status = document.getElementById('uploadStatus');

  if (status) status.innerHTML = '';

  if (!SITE_ID || !SITE_SLUG) {
    alert('Error: sitio no identificado.');
    return;
  }

  if (!files.length) {
    alert('Selecciona al menos una imagen');
    return;
  }

  if (status) {
    status.innerHTML = '<p style="color:blue;">Convirtiendo imágenes a WebP y subiendo...</p>';
  }

  const errores = [];
  let subidas = 0;

  for (let i = 0; i < files.length; i++) {
    const archivoOriginal = files[i];

    try {
      const numeroCarton = obtenerNumeroCartonDesdeNombre(archivoOriginal.name);

      if (!numeroCarton) {
        errores.push(`No se pudo detectar el número del cartón en: ${archivoOriginal.name}`);
        continue;
      }

      const archivoWebP = await convertirImagenAWebP(archivoOriginal, 0.80, 1200);

      const rutaArchivo = nombreCartonWebP(numeroCarton);

      const { error } = await supabase.storage
        .from('cartones')
        .upload(rutaArchivo, archivoWebP, {
          cacheControl: '31536000',
          contentType: 'image/webp',
          upsert: true
        });

      if (error) {
        errores.push(`Error subiendo ${rutaArchivo}: ${error.message}`);
      } else {
        subidas++;
      }

    } catch (err) {
      errores.push(`Error inesperado en ${archivoOriginal.name}: ${err.message}`);
    }
  }

  if (input) input.value = '';

  if (errores.length) {
    if (status) {
      status.innerHTML = `
        <p style="color:red;">Se subieron ${subidas}, pero hubo errores:</p>
        <ul>${errores.map(e => `<li>${e}</li>`).join('')}</ul>
      `;
    }
  } else {
    if (status) {
      status.innerHTML = `<p style="color:green;">✅ ${subidas} imágenes fueron convertidas a WebP y subidas exitosamente.</p>`;
    }
  }

  setTimeout(() => {
    if (status) status.innerHTML = '';
  }, 7000);
}
async function borrarCartones() {
  if (modoCartonSimple) {
    alert('Este sitio está en modo cartón simple. No se usan imágenes de cartones.');
    return;
  }

  if (!SITE_ID || !SITE_SLUG) {
    alert("Error: sitio no identificado.");
    return;
  }

  const claveCorrecta = await getConfigValue('clave_borrar_cartones', null);

  if (!claveCorrecta) {
    alert("Error al obtener la clave de seguridad. Contacta al administrador.");
    return;
  }

  const claveIngresada = prompt("Ingrese la clave de seguridad para borrar los cartones de este sitio:");

  if (!claveIngresada) {
    alert("Operación cancelada.");
    return;
  }

  if (claveIngresada.trim() !== String(claveCorrecta).trim()) {
    alert("Clave incorrecta. No se borraron los cartones.");
    return;
  }

  if (!confirm("⚠️ ¿ESTÁS ABSOLUTAMENTE SEGURO?\n\nEsta acción borrará SOLO las imágenes de cartones de este sitio.\n\nEsto NO se puede deshacer.")) {
    alert("Operación cancelada.");
    return;
  }

  const status = document.getElementById('deleteStatus');

  if (status) {
    status.innerHTML = '<p style="color:blue;">Cargando lista de imágenes...</p>';
  }

  try {
    let totalEliminados = 0;
    const pageSize = 1000;

    while (true) {
      const { data: list, error: listError } = await supabase.storage
        .from('cartones')
        .list(SITE_SLUG, {
          limit: pageSize,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (listError) throw listError;

      if (!list || list.length === 0) break;

      const fileNames = list
        .filter(file => file.name)
        .map(file => `${SITE_SLUG}/${file.name}`);

      if (fileNames.length === 0) break;

      const { error: deleteError } = await supabase.storage
        .from('cartones')
        .remove(fileNames);

      if (deleteError) throw deleteError;

      totalEliminados += fileNames.length;

      if (list.length < pageSize) break;
    }

    if (status) {
      if (totalEliminados === 0) {
        status.innerHTML = '<p style="color:orange;">No hay imágenes para borrar en este sitio.</p>';
      } else {
        status.innerHTML = `<p style="color:green;">✅ Se borraron ${totalEliminados} imágenes de este sitio.</p>`;
      }
    }

  } catch (error) {
    errorSeguro('Error borrando cartones:', error);

    if (status) {
      status.innerHTML = `<p style="color:red;">❌ Error al borrar imágenes: ${error.message}</p>`;
    }
  }

  setTimeout(() => {
    if (status) status.innerHTML = '';
  }, 5000);
}

// ==================== FUNCIÓN entrarAdmin ====================
async function entrarAdmin() {
  if (!SITE_ID) {
    alert('La página todavía no terminó de cargar.');
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    mostrarVentana('admin-login');

    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const errorDiv = document.getElementById('admin-error');

    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.className = '';
    }

    return;
  }

  const { data: ctx, error } = await supabase.rpc('rpc_auth_admin_context', {
    _site_id: SITE_ID
  });

  if (error) {
    errorSeguro(error);
    alert('No se pudo verificar el permiso del administrador.');
    return;
  }

  const permiso = Array.isArray(ctx) ? ctx[0] : ctx;

  if (!permiso || (!permiso.es_master && !permiso.es_admin_sitio)) {
    await supabase.auth.signOut();
    alert('Este usuario no tiene permiso para administrar esta página.');
    return;
  }

  adminSession = {
      rol: permiso.rol || (permiso.es_master ? 'master' : 'admin'),
      site_id: SITE_ID,
      es_master: permiso.es_master === true
    };

  sesionActiva = true;

  sessionStorage.removeItem('admin_email');
  sessionStorage.setItem('admin_rol', permiso.rol || 'admin');
  sessionStorage.setItem('admin_site_id', SITE_ID);
  sessionStorage.setItem('admin_is_master', permiso.es_master ? 'true' : 'false');

  document.querySelectorAll('section').forEach(sec => sec.classList.add('oculto'));

  const panel = document.getElementById('admin-panel');
  if (panel) panel.classList.remove('oculto');

  const emailDisplay = document.getElementById('admin-email-display');
  if (emailDisplay) emailDisplay.textContent = permiso.es_master ? 'Master' : 'Administrador';

  actualizarVencimientoPanelAdmin();

  iniciarDetectorActividad();
  resetInactivityTimer();

  await cargarPanelAdmin();
  activarRefrescoAutomaticoAdmin();
}
// ==================== FUNCIÓN PARA RECUPERAR PASSWORD ====================
async function recuperarPasswordAdmin() {
  const email = ADMIN_EMAIL;
  
  if (!confirm(`¿Enviar enlace de recuperación a ${email}?`)) {
    return;
  }
  
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });
    
    if (error) throw error;
    
    alert('✅ Enlace de recuperación enviado a tu email');
    
  } catch (error) {
    errorSeguro('Error recuperando password:', error);
    alert('❌ Error enviando enlace de recuperación');
  }
}

// ==================== AGREGAR BOTONES ADICIONALES ====================
function agregarBotonesAdicionalesAdmin() {
  const loginSection = document.getElementById('admin-login');
  if (!loginSection) return;
  
  if (!document.getElementById('botones-adicionales-admin')) {
    const botonesHTML = `
      <div id="botones-adicionales-admin" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
        
        <button onclick="recuperarPasswordAdmin()" style="background: #6c5ce7; color: white; padding: 8px 12px; border: none; border-radius: 4px;">
          🔑 Recuperar contraseña
        </button>
      </div>
    `;
    
    loginSection.insertAdjacentHTML('beforeend', botonesHTML);
  }
}

let canalInscripciones = null;
let timerRecargaAdmin = null;
let cargandoPanelAdmin = false;

function programarRecargaAdmin() {
  clearTimeout(timerRecargaAdmin);

  timerRecargaAdmin = setTimeout(async () => {
    if (cargandoPanelAdmin) return;
    if (!sesionActiva) return;

    const panel = document.getElementById('admin-panel');
    if (!panel || panel.classList.contains('oculto')) return;

    cargandoPanelAdmin = true;

    try {
      logSeguro('🔄 Recargando panel admin con pausa...');
      await cargarPanelAdmin();
    } catch (error) {
      errorSeguro('❌ Error recargando panel admin:', error);
    } finally {
      cargandoPanelAdmin = false;
    }
  }, 800);
}

function activarRefrescoAutomaticoAdmin() {
  if (!SITE_ID) {
    warnSeguro('No se puede activar Realtime admin: SITE_ID no está cargado.');
    return;
  }

  if (canalInscripciones) return;

  canalInscripciones = supabase
    .channel(`admin-inscripciones-realtime-${SITE_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'inscripciones',
        filter: `site_id=eq.${SITE_ID}`
      },
      (payload) => {
        logSeguro('🔄 Cambio detectado en inscripciones de este sitio:', payload);
        programarRecargaAdmin();
      }
    )
    .subscribe((status) => {
      logSeguro('📡 Realtime admin:', status);
    });
}
function iniciarContadorReserva(minutos = 5) {
  const div = document.getElementById('contadorReserva');

  let restante = minutos * 60;

  clearInterval(timerReserva);

  timerReserva = setInterval(() => {

    const min = Math.floor(restante / 60);
    const seg = restante % 60;

    div.innerHTML =
      `⏳ Reserva activa: ${min}:${seg.toString().padStart(2,'0')}`;

    if (restante <= 60) {
      div.style.background = 'rgba(239,71,111,.2)';
      div.style.borderColor = '#ef476f';
    }

    if (restante <= 0) {
      clearInterval(timerReserva);

      div.innerHTML =
        '⛔ Tiempo agotado. Los cartones fueron liberados.';

      liberarReservaPorTiempo();
    }

    restante--;

  }, 1000);
}
async function liberarReservaPorTiempo() {
  try {
    const cedulaLimpia = String(usuario.cedula || '').trim();

    await liberarReservasSeleccionadas(cedulaLimpia, usuario.cartones);

    usuario.cartones = [];

    alert('Tu tiempo para enviar el comprobante expiró. Debes seleccionar nuevamente tus cartones.');

    mostrarSeccion('cartones');

    await cargarCartones();

  } catch (err) {
    errorSeguro(err);
  }
}
async function cargarTopCompradores() {
  const cont = document.getElementById('listaTopCompradores');
  if (!cont) return;

  cont.innerHTML = '';

  const { data, error } = await supabase.rpc('rpc_public_top_compradores', {
    _site_id: SITE_ID,
    _limite: 10
  });

  if (error) {
    errorSeguro('Error cargando top compradores:', error);
    cont.innerHTML = '<p>Error cargando top compradores.</p>';
    return;
  }

  const top = data || [];

  if (!top.length) {
    cont.innerHTML = '<p>Aún no hay compradores aprobados.</p>';
    return;
  }

  const ol = document.createElement('ol');
  ol.className = 'top-compradores-lista';

  top.forEach((item, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>#${index + 1} ${item.nombre || 'Sin nombre'}</strong><br>
      ${item.total_cartones || 0} cartones
    `;
    ol.appendChild(li);
  });

  cont.appendChild(ol);
}

let canalTopCompradores = null;

function activarTopCompradoresRealtime() {
  if (!SITE_ID) {
    warnSeguro('No se puede activar Realtime top compradores: SITE_ID no está cargado.');
    return;
  }

  if (canalTopCompradores) return;

  canalTopCompradores = supabase
    .channel(`top-compradores-realtime-${SITE_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'inscripciones',
        filter: `site_id=eq.${SITE_ID}`
      },
      async () => {
        const seccion = document.getElementById('top-compradores');

        if (seccion && !seccion.classList.contains('oculto')) {
          await cargarTopCompradores();
        }
      }
    )
    .subscribe((status) => {
      logSeguro('📡 Realtime top compradores:', status);
    });
}

async function cargarBarraProgresoInicio() {
  const contenedor = document.getElementById('barraProgresoInicio');
  const texto = document.getElementById('textoProgresoCartones');
  const relleno = document.getElementById('rellenoProgresoCartones');

  if (!contenedor || !texto || !relleno) return;

  const mostrar = await getConfigValue('mostrar_barra_progreso', 'false');

  if (mostrar !== 'true') {
    contenedor.classList.add('oculto');
    return;
  }

  await obtenerTotalCartones();

  const vendidos = await contarCartonesVendidos();
  const disponibles = Math.max(totalCartones - vendidos, 0);
  const porcentaje = totalCartones > 0
    ? Math.round((disponibles / totalCartones) * 100)
    : 0;

  texto.textContent = `${porcentaje}% disponibles · ${disponibles} de ${totalCartones} cartones`;

  relleno.style.width = `${porcentaje}%`;
  contenedor.classList.remove('oculto');
}

async function guardarConfigBarraProgreso() {
  const check = document.getElementById('toggleBarraProgreso');
  if (!check) return;

  const valor = check.checked ? 'true' : 'false';

  const ok = await setConfigValue('mostrar_barra_progreso', valor);

  if (ok) {
    alert('Configuración guardada');
    await cargarBarraProgresoInicio();
  } else {
    alert('Error guardando configuración');
  }
}

async function cargarConfigBarraProgresoAdmin() {
  const check = document.getElementById('toggleBarraProgreso');
  if (!check) return;

  const valor = await getConfigValue('mostrar_barra_progreso', 'false');
  check.checked = valor === 'true';
}
let canalProgresoCartones = null;

function activarProgresoCartonesRealtime() {
  if (!SITE_ID) {
    warnSeguro('No se puede activar Realtime progreso: SITE_ID no está cargado.');
    return;
  }

  if (canalProgresoCartones) return;

  canalProgresoCartones = supabase
    .channel(`progreso-cartones-inicio-${SITE_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cartones',
        filter: `site_id=eq.${SITE_ID}`
      },
      async () => {
        await cargarBarraProgresoInicio();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'configuracion',
        filter: `site_id=eq.${SITE_ID}`
      },
      async (payload) => {
        if (
          payload.new?.clave === 'mostrar_barra_progreso' ||
          payload.new?.clave === 'total_cartones'
        ) {
          await cargarBarraProgresoInicio();
        }
      }
    )
    .subscribe((status) => {
      logSeguro('📡 Realtime progreso:', status);
    });
}
let seleccionAleatoriaEnProceso = false;
async function seleccionarAleatorioSeguro() {
if (seleccionAleatoriaEnProceso) return;

  seleccionAleatoriaEnProceso = true;

  try {

  const faltan = cantidadPermitida - usuario.cartones.length;

  if (faltan <= 0) {
    alert('Ya seleccionaste todos los cartones permitidos.');
    return;
  }

  const { data, error } = await supabase.rpc('rpc_reservar_cartones_aleatorios', {
  _site_id: SITE_ID,
  _cantidad: faltan,
  _cedula: String(usuario.cedula || '').trim(),
  _partida_id: null
});

  if (error) {
    errorSeguro(error);
    alert('Error eligiendo cartones aleatorios.');
    return;
  }

  const resultado = Array.isArray(data) ? data[0] : data;

  if (!resultado?.exito) {
    alert(resultado?.mensaje || 'No se pudieron reservar cartones.');
    await cargarCartones();
    return;
  }

  usuario.cartones = [...new Set([...usuario.cartones.map(Number), ...resultado.cartones.map(Number)])];

  await cargarCartones();

  usuario.cartones.forEach(num => {
    const carton = [...document.querySelectorAll('.carton')]
      .find(c => parseInt(c.textContent) === num);

    if (carton) {
      carton.classList.remove('ocupado');
      carton.classList.add('seleccionado');
      carton.onclick = () => toggleCarton(num, carton);
    }
  });
  if (usuario.cartones.length >= cantidadPermitida) {
  document.querySelectorAll('.carton').forEach(c => {
    const n = parseInt(c.textContent);
    const yaSeleccionado = usuario.cartones.includes(n);
    const yaOcupado = cartonesOcupados.includes(n);

    if (!yaSeleccionado && !yaOcupado) {
      c.classList.add('bloqueado');

    } else if (yaSeleccionado) {
      // Si está seleccionado, asegurarse que el onclick siga llamando toggleCarton
      c.onclick = () => toggleCarton(n, c);
    }
  });
}

  actualizarContadorCartones(totalCartones, cartonesOcupados.length, usuario.cartones.length);
  actualizarMonto();

  alert(`Cartones seleccionados: ${resultado.cartones.join(', ')}`);

 } finally {
    seleccionAleatoriaEnProceso = false;
  }
}

window.seleccionarAleatorioSeguro = seleccionarAleatorioSeguro;



function guardarDatosClienteLocal() {
  localStorage.setItem('cliente_nombre', usuario.nombre || '');
  localStorage.setItem('cliente_telefono', usuario.telefono || '');
  localStorage.setItem('cliente_cedula', usuario.cedula || '');
  localStorage.setItem('cliente_referido', usuario.referido || '');
}

function cargarDatosClienteLocal() {
  const nombre = localStorage.getItem('cliente_nombre') || '';
  const telefono = localStorage.getItem('cliente_telefono') || '';
  const cedula = localStorage.getItem('cliente_cedula') || '';
  const referido = localStorage.getItem('cliente_referido') || '';

  if (document.getElementById('nombre')) document.getElementById('nombre').value = nombre;
  if (document.getElementById('telefono')) document.getElementById('telefono').value = telefono;
  if (document.getElementById('cedula')) document.getElementById('cedula').value = cedula;
  if (document.getElementById('referido')) document.getElementById('referido').value = referido;
}

function copiarDatoPago(id) {
  const texto = document.getElementById(id).textContent.trim();

  navigator.clipboard.writeText(texto)
    .then(() => mostrarToastPago('✅ Copiado'))
    .catch(() => alert('No se pudo copiar'));
}

function mostrarToastPago(mensaje) {
  const toast = document.createElement('div');
  toast.className = 'toast-pago';
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 1800);
}

function cargarDatosPagoCliente() {
  const datos = JSON.parse(localStorage.getItem('pago_movil_cliente') || '{}');

  const banco = document.getElementById('pago_banco');
  const telefono = document.getElementById('pago_telefono');
  const cedula = document.getElementById('pago_cedula');

  if (!banco || !telefono || !cedula) return;

  banco.value = datos.banco || '';
  telefono.value = datos.telefono || '';
  cedula.value = datos.cedula || '';

  [banco, telefono, cedula].forEach(input => {
    input.addEventListener('input', guardarDatosPagoClienteAutomatico);
  });
}

function guardarDatosPagoClienteAutomatico() {
  const datos = {
    banco: document.getElementById('pago_banco').value.trim(),
    telefono: document.getElementById('pago_telefono').value.trim(),
    cedula: document.getElementById('pago_cedula').value.trim()
  };

  localStorage.setItem('pago_movil_cliente', JSON.stringify(datos));
}

document.addEventListener('DOMContentLoaded', cargarDatosPagoCliente);


function copiarPagoMovil(banco, telefono, cedula) {
  const texto =
`Banco: ${banco}
Teléfono: ${telefono}
Cédula: ${cedula}`;

  navigator.clipboard.writeText(texto)
    .then(() => alert('✅ Datos copiados'))
    .catch(() => alert('❌ Error al copiar'));
}

function copiarTodoPagoMovil() {
    const banco = document.getElementById('adminPagoBanco')?.textContent || '';
  const telefono = document.getElementById('adminPagoTelefono')?.textContent || '';
  const cedula = document.getElementById('adminPagoCedula')?.textContent || '';
  const monto = document.getElementById('monto-pago')?.textContent || '';

  const texto = ` ${banco}
 ${telefono}
 ${cedula}
 ${monto} `;

  navigator.clipboard.writeText(texto)
    .then(() => alert('✅ Todos los datos de pago copiados al portapapeles'))
    .catch(() => alert('❌ Error al copiar'));
}


async function copiarListaAprobados() {
  const filas = document.querySelectorAll('#contenedor-aprobados tbody tr');

  let texto = 'LISTA DE APROBADOS\n\n';

  filas.forEach(fila => {
    const celdas = fila.querySelectorAll('td');

    if (celdas.length >= 3) {
      texto += `${celdas[0].innerText} | ${celdas[1].innerText} | ${celdas[2].innerText}\n`;
    }
  });

  try {
    await navigator.clipboard.writeText(texto);
    alert('✅ Lista copiada');
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
    alert('✅ Lista copiada');
  }
}
// ─── NAEGACIÓN POR PESTAÑAS DEL ADMIN ───
function cambiarTab(tabId) {
  // Ocultar todos los contenidos
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Desactivar todos los botones
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Activar el seccionado
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}
function obtenerRutaStorageDesdeUrl(url, bucket = 'imagenes') {
  if (!url) return null;

  try {
    const texto = String(url);
    const marcador = `/storage/v1/object/public/${bucket}/`;
    const index = texto.indexOf(marcador);

    if (index === -1) return null;

    const ruta = texto.substring(index + marcador.length);
    return decodeURIComponent(ruta);
  } catch (error) {
    warnSeguro('No se pudo obtener ruta de imagen vieja:', error);
    return null;
  }
}
// ==================== DATOS DE PAGO MÓVIL POR SITIO ====================

function pintarTextoSiExiste(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor || '';
}

function aplicarPagoMovilSitio(datos = {}) {
  const banco = datos.pago_banco || '';
  const bancoCodigo = datos.pago_banco_codigo || '';
  const telefono = datos.pago_telefono_admin || datos.pago_telefono || '';
  const cedula = datos.pago_cedula_admin || datos.pago_cedula || '';
  const titular = datos.pago_titular || '';

  // Donde se muestran los datos al comprador
  pintarTextoSiExiste('adminPagoBanco', bancoCodigo || banco);
  pintarTextoSiExiste('adminPagoTelefono', telefono);
  pintarTextoSiExiste('adminPagoCedula', cedula);
  pintarTextoSiExiste('adminPagoTitular', titular);

  // Inputs del panel admin
  const inputBanco = document.getElementById('configPagoBanco');
  const inputBancoCodigo = document.getElementById('configPagoBancoCodigo');
  const inputTelefono = document.getElementById('configPagoTelefono');
  const inputCedula = document.getElementById('configPagoCedula');
  const inputTitular = document.getElementById('configPagoTitular');

  if (inputBanco) inputBanco.value = banco;
  if (inputBancoCodigo) inputBancoCodigo.value = bancoCodigo;
  if (inputTelefono) inputTelefono.value = telefono;
  if (inputCedula) inputCedula.value = cedula;
  if (inputTitular) inputTitular.value = titular;
}

async function cargarPagoMovilSitio() {
  const datos = {
    pago_banco: await getConfigValue('pago_banco', sitioActual?.pago_banco || ''),
    pago_banco_codigo: await getConfigValue('pago_banco_codigo', sitioActual?.pago_banco_codigo || ''),
    pago_telefono_admin: await getConfigValue('pago_telefono_admin', sitioActual?.pago_telefono || ''),
    pago_cedula_admin: await getConfigValue('pago_cedula_admin', sitioActual?.pago_cedula || ''),
    pago_titular: await getConfigValue('pago_titular', sitioActual?.pago_titular || '')
  };

  aplicarPagoMovilSitio(datos);
}

async function guardarPagoMovilSitio() {
  const estado = document.getElementById('estadoPagoSitio');

  const datos = {
    pago_banco: document.getElementById('configPagoBanco')?.value.trim() || '',
    pago_banco_codigo: document.getElementById('configPagoBancoCodigo')?.value.trim() || '',
    pago_telefono_admin: document.getElementById('configPagoTelefono')?.value.trim() || '',
    pago_cedula_admin: document.getElementById('configPagoCedula')?.value.trim() || '',
    pago_titular: document.getElementById('configPagoTitular')?.value.trim() || ''
  };

  if (!datos.pago_banco && !datos.pago_banco_codigo) {
    alert('Debes colocar el banco o el código del banco.');
    return;
  }

  if (!datos.pago_telefono_admin) {
    alert('Debes colocar el teléfono de pago móvil.');
    return;
  }

  if (!datos.pago_cedula_admin) {
    alert('Debes colocar la cédula o RIF.');
    return;
  }

  try {
    if (estado) {
      estado.textContent = 'Guardando datos de pago...';
      estado.style.color = 'blue';
    }

    for (const [clave, valor] of Object.entries(datos)) {
      const ok = await setConfigValue(clave, valor);

      if (!ok) {
        throw new Error(`No se pudo guardar ${clave}`);
      }
    }

    if (sitioActual) {
      Object.assign(sitioActual, {
        pago_banco: datos.pago_banco,
        pago_banco_codigo: datos.pago_banco_codigo,
        pago_telefono: datos.pago_telefono_admin,
        pago_cedula: datos.pago_cedula_admin,
        pago_titular: datos.pago_titular
      });
    }

    aplicarPagoMovilSitio(datos);

    if (estado) {
      estado.textContent = '✅ Datos de pago guardados correctamente.';
      estado.style.color = 'green';
    }

  } catch (error) {
    errorSeguro('Error guardando pago móvil:', error);

    if (estado) {
      estado.textContent = 'Error guardando pago móvil: ' + error.message;
      estado.style.color = 'red';
    }
  }
}
// ==================== REDES SOCIALES POR SITIO ====================

function normalizarUrlRedSocial(url) {
  const valor = String(url || '').trim();

  if (!valor) return '';

  if (valor.startsWith('http://') || valor.startsWith('https://')) {
    return valor;
  }

  return 'https://' + valor;
}

function aplicarInputsRedesSitio(datos = {}) {
  const whatsapp = document.getElementById('configWhatsapp');
  const whatsappGrupo = document.getElementById('configWhatsappGrupo');
  const instagram = document.getElementById('configInstagram');
  const facebook = document.getElementById('configFacebook');
  const youtube = document.getElementById('configYoutube');
  const tiktok = document.getElementById('configTiktok');

  if (whatsapp) whatsapp.value = datos.whatsapp || '';
  if (whatsappGrupo) whatsappGrupo.value = datos.whatsapp_grupo || '';
  if (instagram) instagram.value = datos.instagram || '';
  if (facebook) facebook.value = datos.facebook || '';
  if (youtube) youtube.value = datos.youtube || '';
  if (tiktok) tiktok.value = datos.tiktok || '';
}

async function cargarRedesSitio() {
  const datos = {
    whatsapp: await getConfigValue('whatsapp', sitioActual?.whatsapp || ''),
    whatsapp_grupo: await getConfigValue('whatsapp_grupo', sitioActual?.whatsapp_grupo || ''),
    instagram: await getConfigValue('instagram', sitioActual?.instagram || ''),
    facebook: await getConfigValue('facebook', sitioActual?.facebook || ''),
    youtube: await getConfigValue('youtube', sitioActual?.youtube || ''),
    tiktok: await getConfigValue('tiktok', sitioActual?.tiktok || '')
  };

  aplicarInputsRedesSitio(datos);
  aplicarRedesSitio(datos);
}

async function guardarRedesSitio() {
  const estado = document.getElementById('estadoRedesSitio');

  const whatsapp = document.getElementById('configWhatsapp')?.value.trim() || '';
  const whatsappGrupo = document.getElementById('configWhatsappGrupo')?.value.trim() || '';
  const instagram = document.getElementById('configInstagram')?.value.trim() || '';
  const facebook = document.getElementById('configFacebook')?.value.trim() || '';
  const youtube = document.getElementById('configYoutube')?.value.trim() || '';
  const tiktok = document.getElementById('configTiktok')?.value.trim() || '';

  const datos = {
    whatsapp: whatsapp.replace(/\D/g, ''),
    whatsapp_grupo: whatsappGrupo ? normalizarUrlRedSocial(whatsappGrupo) : '',
    instagram: instagram ? normalizarUrlRedSocial(instagram) : '',
    facebook: facebook ? normalizarUrlRedSocial(facebook) : '',
    youtube: youtube ? normalizarUrlRedSocial(youtube) : '',
    tiktok: tiktok ? normalizarUrlRedSocial(tiktok) : ''
  };

  try {
    if (estado) {
      estado.textContent = 'Guardando redes sociales...';
      estado.style.color = 'blue';
    }

    for (const [clave, valor] of Object.entries(datos)) {
      const ok = await setConfigValue(clave, valor);

      if (!ok) {
        throw new Error(`No se pudo guardar ${clave}`);
      }
    }

    if (sitioActual) {
      Object.assign(sitioActual, datos);
    }

    aplicarInputsRedesSitio(datos);
    aplicarRedesSitio(datos);

    if (estado) {
      estado.textContent = '✅ Redes sociales guardadas correctamente.';
      estado.style.color = 'green';
    }

  } catch (error) {
    errorSeguro('Error guardando redes sociales:', error);

    if (estado) {
      estado.textContent = 'Error guardando redes sociales: ' + error.message;
      estado.style.color = 'red';
    }
  }
}
// ==================== EXPORTAR FUNCIONES ====================
window.mostrarVentana = mostrarVentana;
window.guardarDatosInscripcion = guardarDatosInscripcion;
window.confirmarCantidad = confirmarCantidad;
window.enviarComprobante = enviarComprobante;
window.consultarCartones = consultarCartones;
window.elegirMasCartones = elegirMasCartones;
window.entrarAdmin = entrarAdmin;
window.loginAdmin = loginAdmin;
window.toggleCarton = toggleCarton;
window.abrirModalCarton = abrirModalCarton;
window.cerrarModalCarton = cerrarModalCarton;
window.seleccionarPromocion = seleccionarPromocion;
window.deseleccionarPromocion = deseleccionarPromocion;
window.cerrarTerminos = cerrarTerminos;
window.toggleFormularioGanador = toggleFormularioGanador;
window.guardarGanador = guardarGanador;
window.ordenarInscripcionesPorNombre = ordenarInscripcionesPorNombre;
window.ordenarPorCedula = ordenarPorCedula;
window.ordenarPorReferencia = ordenarPorReferencia;
window.ordenarPendientesArriba = ordenarPendientesArriba;
window.activarCohetes = activarCohetes;
window.mostrarSeccion = mostrarSeccion;
window.recuperarPasswordAdmin = recuperarPasswordAdmin;
window.guardarColoresSitio = guardarColoresSitio;
window.resetearColoresSitio = resetearColoresSitio;
window.guardarLogoSitio = guardarLogoSitio;
window.guardarPremioSitio = guardarPremioSitio;
window.guardarFaviconSitio = guardarFaviconSitio;
window.guardarPagoMovilSitio = guardarPagoMovilSitio;
window.guardarRedesSitio = guardarRedesSitio;
logSeguro('✅ Sistema configurado correctamente');
window.abrirEnVivoSitio = abrirEnVivoSitio;
window.mostrarPoliticaPrivacidad = mostrarPoliticaPrivacidad;
window.cerrarPoliticaPrivacidad = cerrarPoliticaPrivacidad;
