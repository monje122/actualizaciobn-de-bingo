const BOMBO_SUPABASE_URL = 'https://zxtgaovreqzcpzdvmmcx.supabase.co';
const BOMBO_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dGdhb3ZyZXF6Y3B6ZHZtbWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NzUwOTUsImV4cCI6MjA5NzE1MTA5NX0.aUqskDkosOTXmWOm0q0RacgAnQezSxVD2wGB6CXOB3g';

const bomboDb = window.supabase.createClient(BOMBO_SUPABASE_URL, BOMBO_SUPABASE_KEY);

const MODALIDADES_BOMBO75 = Object.freeze({
  linea_horizontal: { nombre: 'Línea horizontal', patron: [0, 1, 2, 3, 4] },
  linea_vertical: { nombre: 'Línea vertical', patron: [0, 5, 10, 15, 20] },
  diagonal: { nombre: 'Diagonal', patron: [0, 6, 12, 18, 24] },
  cuatro_esquinas: { nombre: 'Cuatro esquinas', patron: [0, 4, 20, 24] },
  equis: { nombre: 'Equis', patron: [0, 4, 6, 8, 12, 16, 18, 20, 24] },
  cruz: { nombre: 'Cruz', patron: [2, 7, 10, 11, 12, 13, 14, 17, 22] },
  circulo: { nombre: 'Círculo', patron: [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24] },
  carton_lleno: { nombre: 'Cartón lleno', patron: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] },
  personalizada: { nombre: 'Personalizada', patron: [] }
});

const COLUMNAS_BOMBO75 = Object.freeze([
  { letra: 'B', inicio: 1, fin: 15 },
  { letra: 'I', inicio: 16, fin: 30 },
  { letra: 'N', inicio: 31, fin: 45 },
  { letra: 'G', inicio: 46, fin: 60 },
  { letra: 'O', inicio: 61, fin: 75 }
]);

let bomboSiteId = null;
let bomboSiteSlug = '';
let bomboSitio = null;
let bomboEstado = null;
let bomboGanadoresPrevios = new Set();
let bomboPatronPersonalizado = new Set([12]);
let bomboTimerAutomatico = null;
let bomboTimerSincronizacion = null;
let bomboOcupado = false;
let bomboConfiguracionPendiente = false;
let bomboToastTimer = null;

function bomboElemento(id) {
  return document.getElementById(id);
}

function obtenerSlugBombo() {
  const slug = new URLSearchParams(window.location.search).get('site');
  return String(slug || '').trim().toLowerCase();
}

function letraDeBola(numero) {
  const n = Number(numero);
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

function etiquetaBola(numero) {
  const n = Number(numero);
  return Number.isInteger(n) && n >= 1 && n <= 75 ? `${letraDeBola(n)}-${n}` : '--';
}

function nombreModalidad(valor) {
  return MODALIDADES_BOMBO75[valor]?.nombre || 'Modalidad';
}

function colorHexSeguro(valor, fallback) {
  const texto = String(valor || '').trim();
  return /^#[0-9a-f]{6}$/i.test(texto) ? texto : fallback;
}

function aplicarTemaBombo(sitio) {
  const root = document.documentElement;
  root.style.setProperty('--site-primary', colorHexSeguro(sitio?.color_principal, '#12355B'));
  root.style.setProperty('--site-accent', colorHexSeguro(sitio?.color_secundario, '#0F766E'));
  root.style.setProperty('--site-button-text', '#FFFFFF');
}

function mostrarToastBombo(mensaje, tipo = '') {
  const toast = bomboElemento('bomboToast');
  if (!toast) return;

  clearTimeout(bomboToastTimer);
  toast.textContent = String(mensaje || '');
  toast.className = `toast show ${tipo}`.trim();
  bomboToastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 4200);
}

function mostrarEstadoBombo(mensaje, tipo = '') {
  const estado = bomboElemento('bomboStatus');
  if (!estado) return;
  estado.textContent = String(mensaje || '');
  estado.className = `status-message ${tipo}`.trim();
}

