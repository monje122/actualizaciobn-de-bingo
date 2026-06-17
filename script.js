var supabase = window.supabase;
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
let cantidadFijaCartones = 1;
let detectorIniciado = false;

// Variables de sesión
let adminSession = null;
let sesionActiva = false;

const ultimoEstadoProcesado = new Map();
const estadoEnProceso = new Set();

async function procesarEstadoUnaVez(id, fila, nuevoEstado, accion) {
  const claveProceso = `${id}-${nuevoEstado}`;

  const estadoActualFila = fila?.dataset?.estadoActual || '';
  const ultimoEstado = ultimoEstadoProcesado.get(id) || estadoActualFila;

  // Si ya está en ese mismo estado, no hace nada
  if (ultimoEstado === nuevoEstado) {
    console.log(`Inscripción ${id} ya está en estado ${nuevoEstado}. No se repite.`);
    return;
  }

  // Si ya se está procesando esa misma acción, no repite
  if (estadoEnProceso.has(claveProceso)) {
    console.log(`Ya se está procesando ${nuevoEstado} para inscripción ${id}`);
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
    console.error('Error procesando estado:', error);
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
  if (!sitio?.fecha_vencimiento) return false;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vence = new Date(`${sitio.fecha_vencimiento}T00:00:00`);
  vence.setHours(0, 0, 0, 0);

  return vence < hoy;
}

async function iniciarSitioActual() {
  SITE_SLUG = obtenerSlugSitio();

  console.log('🌐 Cargando sitio:', SITE_SLUG);

  const { data, error } = await supabase.rpc('rpc_public_get_sitio', {
    _slug: SITE_SLUG
  });

  if (error) {
    console.error('❌ Error cargando sitio:', error);
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

console.log('✅ Sitio cargado:', sitioActual);

aplicarDatosSitio(sitioActual);

if (sitioEstaVencido(sitioActual)) {
  mostrarSitioPausado(sitioActual);
  return false;
}

if (!sitioActual.activo) {
  mostrarSitioPausado(sitioActual);
  return false;
}

  return true;
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

  // Colores CSS globales
  document.documentElement.style.setProperty('--site-primary', sitio.color_principal || '#020A35');
  document.documentElement.style.setProperty('--site-secondary', sitio.color_secundario || '#FFA500');
  document.documentElement.style.setProperty('--site-buttons', sitio.color_botones || sitio.color_principal || '#020A35');
  document.documentElement.style.setProperty('--site-bg', sitio.color_fondo || '#ffffff');
  document.documentElement.style.setProperty('--site-text', sitio.color_texto || '#000000');

  document.body.style.backgroundColor = sitio.color_fondo || '';
  document.body.style.color = sitio.color_texto || '';

  // Total de cartones y precio desde sitios
  totalCartones = parseInt(sitio.total_cartones || sitio.cartones_visibles || 0, 10) || 0;
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
// ==================== FUNCIONES DE CONFIGURACIÓN ====================
async function getConfigValue(clave, fallback = null) {
  if (!SITE_ID) {
    console.warn('SITE_ID no cargado todavía para getConfigValue:', clave);
    return fallback;
  }

  const { data, error } = await supabase.rpc('rpc_get_config_sitio', {
    _site_id: SITE_ID,
    _clave: clave,
    _fallback: fallback
  });

  if (error) {
    console.warn('Error getConfigValue:', clave, error);
    return fallback;
  }

  return data ?? fallback;
}

async function setConfigValue(clave, value) {
  if (!SITE_ID) {
    console.warn('SITE_ID no cargado todavía para setConfigValue:', clave);
    return false;
  }

  const { data, error } = await supabase.rpc('rpc_set_config_sitio', {
    _site_id: SITE_ID,
    _clave: clave,
    _valor: String(value)
  });

  if (error) {
    console.error('Error setConfigValue:', clave, error);
    return false;
  }

  return data === true;
}
// ==================== SESIÓN ADMIN CON SUPABASE AUTH ====================
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
    console.warn('Logout silencioso falló:', error);
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
    console.warn('Error cerrando sesión Auth:', error);
  }

  clearAdminSession();
  resetToLoginState();

  alert('Sesión cerrada correctamente');
}
// ========== FUNCIÓN PARA LIMPIA SESIÓN (COMPATIBLE) ==========
function clearAdminSession() {
  console.log('🧹 Limpiando sesión...');

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

  console.log('✅ Sesión limpiada localmente');
}

// ========== FUNCIÓN PARA VOLVER A LOGIN (COMPATIBLE) ==========
function resetToLoginState() {
  console.log('🔄 Regresando a estado de login...');
  
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
    console.log('✅ Botón de logout configurado');
  }
});

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

    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (loginError) {
      console.error('Error login:', loginError);
      errorDiv.textContent = 'Correo o clave incorrectos';
      errorDiv.className = 'error';
      document.getElementById('admin-password').value = '';
      return;
    }

    const { data: ctx, error: ctxError } = await supabase.rpc('rpc_auth_admin_context', {
      _site_id: SITE_ID
    });

    if (ctxError) {
      console.error('Error verificando permisos:', ctxError);
      await supabase.auth.signOut();
      errorDiv.textContent = 'No se pudo verificar el permiso del administrador';
      errorDiv.className = 'error';
      return;
    }

    const permiso = Array.isArray(ctx) ? ctx[0] : ctx;

    if (!permiso || (!permiso.es_master && !permiso.es_admin_sitio)) {
      await supabase.auth.signOut();

      errorDiv.textContent = 'Este correo no tiene permiso para administrar esta página';
      errorDiv.className = 'error';
      document.getElementById('admin-password').value = '';
      return;
    }

    sessionStorage.setItem('admin_email', permiso.email);
    sessionStorage.setItem('admin_rol', permiso.rol || 'admin');
    sessionStorage.setItem('admin_site_id', SITE_ID);
    sessionStorage.setItem('admin_is_master', permiso.es_master ? 'true' : 'false');

    adminSession = {
      email: permiso.email,
      rol: permiso.rol,
      site_id: SITE_ID,
      es_master: permiso.es_master
    };

    sesionActiva = true;

    document.getElementById('admin-password').value = '';

    errorDiv.innerHTML = '✅ <strong>Acceso correcto</strong><br>Entrando al panel...';
    errorDiv.className = 'success';

    setTimeout(async () => {
      document.getElementById('admin-login').classList.add('oculto');
      document.getElementById('admin-panel').classList.remove('oculto');

      const emailDisplay = document.getElementById('admin-email-display');
      if (emailDisplay) emailDisplay.textContent = permiso.email;

      iniciarDetectorActividad();
      resetInactivityTimer();

      await cargarPanelAdmin();
      activarRefrescoAutomaticoAdmin();
    }, 700);

  } catch (error) {
    console.error('Error en loginAdmin:', error);
    errorDiv.textContent = 'Error de conexión o configuración';
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


// Función para actualizar actividad de sesión
function actualizarActividadSesion() {
  if (!sesionActiva) return;
  console.log('👀 Actividad detectada');
}
// Timer de inactividad
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (sesionActiva) {
    console.log('⏰ Reiniciando timer de inactividad (30 minutos)');
    inactivityTimer = setTimeout(async () => {
      if (sesionActiva) {
        console.log('⏰ Sesión expirada por inactividad');
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

  console.log('👀 Iniciando detector de actividad');

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
  console.log('🔍 Verificando sesión inicial con Supabase Auth...');

  document.getElementById('admin-panel')?.classList.add('oculto');
  document.getElementById('admin-login')?.classList.add('oculto');
  document.getElementById('bienvenida')?.classList.remove('oculto');

  if (!SITE_ID) {
    console.warn('SITE_ID no está cargado todavía');
    return;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (!session?.user?.email) {
      console.log('ℹ️ No hay sesión Auth activa');
      sesionActiva = false;
      adminSession = null;
      return;
    }

    const { data: ctx, error: ctxError } = await supabase.rpc('rpc_auth_admin_context', {
      _site_id: SITE_ID
    });

    if (ctxError) {
      console.error('Error verificando contexto admin:', ctxError);
      await supabase.auth.signOut();
      sesionActiva = false;
      adminSession = null;
      return;
    }

    const permiso = Array.isArray(ctx) ? ctx[0] : ctx;

    if (!permiso || (!permiso.es_master && !permiso.es_admin_sitio)) {
      console.warn('Sesión Auth existe, pero no tiene permiso en este sitio');
      await supabase.auth.signOut();
      sesionActiva = false;
      adminSession = null;
      return;
    }

    sessionStorage.setItem('admin_email', permiso.email);
    sessionStorage.setItem('admin_rol', permiso.rol || 'admin');
    sessionStorage.setItem('admin_site_id', SITE_ID);
    sessionStorage.setItem('admin_is_master', permiso.es_master ? 'true' : 'false');

    adminSession = {
      email: permiso.email,
      rol: permiso.rol,
      site_id: SITE_ID,
      es_master: permiso.es_master
    };

    sesionActiva = true;

    const emailDisplay = document.getElementById('admin-email-display');
    if (emailDisplay) emailDisplay.textContent = permiso.email;

    iniciarDetectorActividad();
    resetInactivityTimer();

    console.log('✅ Sesión admin válida:', adminSession);

  } catch (error) {
    console.error('❌ Error verificando sesión inicial:', error);
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
    console.error('Elemento listaAprobados no encontrado');
    return;
  }

  listaDiv.innerHTML = '';

  if (error) {
    console.error('Error al obtener aprobados:', error);
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
    console.error(e);
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
    console.error(e);
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
    console.error(e);
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
    console.error('Error al obtener inscripciones:', error.message);
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

  const { count, error } = await supabase
  .from('cartones')
  .select('numero', { count: 'exact', head: true })
  .eq('site_id', SITE_ID)
  .gte('numero', 1)
  .lte('numero', totalCartones);

  if (error) {
    console.error('Error al contar cartones:', error);
    return 0;
  }
  
  const totalVendidosElement = document.getElementById('total-vendidos');
  if (totalVendidosElement) {
    totalVendidosElement.textContent = count || 0;
  }
  
  return count || 0;
}

function renderizarBotonesPromociones() {
  const promoBox = document.getElementById('promoBox');
  if (!promoBox) return;

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
  console.log('🚀 Inicializando sistema...');
    sistemaListo = false;
  const sitioOk = await iniciarSitioActual();

if (!sitioOk) {
  console.warn('Sitio no disponible o pausado.');
  return;
}
  // Crear ta¿'bl ses nxiste
   document.getElementById('modal-terminos').classList.remove('oculto');
   await obtenerTotalCartones();
  await cargarLinkWhatsapp();
  document.getElementById('overlay-carga').style.display = 'none';

  await Promise.all([
    cargarDatosClienteLocal(),
  activarProgresoCartonesRealtime(),
  generarCartones(),
    cargarBarraProgresoInicio(),
    cargarConfigBarraProgresoAdmin(),
    cargarImagenPremiosInicio(),
    cargarPrecioPorCarton(),
    cargarConfiguracionModoCartones(),
    cargarPromocionesConfig()
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
  document.getElementById('imprimirListaBtn')?.addEventListener('click', imprimirLista);
  document.getElementById('verListaBtn')?.addEventListener('click', verListaAprobados);
  document.getElementById('guardarModoCartonesBtn')?.addEventListener('click', guardarModoCartones);
  document.getElementById('modoCartonesSelect')?.addEventListener('change', cambiarModoCartones);
  
  // Cargar likde WhatsApp
    sistemaListo = true;
  // Mostrar términos

  document.getElementById('overlay-carga').style.display = 'none';
  console.log('✅ Sistema inicializado correctamente');
});

async function obtenerTotalCartones() {
  const fallback = sitioActual?.total_cartones || sitioActual?.cartones_visibles || '0';
  const valor = await getConfigValue('total_cartones', String(fallback));

  totalCartones = parseInt(valor, 10) || 0;
}

async function cargarPrecioPorCarton() {
  const fallback = sitioActual?.precio_carton_bs ?? '0';
  const valor = await getConfigValue('precio_carton', String(fallback));

  precioPorCarton = parseFloat(valor) || 0;
}

function generarCartones() {
  console.log(`Sistema de bingo inicializado con ${totalCartones} cartones disponibles`);
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

async function mostrarVentana(id) {
  if (!sistemaListo) return;

  if (id === 'top-compradores') {
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
  if (target) target.classList.remove('oculto');

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
    console.error('Error liberando huérfanos:', errorHuerfanos);
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
      carton.onclick = () => abrirModalCarton(i, carton);
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
    console.log('Liberar cartón:', {
      numero: num,
      cedula: cedulaLimpia,
      liberado,
      errorLiberar
    });

    if (errorLiberar) {
      console.error('Error liberando reserva:', errorLiberar);
      alert('No se pudo liberar el cartón. Intenta otra vez.');
      return;
    }

    if (liberado !== true) {
      console.warn('El cartón no se liberó. Puede que no coincidía la cédula o ya estaba en inscripción.');
    }

    cartonesOcupados = cartonesOcupados.filter(n => Number(n) !== num);

    document.querySelectorAll('.carton.bloqueado').forEach(c => {
      const n = Number(c.textContent);
      if (!cartonesOcupados.map(Number).includes(n) && !usuario.cartones.map(Number).includes(n)) {
        c.classList.remove('bloqueado');
        c.onclick = () => abrirModalCarton(n, c);
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

    // 1. Validar que esos cartones estén reservados por esta misma cédula en este sitio
    const { data: reservas, error: errorReservas } = await supabase
      .from('cartones')
      .select('numero, cedula')
      .eq('site_id', SITE_ID)
      .in('numero', cartonesEnviar);

    if (errorReservas) {
      throw new Error('No se pudieron validar tus cartones.');
    }

    const reservasValidas = (reservas || [])
      .filter(r => String(r.cedula || '').trim() === cedulaLimpia)
      .map(r => Number(r.numero));

    const faltantes = cartonesEnviar.filter(n => !reservasValidas.includes(n));

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

    // 2. Validar que no existan en otra inscripción pendiente/aprobada del mismo sitio
    const { data: inscripcionesActivas, error: errorInscripciones } = await supabase
      .from('inscripciones')
      .select('id, nombre, cedula, cartones')
      .eq('site_id', SITE_ID)
      .in('estado', ['pendiente', 'aprobado']);

    if (errorInscripciones) {
      throw new Error('No se pudieron verificar cartones duplicados.');
    }

    const duplicados = [];

    (inscripcionesActivas || []).forEach(ins => {
      const otrosCartones = (ins.cartones || []).map(n => Number(n));

      cartonesEnviar.forEach(n => {
        if (otrosCartones.includes(n)) {
          duplicados.push({
            carton: n,
            nombre: ins.nombre,
            cedula: ins.cedula
          });
        }
      });
    });

    if (duplicados.length > 0) {
      const numeros = [...new Set(duplicados.map(d => d.carton))];

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
      console.error('Error insertando inscripción:', errorInsert);

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
    console.error(err);
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
  const cedula = document.getElementById('consulta-cedula').value.trim();

  const cont = document.getElementById('cartones-usuario');
  cont.innerHTML = '';

  const { data: todas } = await supabase
    .from('inscripciones')
    .select('*')
  .eq('site_id', SITE_ID)
    .eq('cedula', cedula);

  if (!todas || todas.length === 0) {
    cont.innerHTML = `
      <p style="text-align:center;color:#ff4444;">
        No se encontró ninguna compra registrada con esta cédula.
      </p>
    `;
    return;
  }

  const tieneAprobada = todas.some(i => i.estado === 'aprobado');
  const tienePendiente = todas.some(i => i.estado === 'pendiente');
  const tieneRechazada = todas.some(i => i.estado === 'rechazado');
  
  const mensaje = document.createElement('div');
  mensaje.style.textAlign = 'center';
  mensaje.style.marginBottom = '15px';
  mensaje.style.fontWeight = 'bold';

  if (tieneAprobada && tienePendiente && tieneRechazada) {
  mensaje.innerHTML =
    '✅ Tienes compras aprobadas.<br>⏳ También tienes compras pendientes de aprobación.<br>❌ También tienes compras rechazadas(consulta con soporte).';
}
 else if (tieneAprobada && tieneRechazada) {
  mensaje.innerHTML =
    '✅ Tienes compras aprobadas.<br>❌ También tienes compras rechazadas, consulta a soporte.';
}
else if (tieneAprobada && tienePendiente) {
  mensaje.innerHTML =
    '✅ Tienes compras aprobadas.<br>⏳ También tienes compras pendientes de aprobación.';
}
else if (tieneRechazada && tienePendiente) {
  mensaje.innerHTML =
    '❌ Tienes compras rechazadas.<br>⏳ También tienes compras pendientes de aprobación.';
}
else if (tieneAprobada) {
  mensaje.innerHTML =
    '✅ Tu compra ha sido aprobada.';
}
else if (tieneRechazada) {
  mensaje.innerHTML =
    '❌ Tu compra fue rechazada.';
}
else {
  mensaje.innerHTML =
    '⏳ Tu compra está pendiente de aprobación.';
}

  cont.appendChild(mensaje);
  mensaje.classList.add('estado-consulta');

  // Mostrar cartones aunque esté pendiente
  todas.forEach(item => {
    (item.cartones || []).forEach(num => {
      const img = document.createElement('img');
    img.src = urlCartonWebP(num);
img.loading = 'lazy';
img.alt = `Cartón ${num}`;
      img.classList.add('carton-consulta-img');
      img.style.margin = '5px';
      cont.appendChild(img);
    });
  });
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
    console.error(error);
    return alert('Error cargando inscripciones');
  }

  const tbody = document.querySelector('#tabla-comprobantes tbody');
  tbody.innerHTML = '';

  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.dataset.estadoActual = item.estado || 'pendiente';
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td>
        <a href="${buildWhatsAppLink(item.telefono, `Hola ${item.nombre}, te escribo de parte del equipo de bingoandino75.`)}"
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
    console.error(error);
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
    console.error(errUpd);
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
    console.error('Error obteniendo ruta del comprobante:', error);
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
          console.warn('No se pudo eliminar el comprobante del storage:', errorStorage);
        }
      }
    }

    if (fila) fila.remove();

    await contarCartonesVendidos();
    await obtenerMontoTotalRecaudado();
    await cargarCartones();

    alert(`Inscripción eliminada. Cartones liberados: ${data ?? 0}`);

  } catch (e) {
    console.error(e);
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

  // Borrar inscripciones solo de este sitio
  const { error: errorInscripciones } = await supabase
    .from('inscripciones')
    .delete()
    .eq('site_id', SITE_ID)
    .gte('id', 0);

  if (errorInscripciones) {
    alert('❌ Error eliminando inscripciones: ' + errorInscripciones.message);
    return;
  }

  // Borrar cartones solo de este sitio
  const { error: errorCartones } = await supabase
    .from('cartones')
    .delete()
    .eq('site_id', SITE_ID)
    .gte('numero', 1);

  if (errorCartones) {
    alert('❌ Error eliminando cartones: ' + errorCartones.message);
    return;
  }

  // Opcional: borrar ganadores solo de este sitio
  const { error: errorGanadores } = await supabase
    .from('ganadores')
    .delete()
    .eq('site_id', SITE_ID)
    .gte('id', 0);

  if (errorGanadores) {
    console.warn('No se pudieron borrar ganadores:', errorGanadores);
  }

  // Borrar comprobantes solo dentro de la carpeta del sitio
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
      alert('❌ Error listando comprobantes: ' + listErr.message);
      break;
    }

    if (!files || files.length === 0) break;

    const names = files.map(f => `${SITE_SLUG}/${f.name}`);

    const { error: delErr } = await supabase.storage
      .from('comprobantes')
      .remove(names);

    if (delErr) {
      alert('❌ Error eliminando comprobantes: ' + delErr.message);
      break;
    }

    totalEliminados += names.length;

    if (files.length < pageSize) break;
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

  const nuevoTotal = parseInt(input.value, 10);

  if (isNaN(nuevoTotal) || nuevoTotal < 1) {
    if (estado) estado.textContent = "Número inválido.";
    return;
  }

  if (!SITE_ID) {
    if (estado) estado.textContent = "Error: sitio no identificado.";
    return;
  }

  const ok = await setConfigValue('total_cartones', String(nuevoTotal));

  if (!ok) {
    if (estado) estado.textContent = "Error al actualizar.";
    return;
  }

  totalCartones = nuevoTotal;

  if (sitioActual) {
    sitioActual.total_cartones = nuevoTotal;
    sitioActual.cartones_visibles = nuevoTotal;
  }

  if (estado) estado.textContent = "¡Total actualizado!";

  await cargarCartones();
  await contarCartonesVendidos();
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
    
    console.log('Promociones cargadas:', promociones);
    renderizarBotonesPromociones();
  } catch (error) {
    console.error('Error cargando promociones:', error);
  }
}

async function cargarPromocionesAdmin() {
  try {
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`promo${i}_activa`).checked = 
        (await getConfigValue(`promo${i}_activa`, 'false')) === 'true';
      document.getElementById(`promo${i}_descripcion`).value = 
        await getConfigValue(`promo${i}_descripcion`, '');
      document.getElementById(`promo${i}_cantidad`).value = 
        parseInt(await getConfigValue(`promo${i}_cantidad`, '0')) || '';
      document.getElementById(`promo${i}_precio`).value = 
        parseFloat(await getConfigValue(`promo${i}_precio`, '0')) || '';
    }
  } catch (error) {
    console.error('Error cargando promociones en admin:', error);
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
    console.error('Error guardando promociones:', error);

    if (estado) {
      estado.textContent = 'Error inesperado al guardar';
      estado.style.color = 'red';
    }
  }
}

function seleccionarPromocion(numero) {
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
  return promocionSeleccionada ? promociones[promocionSeleccionada - 1] : null;
}

// ==================== FUNCIONES RESTANTES ====================
function mostrarSeccion(id) {
  const secciones = document.querySelectorAll('section');
  secciones.forEach(sec => sec.classList.add('oculto'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('oculto');
  
    if (id === 'ganadores') {
    cargarGanadores();
  }
  
  const redes = document.getElementById('redes-sociales');
  if (redes) {
    redes.style.display = id === 'inicio' ? 'flex' : 'none';
  }
}

async function cargarListaAprobadosSeccion() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('*')
  .eq('site_id', SITE_ID)
    .eq('estado', 'aprobado');

  const contenedor = document.getElementById('contenedor-aprobados');
  contenedor.innerHTML = '';

  if (error || !data.length) {
    contenedor.innerHTML = '<p>No hay aprobados aún.</p>';
    return;
  }

  const tabla = document.createElement('table');
  tabla.style.width = '100%';
  tabla.style.borderCollapse = 'collapse';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Cartón</th>
        <th>Nombre</th>
        <th>Cédula</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = tabla.querySelector('tbody');
  let filas = [];

  data.forEach(item => {
    item.cartones.forEach(carton => {
      filas.push({
        carton,
        nombre: item.nombre,
        cedula: item.cedula
      });
    });
  });

  filas.sort((a, b) => a.carton - b.carton);

  filas.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.carton}</td>
      <td>${item.nombre}</td>
      <td>${'*'.repeat(Math.max(0, String(item.cedula || '').length - 4))}${String(item.cedula || '').slice(-4)}</td>
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
    console.error(error);
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

  const ok = await setConfigValue('cohetes_activados', 'true');

  if (!ok) {
    alert('Error activando cohetes');
    return;
  }

  alert('¡Cohetes activados!');
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
  const text = encodeURIComponent(presetMsg || 'Hola, te escribo de parte del equipo de bingoandino75.');
  return `https://wa.me/${waNumber}?text=${text}`;
}

async function fetchTodosLosOcupados() {
  if (!SITE_ID) return [];

  const { data, error } = await supabase
    .from('cartones')
    .select('numero')
    .eq('site_id', SITE_ID)
    .gte('numero', 1)
    .lte('numero', totalCartones);

  if (error) {
    console.error('Error cargando cartones ocupados:', error);
    return [];
  }

  return (data || []).map(c => Number(c.numero));
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
      console.error(error);
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
    console.error('Error cargando aprobados:', error);
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
    console.error('Error borrando cartones:', error);

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

  if (!session?.user?.email) {
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
    console.error(error);
    alert('No se pudo verificar el permiso del administrador.');
    return;
  }

  const permiso = Array.isArray(ctx) ? ctx[0] : ctx;

  if (!permiso || (!permiso.es_master && !permiso.es_admin_sitio)) {
    await supabase.auth.signOut();
    alert('Este correo no tiene permiso para administrar esta página.');
    return;
  }

  adminSession = {
    email: permiso.email,
    rol: permiso.rol,
    site_id: SITE_ID,
    es_master: permiso.es_master
  };

  sesionActiva = true;

  sessionStorage.setItem('admin_email', permiso.email);
  sessionStorage.setItem('admin_rol', permiso.rol || 'admin');
  sessionStorage.setItem('admin_site_id', SITE_ID);
  sessionStorage.setItem('admin_is_master', permiso.es_master ? 'true' : 'false');

  document.querySelectorAll('section').forEach(sec => sec.classList.add('oculto'));

  const panel = document.getElementById('admin-panel');
  if (panel) panel.classList.remove('oculto');

  const emailDisplay = document.getElementById('admin-email-display');
  if (emailDisplay) emailDisplay.textContent = permiso.email;

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
    console.error('Error recuperando password:', error);
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
      console.log('🔄 Recargando panel admin con pausa...');
      await cargarPanelAdmin();
    } catch (error) {
      console.error('❌ Error recargando panel admin:', error);
    } finally {
      cargandoPanelAdmin = false;
    }
  }, 800);
}

function activarRefrescoAutomaticoAdmin() {
  if (!SITE_ID) {
    console.warn('No se puede activar Realtime admin: SITE_ID no está cargado.');
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
        console.log('🔄 Cambio detectado en inscripciones de este sitio:', payload);
        programarRecargaAdmin();
      }
    )
    .subscribe((status) => {
      console.log('📡 Realtime admin:', status);
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
    console.error(err);
  }
}
async function cargarTopCompradores() {
  const { data, error } = await supabase
    .from('inscripciones')
    .select('nombre, cedula, telefono, cartones, estado')
  .eq('site_id', SITE_ID)
    .in('estado', ['aprobado']);

  const cont = document.getElementById('listaTopCompradores');
  cont.innerHTML = '';

  if (error) {
    console.error(error);
    cont.innerHTML = '<p>Error cargando top compradores.</p>';
    return;
  }

  const ranking = {};

  (data || []).forEach(item => {
    const cedula = item.cedula || 'sin-cedula';
    const cantidad = Array.isArray(item.cartones) ? item.cartones.length : 0;

    if (!ranking[cedula]) {
      ranking[cedula] = {
        nombre: item.nombre || 'Sin nombre',
        cedula,
        telefono: item.telefono || '',
        total: 0
      };
    }

    ranking[cedula].total += cantidad;
  });

  const top = Object.values(ranking)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (!top.length) {
    cont.innerHTML = '<p>No hay compradores todavía.</p>';
    return;
  }

  cont.innerHTML = `
    <ol class="top-compradores-lista">
      ${top.map((p, i) => `
        <li>
          <strong>#${i + 1} ${p.nombre}</strong><br>
          Cédula: ****${String(p.cedula || '').slice(-4)}<br>
          Cartones comprados: <strong>${p.total}</strong>
        </li>
      `).join('')}
    </ol>
  `;
}

let canalTopCompradores = null;

function activarTopCompradoresRealtime() {
  if (!SITE_ID) {
    console.warn('No se puede activar Realtime top compradores: SITE_ID no está cargado.');
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
      console.log('📡 Realtime top compradores:', status);
    });
}

