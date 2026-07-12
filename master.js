// ==================== PANEL MASTER ===================
var supabase = window.supabase;

// ==================== SEGURIDAD: LOGS SIN DATOS SENSIBLES ====================
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


const masterState = {
  user: null,
  sitios: [],
  admins: []
};

const MASTER_PLANES = {
  basico: { nombre: 'Plan Básico', precio: 10, clase: 'basico', icono: '📦' },
  plus: { nombre: 'Plan Plus', precio: 15, clase: 'plus', icono: '⭐' },
  pro: { nombre: 'Plan Pro', precio: 20, clase: 'pro', icono: '💎' }
};

function masterPlanInfo(plan) {
  return MASTER_PLANES[plan] || MASTER_PLANES.basico;
}

function masterPlanBadge(plan) {
  const info = masterPlanInfo(plan);
  return `<span class="master-plan-badge ${info.clase}">${info.icono} ${info.nombre}</span>`;
}

function $(id) {
  return document.getElementById(id);
}

function masterSetEstado(id, mensaje, tipo = 'info') {
  const el = $(id);
  if (!el) return;

  el.textContent = mensaje || '';
  el.className = `master-status ${tipo}`;
}

function masterNormalizarSlug(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function masterEscapeHTML(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function masterUrlSitio(slug) {
  slug = masterNormalizarSlug(slug);

  if (!slug) {
    return `${window.location.origin}/`;
  }

  // Link corto para cualquier sitio nuevo:
  // https://bingogp.com/bingolike
  // El 404.html lo redirige automáticamente a:
  // https://bingogp.com/bingo.html?site=bingolike
  return `${window.location.origin}/${encodeURIComponent(slug)}`;
}

function masterIsTrue(valor) {
  return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

function masterSincronizarModoBingo75(bingoId, simpleId) {
  const bingo = $(bingoId);
  const simple = $(simpleId);
  if (!bingo || !simple) return;

  if (bingo.checked) {
    simple.checked = false;
    simple.disabled = true;
  } else {
    simple.disabled = false;
  }
}

async function masterSetConfigSitio(siteId, clave, valor) {
  const { data, error } = await supabase.rpc('rpc_set_config_sitio', {
    _site_id: siteId,
    _clave: clave,
    _valor: String(valor)
  });

  if (error) throw error;
  if (data !== true) throw new Error(`No se pudo guardar ${clave}`);
  return true;
}

async function masterSetClaveReinicio(siteId, clave) {
  const { data, error } = await supabase.rpc('rpc_guardar_clave_reinicio', {
    _site_id: siteId,
    _clave: clave
  });

  if (error) throw error;
  if (data !== true) throw new Error('No se pudo guardar la clave de reinicio');
  return true;
}

async function masterTieneClaveReinicio(siteId) {
  const { data, error } = await supabase.rpc('rpc_tiene_clave_reinicio', {
    _site_id: siteId
  });

  if (error) throw error;
  return data === true;
}

async function masterGetConfigSitio(siteId, clave, fallback = '') {
  const { data, error } = await supabase.rpc('rpc_get_config_sitio', {
    _site_id: siteId,
    _clave: clave,
    _fallback: fallback
  });

  if (error) {
    warnSeguro('No se pudo leer configuración:', clave, error);
    return fallback;
  }

  return data ?? fallback;
}

function masterMostrarLogin() {
  $('master-login')?.classList.remove('oculto');
  $('master-dashboard')?.classList.add('oculto');

  const overlay = $('overlay-carga');
  if (overlay) overlay.style.display = 'none';
}

function masterMostrarDashboard() {
  $('master-login')?.classList.add('oculto');
  $('master-dashboard')?.classList.remove('oculto');

  const overlay = $('overlay-carga');
  if (overlay) overlay.style.display = 'none';

  if ($('masterEmailDisplay')) {
    $('masterEmailDisplay').textContent = 'Master';
  }
}

async function masterVerificarAcceso() {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session) {
      masterState.user = null;
      masterMostrarLogin();
      return false;
    }

    // No guardamos ni mostramos el correo autenticado en el panel.
    masterState.user = { rol: 'master' };

    // Debe existir en Supabase:
    // public.es_master_admin() returns boolean
    const { data, error } = await supabase.rpc('es_master_admin');

    if (error) {
      errorSeguro('Error verificando master:', error);
      masterSetEstado(
        'masterLoginEstado',
        'No se pudo verificar si eres master. Revisa la función es_master_admin().',
        'error'
      );
      masterMostrarLogin();
      return false;
    }

    if (data !== true) {
      await supabase.auth.signOut();
      masterState.user = null;
      masterSetEstado('masterLoginEstado', 'Este correo no tiene permiso master.', 'error');
      masterMostrarLogin();
      return false;
    }

    masterMostrarDashboard();
    await masterCargarSitios();
    await masterCargarAdminsSitios();
    return true;

  } catch (error) {
    errorSeguro('Error en masterVerificarAcceso:', error);
    masterSetEstado('masterLoginEstado', 'Error verificando acceso master.', 'error');
    masterMostrarLogin();
    return false;
  }
}

// ==================== RATE LIMIT LOGIN MASTER ====================
const MASTER_LOGIN_RATE_MAX_INTENTOS = 5;
const MASTER_LOGIN_RATE_VENTANA_MINUTOS = 10;
const MASTER_LOGIN_RATE_BLOQUEO_MINUTOS = 15;

function masterNormalizarRespuestaRateLogin(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function masterVerificarRateLogin(email) {
  const { data, error } = await supabase.rpc('rpc_login_rate_check', {
    _tipo: 'master_login',
    _email: email,
    _site_id: null,
    _max_intentos: MASTER_LOGIN_RATE_MAX_INTENTOS,
    _ventana_minutos: MASTER_LOGIN_RATE_VENTANA_MINUTOS,
    _bloqueo_minutos: MASTER_LOGIN_RATE_BLOQUEO_MINUTOS
  });

  if (error) {
    errorSeguro('Error verificando rate limit master:', error);
    throw new Error('Falta ejecutar el SQL de seguridad para intentos de login.');
  }

  return masterNormalizarRespuestaRateLogin(data) || { permitido: true, mensaje: 'Permitido' };
}

async function masterRegistrarFalloRateLogin(email) {
  const { data, error } = await supabase.rpc('rpc_login_rate_registrar_fallo', {
    _tipo: 'master_login',
    _email: email,
    _site_id: null,
    _max_intentos: MASTER_LOGIN_RATE_MAX_INTENTOS,
    _ventana_minutos: MASTER_LOGIN_RATE_VENTANA_MINUTOS,
    _bloqueo_minutos: MASTER_LOGIN_RATE_BLOQUEO_MINUTOS
  });

  if (error) {
    warnSeguro('No se pudo registrar fallo de login master:', error);
    return null;
  }

  return masterNormalizarRespuestaRateLogin(data);
}

async function masterLimpiarRateLogin(email) {
  const { error } = await supabase.rpc('rpc_login_rate_limpiar', {
    _tipo: 'master_login',
    _email: email,
    _site_id: null
  });

  if (error) {
    warnSeguro('No se pudo limpiar rate limit master:', error);
  }
}

async function masterLogin() {
  const email = $('masterEmail')?.value.trim().toLowerCase();
  const password = $('masterPassword')?.value || '';

  masterSetEstado('masterLoginEstado', '');

  if (!email || !password) {
    masterSetEstado('masterLoginEstado', 'Ingresa correo y contraseña.', 'error');
    return;
  }

  const btn = $('btnMasterLogin');
  const texto = btn ? btn.textContent : '';

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verificando...';
  }

  try {
    const rate = await masterVerificarRateLogin(email);

    if (rate && rate.permitido === false) {
      masterSetEstado('masterLoginEstado', rate.mensaje || 'Demasiados intentos. Intenta más tarde.', 'error');
      if ($('masterPassword')) $('masterPassword').value = '';
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      const fallo = await masterRegistrarFalloRateLogin(email);
      masterSetEstado('masterLoginEstado', fallo?.mensaje || 'Correo o contraseña incorrectos.', 'error');
      if ($('masterPassword')) $('masterPassword').value = '';
      return;
    }

    const accesoOk = await masterVerificarAcceso();

    if (accesoOk === false) {
      const fallo = await masterRegistrarFalloRateLogin(email);
      masterSetEstado('masterLoginEstado', fallo?.mensaje || 'Este correo no tiene permiso master.', 'error');
      if ($('masterPassword')) $('masterPassword').value = '';
      return;
    }

    await masterLimpiarRateLogin(email);

  } catch (error) {
    errorSeguro('Error login master:', error);
    masterSetEstado('masterLoginEstado', error.message || 'Error iniciando sesión.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = texto;
    }
  }
}

async function masterLogout() {
  await supabase.auth.signOut();
  masterState.user = null;
  masterState.sitios = [];
  masterMostrarLogin();
}
function masterFechaHoyISO() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy.toISOString().slice(0, 10);
}