function mensajeErrorBombo(error, fallback) {
  const mensaje = String(error?.message || fallback || 'No se pudo completar la operación.');
  if (/jwt|token|session/i.test(mensaje)) return 'La sesión expiró. Inicia sesión nuevamente.';
  return mensaje;
}

function mostrarErrorAcceso(titulo, mensaje) {
  detenerAutomaticoBombo(false);
  detenerSincronizacionBombo();
  bomboElemento('bomboLoading').hidden = true;
  bomboElemento('bomboApp').hidden = true;
  bomboElemento('bomboAccessError').hidden = false;
  bomboElemento('bomboErrorTitle').textContent = String(titulo || 'Acceso no disponible');
  bomboElemento('bomboErrorMessage').textContent = String(mensaje || 'No se pudo abrir este panel.');
}

function volverAlAdminBombo() {
  const slug = encodeURIComponent(bomboSiteSlug || obtenerSlugBombo() || 'golden');
  window.location.href = `bingo.html?site=${slug}`;
}

function crearTableroBolas() {
  const tablero = bomboElemento('tableroBolas');
  if (!tablero) return;

  const fragmento = document.createDocumentFragment();

  COLUMNAS_BOMBO75.forEach(columna => {
    const grupo = document.createElement('section');
    grupo.className = 'ball-column';

    const titulo = document.createElement('div');
    titulo.className = 'ball-column-title';
    titulo.textContent = columna.letra;

    const lista = document.createElement('div');
    lista.className = 'ball-list';

    for (let numero = columna.inicio; numero <= columna.fin; numero += 1) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'ball-button';
      boton.dataset.ball = String(numero);
      boton.textContent = String(numero);
      boton.setAttribute('aria-label', `Bola ${columna.letra} ${numero}`);
      boton.addEventListener('click', () => alternarBolaManual(numero));
      lista.appendChild(boton);
    }

    grupo.append(titulo, lista);
    fragmento.appendChild(grupo);
  });

  tablero.replaceChildren(fragmento);
}

function crearPatronGrid() {
  const grid = bomboElemento('patronGrid');
  if (!grid) return;

  const fragmento = document.createDocumentFragment();
  for (let posicion = 0; posicion < 25; posicion += 1) {
    const celda = document.createElement('button');
    celda.type = 'button';
    celda.className = 'pattern-cell';
    celda.dataset.position = String(posicion);
    celda.setAttribute('aria-label', `Casilla ${posicion + 1}`);
    if (posicion === 12) {
      celda.textContent = 'LIBRE';
      celda.classList.add('free');
    }
    celda.addEventListener('click', () => alternarCasillaPatron(posicion));
    fragmento.appendChild(celda);
  }
  grid.replaceChildren(fragmento);
}

function patronSeleccionadoActual() {
  const modalidad = bomboElemento('selectModalidad')?.value || 'linea_horizontal';
  if (modalidad === 'personalizada') return Array.from(bomboPatronPersonalizado).sort((a, b) => a - b);
  return MODALIDADES_BOMBO75[modalidad]?.patron || [];
}

function renderizarPatron() {
  const modalidad = bomboElemento('selectModalidad')?.value || 'linea_horizontal';
  const personalizado = modalidad === 'personalizada';
  const activas = new Set(patronSeleccionadoActual());
  const etiqueta = bomboElemento('patronEstado');

  if (etiqueta) etiqueta.textContent = nombreModalidad(modalidad);

  document.querySelectorAll('.pattern-cell').forEach(celda => {
    const posicion = Number(celda.dataset.position);
    celda.classList.toggle('active', activas.has(posicion));
    celda.classList.toggle('editable', personalizado && posicion !== 12);
    celda.disabled = !personalizado || posicion === 12;
  });
}