function obtenerRutaStorageDesdeUrlImagen(url) {
  if (!url) return null;

  try {
    const parte = String(url).split('/storage/v1/object/public/imagenes/')[1];

    if (parte) {
      return decodeURIComponent(parte.split('?')[0]);
    }

    // Compatibilidad con imágenes viejas guardadas sin carpeta
    return String(url).split('/').pop().split('?')[0];

  } catch (err) {
    console.error('Error obteniendo ruta de imagen:', err);
    return null;
  }
}

async function subirImagenPremiosInicio() {
  const input = document.getElementById('inputPremiosInicio');
  const estado = document.getElementById('estadoPremiosInicio');
  const archivoOriginal = input?.files?.[0];

  if (!SITE_ID || !SITE_SLUG) {
    alert('Error: sitio no identificado.');
    return;
  }

  if (!archivoOriginal) {
    alert('Selecciona una imagen');
    return;
  }

  try {
    if (estado) estado.textContent = 'Convirtiendo imagen a WebP...';

    const imagenAnterior = await getConfigValue('imagen_premios_inicio', null);

    // Convertir JPG / PNG / WEBP a WebP optimizado
    const archivoWebP = await convertirImagenAWebP(archivoOriginal, 0.85, 1400);

    const idArchivo = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const nombreArchivo = `${SITE_SLUG}/premios-inicio-${Date.now()}-${idArchivo}.webp`;

    if (estado) estado.textContent = 'Subiendo imagen...';

    const { error: uploadError } = await supabase.storage
      .from('imagenes')
      .upload(nombreArchivo, archivoWebP, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) {
      if (estado) estado.textContent = 'Error subiendo imagen';
      console.error(uploadError);
      return;
    }

    const { data: publicData } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombreArchivo);

    const url = publicData.publicUrl;

    if (estado) estado.textContent = 'Guardando configuración...';

    const ok = await setConfigValue('imagen_premios_inicio', url);

    if (!ok) {
      if (estado) estado.textContent = 'Error guardando imagen';

      await supabase.storage
        .from('imagenes')
        .remove([nombreArchivo]);

      return;
    }

    // Borrar imagen anterior solo después de guardar la nueva correctamente
    if (imagenAnterior) {
      const rutaAnterior = obtenerRutaStorageDesdeUrlImagen(imagenAnterior);

      if (rutaAnterior && rutaAnterior !== nombreArchivo) {
        await supabase.storage
          .from('imagenes')
          .remove([rutaAnterior]);
      }
    }

    if (input) input.value = '';
    if (estado) estado.textContent = '✅ Imagen guardada en WebP';

    await cargarImagenPremiosInicio();

  } catch (error) {
    console.error(error);
    if (estado) estado.textContent = '❌ Error: ' + error.message;
  }
}

