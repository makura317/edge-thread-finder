export function archiveObjectName(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date は YYYY-MM-DD 形式で指定してください。');
  return `${date}.jsonl`;
}

export function parseArchiveJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)).map(thread => ({
    ...thread,
    // Mirror pages keep all responses in body; enough for an MVP display and sort key.
    responses: (thread.body.match(/(?:^|\n)\d+\s*:/g) || []).length,
    url: thread.sourceUrl,
    createdAt: thread.createdAt.replace(/-/g, (match, offset) => offset === 4 || offset === 7 ? '-' : match).replace(/^(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})$/, '$1T$2:$3:$4+09:00'),
    tags: thread.tags || []
  }));
}