function alternarCasillaPatron(posicion) {
  if (bomboElemento('selectModalidad')?.value !== 'personalizada' || posicion === 12) return;

  if (bomboPatronPersonalizado.has(posicion)) {
    bomboPatronPersonalizado.delete(posicion);
  } else {
    bomboPatronPersonalizado.add(posicion);
  }

  bomboPatronPersonalizado.add(12);
  bomboConfiguracionPendiente = true;
  renderizarPatron();
  mostrarEstadoBombo('Patrón preparado para una nueva partida.');
}

function renderizarEstadoBombo(estado, opciones = {}) {
  if (!estado) return;
  bomboEstado = estado;

  const bolas = Array.isArray(estado.bolas) ? estado.bolas.map(Number) : [];
  const bolasSet = new Set(bolas);
  const ultima = bolas.length ? bolas[bolas.length - 1] : null;

  bomboElemento('estadoModalidad').textContent = nombreModalidad(estado.modalidad);
  bomboElemento('estadoBolas').textContent = `${bolas.length} / 75`;
  bomboElemento('estadoGenerados').textContent = String(Number(estado.cartones_generados) || 0);
  bomboElemento('estadoAprobados').textContent = String(Number(estado.cartones_aprobados) || 0);
  bomboElemento('estadoModo').textContent = estado.modo === 'automatico' ? 'Automático' : 'Manual';
  bomboElemento('ultimaBola').textContent = etiquetaBola(ultima);

  document.querySelectorAll('.ball-button').forEach(boton => {
    const numero = Number(boton.dataset.ball);
    boton.classList.toggle('drawn', bolasSet.has(numero));
    boton.classList.toggle('latest', numero === ultima);
    boton.setAttribute('aria-pressed', String(bolasSet.has(numero)));
    boton.disabled = bomboOcupado || estado.modo !== 'manual';
  });

  const historial = bomboElemento('historialBolas');
  const fragmento = document.createDocumentFragment();
  if (!bolas.length) {
    const vacio = document.createElement('span');
    vacio.className = 'empty-inline';
    vacio.textContent = 'Sin bolas marcadas';
    fragmento.appendChild(vacio);
  } else {
    bolas.slice(-20).forEach(numero => {
      const item = document.createElement('span');
      item.className = 'history-ball';
      item.textContent = etiquetaBola(numero);
      fragmento.appendChild(item);
    });
  }
  historial.replaceChildren(fragmento);

  bomboElemento('btnDesmarcarUltima').disabled = bomboOcupado || !bolas.length || estado.modo !== 'manual';

  actualizarModoVisual(estado.modo || 'manual');

  if (opciones.sincronizarConfiguracion !== false) {
    bomboElemento('selectModalidad').value = estado.modalidad || 'linea_horizontal';
    if (estado.modalidad === 'personalizada') {
      const patron = Array.isArray(estado.patron) ? estado.patron.map(Number) : [];
      bomboPatronPersonalizado = new Set(patron.length ? patron : [12]);
      bomboPatronPersonalizado.add(12);
    }
    renderizarPatron();
  }
}

function actualizarModoVisual(modo) {
  const automatico = modo === 'automatico';
  bomboElemento('btnModoManual').classList.toggle('active', !automatico);
  bomboElemento('btnModoAutomatico').classList.toggle('active', automatico);
  bomboElemento('automaticControls').hidden = !automatico;

  if (bomboEstado) {
    bomboEstado.modo = automatico ? 'automatico' : 'manual';
    bomboElemento('estadoModo').textContent = automatico ? 'Automático' : 'Manual';
    document.querySelectorAll('.ball-button').forEach(boton => {
      boton.disabled = bomboOcupado || automatico;
    });
  }
}

function establecerOcupadoBombo(ocupado) {
  bomboOcupado = ocupado;
  const ids = [
    'btnNuevaPartida', 'btnBuscarGanadores', 'btnRefrescarBombo',
    'btnModoManual', 'btnModoAutomatico', 'btnSiguienteBola'
  ];
  ids.forEach(id => {
    const elemento = bomboElemento(id);
    if (elemento) elemento.disabled = ocupado;
  });

  if (bomboEstado) renderizarEstadoBombo(bomboEstado, { sincronizarConfiguracion: false });
  actualizarIndicadorAutomatico(Boolean(bomboTimerAutomatico));
}