async function cargarImagenPremiosInicio() {
  const img = document.getElementById('imagenPremiosInicio');
  if (!img) return;

  const url = await getConfigValue('imagen_premios_inicio', '');

  if (!url) {
    img.src = '';
    img.classList.add('oculto');
    return;
  }

  img.src = url;
  img.classList.remove('oculto');
}

async function eliminarImagenPremiosInicio() {
  if (!SITE_ID || !SITE_SLUG) {
    alert('Error: sitio no identificado.');
    return;
  }

  if (!confirm('¿Eliminar la imagen de premios?')) return;

  try {
    const urlActual = await getConfigValue('imagen_premios_inicio', null);

    if (urlActual) {
      const rutaArchivo = obtenerRutaStorageDesdeUrlImagen(urlActual);

      if (rutaArchivo) {
        await supabase.storage
          .from('imagenes')
          .remove([rutaArchivo]);
      }
    }

    const ok = await setConfigValue('imagen_premios_inicio', '');

    if (!ok) {
      alert('Error limpiando la configuración de la imagen');
      return;
    }

    const img = document.getElementById('imagenPremiosInicio');

    if (img) {
      img.src = '';
      img.classList.add('oculto');
    }

    alert('Imagen eliminada correctamente');

  } catch (err) {
    console.error(err);
    alert('Error eliminando imagen');
  }
}

window.subirImagenPremiosInicio = subirImagenPremiosInicio;
window.eliminarImagenPremiosInicio = eliminarImagenPremiosInicio;
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
    console.warn('No se puede activar Realtime progreso: SITE_ID no está cargado.');
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
      console.log('📡 Realtime progreso:', status);
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
    console.error(error);
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
window.activarCohetes = activarCohetes;
window.mostrarSeccion = mostrarSeccion;
window.recuperarPasswordAdmin = recuperarPasswordAdmin;

console.log('✅ Sistema configurado correctamente');
