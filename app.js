const list = document.querySelector('#results-list');
const empty = document.querySelector('#empty-state');
const summary = document.querySelector('#result-summary');
const form = document.querySelector('#search-form');
const query = document.querySelector('#query');
const period = document.querySelector('#period');
const minResponses = document.querySelector('#min-responses');
const body = document.querySelector('#body');
const sort = document.querySelector('#sort');
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
const highlight = (text, words) => escapeHtml(text).replace(new RegExp(`(${words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi'), '<mark>$1</mark>');
const dateText = iso => new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'short', day:'numeric' }).format(new Date(iso));
function getParams() { const p = new URLSearchParams(location.search); return { q:p.get('q') || '', period:p.get('period') || 'all', minResponses:p.get('minResponses') || '0', body:p.get('body') !== 'false', sort:p.get('sort') || 'relevance' }; }
function setControls(p) { query.value=p.q; period.value=p.period; minResponses.value=p.minResponses; body.checked=p.body; sort.value=p.sort; }
function render() {
  const p = getParams(); setControls(p); list.replaceChildren();
  if (!p.q.trim()) { summary.textContent='キーワードを入力して検索'; empty.hidden=false; return; }
  const words = p.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const threshold = { week:7, month:31, year:366 }[p.period]; const now = Date.now();
  let matches = threads.map(thread => {
    const title = thread.title.toLowerCase(), text = thread.body.toLowerCase();
    const titleHits=words.filter(w=>title.includes(w)).length, bodyHits=words.filter(w=>text.includes(w)).length;
    return { ...thread, score:titleHits*5 + (p.body ? bodyHits : 0), titleHits, bodyHits };
  }).filter(t => t.score && t.responses >= Number(p.minResponses) && (!threshold || now - new Date(t.createdAt).getTime() <= threshold*86400000));
  matches.sort((a,b) => p.sort==='newest' ? new Date(b.createdAt)-new Date(a.createdAt) : p.sort==='responses' ? b.responses-a.responses : b.score-a.score || b.responses-a.responses);
  summary.textContent = `「${p.q}」の検索結果 ${matches.length}件`;
  empty.hidden = matches.length > 0;
  if (!matches.length) { empty.querySelector('h2').textContent='見つかりませんでした'; empty.querySelector('p').textContent='期間やキーワードを変えて、もう一度お試しください。'; return; }
  matches.forEach(thread => { const node=template.content.cloneNode(true); const a=node.querySelector('.thread-title'); a.href=thread.url; a.innerHTML=highlight(thread.title, words); node.querySelector('.snippet').innerHTML=highlight(thread.body, words); const tags=node.querySelector('.tags'); (thread.tags || []).forEach(tagData => { const [type, value] = Array.isArray(tagData) ? tagData : [tagData.type, tagData.value]; const tag=document.createElement('span'); tag.className='tag'; tag.innerHTML=`<b>${escapeHtml(type)}</b>${escapeHtml(value)}`; tags.append(tag); }); const refine=node.querySelector('.refine-tags'); const status=node.querySelector('.analysis-status'); refine.addEventListener('click', async () => { refine.disabled=true; status.textContent='Lunaへ判定を依頼中…'; try { const response=await fetch('/api/analyze-tags', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({title:thread.title, body:thread.body}) }); const result=await response.json(); if (!response.ok) throw new Error(result.error); tags.replaceChildren(); (result.analysis?.tags || result.candidates).filter(tag => tag.decision !== 'drop').forEach(tag => { const chip=document.createElement('span'); chip.className='tag'; chip.innerHTML=`<b>${escapeHtml(tag.type)}</b>${escapeHtml(tag.value)}`; tags.append(chip); }); status.textContent=result.analysis ? `Luna判定済み（${result.model}）` : '辞書候補を表示しています'; } catch (error) { status.textContent=error.message; } finally { refine.disabled=false; } }); node.querySelector('.date').textContent=dateText(thread.createdAt); node.querySelector('.responses').textContent=`${thread.responses.toLocaleString()}レス`; list.append(node); });
}
function submit() { const p = new URLSearchParams({ q:query.value.trim(), period:period.value, minResponses:minResponses.value, body:String(body.checked), sort:sort.value }); history.pushState({}, '', `?${p}`); render(); }
form.addEventListener('submit', e => { e.preventDefault(); submit(); }); sort.addEventListener('change', submit); window.addEventListener('popstate', render);
document.querySelectorAll('[data-query]').forEach(button => button.addEventListener('click', () => { query.value=button.dataset.query; submit(); }));
document.querySelector('#sample-link').addEventListener('click', () => { query.value='NHKBS'; submit(); });
render();