async function llamarRpcBombo(nombre, parametros) {
  const { data, error } = await bomboDb.rpc(nombre, parametros);
  if (error) throw error;
  return data;
}

async function cargarContextoBombo(opciones = {}) {
  if (!bomboSiteId) return null;
  const estado = await llamarRpcBombo('rpc_bombo75_contexto', { _site_id: bomboSiteId });
  renderizarEstadoBombo(estado, {
    sincronizarConfiguracion: opciones.sincronizarConfiguracion !== false && !bomboConfiguracionPendiente
  });
  return estado;
}

async function alternarBolaManual(numero) {
  if (!bomboEstado || bomboEstado.modo !== 'manual' || bomboOcupado) return;
  const bolas = new Set((bomboEstado.bolas || []).map(Number));
  const marcada = !bolas.has(Number(numero));

  establecerOcupadoBombo(true);
  mostrarEstadoBombo(marcada ? `Marcando ${etiquetaBola(numero)}...` : `Desmarcando ${etiquetaBola(numero)}...`);

  try {
    const estado = await llamarRpcBombo('rpc_bombo75_establecer_bola', {
      _site_id: bomboSiteId,
      _bola: Number(numero),
      _marcada: marcada
    });
    renderizarEstadoBombo(estado, { sincronizarConfiguracion: false });
    const hayGanadorNuevo = await comprobarGanadoresBombo({ anunciar: marcada });
    if (!hayGanadorNuevo) {
      mostrarEstadoBombo(`${etiquetaBola(numero)} ${marcada ? 'marcada' : 'desmarcada'}.`, 'success');
    }
  } catch (error) {
    mostrarEstadoBombo(mensajeErrorBombo(error), 'error');
    mostrarToastBombo(mensajeErrorBombo(error), 'error');
  } finally {
    establecerOcupadoBombo(false);
  }
}

async function desmarcarUltimaBola() {
  const bolas = Array.isArray(bomboEstado?.bolas) ? bomboEstado.bolas.map(Number) : [];
  if (!bolas.length) return;
  await alternarBolaManual(bolas[bolas.length - 1]);
}

async function cambiarModoBombo(modo) {
  if (bomboOcupado || !['manual', 'automatico'].includes(modo)) return;
  if (modo === 'manual') detenerAutomaticoBombo(false);

  establecerOcupadoBombo(true);
  try {
    const estado = await llamarRpcBombo('rpc_bombo75_cambiar_modo', {
      _site_id: bomboSiteId,
      _modo: modo
    });
    renderizarEstadoBombo(estado, { sincronizarConfiguracion: false });
    actualizarModoVisual(modo);
    mostrarEstadoBombo(`Control ${modo === 'automatico' ? 'automático' : 'manual'} activo.`, 'success');
  } catch (error) {
    mostrarEstadoBombo(mensajeErrorBombo(error), 'error');
  } finally {
    establecerOcupadoBombo(false);
  }
}

async function iniciarNuevaPartidaBombo() {
  if (bomboOcupado) return;
  const modalidad = bomboElemento('selectModalidad').value;
  const modo = bomboElemento('btnModoAutomatico').classList.contains('active') ? 'automatico' : 'manual';
  const patron = modalidad === 'personalizada' ? patronSeleccionadoActual() : [];
  const bolasActuales = Array.isArray(bomboEstado?.bolas) ? bomboEstado.bolas.length : 0;

  if (modalidad === 'personalizada' && patron.filter(posicion => posicion !== 12).length < 1) {
    mostrarToastBombo('Selecciona al menos una casilla además del centro libre.', 'error');
    return;
  }

  if (bolasActuales > 0 && !window.confirm('¿Iniciar una nueva partida? Se limpiarán todas las bolas marcadas.')) {
    return;
  }

  detenerAutomaticoBombo(false);
  establecerOcupadoBombo(true);
  mostrarEstadoBombo('Iniciando nueva partida...');

  try {
    const estado = await llamarRpcBombo('rpc_bombo75_nueva_partida', {
      _site_id: bomboSiteId,
      _modalidad: modalidad,
      _patron: patron,
      _modo: modo
    });
    bomboGanadoresPrevios = new Set();
    bomboConfiguracionPendiente = false;
    renderizarEstadoBombo(estado);
    renderizarGanadoresBombo([]);
    mostrarEstadoBombo(`Nueva partida: ${nombreModalidad(modalidad)}.`, 'success');
    mostrarToastBombo('Partida iniciada.', 'success');
  } catch (error) {
    mostrarEstadoBombo(mensajeErrorBombo(error), 'error');
    mostrarToastBombo(mensajeErrorBombo(error), 'error');
  } finally {
    establecerOcupadoBombo(false);
  }
}

