// ==================== PANEL MASTER ===================
var supabase = window.supabase;

const masterState = {
  user: null,
  sitios: []
};

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
  const basePath = window.location.pathname.replace(/\/master\.html$/i, '/index.html');
  return `${window.location.origin}${basePath}?site=${encodeURIComponent(slug)}`;
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
    $('masterEmailDisplay').textContent = masterState.user?.email || '';
  }
}

async function masterVerificarAcceso() {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      masterState.user = null;
      masterMostrarLogin();
      return false;
    }

    masterState.user = userData.user;

    // Debe existir en Supabase:
    // public.es_master_admin() returns boolean
    const { data, error } = await supabase.rpc('es_master_admin');

    if (error) {
      console.error('Error verificando master:', error);
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

    return true;

  } catch (error) {
    console.error('Error en masterVerificarAcceso:', error);
    masterSetEstado('masterLoginEstado', 'Error verificando acceso master.', 'error');
    masterMostrarLogin();
    return false;
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      masterSetEstado('masterLoginEstado', 'Correo o contraseña incorrectos.', 'error');
      return;
    }

    await masterVerificarAcceso();

  } catch (error) {
    console.error('Error login master:', error);
    masterSetEstado('masterLoginEstado', 'Error iniciando sesión.', 'error');
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

async function masterCrearSitio() {
  const nombre = $('masterNombreSitio')?.value.trim();
  const slugManual = $('masterSlugSitio')?.value.trim();
  const titulo = $('masterTituloSitio')?.value.trim();
  const total = parseInt($('masterTotalCartones')?.value, 10);
  const precio = parseFloat($('masterPrecioCarton')?.value);
  const logoUrl = $('masterLogoUrl')?.value.trim();
  const colorPrincipal = $('masterColorPrincipal')?.value.trim();
  const whatsappGrupo = $('masterWhatsappGrupo')?.value.trim();

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

  masterSetEstado('masterEstadoCrearSitio', 'Creando sitio...', 'info');

  const nuevoSitio = {
    nombre,
    slug,
    titulo_publico: titulo || nombre,
    total_cartones: total,
    cartones_visibles: total,
    precio_carton_bs: precio,
    activo: true
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

    masterSetEstado(
      'masterEstadoCrearSitio',
      `✅ Sitio creado correctamente.\nLink: ${masterUrlSitio(data.slug)}`,
      'success'
    );

    ['masterNombreSitio', 'masterSlugSitio', 'masterTituloSitio', 'masterTotalCartones',
     'masterPrecioCarton', 'masterLogoUrl', 'masterColorPrincipal', 'masterWhatsappGrupo'
    ].forEach(id => {
      const el = $(id);
      if (el) el.value = '';
    });

    await masterCargarSitios();

  } catch (error) {
    console.error('Error creando sitio:', error);
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
            <small>${masterEscapeHTML(sitio.titulo_publico || '')}</small>
          </td>
          <td>
            <code>${masterEscapeHTML(sitio.slug || '')}</code><br>
            <a href="${url}" target="_blank" rel="noopener">Abrir sitio</a>
          </td>
          <td>${masterEscapeHTML(sitio.total_cartones || sitio.cartones_visibles || 0)}</td>
          <td>${Number(sitio.precio_carton_bs || 0).toFixed(2)} Bs</td>
          <td>
            <span class="${activo ? 'site-active' : 'site-paused'}">
              ${activo ? 'Activo' : 'Pausado'}
            </span>
          </td>
          <td>
            <button class="master-btn ${activo ? 'warning' : 'success'}"
                    onclick="masterCambiarEstadoSitio(${Number(sitio.id)}, ${activo ? 'false' : 'true'})">
              ${activo ? '⏸️ Pausar' : '▶️ Activar'}
            </button>

            <button class="master-btn secondary" onclick="masterAbrirEditor(${Number(sitio.id)})">
              ✏️ Editar
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
            <th>Link</th>
            <th>Cartones</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    `;

  } catch (error) {
    console.error('Error cargando sitios:', error);
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
    console.error('Error cambiando estado:', error);
    alert('Error cambiando estado: ' + error.message);
  }
}

function masterAbrirEditor(siteId) {
  const sitio = masterState.sitios.find(s => Number(s.id) === Number(siteId));

  if (!sitio) {
    alert('No se encontró el sitio.');
    return;
  }

  $('masterEditorSitio')?.classList.remove('oculto');

  $('masterEditId').value = sitio.id;
  $('masterEditNombre').value = sitio.nombre || '';
  $('masterEditTitulo').value = sitio.titulo_publico || sitio.nombre || '';
  $('masterEditTotal').value = sitio.total_cartones || sitio.cartones_visibles || 0;
  $('masterEditPrecio').value = sitio.precio_carton_bs || 0;
  $('masterEditLogoUrl').value = sitio.logo_url || '';
  $('masterEditColorPrincipal').value = sitio.color_principal || '';
  $('masterEditWhatsappGrupo').value = sitio.whatsapp_grupo || '';
  $('masterEditActivo').value = sitio.activo === false ? 'false' : 'true';

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
  const logoUrl = $('masterEditLogoUrl')?.value.trim();
  const colorPrincipal = $('masterEditColorPrincipal')?.value.trim();
  const whatsappGrupo = $('masterEditWhatsappGrupo')?.value.trim();
  const activo = $('masterEditActivo')?.value === 'true';

  if (!nombre) {
    masterSetEstado('masterEstadoEditarSitio', 'El nombre no puede estar vacío.', 'error');
    return;
  }

  if (!Number.isFinite(total) || total < 1) {
    masterSetEstado('masterEstadoEditarSitio', 'Total de cartones inválido.', 'error');
    return;
  }

  if (!Number.isFinite(precio) || precio < 0) {
    masterSetEstado('masterEstadoEditarSitio', 'Precio inválido.', 'error');
    return;
  }

  masterSetEstado('masterEstadoEditarSitio', 'Guardando cambios...', 'info');

  const cambios = {
    nombre,
    titulo_publico: titulo || nombre,
    total_cartones: total,
    cartones_visibles: total,
    precio_carton_bs: precio,
    activo,
    logo_url: logoUrl || null,
    color_principal: colorPrincipal || null,
    whatsapp_grupo: whatsappGrupo || null
  };

  try {
    const { error } = await supabase
      .from('sitios')
      .update(cambios)
      .eq('id', siteId);

    if (error) throw error;

    masterSetEstado('masterEstadoEditarSitio', '✅ Cambios guardados.', 'success');

    await masterCargarSitios();

  } catch (error) {
    console.error('Error guardando edición:', error);
    masterSetEstado('masterEstadoEditarSitio', 'Error guardando cambios: ' + error.message, 'error');
  }
}

function masterConfigurarEventos() {
 
  $('btnMasterLogin')?.addEventListener('click', masterLogin);
  $('btnMasterLogout')?.addEventListener('click', masterLogout);
  $('btnMasterRecargar')?.addEventListener('click', masterCargarSitios);
  $('btnMasterCrearSitio')?.addEventListener('click', masterCrearSitio);
  $('btnMasterCrearAdmin')?.addEventListener('click', masterCrearAdminSitio);
  $('btnMasterGuardarEdicion')?.addEventListener('click', masterGuardarEdicion);
  $('btnMasterCancelarEdicion')?.addEventListener('click', masterCerrarEditor);

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
          ✅ ${data?.mensaje || 'Administrador creado correctamente.'}
        </p>
      `;
    }

    document.getElementById('masterAdminEmail').value = '';
    document.getElementById('masterAdminPassword').value = '';

  } catch (error) {
    console.error('Error creando admin:', error);

    if (estado) {
      estado.innerHTML = `
        <p style="color:red;">
          Error creando admin: ${error.message || error}
        </p>
      `;
    }
  }
}
// Exponer funciones usadas por botones inline
window.masterCambiarEstadoSitio = masterCambiarEstadoSitio;
window.masterAbrirEditor = masterAbrirEditor;

document.addEventListener('DOMContentLoaded', async () => {
  masterConfigurarEventos();
  await masterVerificarAcceso();
});
