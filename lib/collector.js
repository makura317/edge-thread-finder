const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function parseSubjectTxt(text) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(\d+)\.dat<>(.+?)\s*\((\d+)\)\s*$/);
    return match ? [{ id: match[1], title: match[2], responses: Number(match[3]) }] : [];
  });
}

export function threadDateFromId(id) {
  if (!/^\d{10}$/.test(String(id))) throw new Error('スレッドIDは10桁のUNIX秒である必要があります。');
  return new Date(Number(id) * 1000 + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function currentDatUrl(id) {
  return `https://bbs.eddibb.cc/liveedge/dat/${id}.dat`;
}

export function kakoDatUrl(id) {
  const value = String(id);
  return `https://bbs.eddibb.cc/liveedge/kako/${value.slice(0, 4)}/${value.slice(0, 5)}/${value}.dat`;
}

function textFromDatHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|#38);/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export function parseDatBody(text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const fields = line.split('<>');
    const body = textFromDatHtml(fields[3] || '');
    return body ? [`${index + 1} : ${body}`] : [];
  }).join('\n');
}