async function sacarSiguienteBolaBombo() {
  if (bomboOcupado) return false;
  establecerOcupadoBombo(true);

  try {
    const estado = await llamarRpcBombo('rpc_bombo75_sacar_bola', { _site_id: bomboSiteId });
    renderizarEstadoBombo(estado, { sincronizarConfiguracion: false });

    const bola = Number(estado?.bola_sacada);
    if (!Number.isInteger(bola)) {
      detenerAutomaticoBombo(false);
      mostrarEstadoBombo('Las 75 bolas ya fueron marcadas.');
      mostrarToastBombo('No quedan bolas disponibles.');
      return false;
    }

    mostrarEstadoBombo(`${etiquetaBola(bola)} marcada automáticamente.`, 'success');
    const hayGanadorNuevo = await comprobarGanadoresBombo({ anunciar: true });
    return !hayGanadorNuevo;
  } catch (error) {
    detenerAutomaticoBombo(false);
    mostrarEstadoBombo(mensajeErrorBombo(error), 'error');
    mostrarToastBombo(mensajeErrorBombo(error), 'error');
    return false;
  } finally {
    establecerOcupadoBombo(false);
  }
}

function renderizarGanadoresBombo(ganadores) {
  const lista = bomboElemento('listaGanadores');
  const contador = bomboElemento('contadorGanadores');
  const datos = Array.isArray(ganadores) ? ganadores : [];
  const fragmento = document.createDocumentFragment();

  contador.textContent = `${datos.length} ${datos.length === 1 ? 'ganador' : 'ganadores'}`;
  contador.classList.toggle('has-winners', datos.length > 0);

  if (!datos.length) {
    const vacio = document.createElement('div');
    vacio.className = 'empty-state';
    vacio.textContent = 'Sin Bingo para la modalidad actual.';
    fragmento.appendChild(vacio);
  } else {
    datos.forEach(ganador => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'winner-card';

      const numero = document.createElement('div');
      numero.className = 'winner-number';
      const numeroLabel = document.createElement('span');
      numeroLabel.textContent = 'Cartón';
      const numeroValor = document.createElement('strong');
      numeroValor.textContent = String(Number(ganador.carton) || 0);
      numero.append(numeroLabel, numeroValor);

      const datosGanador = document.createElement('div');
      datosGanador.className = 'winner-data';
      const nombre = document.createElement('h3');
      nombre.textContent = ganador.nombre || 'Comprador';
      const cedula = document.createElement('p');
      cedula.textContent = `Cédula: ${ganador.cedula || 'Sin dato'}`;
      const telefono = document.createElement('p');
      telefono.textContent = `Teléfono: ${ganador.telefono || 'Sin dato'}`;
      const modalidad = document.createElement('p');
      modalidad.textContent = `Modalidad: ${nombreModalidad(ganador.modalidad)}`;
      datosGanador.append(nombre, cedula, telefono, modalidad);

      tarjeta.append(numero, datosGanador);
      fragmento.appendChild(tarjeta);
    });
  }

  lista.replaceChildren(fragmento);
}

