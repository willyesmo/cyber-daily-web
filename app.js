'use strict';
const $ = id => document.getElementById(id);
const hosted = document.documentElement.dataset.mode === 'static';
const latestPath = hosted ? 'reports/latest.json' : '/api/report';
const historyPath = hosted ? 'reports/history.json' : '/api/history';
let report = {items: [], sources: []};
let loading = false;
let requestVersion = 0;
const date = value => { const d = new Date(value); if (Number.isNaN(d.getTime())) return 'Fecha no disponible'; return /^\d{4}-\d{2}-\d{2}$/.test(value) ? d.toLocaleDateString('es', {dateStyle: 'medium', timeZone: 'UTC'}) + ' (fecha de catálogo)' : d.toLocaleString('es', {dateStyle: 'medium', timeStyle: 'short'}); };
const itemDate = item => date(/^\d{4}-\d{2}-\d{2}$/.test(item.date || '') ? item.date : item.published);
function node(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
function identifiers(item) { return [...new Set(((item.title || '') + ' ' + (item.detail || '')).match(/\bCVE-\d{4}-\d{4,}\b/gi) || [])].map(x => x.toUpperCase()); }
function safeLink(raw) { try { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function link(label, raw) { const a = node('a', label); const url = safeLink(raw); if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; }
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function json(url, options) { const response = await fetch(url, {cache: 'no-store', ...options}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'No se pudo cargar el informe.'); return data; }
function read(item) {
  $('reader-title').textContent = item.title;
  $('reader-source').textContent = `${item.source} · ${itemDate(item)} · ${item.kind}`;
  $('reader-origin').textContent = item.detail_origin || 'Texto publicado por la fuente, guardado en este informe';
  $('reader-text').replaceChildren();
  const text = item.detail || 'La fuente no ha proporcionado un resumen para esta entrada.';
  // Group sentences for reading without changing or inventing source content.
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[\s\S]+$/g) || [text];
  for (let i = 0; i < sentences.length; i += 4) $('reader-text').append(node('p', sentences.slice(i, i + 4).join('').trim()));
  const facts = node('dl');
  Object.entries(item.facts || {}).forEach(([key, value]) => facts.append(node('dt', key), node('dd', value)));
  $('reader-facts').replaceChildren(facts);
  $('reader-ids').replaceChildren(...identifiers(item).map(id => node('span', id, 'tag')));
  const techniques = [...new Set((item.detail || '').match(/\bT\d{4}(?:\.\d{3})?\b/g) || [])];
  techniques.forEach(id => $('reader-ids').append(link(id + ' · MITRE', 'https://attack.mitre.org/techniques/' + id.replace('.', '/') + '/')));
  const url = safeLink(item.url);
  $('reader-link').hidden = !url;
  if (url) $('reader-link').href = url; else $('reader-link').removeAttribute('href');
  $('reader').showModal();
}
function renderCards() {
  const term = $('search').value.toLocaleLowerCase();
  const source = $('source').value;
  const items = report.items.filter(item => (!source || item.source === source) && `${item.title} ${item.detail} ${item.source} ${JSON.stringify(item.facts || {})}`.toLocaleLowerCase().includes(term));
  $('count').textContent = `${items.length} / ${report.items.length}`;
  $('cards').replaceChildren();
  if (!items.length) $('cards').append(node('div', report.items.length ? 'No hay coincidencias. Prueba otra búsqueda o fuente.' : (hosted ? 'No hay entradas para mostrar. Revisa la cobertura de fuentes o consulta otro informe.' : 'No hay entradas para mostrar. Actualiza el informe o amplía la ventana y revisa la cobertura de fuentes.'), 'empty'));
  items.forEach(item => {
    const card = node('article', undefined, 'card');
    const meta = node('div', undefined, 'card-meta'); meta.append(node('span', item.source), node('time', itemDate(item)));
    const summary = item.detail || 'Esta fuente no ha proporcionado un extracto.';
    const tags = node('div', undefined, 'tags'); identifiers(item).slice(0, 4).forEach(id => tags.append(node('span', id, 'tag')));
    const actions = node('div', undefined, 'card-actions'); const button = node('button', 'Leer información →'); button.addEventListener('click', () => read(item));
    actions.append(button, link('Fuente original ↗', item.url));
    card.append(meta, node('h3', item.title), node('p', summary.slice(0, 260) + (summary.length > 260 ? '…' : '')), tags, actions);
    $('cards').append(card);
  });
}
function render() {
  $('updated').textContent = 'Generado: ' + date(report.generated);
  $('total').textContent = report.items.length;
  $('sources').textContent = `${report.sources.filter(s => s.status === 'OK').length} / ${report.sources.length}`;
  $('cves').textContent = new Set(report.items.flatMap(identifiers)).size;
  $('window').textContent = `${report.hours} h`;
  if (['24', '72', '168'].includes(String(report.hours))) $('hours').value = String(report.hours);
  const previous = $('source').value;
  $('source').replaceChildren(new Option('Todas las fuentes', ''), ...[...new Set(report.items.map(i => i.source))].sort().map(s => new Option(s, s)));
  if ([...$('source').options].some(o => o.value === previous)) $('source').value = previous;
  $('coverage-body').replaceChildren();
  report.sources.forEach(s => { const tr = node('tr'); const state = s.status === 'OK' ? 'Disponible' : s.status.startsWith('NOT CONFIGURED') ? 'Sin configurar' : 'Error de conexión o lectura'; tr.append(node('td', s.source), node('td', state, s.status === 'OK' ? 'ok' : 'warning'), node('td', s.recent), node('td', s.shown), node('td', s.undated)); $('coverage-body').append(tr); });
  renderCards();
}
async function loadReport() {
  const version = ++requestVersion;
  const path = $('history').value;
  try { const data = await json(path); if (version !== requestVersion) return; report = data; render(); $('download').href = path === latestPath ? (hosted ? 'reports/latest.txt' : '/reports/latest.txt') : path.replace(/\.json$/, '.txt'); $('download').hidden = false; }
  catch (error) { if (version !== requestVersion) return; message(error.message, true); report = {items: [], sources: []}; $('updated').textContent = 'Sin informe disponible'; ['total', 'sources', 'cves', 'window'].forEach(id => $(id).textContent = '—'); $('coverage-body').replaceChildren(); $('download').hidden = true; renderCards(); }
}
async function history() {
  const previous = $('history').value;
  const entries = await json(historyPath);
  $('history').replaceChildren(new Option('Último informe', latestPath), ...entries.map(e => new Option(e.name, e.url)));
  if ([...$('history').options].some(o => o.value === previous)) $('history').value = previous;
}
function busy(value) { loading = value; $('refresh').disabled = value; $('refresh').textContent = value ? 'Recopilando fuentes…' : '↻ Actualizar informe'; }
async function poll() {
  try {
    const state = await json('/api/state');
    if (state.running) { busy(true); message('Consultando las fuentes. Puedes seguir leyendo mientras se genera el informe.'); setTimeout(poll, 1500); }
    else { const wasLoading = loading; busy(false); if (wasLoading) { await history(); $('history').value = latestPath; await loadReport(); message(state.error || 'Informe actualizado y guardado en el historial.', !!state.error); } else if (state.error) message(state.error, true); }
  } catch { busy(false); message('No se pudo conectar con Cyber Daily. Comprueba que app.py sigue abierto y recarga la página.', true); }
}
$('refresh').addEventListener('click', async () => {
  busy(true);
  try { await json('/api/update', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Cyber-Daily': '1'}, body: JSON.stringify({hours: Number($('hours').value)})}); poll(); }
  catch (error) { busy(false); message(error.message, true); }
});
$('search').addEventListener('input', renderCards);
$('source').addEventListener('change', renderCards);
$('history').addEventListener('change', () => { message(''); loadReport(); });
$('close-reader').addEventListener('click', () => $('reader').close());
async function syncHosted() {
  if (loading || document.hidden) return;
  loading = true;
  try {
    await history();
    // Keep the selected historical report and any active search filters.
    if ($('history').value === latestPath) await loadReport();
  } catch { message('No se pudo consultar la nueva versión. Se volverá a intentar automáticamente.', true); }
  finally { loading = false; }
}
async function init() {
  if (hosted) {
    $('history').replaceChildren(new Option('Último informe', latestPath));
    $('refresh').hidden = true;
    $('hours').disabled = true;
    document.querySelector('.sidebar-note').replaceChildren(node('strong', 'Actualización automática'), node('p', 'Nuevos informes cada 3 horas. La página consulta novedades cada 5 minutos.'));
    message('Recopilación automática cada 3 horas. La hora de generación indica la última actualización disponible.');
  }
  await loadReport();
  try { await history(); } catch (error) { message(error.message, true); }
  if (hosted) {
    setInterval(syncHosted, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncHosted(); });
  } else await poll();
}
init();
