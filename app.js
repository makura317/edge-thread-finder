const list = document.querySelector('#results-list');
const empty = document.querySelector('#empty-state');
const summary = document.querySelector('#result-summary');
const form = document.querySelector('#search-form');
const query = document.querySelector('#query');
const period = document.querySelector('#period');
const minResponses = document.querySelector('#min-responses');
const body = document.querySelector('#body');
const showOp = document.querySelector('#show-op');
const sort = document.querySelector('#sort');
const resultLimit = document.querySelector('#result-limit');
const selectedTags = document.querySelector('#selected-tags');
const tagChoices = document.querySelector('#tag-choices');
const template = document.querySelector('#result-template');
const sampleThreads = await fetch('./data/threads.json').then(r => r.json());
let threads = sampleThreads;
const archiveDate = '2026-09-06';
try {
  const response = await fetch(`/api/archive?date=${archiveDate}`);
  if (response.ok) {
    const archive = await response.json();
    threads = archive.threads;
    document.querySelector('.eyebrow').textContent = `${archiveDate} のR2アーカイブ（${archive.partial ? '部分取得' : '完全取得'}）`;
  }
} catch { /* ローカルMVPでは同梱サンプルを使う */ }

const escapeHtml = value => value.replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const highlight = (text, words) => !words.length ? escapeHtml(text) : escapeHtml(text).replace(new RegExp(`(${words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi'), '<mark>$1</mark>');
const dateText = iso => new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'short', day:'numeric' }).format(new Date(iso));
function getParams() { const p = new URLSearchParams(location.search); return { q:p.get('q') || '', period:p.get('period') || 'all', minResponses:p.get('minResponses') || '0', body:p.get('body') !== 'false', showOp:p.get('showOp') === 'true', sort:p.get('sort') || 'relevance', limit:p.get('limit') === '50' ? 50 : 20, tags:(p.get('tags') || '').split(',').filter(Boolean) }; }
function setControls(p) { query.value=p.q; period.value=p.period; minResponses.value=p.minResponses; body.checked=p.body; showOp.checked=p.showOp; sort.value=p.sort; resultLimit.value=String(p.limit); }
const tagKey = tag => `${tag.type}:${tag.value}`;
function threadTags(thread) { return (thread.tags || []).map(tag => Array.isArray(tag) ? { type:tag[0], value:tag[1] } : tag); }
function renderTagFilter(active) {
  const counts = new Map();
  threads.flatMap(threadTags).forEach(tag => { const key=tagKey(tag); counts.set(key, { ...tag, count:(counts.get(key)?.count || 0) + 1 }); });
  const available = [...counts.values()].sort((a,b) => b.count-a.count || a.value.localeCompare(b.value, 'ja')).slice(0, 24);
  const activeTags = active.map(key => counts.get(key)).filter(Boolean);
  selectedTags.replaceChildren(); tagChoices.replaceChildren();
  activeTags.forEach(tag => selectedTags.append(tagButton(tag, true)));
  available.filter(tag => !active.includes(tagKey(tag))).forEach(tag => tagChoices.append(tagButton(tag, false)));
}
function tagButton(tag, selected) { const button=document.createElement('button'); button.type='button'; button.className=`tag tag-${tag.type}${selected ? ' selected' : ''}`; button.textContent=selected ? `${tag.value} ×` : tag.value; button.title=`${tag.type}: ${tag.value}`; button.addEventListener('click', () => toggleTag(tagKey(tag))); return button; }
function toggleTag(key) { const p=getParams(); submit(p.tags.includes(key) ? p.tags.filter(tag => tag !== key) : [...p.tags, key]); }
function render() {
  const p = getParams(); setControls(p); list.replaceChildren();
  const words = p.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const threshold = { week:7, month:31, year:366 }[p.period]; const now = Date.now();
  let matches = threads.map(thread => {
    const title = thread.title.toLowerCase(), text = thread.body.toLowerCase();
    const titleHits=words.filter(w=>title.includes(w)).length, bodyHits=words.filter(w=>text.includes(w)).length;
    return { ...thread, score:titleHits*5 + (p.body ? bodyHits : 0), titleHits, bodyHits };
  }).filter(t => (!words.length || t.score) && p.tags.every(key => threadTags(t).some(tag => tagKey(tag) === key)) && t.responses >= Number(p.minResponses) && (!threshold || now - new Date(t.createdAt).getTime() <= threshold*86400000));
  matches.sort((a,b) => !words.length || p.sort==='newest' ? new Date(b.createdAt)-new Date(a.createdAt) : p.sort==='responses' ? b.responses-a.responses : b.score-a.score || b.responses-a.responses);
  const total = matches.length; matches = matches.slice(0, p.limit);
  summary.textContent = words.length ? `「${p.q}」の検索結果 ${total}件（上位${matches.length}件表示）` : `すべてのスレッド ${total}件（新しい順・${matches.length}件表示）`;
  if (p.tags.length) summary.textContent += `・タグ: ${p.tags.map(key => key.split(':').slice(1).join(':')).join(' / ')}`;
  renderTagFilter(p.tags);
  empty.hidden = matches.length > 0;
  if (!matches.length) { empty.querySelector('h2').textContent='見つかりませんでした'; empty.querySelector('p').textContent='期間やキーワードを変えて、もう一度お試しください。'; return; }
  matches.forEach(thread => { const node=template.content.cloneNode(true); const a=node.querySelector('.thread-title'); a.href=thread.url; a.innerHTML=highlight(thread.title, words); const header=node.querySelector('.op-header'); header.hidden=!p.showOp || !thread.opHeader; header.textContent=thread.opHeader || ''; const snippet=node.querySelector('.snippet'); snippet.hidden=!p.showOp; snippet.innerHTML=highlight(thread.op || '', words); const tags=node.querySelector('.tags'); threadTags(thread).forEach(tag => tags.append(tagButton(tag, p.tags.includes(tagKey(tag))))); node.querySelector('.date').textContent=dateText(thread.createdAt); node.querySelector('.responses').textContent=`${thread.responses.toLocaleString()}レス`; list.append(node); });
}
function submit(tags=getParams().tags) { const p = new URLSearchParams({ q:query.value.trim(), period:period.value, minResponses:minResponses.value, body:String(body.checked), showOp:String(showOp.checked), sort:sort.value, limit:resultLimit.value }); if (tags.length) p.set('tags', tags.join(',')); history.pushState({}, '', `?${p}`); render(); }
form.addEventListener('submit', e => { e.preventDefault(); submit(); }); sort.addEventListener('change', submit); resultLimit.addEventListener('change', submit); showOp.addEventListener('change', submit); window.addEventListener('popstate', render);
document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => { query.value=button.dataset.query; submit(); }));
document.querySelector('#sample-link').addEventListener('click', () => { query.value='NHKBS'; submit(); });
render();