async function comprobarGanadoresBombo(opciones = {}) {
  try {
    const ganadores = await llamarRpcBombo('rpc_bombo75_ganadores', { _site_id: bomboSiteId });
    const lista = Array.isArray(ganadores) ? ganadores : [];
    const claves = new Set(lista.map(item => `${item.carton}:${item.inscripcion_id}`));
    const nuevos = lista.filter(item => !bomboGanadoresPrevios.has(`${item.carton}:${item.inscripcion_id}`));

    renderizarGanadoresBombo(lista);
    bomboGanadoresPrevios = claves;

    if (opciones.anunciar && nuevos.length > 0) {
      detenerAutomaticoBombo(false);
      const cartones = nuevos.map(item => item.carton).join(', ');
      mostrarToastBombo(`Bingo detectado: cartón ${cartones}.`, 'success');
      mostrarEstadoBombo(`Bingo detectado en ${nuevos.length} cartón${nuevos.length === 1 ? '' : 'es'}.`, 'success');
      bomboElemento('listaGanadores')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return true;
    }

    return false;
  } catch (error) {
    mostrarEstadoBombo(mensajeErrorBombo(error), 'error');
    return false;
  }
}

function actualizarIndicadorAutomatico(enMarcha) {
  const indicador = bomboElemento('estadoAutomatico');
  indicador.textContent = enMarcha ? 'En marcha' : 'En pausa';
  indicador.classList.toggle('running', enMarcha);
  bomboElemento('btnIniciarAutomatico').disabled = enMarcha || bomboOcupado;
  bomboElemento('btnPausarAutomatico').disabled = !enMarcha;
}

function detenerAutomaticoBombo(mostrarMensaje = true) {
  if (bomboTimerAutomatico) {
    clearInterval(bomboTimerAutomatico);
    bomboTimerAutomatico = null;
  }
  actualizarIndicadorAutomatico(false);
  if (mostrarMensaje) mostrarEstadoBombo('Sorteo automático pausado.');
}

async function iniciarAutomaticoBombo() {
  if (bomboTimerAutomatico || bomboOcupado) return;

  if (bomboEstado?.modo !== 'automatico') {
    await cambiarModoBombo('automatico');
  }

  const continuar = await sacarSiguienteBolaBombo();
  if (!continuar) return;

  const intervalo = Math.max(2000, Number(bomboElemento('selectVelocidad').value) || 5000);
  bomboTimerAutomatico = setInterval(async () => {
    if (document.visibilityState === 'hidden' || bomboOcupado) return;
    const seguir = await sacarSiguienteBolaBombo();
    if (!seguir) detenerAutomaticoBombo(false);
  }, intervalo);
  actualizarIndicadorAutomatico(true);
  mostrarEstadoBombo('Sorteo automático en marcha.', 'success');
}

function reiniciarIntervaloAutomatico() {
  if (!bomboTimerAutomatico) return;
  detenerAutomaticoBombo(false);
  iniciarAutomaticoBombo();
}

function iniciarSincronizacionBombo() {
  detenerSincronizacionBombo();
  bomboTimerSincronizacion = setInterval(async () => {
    if (document.visibilityState === 'hidden' || bomboOcupado || bomboTimerAutomatico) return;
    try {
      await cargarContextoBombo({ sincronizarConfiguracion: false });
      await comprobarGanadoresBombo({ anunciar: false });
    } catch (error) {
      if (error?.code === '42501' || error?.code === '55000') {
        mostrarErrorAcceso('Panel deshabilitado', mensajeErrorBombo(error));
      }
    }
  }, 10000);
}

function detenerSincronizacionBombo() {
  if (bomboTimerSincronizacion) {
    clearInterval(bomboTimerSincronizacion);
    bomboTimerSincronizacion = null;
  }
}