function masterCalcularFechaVencimiento(meses) {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  fecha.setMonth(fecha.getMonth() + Number(meses || 1));
  return fecha.toISOString().slice(0, 10);
}

function masterDiasRestantes(fechaVencimiento) {
  if (!fechaVencimiento) return 0;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vence = new Date(`${fechaVencimiento}T00:00:00`);
  vence.setHours(0, 0, 0, 0);

  const diff = Math.ceil((vence - hoy) / 86400000);
  return Math.max(diff, 0);
}

function masterTextoVencimiento(sitio) {
  const fecha = sitio.fecha_vencimiento || '';
  const dias = masterDiasRestantes(fecha);

  if (!fecha) {
    return '<span class="site-paused">Sin fecha</span>';
  }

  if (dias <= 0) {
    return `<span class="site-paused">Vencido<br><small>${masterEscapeHTML(fecha)}</small></span>`;
  }

  return `<span class="site-active">${dias} días<br><small>Vence: ${masterEscapeHTML(fecha)}</small></span>`;
}

function masterMostrarPanelAccion(tipo) {
  const contenedor = $('masterPanelAcciones');
  const crearSitio = $('masterCrearSitioSection');
  const crearAdmin = $('masterCrearAdminSection');

  if (!contenedor || !crearSitio || !crearAdmin) return;

  crearSitio.classList.add('oculto');
  crearAdmin.classList.add('oculto');

  if (tipo === 'crear-sitio') {
    crearSitio.classList.remove('oculto');
  }

  if (tipo === 'crear-admin') {
    crearAdmin.classList.remove('oculto');
  }

  contenedor.classList.remove('oculto');

  requestAnimationFrame(() => {
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function masterOcultarPanelAccion() {
  $('masterCrearSitioSection')?.classList.add('oculto');
  $('masterCrearAdminSection')?.classList.add('oculto');
  $('masterPanelAcciones')?.classList.add('oculto');
}

function masterIrASeccion(id) {
  const el = $(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function masterActualizarResumen() {
  const contenedor = $('masterResumenCards');
  if (!contenedor) return;

  const sitios = masterState.sitios || [];
  const totalSitios = sitios.length;
  const activos = sitios.filter(s => s.activo !== false && masterDiasRestantes(s.fecha_vencimiento) > 0).length;
  const pausados = sitios.filter(s => s.activo === false).length;
  const vencidos = sitios.filter(s => masterDiasRestantes(s.fecha_vencimiento) <= 0).length;
  const admins = masterState.admins?.length || 0;
  const totalTopes = sitios.reduce((acc, s) => acc + Number(s.limite_cartones || s.total_cartones || 0), 0);

  masterActualizarResumenPlanes();

  contenedor.innerHTML = `
    <article class="master-kpi-card">
      <span>🌐 Sitios</span>
      <strong>${totalSitios}</strong>
      <small>Total registrados</small>
    </article>

    <article class="master-kpi-card ok">
      <span>✅ Activos</span>
      <strong>${activos}</strong>
      <small>Vendiendo o listos</small>
    </article>

    <article class="master-kpi-card warning">
      <span>⏸️ Pausados</span>
      <strong>${pausados}</strong>
      <small>Detenidos por master</small>
    </article>

    <article class="master-kpi-card danger">
      <span>⏳ Vencidos</span>
      <strong>${vencidos}</strong>
      <small>Sin días restantes</small>
    </article>

    <article class="master-kpi-card">
      <span>🎟️ Tope total</span>
      <strong>${totalTopes}</strong>
      <small>Cartones permitidos</small>
    </article>

    <article class="master-kpi-card">
      <span>👥 Admins</span>
      <strong>${admins}</strong>
      <small>Asignados</small>
    </article>
  `;
}


function masterActualizarResumenPlanes() {
  const contenedor = $('masterResumenPlanes');
  if (!contenedor) return;

  const sitios = masterState.sitios || [];
  const activos = sitios.filter(s => s.activo !== false && masterDiasRestantes(s.fecha_vencimiento) > 0);

  const conteo = {
    basico: sitios.filter(s => (s.plan_tipo || 'basico') === 'basico').length,
    plus: sitios.filter(s => (s.plan_tipo || 'basico') === 'plus').length,
    pro: sitios.filter(s => (s.plan_tipo || 'basico') === 'pro').length
  };

  const ingresoMensual = activos.reduce((acc, s) => {
    const info = masterPlanInfo(s.plan_tipo || 'basico');
    return acc + Number(info.precio || 0);
  }, 0);

  contenedor.innerHTML = `
    <article class="master-plan-card basico">
      <span>📦 Plan Básico</span>
      <strong>${conteo.basico}</strong>
      <small>Clientes en Básico · $10</small>
    </article>

    <article class="master-plan-card plus">
      <span>⭐ Plan Plus</span>
      <strong>${conteo.plus}</strong>
      <small>Clientes en Plus · $15</small>
    </article>

    <article class="master-plan-card pro">
      <span>💎 Plan Pro</span>
      <strong>${conteo.pro}</strong>
      <small>Clientes en Pro · $20</small>
    </article>

    <article class="master-plan-card total">
      <span>💰 Estimado mensual</span>
      <strong>$${ingresoMensual.toFixed(2)}</strong>
      <small>Solo sitios activos y no vencidos</small>
    </article>
  `;
}

async function masterCrearSitio() {
  const nombre = $('masterNombreSitio')?.value.trim();
  const slugManual = $('masterSlugSitio')?.value.trim();
  const titulo = $('masterTituloSitio')?.value.trim();
  const total = parseInt($('masterTotalCartones')?.value, 10);
  const precio = parseFloat($('masterPrecioCarton')?.value);
  const claveReinicio = $('masterClaveReinicio')?.value.trim();
  const claveBorrarCartones = $('masterClaveBorrarCartones')?.value.trim();
  const logoUrl = $('masterLogoUrl')?.value.trim();
  const colorPrincipal = $('masterColorPrincipal')?.value.trim();
  const whatsappGrupo = $('masterWhatsappGrupo')?.value.trim();
  const privacidadOrganizador = $('masterPrivacidadOrganizador')?.value.trim();
  const privacidadContacto = $('masterPrivacidadContacto')?.value.trim();
  const privacidadTexto = $('masterPrivacidadTexto')?.value.trim();
  const planTipo = $('masterPlanSitio')?.value || 'basico';
  const bingo75Habilitado = $('masterBingo75Habilitado')?.checked === true;
  const modoCartonSimple = !bingo75Habilitado && $('masterModoCartonSimple')?.checked === true;
  const mostrarEnVivo = $('masterMostrarEnVivo')?.checked !== false;
  const mostrarTopCompradores = $('masterMostrarTopCompradores')?.checked !== false;
  const mostrarPromociones = $('masterMostrarPromociones')?.checked !== false;
const mesesServicio = parseInt($('masterMesesServicio')?.value || '1', 10);
const fechaInicio = masterFechaHoyISO();
const fechaVencimiento = masterCalcularFechaVencimiento(mesesServicio);
  const slug = masterNormalizarSlug(slugManual || nombre);

  if (!nombre || !slug) {
    masterSetEstado('masterEstadoCrearSitio', 'Debes colocar nombre y slug.', 'error');
    return;
  }

  if (!Number.isFinite(total) || total < 1) {
    masterSetEstado('masterEstadoCrearSitio', 'El total de cartones debe ser mayor a 0.', 'error');
    return;
  }

  if (!Number.isFinite(precio) || precio < 0) {
    masterSetEstado('masterEstadoCrearSitio', 'El precio debe ser válido.', 'error');
    return;
  }

  if (claveReinicio.length < 12 || claveReinicio.length > 128) {
    masterSetEstado('masterEstadoCrearSitio', 'La clave de reinicio debe tener entre 12 y 128 caracteres.', 'error');
    return;
  }

  if (!claveBorrarCartones) {
    masterSetEstado('masterEstadoCrearSitio', 'Debes colocar una clave para borrar cartones de este sitio.', 'error');
    return;
  }

  masterSetEstado('masterEstadoCrearSitio', 'Creando sitio...', 'info');

  const nuevoSitio = {
  nombre,
  slug,
  titulo_publico: titulo || nombre,
  plan_tipo: planTipo,
  bingo75_habilitado: bingo75Habilitado,
  mostrar_en_vivo: mostrarEnVivo,
  mostrar_top_compradores: mostrarTopCompradores,
  privacidad_organizador: privacidadOrganizador || null,
  privacidad_contacto: privacidadContacto || null,
  privacidad_texto: privacidadTexto || null,

  // Tope máximo colocado por el master
  limite_cartones: total,

  // Se mantiene para compatibilidad con código anterior
  total_cartones: total,

  // Al crear, los visibles empiezan igual al tope
  cartones_visibles: total,

  precio_carton_bs: precio,
  activo: true,
  fecha_inicio: fechaInicio,
  fecha_vencimiento: fechaVencimiento,
  meses_servicio: mesesServicio
};

  if (logoUrl) nuevoSitio.logo_url = logoUrl;
  if (colorPrincipal) nuevoSitio.color_principal = colorPrincipal;
  if (whatsappGrupo) nuevoSitio.whatsapp_grupo = whatsappGrupo;

  try {
    const { data, error } = await supabase
      .from('sitios')
      .insert([nuevoSitio])
      .select('*')
      .single();

    if (error) throw error;

    await masterSetConfigSitio(
      data.id,
      'modo_carton_simple',
      modoCartonSimple ? 'true' : 'false'
    );

    await masterSetConfigSitio(
      data.id,
      'mostrar_promociones',
      mostrarPromociones ? 'true' : 'false'
    );

    await masterSetClaveReinicio(data.id, claveReinicio);

    await masterSetConfigSitio(
      data.id,
      'clave_borrar_cartones',
      claveBorrarCartones
    );

    masterSetEstado(
      'masterEstadoCrearSitio',
      `✅ Sitio creado correctamente.\nLink: ${masterUrlSitio(data.slug)}`,
      'success'
    );

    ['masterNombreSitio', 'masterSlugSitio', 'masterTituloSitio', 'masterTotalCartones',
     'masterPrecioCarton', 'masterClaveReinicio', 'masterClaveBorrarCartones',
     'masterLogoUrl', 'masterColorPrincipal', 'masterWhatsappGrupo',
     'masterPrivacidadOrganizador', 'masterPrivacidadContacto', 'masterPrivacidadTexto'
    ].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    if ($('masterPlanSitio')) $('masterPlanSitio').value = 'basico';
    if ($('masterModoCartonSimple')) $('masterModoCartonSimple').checked = false;
    if ($('masterBingo75Habilitado')) $('masterBingo75Habilitado').checked = false;
    masterSincronizarModoBingo75('masterBingo75Habilitado', 'masterModoCartonSimple');
    if ($('masterMostrarEnVivo')) $('masterMostrarEnVivo').checked = true;
    if ($('masterMostrarTopCompradores')) $('masterMostrarTopCompradores').checked = true;
    if ($('masterMostrarPromociones')) $('masterMostrarPromociones').checked = true;

    await masterCargarSitios();

  } catch (error) {
    errorSeguro('Error creando sitio:', error);
    masterSetEstado('masterEstadoCrearSitio', 'Error creando sitio: ' + error.message, 'error');
  }
}

async function masterCargarSitios() {
  const contenedor = $('masterListaSitios');
  if (!contenedor) return;

  contenedor.innerHTML = '<p>Cargando sitios...</p>';

  try {
    const { data, error } = await supabase
      .from('sitios')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    masterState.sitios = data || [];
    masterActualizarResumen();

    if (!masterState.sitios.length) {
      contenedor.innerHTML = '<p>No hay sitios registrados.</p>';
      return;
    }

    const filas = masterState.sitios.map(sitio => {
      const url = masterUrlSitio(sitio.slug || '');
      const activo = sitio.activo !== false;

      return `
        <tr>
          <td>${masterEscapeHTML(sitio.id)}</td>
          <td>
            <strong>${masterEscapeHTML(sitio.nombre || '')}</strong><br>
            <small>${masterEscapeHTML(sitio.titulo_publico || '')}</small><br>
            ${masterPlanBadge(sitio.plan_tipo || 'basico')}
          </td>
          <td>
            <code>${masterEscapeHTML(sitio.slug || '')}</code><br>
            <a href="${url}" target="_blank" rel="noopener">Abrir sitio</a><br>
            <small>🔴 En vivo: ${sitio.mostrar_en_vivo === false ? 'No' : 'Sí'} · 🏆 Top: ${sitio.mostrar_top_compradores === false ? 'No' : 'Sí'}</small><br>
            <small>Bingo 75: ${sitio.bingo75_habilitado === true ? 'Habilitado' : 'Deshabilitado'}</small>
          </td>
          <td>
            <strong>Tope:</strong> ${masterEscapeHTML(sitio.limite_cartones || sitio.total_cartones || 0)}<br>
            <small>Visible: ${masterEscapeHTML(sitio.cartones_visibles || 0)}</small>
          </td>
          <td>${Number(sitio.precio_carton_bs || 0).toFixed(2)} Bs</td>
          <td>
  <span class="${activo ? 'site-active' : 'site-paused'}">
    ${activo ? 'Activo' : 'Pausado'}
  </span>
</td>
<td>
  ${masterTextoVencimiento(sitio)}
</td>
<td>
            <div class="master-row-actions">
              <button class="master-btn ${activo ? 'warning' : 'success'}"
                      onclick="masterCambiarEstadoSitio(${Number(sitio.id)}, ${activo ? 'false' : 'true'})">
                ${activo ? '⏸️ Pausar' : '▶️ Activar'}
              </button>

              <button class="master-btn secondary" onclick="masterAbrirEditor(${Number(sitio.id)})">
                ✏️ Editar
              </button>

              <button class="master-btn warning" onclick="masterRenovarSitioRapido(${Number(sitio.id)})">
                📅 Renovar
              </button>

              <button class="master-btn danger" onclick="masterEliminarSitio(${Number(sitio.id)})">
                🗑️ Eliminar
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    contenedor.innerHTML = `
      <table class="master-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Sitio</th>
            <th>Link</th>
            <th>Cartones</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Vencimiento</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `;

  } catch (error) {
    errorSeguro('Error cargando sitios:', error);
    contenedor.innerHTML = `<p style="color:red;">Error cargando sitios: ${masterEscapeHTML(error.message)}</p>`;
  }
}

async function masterCambiarEstadoSitio(siteId, nuevoEstado) {
  const activo = nuevoEstado === true || nuevoEstado === 'true';

  const confirmar = confirm(activo ? '¿Activar este sitio?' : '¿Pausar este sitio?');
  if (!confirmar) return;

  try {
    const { error } = await supabase
      .from('sitios')
      .update({ activo })
      .eq('id', siteId);

    if (error) throw error;

    await masterCargarSitios();

  } catch (error) {
    errorSeguro('Error cambiando estado:', error);
    alert('Error cambiando estado: ' + error.message);
  }
}

async function masterAbrirEditor(siteId) {
  const sitio = masterState.sitios.find(s => Number(s.id) === Number(siteId));

  if (!sitio) {
    alert('No se encontró el sitio.');
    return;
  }

  $('masterEditorSitio')?.classList.remove('oculto');

  $('masterEditId').value = sitio.id;
  $('masterEditNombre').value = sitio.nombre || '';
  $('masterEditTitulo').value = sitio.titulo_publico || sitio.nombre || '';
  if ($('masterEditPlanSitio')) $('masterEditPlanSitio').value = sitio.plan_tipo || 'basico';
  $('masterEditTotal').value = sitio.limite_cartones || sitio.total_cartones || sitio.cartones_visibles || 0;
  $('masterEditPrecio').value = sitio.precio_carton_bs || 0;
  $('masterEditLogoUrl').value = sitio.logo_url || '';
  $('masterEditColorPrincipal').value = sitio.color_principal || '';
  $('masterEditWhatsappGrupo').value = sitio.whatsapp_grupo || '';
  if ($('masterEditPrivacidadOrganizador')) $('masterEditPrivacidadOrganizador').value = sitio.privacidad_organizador || '';
  if ($('masterEditPrivacidadContacto')) $('masterEditPrivacidadContacto').value = sitio.privacidad_contacto || '';
  if ($('masterEditPrivacidadTexto')) $('masterEditPrivacidadTexto').value = sitio.privacidad_texto || '';
  $('masterEditActivo').value = sitio.activo === false ? 'false' : 'true';
  if ($('masterEditMostrarEnVivo')) $('masterEditMostrarEnVivo').checked = sitio.mostrar_en_vivo !== false;
  if ($('masterEditMostrarTopCompradores')) $('masterEditMostrarTopCompradores').checked = sitio.mostrar_top_compradores !== false;
  if ($('masterEditBingo75Habilitado')) $('masterEditBingo75Habilitado').checked = sitio.bingo75_habilitado === true;
  masterSincronizarModoBingo75('masterEditBingo75Habilitado', 'masterEditModoCartonSimple');

  if ($('masterEditClaveReinicio')) {
    const inputClaveReinicio = $('masterEditClaveReinicio');
    inputClaveReinicio.value = '';

    try {
      const tieneClaveReinicio = await masterTieneClaveReinicio(sitio.id);
      inputClaveReinicio.dataset.tieneClave = String(tieneClaveReinicio);
      inputClaveReinicio.placeholder = tieneClaveReinicio
        ? 'Dejar vacía para conservar la clave actual'
        : 'Crea una clave de 12 caracteres o más';
    } catch (error) {
      warnSeguro('No se pudo comprobar la clave de reinicio:', error);
      inputClaveReinicio.dataset.tieneClave = 'false';
      inputClaveReinicio.placeholder = 'Ingresa una nueva clave para continuar';
    }
  }

  if ($('masterEditClaveBorrarCartones')) {
    const valorClaveBorrarCartones = await masterGetConfigSitio(
      sitio.id,
      'clave_borrar_cartones',
      ''
    );

    $('masterEditClaveBorrarCartones').value = valorClaveBorrarCartones || '';
  }

  if ($('masterEditMostrarPromociones')) {
    $('masterEditMostrarPromociones').checked = true;

    const valorPromociones = await masterGetConfigSitio(
      sitio.id,
      'mostrar_promociones',
      'true'
    );

    $('masterEditMostrarPromociones').checked = String(valorPromociones).toLowerCase() !== 'false';
  }

  if ($('masterEditModoCartonSimple')) {
    $('masterEditModoCartonSimple').checked = false;

    const valorSimple = await masterGetConfigSitio(
      sitio.id,
      'modo_carton_simple',
      'false'
    );

    $('masterEditModoCartonSimple').checked = masterIsTrue(valorSimple);
    masterSincronizarModoBingo75('masterEditBingo75Habilitado', 'masterEditModoCartonSimple');
  }

  masterSetEstado('masterEstadoEditarSitio', '');

  window.scrollTo({
    top: $('masterEditorSitio').offsetTop - 20,
    behavior: 'smooth'
  });
}

function masterCerrarEditor() {
  $('masterEditorSitio')?.classList.add('oculto');
  masterSetEstado('masterEstadoEditarSitio', '');
}

async function masterGuardarEdicion() {
  const siteId = parseInt($('masterEditId')?.value, 10);

  if (!Number.isFinite(siteId)) {
    masterSetEstado('masterEstadoEditarSitio', 'No se encontró el ID del sitio.', 'error');
    return;
  }

  const nombre = $('masterEditNombre')?.value.trim();
  const titulo = $('masterEditTitulo')?.value.trim();
  const total = parseInt($('masterEditTotal')?.value, 10);
  const precio = parseFloat($('masterEditPrecio')?.value);
  const inputClaveReinicio = $('masterEditClaveReinicio');
  const claveReinicio = inputClaveReinicio?.value.trim() || '';
  const tieneClaveReinicio = inputClaveReinicio?.dataset.tieneClave === 'true';
  const claveBorrarCartones = $('masterEditClaveBorrarCartones')?.value.trim();
  const logoUrl = $('masterEditLogoUrl')?.value.trim();
  const colorPrincipal = $('masterEditColorPrincipal')?.value.trim();
  const whatsappGrupo = $('masterEditWhatsappGrupo')?.value.trim();
  const privacidadOrganizador = $('masterEditPrivacidadOrganizador')?.value.trim();
  const privacidadContacto = $('masterEditPrivacidadContacto')?.value.trim();
  const privacidadTexto = $('masterEditPrivacidadTexto')?.value.trim();
  const activo = $('masterEditActivo')?.value === 'true';
  const planTipo = $('masterEditPlanSitio')?.value || 'basico';
  const bingo75Habilitado = $('masterEditBingo75Habilitado')?.checked === true;
  const modoCartonSimple = !bingo75Habilitado && $('masterEditModoCartonSimple')?.checked === true;
  const mostrarEnVivo = $('masterEditMostrarEnVivo')?.checked !== false;
  const mostrarTopCompradores = $('masterEditMostrarTopCompradores')?.checked !== false;
  const mostrarPromociones = $('masterEditMostrarPromociones')?.checked !== false;

  if (!nombre) {
    masterSetEstado('masterEstadoEditarSitio', 'El nombre no puede estar vacío.', 'error');
    return;
  }

  if (!Number.isFinite(total) || total < 1) {
    masterSetEstado('masterEstadoEditarSitio', 'Límite de cartones inválido.', 'error');
    return;
  }

  if (!Number.isFinite(precio) || precio < 0) {
    masterSetEstado('masterEstadoEditarSitio', 'Precio inválido.', 'error');
    return;
  }

  if (!claveReinicio && !tieneClaveReinicio) {
    masterSetEstado('masterEstadoEditarSitio', 'Debes crear una clave de reinicio para este sitio.', 'error');
    return;
  }

  if (claveReinicio && (claveReinicio.length < 12 || claveReinicio.length > 128)) {
    masterSetEstado('masterEstadoEditarSitio', 'La nueva clave de reinicio debe tener entre 12 y 128 caracteres.', 'error');
    return;
  }

  if (!claveBorrarCartones) {
    masterSetEstado('masterEstadoEditarSitio', 'La clave para borrar cartones no puede estar vacía.', 'error');
    return;
  }

  masterSetEstado('masterEstadoEditarSitio', 'Guardando cambios...', 'info');

  try {
    // 1) Guardar datos generales del sitio
    const cambios = {
      nombre,
      titulo_publico: titulo || nombre,
      plan_tipo: planTipo,
      bingo75_habilitado: bingo75Habilitado,
      mostrar_en_vivo: mostrarEnVivo,
      mostrar_top_compradores: mostrarTopCompradores,
      precio_carton_bs: precio,
      activo,
      logo_url: logoUrl || null,
      color_principal: colorPrincipal || null,
      whatsapp_grupo: whatsappGrupo || null,
      privacidad_organizador: privacidadOrganizador || null,
      privacidad_contacto: privacidadContacto || null,
      privacidad_texto: privacidadTexto || null
    };

    const { error: errorUpdate } = await supabase
      .from('sitios')
      .update(cambios)
      .eq('id', siteId);

    if (errorUpdate) throw errorUpdate;

    // 2) Guardar el tope máximo usando la RPC master
    // Esta RPC actualiza limite_cartones y ajusta cartones_visibles si pasa del tope.
    const { error: errorLimite } = await supabase.rpc('rpc_master_set_limite_cartones', {
      _site_id: siteId,
      _limite_cartones: total
    });

    if (errorLimite) throw errorLimite;

    await masterSetConfigSitio(
      siteId,
      'modo_carton_simple',
      modoCartonSimple ? 'true' : 'false'
    );

    await masterSetConfigSitio(
      siteId,
      'mostrar_promociones',
      mostrarPromociones ? 'true' : 'false'
    );

    if (claveReinicio) {
      await masterSetClaveReinicio(siteId, claveReinicio);
      inputClaveReinicio.dataset.tieneClave = 'true';
      inputClaveReinicio.value = '';
      inputClaveReinicio.placeholder = 'Dejar vacía para conservar la clave actual';
    }

    await masterSetConfigSitio(
      siteId,
      'clave_borrar_cartones',
      claveBorrarCartones
    );

    masterSetEstado('masterEstadoEditarSitio', '✅ Cambios guardados.', 'success');

    await masterCargarSitios();

  } catch (error) {
    errorSeguro('Error guardando edición:', error);
    masterSetEstado('masterEstadoEditarSitio', 'Error guardando cambios: ' + error.message, 'error');
  }
}

function masterConfigurarEventos() {

  $('btnMasterLogin')?.addEventListener('click', masterLogin);
  $('btnMasterLogout')?.addEventListener('click', masterLogout);
  $('btnMasterRecargar')?.addEventListener('click', masterCargarSitios);
  $('btnMasterRecargarAdmins')?.addEventListener('click', masterCargarAdminsSitios);
  $('btnMasterVerSitios')?.addEventListener('click', () => masterIrASeccion('masterSitiosSection'));
  $('btnMasterVerCrearSitio')?.addEventListener('click', () => masterMostrarPanelAccion('crear-sitio'));
  $('btnMasterVerCrearAdmin')?.addEventListener('click', () => masterMostrarPanelAccion('crear-admin'));
  $('btnMasterCrearSitio')?.addEventListener('click', masterCrearSitio);
  $('btnMasterCrearAdmin')?.addEventListener('click', masterCrearAdminSitio);
  $('btnMasterGuardarEdicion')?.addEventListener('click', masterGuardarEdicion);
  $('btnMasterRenovarSitio')?.addEventListener('click', masterRenovarSitio);
  $('btnMasterCancelarEdicion')?.addEventListener('click', masterCerrarEditor);

  $('masterBingo75Habilitado')?.addEventListener('change', () => {
    masterSincronizarModoBingo75('masterBingo75Habilitado', 'masterModoCartonSimple');
  });

  $('masterEditBingo75Habilitado')?.addEventListener('change', () => {
    masterSincronizarModoBingo75('masterEditBingo75Habilitado', 'masterEditModoCartonSimple');
  });

  $('masterPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') masterLogin();
  });

  $('masterNombreSitio')?.addEventListener('input', () => {
    const slugInput = $('masterSlugSitio');
    const nombre = $('masterNombreSitio')?.value || '';

    if (slugInput && !slugInput.dataset.editado) {
      slugInput.value = masterNormalizarSlug(nombre);
    }
  });

  $('masterSlugSitio')?.addEventListener('input', () => {
    $('masterSlugSitio').dataset.editado = '1';
    $('masterSlugSitio').value = masterNormalizarSlug($('masterSlugSitio').value);
  });
}
async function masterCrearAdminSitio() {
  const estado = document.getElementById('masterEstadoCrearAdmin');

  try {
    const siteId = Number(document.getElementById('masterAdminSiteId')?.value || 0);
    const email = document.getElementById('masterAdminEmail')?.value.trim().toLowerCase();
    const password = document.getElementById('masterAdminPassword')?.value.trim();

    if (!siteId) {
      alert('Coloca el ID del sitio.');
      return;
    }

    if (!email || !email.includes('@')) {
      alert('Coloca un correo válido.');
      return;
    }

    if (!password || password.length < 6) {
      alert('La contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    if (estado) {
      estado.innerHTML = '<p style="color:blue;">Creando administrador...</p>';
    }

    const { data, error } = await supabase.functions.invoke('master-create-admin', {
      body: {
        site_id: siteId,
        email: email,
        password: password,
        rol: 'admin'
      }
    });

    if (error) {
      throw error;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (estado) {
      estado.innerHTML = `
        <p style="color:green;">
          ✅ ${masterEscapeHTML(data?.mensaje || 'Administrador creado correctamente.')}
        </p>
      `;
    }

    document.getElementById('masterAdminEmail').value = '';
    document.getElementById('masterAdminPassword').value = '';
await masterCargarAdminsSitios();
  } catch (error) {
    errorSeguro('Error creando admin:', error);

    if (estado) {
      estado.innerHTML = `
        <p style="color:red;">
          Error creando admin: ${masterEscapeHTML(error.message || error)}
        </p>
      `;
    }
  }
}
async function masterCargarAdminsSitios() {
  const contenedor = document.getElementById('masterListaAdmins');
  if (!contenedor) return;

  contenedor.innerHTML = '<p>Cargando administradores...</p>';

  try {
    const { data, error } = await supabase
      .rpc('rpc_master_list_admins_sitios');

    if (error) throw error;

    masterState.admins = data || [];
    masterActualizarResumen();

    if (!masterState.admins.length) {
      contenedor.innerHTML = '<p>No hay administradores asignados todavía.</p>';
      return;
    }

    const filas = masterState.admins.map(admin => {
      const sitio = masterState.sitios.find(s => Number(s.id) === Number(admin.site_id));
      const activo = admin.activo !== false;

      return `
        <tr>
          <td>${masterEscapeHTML(admin.id)}</td>
          <td>
            <strong>${masterEscapeHTML(sitio?.nombre || 'Sitio no encontrado')}</strong><br>
            <small>ID: ${masterEscapeHTML(admin.site_id)} | ${masterEscapeHTML(sitio?.slug || '')}</small>
          </td>
          <td>${masterEscapeHTML(admin.email_mascara || '')}</td>
          <td>${masterEscapeHTML(admin.rol || 'admin')}</td>
          <td>
            <span class="${activo ? 'site-active' : 'site-paused'}">
              ${activo ? 'Activo' : 'Pausado'}
            </span>
          </td>
          <td>
            <button class="master-btn ${activo ? 'warning' : 'success'}"
                    onclick="masterCambiarEstadoAdminSitio(${Number(admin.id)}, ${activo ? 'false' : 'true'})">
              ${activo ? '⏸️ Pausar' : '▶️ Activar'}
            </button>

            <button class="master-btn danger"
                    onclick="masterEliminarAdminSitio(${Number(admin.id)})">
              🗑️ Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join('');

    contenedor.innerHTML = `
      <table class="master-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Sitio</th>
            <th>Admin</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `;

  } catch (error) {
    errorSeguro('Error cargando admins:', error);
    contenedor.innerHTML = `
      <p style="color:red;">
        Error cargando admins: ${masterEscapeHTML(error.message)}
      </p>
    `;
  }
}

async function masterCambiarEstadoAdminSitio(adminId, nuevoEstado) {
  const activo = nuevoEstado === true || nuevoEstado === 'true';

  const admin = masterState.admins.find(a => Number(a.id) === Number(adminId));

  const confirmar = confirm(
    activo
      ? `¿Activar el admin ${admin?.email_mascara || ''}?`
      : `¿Pausar el admin ${admin?.email_mascara || ''}?`
  );

  if (!confirmar) return;

  try {
    const { data, error } = await supabase.rpc('rpc_master_set_admin_activo', {
      _admin_id: Number(adminId),
      _activo: activo
    });

    if (error) throw error;
    if (data !== true) throw new Error('No se pudo actualizar el administrador.');

    await masterCargarAdminsSitios();

  } catch (error) {
    errorSeguro('Error cambiando estado del admin:', error);
    alert('Error cambiando estado del admin: ' + error.message);
  }
}

async function masterEliminarAdminSitio(adminId) {
  const admin = masterState.admins.find(a => Number(a.id) === Number(adminId));

  const confirmar = confirm(
    `¿Eliminar este admin del sitio?\n\n${admin?.email_mascara || ''}\n\nNo borra el usuario de Auth, solo le quita acceso a este sitio.`
  );

  if (!confirmar) return;

  try {
    const { data, error } = await supabase.rpc('rpc_master_delete_admin_sitio', {
      _admin_id: Number(adminId)
    });

    if (error) throw error;
    if (data !== true) throw new Error('No se pudo eliminar el administrador.');

    await masterCargarAdminsSitios();

  } catch (error) {
    errorSeguro('Error eliminando admin:', error);
    alert('Error eliminando admin: ' + error.message);
  }
}

function masterPedirMesesRenovacion(nombreSitio = '') {
  const valor = prompt(
    `¿Cuántos meses quieres renovar ${nombreSitio ? nombreSitio : 'este sitio'}?\n\nOpciones: 1, 3, 6 o 12`,
    '1'
  );

  if (valor === null) return null;

  const meses = parseInt(valor, 10);

  if (![1, 3, 6, 12].includes(meses)) {
    alert('Debes colocar 1, 3, 6 o 12 meses.');
    return null;
  }

  return meses;
}

async function masterRenovarSitioRapido(siteId) {
  const sitio = masterState.sitios.find(s => Number(s.id) === Number(siteId));

  if (!sitio) {
    alert('No se encontró el sitio. Recarga el panel.');
    return;
  }

  const meses = masterPedirMesesRenovacion(sitio.nombre || sitio.slug || '');
  if (!meses) return;

  const confirmar = confirm(`¿Renovar ${sitio.nombre || sitio.slug || 'este sitio'} por ${meses} mes(es)?`);
  if (!confirmar) return;

  try {
    const { data, error } = await supabase.rpc('rpc_master_renovar_sitio', {
      _site_id: Number(siteId),
      _meses: meses
    });

    if (error) throw error;

    const resultado = Array.isArray(data) ? data[0] : data;

    alert(
      `✅ Sitio renovado correctamente.\n\n` +
      `Vence: ${resultado?.fecha_vencimiento || ''}\n` +
      `Días restantes: ${resultado?.dias_restantes ?? ''}`
    );

    await masterCargarSitios();

  } catch (error) {
    errorSeguro('Error renovando sitio:', error);
    alert('Error renovando sitio: ' + (error.message || error));
  }
}

async function masterEliminarSitio(siteId) {
  const sitio = masterState.sitios.find(s => Number(s.id) === Number(siteId));

  if (!sitio) {
    alert('No se encontró el sitio. Recarga el panel.');
    return;
  }

  const slug = sitio.slug || '';
  const nombre = sitio.nombre || slug || `ID ${siteId}`;

  const confirmacion = prompt(
    `⚠️ Vas a eliminar el sitio completo:\n\n${nombre}\nSlug: ${slug}\n\n` +
    `Esto eliminará datos de ese sitio: inscripciones, cartones, configuración, admins, ganadores y pagos.\n\n` +
    `Para confirmar escribe exactamente el slug del sitio:`
  );

  if (confirmacion === null) return;

  if (String(confirmacion).trim().toLowerCase() !== String(slug).trim().toLowerCase()) {
    alert('No se eliminó. El slug no coincide.');
    return;
  }

  const confirmarFinal = confirm(
    `Última confirmación:\n\n¿Eliminar DEFINITIVAMENTE el sitio ${nombre}?\n\n` +
    `Se borrará solamente la información del site_id ${siteId}.\n` +
    `No afecta otros sitios.`
  );

  if (!confirmarFinal) return;

  try {
    const { data, error } = await supabase.rpc('rpc_master_eliminar_sitio_completo', {
      _site_id: Number(siteId)
    });

    if (error) throw error;

    const resultado = Array.isArray(data) ? data[0] : data;

    if (!resultado || resultado.ok !== true) {
      throw new Error('La RPC no confirmó la eliminación del sitio.');
    }

    alert(
      `✅ Sitio eliminado correctamente.\n\n` +
      `Sitio: ${resultado.nombre || nombre}\n` +
      `Slug: ${resultado.slug || slug}\n\n` +
      `Cartones BD: ${resultado.cartones ?? 0}\n` +
      `Inscripciones: ${resultado.inscripciones ?? 0}\n` +
      `Configuración: ${resultado.configuracion ?? 0}\n` +
      `Admins: ${(resultado.sitio_admins ?? 0) + (resultado.site_admins ?? 0)}\n` +
      `Ganadores: ${resultado.ganadores ?? 0}\n` +
      `Archivos Storage: ${resultado.storage_objetos ?? 0}`
    );

    const editorId = parseInt($('masterEditId')?.value || '0', 10);
    if (Number(editorId) === Number(siteId)) {
      masterCerrarEditor();
    }

    await masterCargarSitios();
    await masterCargarAdminsSitios();

  } catch (error) {
    errorSeguro('Error eliminando sitio completo:', error);
    alert(
      'No se pudo eliminar el sitio completo: ' + (error.message || error) +
      '\n\nEjecuta primero el SQL: sql_eliminar_sitio_completo_master.txt'
    );
  }
}

async function masterRenovarSitio() {
  const siteId = parseInt($('masterEditId')?.value, 10);
  const meses = parseInt($('masterEditMesesRenovar')?.value || '1', 10);

  if (!Number.isFinite(siteId)) {
    alert('Primero abre un sitio para editar.');
    return;
  }

  if (![1, 3, 6, 12].includes(meses)) {
    alert('Selecciona 1, 3, 6 o 12 meses.');
    return;
  }

  const confirmar = confirm(`¿Renovar este sitio por ${meses} mes(es)?`);

  if (!confirmar) return;

  try {
    masterSetEstado('masterEstadoEditarSitio', 'Renovando sitio...', 'info');

    const { data, error } = await supabase.rpc('rpc_master_renovar_sitio', {
      _site_id: siteId,
      _meses: meses
    });

    if (error) throw error;

    const resultado = Array.isArray(data) ? data[0] : data;

    masterSetEstado(
      'masterEstadoEditarSitio',
      `✅ Sitio renovado.\nVence: ${resultado?.fecha_vencimiento || ''}\nDías restantes: ${resultado?.dias_restantes ?? ''}`,
      'success'
    );

    await masterCargarSitios();

  } catch (error) {
    errorSeguro('Error renovando sitio:', error);
    masterSetEstado('masterEstadoEditarSitio', 'Error renovando sitio: ' + error.message, 'error');
  }
}
// Exponer funciones usadas por botones inline
window.masterCambiarEstadoSitio = masterCambiarEstadoSitio;
window.masterAbrirEditor = masterAbrirEditor;
window.masterRenovarSitioRapido = masterRenovarSitioRapido;
window.masterEliminarSitio = masterEliminarSitio;
window.masterCambiarEstadoAdminSitio = masterCambiarEstadoAdminSitio;
window.masterEliminarAdminSitio = masterEliminarAdminSitio;
window.masterOcultarPanelAccion = masterOcultarPanelAccion;

document.addEventListener('DOMContentLoaded', async () => {
  masterConfigurarEventos();
  await masterVerificarAcceso();
});