function configurarEventosBombo() {
  bomboElemento('btnVolverAdmin').addEventListener('click', volverAlAdminBombo);
  bomboElemento('btnErrorVolver').addEventListener('click', volverAlAdminBombo);
  bomboElemento('btnRefrescarBombo').addEventListener('click', async () => {
    if (bomboOcupado) return;
    establecerOcupadoBombo(true);
    try {
      await cargarContextoBombo();
      await comprobarGanadoresBombo({ anunciar: false });
      mostrarEstadoBombo('Panel actualizado.', 'success');
    } catch (error) {
      mostrarEstadoBombo(mensajeErrorBombo(error), 'error');
    } finally {
      establecerOcupadoBombo(false);
    }
  });

  bomboElemento('btnModoManual').addEventListener('click', () => cambiarModoBombo('manual'));
  bomboElemento('btnModoAutomatico').addEventListener('click', () => cambiarModoBombo('automatico'));
  bomboElemento('btnNuevaPartida').addEventListener('click', iniciarNuevaPartidaBombo);
  bomboElemento('btnBuscarGanadores').addEventListener('click', () => comprobarGanadoresBombo({ anunciar: true }));
  bomboElemento('btnDesmarcarUltima').addEventListener('click', desmarcarUltimaBola);
  bomboElemento('btnIniciarAutomatico').addEventListener('click', iniciarAutomaticoBombo);
  bomboElemento('btnPausarAutomatico').addEventListener('click', () => detenerAutomaticoBombo(true));
  bomboElemento('btnSiguienteBola').addEventListener('click', sacarSiguienteBolaBombo);
  bomboElemento('selectVelocidad').addEventListener('change', reiniciarIntervaloAutomatico);

  bomboElemento('selectModalidad').addEventListener('change', () => {
    if (bomboElemento('selectModalidad').value === 'personalizada') {
      bomboPatronPersonalizado.add(12);
    }
    bomboConfiguracionPendiente = true;
    renderizarPatron();
    mostrarEstadoBombo('Modalidad preparada para una nueva partida.');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && bomboTimerAutomatico) {
      detenerAutomaticoBombo(false);
    }
  });

  window.addEventListener('beforeunload', () => {
    detenerAutomaticoBombo(false);
    detenerSincronizacionBombo();
  });
}

async function iniciarBombo75() {
  crearTableroBolas();
  crearPatronGrid();
  configurarEventosBombo();

  bomboSiteSlug = obtenerSlugBombo();
  if (!bomboSiteSlug) {
    mostrarErrorAcceso('Sitio no identificado', 'Falta el sitio en la dirección del panel.');
    return;
  }

  try {
    const { data: sitioData, error: sitioError } = await bomboDb.rpc('rpc_public_get_sitio', {
      _slug: bomboSiteSlug
    });
    if (sitioError) throw sitioError;

    bomboSitio = Array.isArray(sitioData) ? sitioData[0] : sitioData;
    if (!bomboSitio?.id) throw new Error('El sitio no existe o no está disponible.');

    bomboSiteId = Number(bomboSitio.id);
    aplicarTemaBombo(bomboSitio);
    bomboElemento('bomboSiteName').textContent = bomboSitio.nombre || 'Bingo 75';
    document.title = `${bomboSitio.nombre || 'Bingo 75'} - Panel de Bombo`;

    const { data: sesionData } = await bomboDb.auth.getSession();
    if (!sesionData?.session?.user) {
      throw new Error('Inicia sesión como administrador desde el panel del sitio.');
    }

    const { data: accesoData, error: accesoError } = await bomboDb.rpc('rpc_auth_admin_context', {
      _site_id: bomboSiteId
    });
    if (accesoError) throw accesoError;
    const acceso = Array.isArray(accesoData) ? accesoData[0] : accesoData;
    bomboElemento('bomboAdminRole').textContent = acceso?.es_master ? 'Master' : 'Administrador';

    await cargarContextoBombo();
    await comprobarGanadoresBombo({ anunciar: false });

    bomboElemento('bomboLoading').hidden = true;
    bomboElemento('bomboApp').hidden = false;
    iniciarSincronizacionBombo();
  } catch (error) {
    mostrarErrorAcceso('Acceso no disponible', mensajeErrorBombo(error));
  }
}

document.addEventListener('DOMContentLoaded', iniciarBombo75);
